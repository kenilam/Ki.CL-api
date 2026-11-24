import { createRemoteJWKSet, customFetch, jwtVerify, type JWTVerifyGetKey } from 'jose';

import * as invoker from './invoker.js';

export interface Visitor {
  userGUID: string;
  aud: 'anon' | 'user';
  human?: boolean;
}

let keys: { url: string; set: JWTVerifyGetKey } | undefined;

export function trust(url: string | undefined): void {
  if (!url || keys?.url === url) {
    return;
  }

  keys = {
    url,
    set: createRemoteJWKSet(new URL(url), {
      [customFetch]: (input, options) => {
        const headers = new Headers(options.headers);
        const authorization = invoker.authorization();

        if (authorization) {
          headers.set('x-serverless-authorization', authorization);
        }

        return fetch(input, { ...options, headers });
      },
    }),
  };
}

export async function read(cookie: string | null | undefined): Promise<Visitor | null> {
  const token = cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('access_token='))
    ?.slice('access_token='.length);

  if (!token || !keys) {
    return null;
  }

  try {
    const { payload } = await jwtVerify<Visitor>(decodeURIComponent(token), keys.set, { algorithms: ['EdDSA'] });

    return payload;
  } catch {
    return null;
  }
}
