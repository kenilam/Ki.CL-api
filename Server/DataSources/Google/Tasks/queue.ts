import { CloudTasksClient } from '@google-cloud/tasks';

import { currentAcceptLanguages } from 'server/Helpers/acceptLanguage.js';

export type Run = 'image-agent' | 'kinetic-light' | 'swatch' | 'taxon-visual';

export type RunPayload = Record<string, unknown>;

// Long enough for a swatch that draws twice and waits on a slow film.
const DEADLINE_SECONDS = 900;

let client: CloudTasksClient | null = null;

function queueConfig() {
  const queue = process.env.API_RUNS_QUEUE;
  const url = process.env.API_RUNS_URL;
  const serviceAccountEmail = process.env.API_RUNS_SERVICE_ACCOUNT;

  return queue && url && serviceAccountEmail ? { queue, url, serviceAccountEmail } : null;
}

export function runsQueued(): boolean {
  return queueConfig() !== null;
}

/**
 * Starts work that carries on after the request that asked for it. With a
 * queue configured, Cloud Tasks calls `/internal/runs/<run>` and the work runs
 * inside that request, so Cloud Run keeps a CPU on it. Without one, as in local
 * development, it runs in this process. Either way it keeps the request's
 * languages.
 */
export async function runLater(
  run: Run,
  payload: RunPayload,
  here: () => Promise<void>,
): Promise<void> {
  const config = queueConfig();

  if (!config) {
    here().catch((error: Error) => {
      console.error(`[Runs] ${run} failed: ${error.message}`);
    });
    return;
  }

  client ??= new CloudTasksClient();

  const body = { ...payload, acceptLanguages: currentAcceptLanguages() };

  await client.createTask({
    parent: config.queue,
    task: {
      dispatchDeadline: { seconds: DEADLINE_SECONDS },
      httpRequest: {
        httpMethod: 'POST',
        url: `${config.url}/internal/runs/${run}`,
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify(body)).toString('base64'),
        oidcToken: { serviceAccountEmail: config.serviceAccountEmail, audience: config.url },
      },
    },
  });
}
