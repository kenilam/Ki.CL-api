import { createGatewayRuntime, type GatewayPlugin } from '@graphql-hive/gateway-runtime';
import { GraphQLError } from 'graphql';

import * as invoker from './invoker.js';
import * as registry from './registry.js';
import * as visitor from './visitor.js';

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
      visitor.trust(registry.jwks(records));

      return supergraphSdl;
    },
    transportEntries: {
      '*.http': {
        headers: INVOKER,
        options: {
          subscriptions: {
            kind: 'ws',
            headers: INVOKER,
            options: { connectionParams: { cookie: '{context.upgrade.cookie}' } },
          },
        },
      },
    },
    genericAuth: {
      mode: 'protect-all',
      authDirectiveName: 'public',
      resolveUserFn: (context) =>
        visitor.read((context as { upgrade?: { cookie?: string } }).upgrade?.cookie ?? context.request?.headers.get('cookie')),
      extractScopes: (user) => (user?.human ? ['human'] : []),
      validateUser: ({ user, parentType, fieldDirectives, fieldScopes, userScopes, executionArgs }) => {
        const { schema } = executionArgs;
        const roots = [schema.getQueryType(), schema.getMutationType(), schema.getSubscriptionType()];

        if (!roots.includes(parentType as never) || fieldDirectives?.public) {
          return;
        }

        if (!user) {
          return new GraphQLError('Unauthorized', { extensions: { code: 'UNAUTHENTICATED' } });
        }

        if (fieldScopes && !fieldScopes.some((scopes) => scopes.every((scope) => userScopes.includes(scope)))) {
          return new GraphQLError('Human check required', { extensions: { code: 'CAPTCHA_REQUIRED' } });
        }
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
