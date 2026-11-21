import { PubSub } from 'graphql-subscriptions';

import { onChange, watchingChanges } from 'server/DataSources/MongoDB/changes.js';
import { KineticLightReadings } from 'server/DataSources/MongoDB/KineticLightReadings/Model.js';
import { toResult, type LeanReading, type ReadingResult } from './result.js';

export const kineticLightPubSub = new PubSub<{
  KINETIC_LIGHT_READING_UPDATED: { kineticLightReadingUpdated: ReadingResult };
}>();

export const KINETIC_LIGHT_READING_UPDATED = 'KINETIC_LIGHT_READING_UPDATED' as const;

function publish(reading: ReadingResult): void {
  void kineticLightPubSub.publish(KINETIC_LIGHT_READING_UPDATED, {
    kineticLightReadingUpdated: reading,
  });
}

// Every instance hears every reading written, whichever instance read the sheet.
onChange(KineticLightReadings.collection.collectionName, (document) => {
  publish(toResult(document as LeanReading));
});

/** Publishes a write in this process only while the change stream is closed. */
export function publishReadingUpdated(reading: ReadingResult): void {
  if (!watchingChanges()) {
    publish(reading);
  }
}
