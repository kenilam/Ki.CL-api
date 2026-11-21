import { runLater, type RunPayload } from 'server/DataSources/Google/Tasks/index.js';
import { failTurn, respond } from './respond.js';

/** A turn, from the queue. */
export async function runImageAgentTask({ threadId, owner, text }: RunPayload): Promise<void> {
  if (typeof threadId !== 'string' || typeof owner !== 'string' || typeof text !== 'string') {
    return;
  }

  await respond(threadId, owner, text);
}

/** Hands the turn to the queue once the person's message is saved. */
export async function startTurn(threadId: string, owner: string, text: string): Promise<void> {
  await runLater('image-agent', { threadId, owner, text }, () => respond(threadId, owner, text))
    .catch((error: unknown) => failTurn(threadId, error));
}
