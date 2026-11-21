import { Types } from 'mongoose';

import type { RunPayload } from 'server/DataSources/Google/Tasks/index.js';
import { Swatches } from 'server/DataSources/MongoDB/Swatches/Model.js';
import { SwatchStage, SwatchStatus } from 'server/Types/graphql.js';
import { makeSwatch, nameSwatch } from './run.js';

/**
 * A swatch's run, from the queue. A picked colour is named here first; an
 * upload was named in the request that sent the picture, so only the still
 * and the film are left.
 */
export async function runSwatchTask({ id }: RunPayload): Promise<void> {
  if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) {
    return;
  }

  const swatch = await Swatches.findOne({ _id: id, status: SwatchStatus.Making }).select('stage hex').lean();

  if (!swatch) {
    return;
  }

  if (swatch.stage === SwatchStage.Naming) {
    const named = swatch.hex ? await nameSwatch(swatch._id, { hex: swatch.hex }) : false;

    if (!named) {
      return;
    }
  }

  await makeSwatch(swatch._id);
}
