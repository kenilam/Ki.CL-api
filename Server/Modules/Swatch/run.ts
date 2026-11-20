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

export async function runSwatch(id: Types.ObjectId, input: SwatchInput): Promise<void> {
  const startedAt = Date.now();

  const save = async (update: UpdateQuery<ISwatch>) => {
    const swatch = await Swatches
      .findOneAndUpdate({ _id: id, status: SwatchStatus.Making }, update, { returnDocument: 'after' })
      .lean();

    if (swatch) {
      publishSwatchUpdated(toResult(swatch));
      await notifySwatch(toResult(swatch));
    }
  };

  try {
    const description = await describe(input);
    const { hex, motion, name, scene, sound, tone } = description;

    await save({ stage: SwatchStage.Drawing, hex, motion, name, scene, sound, tone });

    const [still] = await Promise.all([
      drawStill(hex, description),
      translateNames(name)
        .then((names) => save({ names }))
        .catch((error: Error) => {
          console.warn(`${LOG} ${id} "${name}" was not translated: ${error.message}`);
        }),
    ]);

    await save({ stage: SwatchStage.Animating, still: await persistStill(String(id), still.buffer) });

    const { audio, original, video } = await makeFilm(String(id), still.buffer, description);

    await save({ status: SwatchStatus.Ready, stage: null, audio, original, video });

    console.log(`${LOG} ${id} "${name}" ${hex} ready in ${Math.round((Date.now() - startedAt) / 1000)}s`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`${LOG} ${id} was not made: ${message}`);

    await save({
      status: SwatchStatus.Failed,
      stage: null,
      failure: REJECTED.test(message) ? SwatchFailure.Rejected : SwatchFailure.Unavailable,
    });
  }
}
