import { PubSub } from 'graphql-subscriptions';

import { onChange, watchingChanges } from 'server/DataSources/MongoDB/changes.js';
import { Swatches, type ISwatch } from 'server/DataSources/MongoDB/Swatches/Model.js';
import { toResult, type SwatchResult } from './result.js';

export const swatchPubSub = new PubSub<{
  SWATCH_UPDATED: { swatchUpdated: SwatchResult };
}>();

export const SWATCH_UPDATED = 'SWATCH_UPDATED' as const;

function publish(swatch: SwatchResult): void {
  void swatchPubSub.publish(SWATCH_UPDATED, { swatchUpdated: swatch });
}

// Every instance hears every swatch written, whichever instance made it.
onChange(Swatches.collection.collectionName, (document) => {
  publish(toResult(document as ISwatch));
});

/** Publishes a write in this process only while the change stream is closed. */
export function publishSwatchUpdated(swatch: SwatchResult): void {
  if (!watchingChanges()) {
    publish(swatch);
  }
}
