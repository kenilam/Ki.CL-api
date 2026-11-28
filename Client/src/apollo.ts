import {
  ApolloClient,
  CombinedGraphQLErrors,
  InMemoryCache,
  createHttpLink,
  split,
} from '@apollo/client';
import { ErrorLink } from '@apollo/client/link/error';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import type { Client } from 'graphql-ws';
import { from, mergeMap, of, throwError } from 'rxjs';

import * as language from 'api/language';
import * as renewal from 'api/renewal';
import { createSocketClient } from 'api/socket';
import { toWsUri } from 'api/wsUri';

const RENEWALS: Record<string, (uri: string) => Promise<boolean>> = {
  EXPIRED: (uri) => renewal.refresh(uri).then((refreshed) => refreshed || renewal.session()),
  UNAUTHORIZED: () => renewal.session(),
  CAPTCHA_REQUIRED: () => renewal.session(),
  UNAUTHENTICATED: () => renewal.session(),
};

function renewalLink(uri: string, socket: Client | null) {
  return new ErrorLink(({ error, result, operation, forward }) => {
    const renew = CombinedGraphQLErrors.is(error)
      ? error.errors
          .map((graphQLError) => RENEWALS[String(graphQLError.extensions?.code)])
          .find(Boolean)
      : undefined;

    if (!renew || operation.getContext().renewed) {
      return;
    }

    return from(renew(uri)).pipe(
      mergeMap((renewed) => {
        if (!renewed) {
          return result ? of(result) : throwError(() => error);
        }

        socket?.terminate();
        operation.setContext({ renewed: true });

        return forward(operation);
      }),
    );
  });
}

function createClient(
  uri: string,
  wsUri: string,
): ApolloClient {
  const httpLink = createHttpLink({
    uri,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const socket = typeof window !== 'undefined' ? createSocketClient(wsUri) : null;
  const wsLink = socket ? new GraphQLWsLink(socket) : null;

  const transport =
    wsLink != null
      ? split(
          ({ query }) => {
            const definition = getMainDefinition(query);
            return (
              definition.kind === 'OperationDefinition' &&
              definition.operation === 'subscription'
            );
          },
          wsLink,
          language.link.concat(httpLink),
        )
      : language.link.concat(httpLink);

  const client = new ApolloClient({
    enhancedClientAwareness: { transport: false },
    link: renewalLink(uri, socket).concat(transport),
    cache: new InMemoryCache({
      typePolicies: {
        Query: {
          fields: {
            swatch: {
              read: (_, { args, toReference }) =>
                toReference({ __typename: 'Swatch', id: args?.id }),
            },
          },
        },
        TreeOfLifeNode: {
          keyFields: ['nodeId'],
        },
      },
    }),
    defaultOptions: {
      watchQuery: {
        fetchPolicy: 'cache-and-network',
      },
      mutate: {
        fetchPolicy: 'no-cache',
      },
    },
  });

  language.follow(client);

  return client;
}

let clientInstance: ApolloClient | null = null;

export function getClient(
  uri: string = '/api',
  wsUri?: string,
): ApolloClient {
  if (!clientInstance) {
    clientInstance = createClient(uri, wsUri ?? toWsUri(uri));
  }
  return clientInstance;
}
