import type { QueryFilter } from 'mongoose';

import { SwatchFailure, Swatches, type ISwatch } from 'server/DataSources/MongoDB/Swatches/Model.js';
import { SwatchStatus } from 'server/Types/graphql.js';
import { notifySwatch } from './notify.js';
import { publishSwatchUpdated } from './pubsub.js';
import { toResult } from './result.js';

const STALLED_MS = 10 * 60 * 1000;

// A restart ends a run halfway. Stalled runs are failed when next asked for, since another instance may still be working.
export async function recoverStalled(filter: QueryFilter<ISwatch>): Promise<void> {
  const stalled = await Swatches.find({
    ...filter,
    status: SwatchStatus.Making,
    startedAt: { $lt: new Date(Date.now() - STALLED_MS) },
  }).select('_id').lean();

  await Promise.all(
    stalled.map(async ({ _id }) => {
      const swatch = await Swatches.findOneAndUpdate(
        { _id, status: SwatchStatus.Making },
        { status: SwatchStatus.Failed, stage: null, failure: SwatchFailure.Unavailable },
        { returnDocument: 'after' },
      ).lean();

      if (swatch) {
        publishSwatchUpdated(toResult(swatch));
        await notifySwatch(toResult(swatch));
      }
    }),
  );
}
