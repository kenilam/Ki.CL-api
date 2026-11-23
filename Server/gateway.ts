import { createGatewayRuntime, type GatewayPlugin } from '@graphql-hive/gateway-runtime';

import * as invoker from './invoker.js';
import * as registry from './registry.js';

const FORWARDED = ['cookie', 'accept-language', 'origin', 'authorization', 'x-turnstile-token'];
const INVOKER = [['x-serverless-authorization', '{context.invoker.authorization}']] as [string, string][];

let services: registry.ServiceRecord[] = [];

export function serviceUrl(name: string): string | undefined {
  return services.find((service) => service.name === name)?.url;
}

export function create(source: string) {
  return createGatewayRuntime({
    graphqlEndpoint: '/api',
    landingPage: false,
    graphiql: false,
    pollingInterval: 30_000,
    supergraph: async () => {
      const records = await registry.read(source);
      const { supergraphSdl } = registry.compose(records);

      services = records;

      return supergraphSdl;
    },
    transportEntries: {
      '*.http': {
        headers: INVOKER,
        options: {
          subscriptions: {
            kind: 'ws',
            headers: INVOKER,
            options: { connectionParams: { cookie: '{context.headers.cookie}' } },
          },
        },
      },
    },
    propagateHeaders: {
      fromClientToSubgraphs: ({ request }) =>
        Object.fromEntries(FORWARDED.map((name) => [name, request.headers.get(name) ?? undefined])),
      fromSubgraphsToClient: ({ response, subgraphName }) => ({
        'set-cookie': response.headers.getSetCookie(),
        ...(subgraphName === 'core' ? { 'content-language': response.headers.get('content-language') ?? undefined } : {}),
      }),
    },
    plugins: (): GatewayPlugin[] => [
      {
        onContextBuilding: ({ extendContext }) => {
          extendContext({ invoker: { authorization: invoker.authorization() } });
        },
        onFetch:
          () =>
          ({ response, setResponse }) => {
            if (response.status === 401) {
              setResponse(Response.json({ errors: [{ message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } }] }));
            }
          },
      },
    ],
  });
}
