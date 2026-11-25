import React from 'react';
// Apollo Client 4 serves the React bindings from their own entry point.
import { ApolloProvider as BaseApolloProvider } from '@apollo/client/react';

import { getClient } from 'api/apollo';

interface ProviderProps {
  uri?: string;
  /** WebSocket URL. Defaults to uri with http→ws. */
  wsUri?: string;
  children: React.ReactNode;
}

export function Provider({ uri = '/api', wsUri, children }: ProviderProps) {
  return <BaseApolloProvider client={getClient(uri, wsUri)}>{children}</BaseApolloProvider>;
}
