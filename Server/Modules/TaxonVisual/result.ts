import { TaxonVisualExhaustion, TaxonVisualStatus } from 'server/Types/graphql.js';
import type { TaxonVisualResult, TaxonVisualScoreResult } from './types.js';

export /** Whether an error message is about quota rather than a fault. `studio budget` is in older stored errors. */
function isQuotaMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return ['billing', 'quota', 'studio budget', 'rate limit'].some((word) => lower.includes(word));
}

export function toVisualScore(
  score: {
    overall?: number | null;
    taxonMatch?: number | null;
    taxon_match?: number | null;
    pass?: boolean | null;
  } | null | undefined,
): TaxonVisualScoreResult | null {
  if (!score) {
    return null;
  }
  const overall = score.overall;
  const taxonMatch = score.taxonMatch ?? score.taxon_match;
  const pass = score.pass;
  if (
    typeof overall !== 'number'
    || typeof taxonMatch !== 'number'
    || typeof pass !== 'boolean'
  ) {
    return null;
  }
  return { overall, taxonMatch, pass };
}

export function toResult(doc: {
  ottId: number;
  nodeId?: string | null;
  description?: string | null;
  assetId?: unknown;
  visualStatus?: TaxonVisualStatus | null;
  visualScore?: TaxonVisualScoreResult | null;
  visualExhaustion?: TaxonVisualExhaustion | null;
  status?: TaxonVisualStatus;
  error?: string | null;
}): TaxonVisualResult {
  let status = doc.status ?? doc.visualStatus ?? TaxonVisualStatus.Pending;
  if (status === TaxonVisualStatus.Error && doc.error && isQuotaMessage(doc.error)) {
    status = TaxonVisualStatus.Exhausted;
  }

  return {
    status,
    ottId: doc.ottId,
    nodeId: doc.nodeId ?? null,
    assetId: doc.assetId != null ? String(doc.assetId) : null,
    description: doc.description ?? null,
    visualScore: toVisualScore(doc.visualScore),
    /*
     * Only meaningful while the quota is what is stopping us. Carrying it into
     * a READY result would leave a stale reason attached to a plate that
     * exists.
     */
    exhaustion: status === TaxonVisualStatus.Exhausted
      ? doc.visualExhaustion ?? TaxonVisualExhaustion.Refills
      : null,
  };
}
