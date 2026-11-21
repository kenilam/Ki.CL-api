import { PubSub } from 'graphql-subscriptions';

import { onChange, watchingChanges } from 'server/DataSources/MongoDB/changes.js';
import { TreeOfLifeNodes, type ITreeOfLifeNode } from 'server/DataSources/MongoDB/TreeOfLife/Model.js';
import { toResult } from './result.js';
import type { TaxonVisualResult } from './types.js';

export const taxonVisualPubSub = new PubSub<{
  TAXON_VISUAL_UPDATED: { taxonVisualUpdated: TaxonVisualResult };
}>();

export const TAXON_VISUAL_UPDATED = 'TAXON_VISUAL_UPDATED' as const;

/** Sends to this process's subscribers now, as when a late one catches up. */
export function sendTaxonVisualUpdated(result: TaxonVisualResult): void {
  void taxonVisualPubSub.publish(TAXON_VISUAL_UPDATED, {
    taxonVisualUpdated: result,
  });
}

// Every instance hears every plate written, whichever instance drew it.
onChange(TreeOfLifeNodes.collection.collectionName, (document) => {
  const node = document as ITreeOfLifeNode;

  if (node.visualStatus && typeof node.ottId === 'number') {
    sendTaxonVisualUpdated(toResult({
      ottId: node.ottId,
      nodeId: node.nodeId,
      description: node.description,
      assetId: node.assetId,
      visualScore: node.visualScore,
      visualExhaustion: node.visualExhaustion,
      error: node.error,
      status: node.visualStatus,
    }));
  }
});

/** Publishes a write in this process only while the change stream is closed. */
export function publishTaxonVisualUpdated(result: TaxonVisualResult): void {
  if (!watchingChanges()) {
    sendTaxonVisualUpdated(result);
  }
}
