import { print } from '@apollo/client/utilities';

import { Kicl_RefreshTokenDocument } from 'api/generated/graphql';

type Renew = () => Promise<boolean>;

let renew: Renew | undefined;
let pending: Promise<boolean> | undefined;
let refreshing: Promise<boolean> | undefined;

export function onUnauthenticated(next: Renew): () => void {
  renew = next;

  return () => {
    if (renew === next) {
      renew = undefined;
    }
  };
}

export function session(): Promise<boolean> {
  if (!renew) {
    return Promise.resolve(false);
  }

  pending ??= renew().finally(() => {
    pending = undefined;
  });

  return pending;
}

export function refresh(uri: string): Promise<boolean> {
  refreshing ??= fetch(uri, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationName: 'kicl_refreshToken', query: print(Kicl_RefreshTokenDocument) }),
  })
    .then((response) => response.json())
    .then((body: { data?: { refreshToken?: boolean | null } }) => body.data?.refreshToken === true)
    .catch(() => false)
    .finally(() => {
      refreshing = undefined;
    });

  return refreshing;
}
