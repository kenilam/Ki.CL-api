import { getOperationAST, Kind, parse } from 'graphql';

import * as cookies from './cookies.js';
import * as sessions from './sessions.js';
import * as tokens from './tokens.js';
import * as turnstile from './turnstile.js';

type Refusal = { ok: false; code: 'CAPTCHA_REQUIRED' | 'UNAUTHORIZED'; message: string; status: 401 | 403; clear: boolean };

export type Admission = { ok: true; cookie: string; setCookies: string[]; issued: boolean } | Refusal;

const CAPTCHA_REQUIRED: Refusal = {
  ok: false,
  code: 'CAPTCHA_REQUIRED',
  message: 'Confirm you are human to continue.',
  status: 403,
  clear: false,
};

const UNAUTHORIZED: Refusal = {
  ok: false,
  code: 'UNAUTHORIZED',
  message: 'Your session has ended. Sign in again.',
  status: 401,
  clear: true,
};

/** Root fields that run without a session, such as `translations`, which the host loads before its first page. */
const WHITE_LIST = new Set(
  (process.env.WHITE_LIST_OPERATION ?? '')
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean),
);

export function whiteListed(query: string | undefined, operationName: string | undefined): boolean {
  if (!query || !WHITE_LIST.size) {
    return false;
  }

  try {
    const fields = (getOperationAST(parse(query), operationName)?.selectionSet.selections ?? [])
      .filter((selection) => selection.kind === Kind.FIELD && selection.name.value !== '__typename')
      .map((selection) => (selection.kind === Kind.FIELD ? selection.name.value : ''));

    return fields.length > 0 && fields.every((field) => WHITE_LIST.has(field));
  } catch {
    return false;
  }
}

async function exchangeToken(
  incoming: Record<string, string>,
  turnstileToken: string | null,
): Promise<Admission> {
  if (!(await turnstile.passes(turnstileToken))) {
    return CAPTCHA_REQUIRED;
  }

  if (incoming.refresh_token) {
    await sessions.remove(incoming.refresh_token);
  }

  const issued = await sessions.anonymous();

  return { ok: true, cookie: cookies.header({ ...incoming, ...issued }), setCookies: cookies.set(issued), issued: true };
}

/**
 * The checks a request passes before it reaches a service. The access token's
 * expiry is checked per field, in `gateway.ts`, since `@public` fields such as
 * `refreshToken` run without a live one.
 */
export async function admit(cookieHeader: string | null | undefined, turnstileToken: string | null): Promise<Admission> {
  const incoming = cookies.parse(cookieHeader);
  const kind = incoming.refresh_token ? await sessions.kind(incoming.refresh_token) : null;

  if (!kind) {
    return incoming.aud === 'user' ? UNAUTHORIZED : exchangeToken(incoming, turnstileToken);
  }

  if ((await tokens.check(incoming.access_token)) === 'invalid') {
    return UNAUTHORIZED;
  }

  return {
    ok: true,
    cookie: cookieHeader ?? '',
    setCookies: incoming.aud === kind ? [] : [cookies.line('aud', kind)],
    issued: false,
  };
}
