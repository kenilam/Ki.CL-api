import 'dotenv/config';
import { createServer } from 'node:http';
import appRoot from 'app-root-path';
import express from 'express';
import { useServer, type Extra } from 'graphql-ws/use/ws';
import { WebSocketServer } from 'ws';
import { getGraphQLWSOptions } from '@graphql-hive/gateway-runtime';

import * as gateway from './gateway.js';
import * as invoker from './invoker.js';
import { precompressed } from './Middleware/precompressed.js';
import * as passthrough from './passthrough.js';

const PORT = Number(process.env.PORT) || 3100;
const REGISTRY = process.env.REGISTRY ?? (process.env.NODE_ENV === 'development' ? './.registry-local' : undefined);
const CLIENT = appRoot.resolve('Client/dist');

if (!REGISTRY) {
  throw new Error('REGISTRY is not set: a registry bucket name, or a directory for local work.');
}

const runtime = gateway.create(REGISTRY);
const app = express();
const server = createServer(app);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(
  '/client',
  precompressed(CLIENT),
  express.static(CLIENT, {
    setHeaders(res, path) {
      res.setHeader('Cache-Control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  }),
);
app.get('/client/@mf-types.zip', (_req, res) => {
  res.sendFile(`${CLIENT}/types.zip`);
});

app.use(passthrough.toCore);
app.use(runtime.graphqlEndpoint, runtime);

useServer(
  getGraphQLWSOptions<Record<string, unknown>, Extra>(runtime, (context) => ({
    req: context.extra.request,
    socket: context.extra.socket,
    upgrade: { cookie: context.extra.request.headers.cookie ?? context.connectionParams?.cookie },
  })),
  new WebSocketServer({ server, path: runtime.graphqlEndpoint }),
);

await invoker.start();
await runtime.fetch('http://localhost/api', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query: '{ __typename }' }),
});

server.listen(PORT, () => {
  console.log(`Gateway on ${PORT}, reading the registry at ${REGISTRY}`);
});
