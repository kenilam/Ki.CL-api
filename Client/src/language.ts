import type { ApolloClient } from '@apollo/client';
import { SetContextLink } from '@apollo/client/link/context';

import { acceptLanguage } from 'api/acceptLanguage';

// The language the cached answers were asked in; unset while nothing is cached.
let asked: string | undefined;

export const link = new SetContextLink(({ headers }) => {
  if (typeof document === 'undefined') {
    return {};
  }

  asked = document.documentElement.lang;

  return { headers: { 'Accept-Language': acceptLanguage(asked), ...headers } };
});

// After a switch every cached answer is in the old language, so the cache is emptied and what's on screen is asked again.
export function follow(client: ApolloClient): void {
  if (typeof document === 'undefined') {
    return;
  }

  new MutationObserver(() => {
    if (asked === undefined || document.documentElement.lang === asked) {
      return;
    }

    asked = undefined;
    // A refetch that a newer one replaces settles as an AbortError; any other failure still surfaces.
    void client.resetStore().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      throw error;
    });
  }).observe(document.documentElement, { attributeFilter: ['lang'] });
}
