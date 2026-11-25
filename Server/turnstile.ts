const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const HEADER = 'x-turnstile-token';

/** Must match the `action` the host renders the widget with. */
const ACTION = 'exchange-token';

const MAX_TOKEN_LENGTH = 2048;

const TIMEOUT_MS = 5000;

/** Codes that mean our setup is wrong, not the visitor. */
const OUR_FAULT = new Set(['missing-input-secret', 'invalid-input-secret', 'internal-error']);

export type Verdict = 'passed' | 'rejected' | 'unavailable';

interface Siteverify {
  success: boolean;
  'error-codes'?: string[];
  hostname?: string;
  action?: string;
  metadata?: { result_with_testing_key?: boolean };
}

function hostnames(): string[] {
  return (process.env.TURNSTILE_HOSTNAMES ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

async function siteverify(secret: string, token: string): Promise<{ verdict: Verdict; codes: string[] }> {
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      return { verdict: 'unavailable', codes: [`http-${response.status}`] };
    }

    const payload = (await response.json()) as Siteverify;
    const codes = payload['error-codes'] ?? [];

    if (!payload.success) {
      return { verdict: codes.some((code) => OUR_FAULT.has(code)) ? 'unavailable' : 'rejected', codes };
    }

    /* Cloudflare's test secrets answer with no action and `example.com` as the hostname. */
    if (payload.metadata?.result_with_testing_key) {
      return { verdict: 'passed', codes };
    }

    if (payload.action !== ACTION) {
      return { verdict: 'rejected', codes: ['action-mismatch'] };
    }

    const allowed = hostnames();

    if (allowed.length && !allowed.includes(payload.hostname?.toLowerCase() ?? '')) {
      return { verdict: 'rejected', codes: ['hostname-mismatch'] };
    }

    return { verdict: 'passed', codes };
  } catch (error) {
    return { verdict: 'unavailable', codes: [error instanceof Error ? error.name : 'fetch-failed'] };
  }
}

/**
 * Cloudflare accepts each token once, so this is called only when a token set
 * is about to be issued. Without a secret outside production everyone passes,
 * so local work needs no widget. Until the proof-of-work fallback lands, a
 * visitor is let through when Cloudflare can't answer.
 */
export async function passes(token: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();

  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }

  if (!token || token.length > MAX_TOKEN_LENGTH) {
    return false;
  }

  const { verdict, codes } = await siteverify(secret, token);

  if (verdict === 'unavailable') {
    console.warn(`[Turnstile] unavailable, letting the visitor through: ${codes.join(',')}`);
  }

  return verdict !== 'rejected';
}
