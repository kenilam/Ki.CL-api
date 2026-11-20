import { PubSub } from 'graphql-subscriptions';

import type { SwatchResult } from './result.js';

export const swatchPubSub = new PubSub<{
  SWATCH_UPDATED: { swatchUpdated: SwatchResult };
}>();

export const SWATCH_UPDATED = 'SWATCH_UPDATED' as const;

export function publishSwatchUpdated(swatch: SwatchResult): void {
  void swatchPubSub.publish(SWATCH_UPDATED, { swatchUpdated: swatch });
}
