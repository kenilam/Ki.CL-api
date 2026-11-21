import { PubSub } from 'graphql-subscriptions';

import { onChange, watchingChanges } from 'server/DataSources/MongoDB/changes.js';
import { ImageAgentThreads } from 'server/DataSources/MongoDB/ImageAgentThreads/Model.js';
import { toResult, type ImageAgentThreadResult, type LeanImageAgentThread } from './types.js';

export const imageAgentPubSub = new PubSub<{
  IMAGE_AGENT_THREAD_UPDATED: { imageAgentThreadUpdated: ImageAgentThreadResult };
}>();

export const IMAGE_AGENT_THREAD_UPDATED = 'IMAGE_AGENT_THREAD_UPDATED' as const;

function publish(thread: ImageAgentThreadResult): void {
  void imageAgentPubSub.publish(IMAGE_AGENT_THREAD_UPDATED, {
    imageAgentThreadUpdated: thread,
  });
}

// Every instance hears every thread written, whichever instance ran the turn.
onChange(ImageAgentThreads.collection.collectionName, (document) => {
  publish(toResult(document as LeanImageAgentThread));
});

/** Publishes a write in this process only while the change stream is closed. */
export function publishImageAgentThreadUpdated(thread: ImageAgentThreadResult): void {
  if (!watchingChanges()) {
    publish(thread);
  }
}
