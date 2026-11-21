import type { UpdateQuery } from 'mongoose';

import { TreeOfLifeNodes, type ITreeOfLifeNode } from './Model.js';

// Longer than a run's deadline on the queue, so a live run never loses its claim.
const CLAIM_MS = 16 * 60 * 1000;

/** Whether a run holds the plate now. */
export function plateClaimed(node: Pick<ITreeOfLifeNode, 'visualRunUntil'>): boolean {
  return Boolean(node.visualRunUntil && node.visualRunUntil.getTime() > Date.now());
}

/**
 * Takes the plate for one run, with whatever else the run starts by writing.
 * Only one request can win it, whichever instance it's on. Returns whether
 * this one did.
 */
export async function claimPlate(ottId: number, update: UpdateQuery<ITreeOfLifeNode> = {}): Promise<boolean> {
  const now = new Date();
  const claimed = await TreeOfLifeNodes.findOneAndUpdate(
    { ottId, $or: [{ visualRunUntil: null }, { visualRunUntil: { $lte: now } }] },
    { ...update, $set: { ...update.$set, visualRunUntil: new Date(now.getTime() + CLAIM_MS) } },
  ).lean();

  return claimed !== null;
}

export async function releasePlate(ottId: number): Promise<void> {
  await TreeOfLifeNodes.updateOne({ ottId }, { $set: { visualRunUntil: null } });
}
