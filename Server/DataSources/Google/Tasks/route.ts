import express, { type Request, type Response, type Router } from 'express';
import { OAuth2Client } from 'google-auth-library';

import { withAcceptLanguages } from 'server/Helpers/acceptLanguage.js';

import type { Run, RunPayload } from './queue.js';

export type RunHandlers = Partial<Record<Run, (payload: RunPayload) => Promise<void>>>;

const verifier = new OAuth2Client();

// Only Cloud Tasks, signing as the runs service account, may start a run.
async function fromQueue(req: Request): Promise<boolean> {
  const url = process.env.API_RUNS_URL;
  const email = process.env.API_RUNS_SERVICE_ACCOUNT;
  const token = req.headers.authorization?.replace(/^Bearer /, '');

  if (!url || !email || !token) {
    return false;
  }

  try {
    const ticket = await verifier.verifyIdToken({ idToken: token, audience: url });
    const payload = ticket.getPayload();

    return payload?.email === email && payload.email_verified === true;
  } catch {
    return false;
  }
}

/**
 * The work runs before the response is sent, so the request holds the CPU for
 * all of it. A failed run answers 204 too: the run records its own failure,
 * and the queue doesn't retry, since a retry would pay for its work again.
 */
export function runsRoute(handlers: RunHandlers): Router {
  const router = express.Router();

  router.post('/:run', express.json({ limit: '1mb' }), async (req: Request, res: Response) => {
    if (!(await fromQueue(req))) {
      res.status(403).end();
      return;
    }

    const run = req.params.run as Run;
    const handler = handlers[run];

    if (!handler) {
      res.status(404).end();
      return;
    }

    const { acceptLanguages, ...payload } = req.body as RunPayload & { acceptLanguages?: string[] };

    try {
      await withAcceptLanguages(acceptLanguages ?? [], () => handler(payload));
    } catch (error) {
      console.error(`[Runs] ${run} failed: ${(error as Error).message}`);
    }

    res.status(204).end();
  });

  return router;
}
