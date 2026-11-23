import { createProxyMiddleware } from 'http-proxy-middleware';

import * as gateway from './gateway.js';
import * as invoker from './invoker.js';

export const toCore = createProxyMiddleware({
  pathFilter: ['/api/session', '/assets'],
  changeOrigin: true,
  router: () => new URL(gateway.serviceUrl('core') ?? 'http://localhost').origin,
  on: {
    proxyReq: (proxyReq) => {
      const authorization = invoker.authorization();

      if (authorization) {
        proxyReq.setHeader('x-serverless-authorization', authorization);
      }
    },
  },
});
