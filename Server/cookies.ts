import { decodeJwt } from 'jose';

export const NAMES = ['access_token', 'refresh_token', 'aud'] as const;

export type Name = (typeof NAMES)[number];

export type TokenSet = Record<Name, string>;

const PRODUCTION = process.env.NODE_ENV === 'production';

const ACCESS_TOKEN_MS = 15 * 60 * 1000;

/** Browsers cap a cookie's lifetime at 400 days. */
const AUD_MS = 400 * 24 * 60 * 60 * 1000;

const GRACE_MINUTES = 15;

export function accessTokenExpiry(now = new Date()): Date {
  return new Date(now.getTime() + ACCESS_TOKEN_MS);
}

/** Midnight on the 8th day, or the 9th when issued at 23:45 or later. Core uses the same rule. */
export function refreshTokenExpiry(now = new Date()): Date {
  const midnight = new Date(now);

  midnight.setHours(0, 0, 0, 0);
  midnight.setDate(midnight.getDate() + 8);

  if (now.getHours() === 23 && now.getMinutes() >= 60 - GRACE_MINUTES) {
    midnight.setDate(midnight.getDate() + 1);
  }

  return midnight;
}

export function parse(header: string | null | undefined): Partial<TokenSet> & Record<string, string> {
  const cookies: Record<string, string> = {};

  for (const part of header?.split(';') ?? []) {
    const eq = part.indexOf('=');
    const key = part.slice(0, eq).trim();

    if (eq !== -1 && key) {
      cookies[key] = decodeURIComponent(part.slice(eq + 1).trim());
    }
  }

  return cookies;
}

export function header(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('; ');
}

function attributes(name: Name, expires: Date): string {
  return [
    'Path=/',
    `Expires=${expires.toUTCString()}`,
    name === 'aud' ? null : 'HttpOnly',
    PRODUCTION ? 'Secure' : null,
    `SameSite=${PRODUCTION ? 'Strict' : 'Lax'}`,
  ]
    .filter(Boolean)
    .join('; ');
}

function expiry(name: Name, value: string): Date {
  const now = new Date();
  const expiries: Record<Name, () => Date> = {
    access_token: () => new Date((decodeJwt(value).exp ?? 0) * 1000),
    refresh_token: () => refreshTokenExpiry(now),
    aud: () => new Date(now.getTime() + AUD_MS),
  };

  return expiries[name]();
}

export function line(name: Name, value: string): string {
  return `${name}=${encodeURIComponent(value)}; ${attributes(name, expiry(name, value))}`;
}

export function set(tokens: TokenSet): string[] {
  return NAMES.map((name) => line(name, tokens[name]));
}

export function clear(): string[] {
  return NAMES.map((name) => `${name}=; ${attributes(name, new Date(0))}`);
}
