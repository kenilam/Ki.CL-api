import { Swatches } from 'server/DataSources/MongoDB/Swatches/Model.js';
import { TooManyRequests } from 'server/Errors/index.js';
import { translate } from 'server/Helpers/translate.js';
import { SwatchStatus } from 'server/Types/graphql.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export async function allowanceFor(startedBy: string) {
  const now = Date.now();
  const dayAgo = new Date(now - DAY_MS);
  const hourAgo = new Date(now - HOUR_MS);
  const limit = envNumber('SWATCH_DAILY_LIMIT_PER_USER', 3);

  const [busy, last, runs, everyone, recent] = await Promise.all([
    Swatches.exists({ startedBy, status: SwatchStatus.Making }),
    Swatches.findOne({ startedBy }).sort({ startedAt: -1 }).select('startedAt').lean(),
    Swatches.countDocuments({ startedBy, startedAt: { $gte: dayAgo } }),
    Swatches.countDocuments({ startedBy: { $type: 'string' }, startedAt: { $gte: dayAgo } }),
    Swatches.distinct('startedBy', { startedAt: { $gte: hourAgo } }),
  ]);

  const pauseEnds = (last?.startedAt.getTime() ?? 0) + envNumber('SWATCH_MIN_INTERVAL_SECONDS', 30) * 1000;

  const closed = everyone >= envNumber('SWATCH_DAILY_LIMIT_GLOBAL', 20)
    || (!recent.includes(startedBy) && recent.length >= envNumber('SWATCH_HOURLY_USERS', 10));

  return {
    remaining: closed ? 0 : Math.max(0, limit - runs),
    limit,
    nextAllowedAt: pauseEnds > now ? new Date(pauseEnds) : null,
    busy: Boolean(busy),
  };
}

export async function assertWithinQuota(startedBy: string): Promise<void> {
  const allowance = await allowanceFor(startedBy);

  if (allowance.busy) {
    throw TooManyRequests(translate('api', 'swatch_error_busy'));
  }

  if (allowance.nextAllowedAt) {
    throw TooManyRequests(translate('api', 'swatch_error_too_soon'));
  }

  if (allowance.remaining <= 0) {
    throw TooManyRequests(translate('api', 'swatch_error_limit'));
  }
}
