import { createGatewayRuntime, type GatewayPlugin } from '@graphql-hive/gateway-runtime';
import { getOperationAST, GraphQLError, type ExecutionArgs, type ExecutionResult } from 'graphql';

import * as admission from './admission.js';
import * as cookies from './cookies.js';
import * as invoker from './invoker.js';
import * as registry from './registry.js';
import * as tokens from './tokens.js';
import * as turnstile from './turnstile.js';

const FORWARDED = ['cookie', 'accept-language', 'origin', 'authorization'];
const INVOKER = [['x-serverless-authorization', '{context.invoker.authorization}']] as [string, string][];
const OPERATION_PREFIX = 'kicl_';

type Authorization = cookies.TokenSet | { revoke: true };

let services: registry.ServiceRecord[] = [];

export function serviceUrl(name: string): string | undefined {
  return services.find((service) => service.name === name)?.url;
}

/** What the request step decided for each HTTP request: the cookies sent on, and the cookies to set. */
const admitted = new WeakMap<Request, { cookie?: string; setCookies: string[] }>();

function stateOf(request: Request) {
  let state = admitted.get(request);

  if (!state) {
    state = { setCookies: [] };
    admitted.set(request, state);
  }

  return state;
}

function cookieOf(request: Request | undefined): string | null | undefined {
  return request ? (admitted.get(request)?.cookie ?? request.headers.get('cookie')) : undefined;
}

function unnamed(args: ExecutionArgs): ExecutionResult | null {
  const name = getOperationAST(args.document, args.operationName)?.name?.value;

  return name?.startsWith(OPERATION_PREFIX)
    ? null
    : { errors: [new GraphQLError('Operation name is missing its prefix', { extensions: { code: 'BAD_REQUEST' } })] };
}

function cookiesFor(authorization: Authorization): string[] {
  return 'revoke' in authorization ? cookies.clear() : cookies.set(authorization);
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
            options: { connectionParams: { cookie: '{context.upgrade.cookie}' } },
          },
        },
      },
    },
    genericAuth: {
      mode: 'protect-all',
      authDirectiveName: 'public',
      resolveUserFn: async (context) => {
        const header = (context as { upgrade?: { cookie?: string } }).upgrade?.cookie ?? cookieOf(context.request);

        return { check: await tokens.check(cookies.parse(header).access_token) };
      },
      validateUser: ({ user, parentType, fieldDirectives, executionArgs }) => {
        const { schema } = executionArgs;
        const roots = [schema.getQueryType(), schema.getMutationType(), schema.getSubscriptionType()];
        const check = user?.check;

        if (!roots.includes(parentType as never) || fieldDirectives?.public || typeof check === 'object') {
          return;
        }

        return check === 'invalid'
          ? new GraphQLError('Unauthorized', { extensions: { code: 'UNAUTHORIZED' } })
          : new GraphQLError('Expired', { extensions: { code: 'EXPIRED' } });
      },
    },
    propagateHeaders: {
      fromClientToSubgraphs: ({ request }) => ({
        ...Object.fromEntries(FORWARDED.map((name) => [name, request.headers.get(name) ?? undefined])),
        cookie: cookieOf(request) ?? undefined,
      }),
      fromSubgraphsToClient: ({ response, subgraphName }) => ({
        'set-cookie': response.headers.getSetCookie(),
        ...(subgraphName === 'i18n' ? { 'content-language': response.headers.get('content-language') ?? undefined } : {}),
      }),
    },
    plugins: (): GatewayPlugin[] => [
      {
        onContextBuilding: ({ extendContext }) => {
          extendContext({ invoker: { authorization: invoker.authorization() } });
        },
        onParams: async ({ params, request, setResult }) => {
          // An operation on a WebSocket has no request: the socket is checked per field, from its upgrade cookie.
          if (!request || admission.whiteListed(params.query, params.operationName)) {
            return;
          }

          const result = await admission.admit(request.headers.get('cookie'), request.headers.get(turnstile.HEADER));
          const state = stateOf(request);

          if (!result.ok) {
            state.setCookies.push(...(result.clear ? cookies.clear() : []));
            setResult({ errors: [new GraphQLError(result.message, { extensions: { code: result.code } })] });
            return;
          }

          state.cookie = result.cookie;
          state.setCookies.push(...result.setCookies);
        },
        onExecute: ({ args, setResultAndStopExecution }) => {
          const refused = unnamed(args);

          if (refused) {
            setResultAndStopExecution(refused);
          }
        },
        onSubscribe: ({ args, setResultAndStopExecution }) => {
          const refused = unnamed(args);

          if (refused) {
            setResultAndStopExecution(refused);
          }
        },
        onSubgraphExecute: ({ executionRequest }) => {
          const request = (executionRequest.context as { request?: Request } | undefined)?.request;

          return ({ result, setResult }) => {
            if (Symbol.asyncIterator in result) {
              return;
            }

            const { authorization, ...extensions } = result.extensions ?? {};

            if (!authorization) {
              return;
            }

            if (request) {
              stateOf(request).setCookies.push(...cookiesFor(authorization as Authorization));
            }

            setResult({ ...result, extensions });
          };
        },
        onResponse: ({ request, response }) => {
          for (const cookie of admitted.get(request)?.setCookies ?? []) {
            response.headers.append('set-cookie', cookie);
          }
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
