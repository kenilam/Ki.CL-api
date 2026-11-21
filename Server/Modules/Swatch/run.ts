import type { Types, UpdateQuery } from 'mongoose';

import { SwatchFailure, Swatches, type ISwatch } from 'server/DataSources/MongoDB/Swatches/Model.js';
import { SwatchStage, SwatchStatus } from 'server/Types/graphql.js';
import { describePick, describeUpload, type Description } from './describe.js';
import { drawStill } from './draw.js';
import { makeFilm } from './film.js';
import { translateNames } from './name.js';
import { notifySwatch } from './notify.js';
import { persistStill } from './persist.js';
import { publishSwatchUpdated } from './pubsub.js';
import { toResult } from './result.js';

const LOG = '[Swatch]';
const REJECTED = /content.?policy|safety|blocked|prohibited/i;

export type SwatchInput = { hex: string } | { image: Buffer; mime: string };

function describe(input: SwatchInput): Promise<Description> {
  return 'hex' in input ? describePick(input.hex) : describeUpload(input.image, input.mime);
}

async function save(id: Types.ObjectId, update: UpdateQuery<ISwatch>): Promise<void> {
  const swatch = await Swatches
    .findOneAndUpdate({ _id: id, status: SwatchStatus.Making }, update, { returnDocument: 'after' })
    .lean();

  if (swatch) {
    publishSwatchUpdated(toResult(swatch));
    await notifySwatch(toResult(swatch));
  }
}

export async function failSwatch(id: Types.ObjectId, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`${LOG} ${id} was not made: ${message}`);

  await save(id, {
    status: SwatchStatus.Failed,
    stage: null,
    failure: REJECTED.test(message) ? SwatchFailure.Rejected : SwatchFailure.Unavailable,
  });
}

// What the model said about the colour, read back from the record.
function descriptionOf({ hex, name, scene, motion, sound, tone }: ISwatch): Description | null {
  return hex && name && scene && motion && tone
    ? { hex, name, scene, motion, sound: sound ?? undefined, tone }
    : null;
}

/**
 * Names the colour and saves what the model said, so the rest of the run needs
 * only the record. An upload's picture is read here and let go. Returns
 * whether the swatch can go on.
 */
export async function nameSwatch(id: Types.ObjectId, input: SwatchInput): Promise<boolean> {
  try {
    const { hex, motion, name, scene, sound, tone } = await describe(input);

    await save(id, { stage: SwatchStage.Drawing, hex, motion, name, scene, sound, tone });

    return true;
  } catch (error) {
    await failSwatch(id, error);

    return false;
  }
}

/** Draws the still and makes the film, from the description on the record. */
export async function makeSwatch(id: Types.ObjectId): Promise<void> {
  const swatch = await Swatches.findOne({ _id: id, status: SwatchStatus.Making }).lean();
  const description = swatch ? descriptionOf(swatch) : null;

  if (!swatch || !description) {
    return;
  }

  try {
    const [still] = await Promise.all([
      drawStill(description.hex, description),
      translateNames(description.name)
        .then((names) => save(id, { names }))
        .catch((error: Error) => {
          console.warn(`${LOG} ${id} "${description.name}" was not translated: ${error.message}`);
        }),
    ]);

    await save(id, { stage: SwatchStage.Animating, still: await persistStill(String(id), still.buffer) });

    const { audio, original, video } = await makeFilm(String(id), still.buffer, description);

    await save(id, { status: SwatchStatus.Ready, stage: null, audio, original, video });

    const seconds = Math.round((Date.now() - swatch.startedAt.getTime()) / 1000);

    console.log(`${LOG} ${id} "${description.name}" ${description.hex} ready in ${seconds}s`);
  } catch (error) {
    await failSwatch(id, error);
  }
}
