import { mongo, type Types } from 'mongoose';

import { runLater } from 'server/DataSources/Google/Tasks/index.js';
import { Swatches } from 'server/DataSources/MongoDB/Swatches/Model.js';
import { BadUserInput } from 'server/Errors/index.js';
import { translate } from 'server/Helpers/translate.js';
import { SwatchSource, SwatchStage, SwatchStatus } from 'server/Types/graphql.js';
import { joinSwatch, notifySwatch } from './notify.js';
import { assertWithinQuota } from './quota.js';
import { recoverStalled } from './recover.js';
import { toResult } from './result.js';
import { failSwatch, makeSwatch, nameSwatch, type SwatchInput } from './run.js';
import { runSwatchTask } from './task.js';
import { MAX_FILE_BYTES, MAX_FILE_SIZE } from './validation.js';

const SIGNATURES: [string, string][] = [
  ['89504e47', 'image/png'],
  ['ffd8ff', 'image/jpeg'],
  ['47494638', 'image/gif'],
];

const MAKING = {
  status: SwatchStatus.Making,
  stage: SwatchStage.Naming,
};

function mimeOf(bytes: Buffer): string | null {
  const isWebp = bytes.subarray(0, 4).toString('latin1') === 'RIFF'
    && bytes.subarray(8, 12).toString('latin1') === 'WEBP';

  if (isWebp) {
    return 'image/webp';
  }

  const hex = bytes.subarray(0, 4).toString('hex');

  return SIGNATURES.find(([signature]) => hex.startsWith(signature))?.[1] ?? null;
}

function isDuplicateHex(error: unknown): boolean {
  return error instanceof mongo.MongoServerError
    && error.code === 11000
    && Boolean(error.keyPattern?.hex);
}

// The picture is read now and dropped, so an upload's task carries only its id.
async function begin(swatch: Parameters<typeof toResult>[0], input: SwatchInput) {
  const { _id: id } = swatch;

  await notifySwatch(toResult(swatch));

  if ('image' in input && !(await nameSwatch(id, input))) {
    return toResult((await Swatches.findById(id).lean()) ?? swatch);
  }

  const here = 'image' in input ? () => makeSwatch(id) : () => runSwatchTask({ id: String(id) });

  await runLater('swatch', { id: String(id) }, here).catch((error: unknown) => failSwatch(id, error));

  return toResult((await Swatches.findById(id).lean()) ?? swatch);
}

export async function upload(owner: string, bytes: Buffer) {
  if (bytes.length > MAX_FILE_BYTES) {
    throw BadUserInput(translate('api', 'swatch_error_too_large', { size: MAX_FILE_SIZE }));
  }

  const mime = mimeOf(bytes);

  if (!mime) {
    throw BadUserInput(translate('api', 'swatch_error_type'));
  }

  const swatch = await Swatches.create({
    ...MAKING,
    ownerGUID: owner,
    startedBy: owner,
    source: SwatchSource.Upload,
  });

  return begin(swatch.toObject(), { image: bytes, mime });
}

// A failed colour is made again on the same record, so it keeps one link.
export async function pick(owner: string, hex: string, failed: Types.ObjectId | null) {
  await recoverStalled({ startedBy: owner });
  await assertWithinQuota(owner);

  const started = { ...MAKING, startedBy: owner, startedAt: new Date(), failure: null };

  try {
    const swatch = failed
      ? await Swatches.findOneAndUpdate(
        { _id: failed, status: SwatchStatus.Failed },
        { ...started, name: null, names: {}, scene: null, motion: null, tone: null, still: null, video: null },
        { returnDocument: 'after' },
      ).lean()
      : (await Swatches.create({
        ...started,
        hex,
        source: SwatchSource.Pick,
      })).toObject();

    if (swatch) {
      return await begin(swatch, { hex });
    }
  } catch (error) {
    if (!isDuplicateHex(error)) {
      throw error;
    }
  }

  // Someone else started it a moment ago.
  const other = await Swatches.findOne({ source: SwatchSource.Pick, hex }).lean();

  if (!other) {
    throw new Error(`The swatch for ${hex} could not be found`);
  }

  await joinSwatch(owner, toResult(other));

  return toResult(other);
}
