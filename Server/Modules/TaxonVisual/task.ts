import { runLater, type RunPayload } from 'server/DataSources/Google/Tasks/index.js';
import { releasePlate } from 'server/DataSources/MongoDB/TreeOfLife/claim.js';
import { runDescriptionOnly, runGeneration, runRegeneration } from './runs.js';

type Plate = { ottId: number; nodeId: string; name: string; rank: string | null };

export type PlateRun =
  | (Plate & { step: 'generate' })
  | (Plate & { step: 'regenerate'; assetId: string; previousDescription: string | null })
  | (Plate & { step: 'describe'; assetId: string });

const STEPS: { [S in PlateRun['step']]: (run: Extract<PlateRun, { step: S }>) => Promise<void> } = {
  generate: ({ ottId, nodeId, name, rank }) => runGeneration(ottId, nodeId, name, rank),
  regenerate: ({ ottId, nodeId, name, rank, assetId, previousDescription }) =>
    runRegeneration(ottId, nodeId, name, rank, assetId, previousDescription),
  describe: ({ ottId, nodeId, name, rank, assetId }) => runDescriptionOnly(ottId, nodeId, name, rank, assetId),
};

function runStep(run: PlateRun): Promise<void> {
  return (STEPS[run.step] as (run: PlateRun) => Promise<void>)(run);
}

/**
 * Queues a run on a plate this request has claimed. If it can't be queued,
 * the claim is let go, so the next view can try again.
 */
export async function startPlate(run: PlateRun): Promise<void> {
  await runLater('taxon-visual', run, () => runStep(run)).catch(async (error: Error) => {
    console.error(`[TaxonVisual] plate ${run.ottId} was not queued: ${error.message}`);
    await releasePlate(run.ottId);
  });
}

function isPlateRun(payload: RunPayload): payload is PlateRun {
  const { step, ottId, nodeId, name, rank } = payload;

  return typeof step === 'string' && step in STEPS
    && typeof ottId === 'number' && typeof nodeId === 'string' && typeof name === 'string'
    && (rank === null || typeof rank === 'string');
}

/** A plate's run, from the queue. */
export async function runTaxonVisualTask(payload: RunPayload): Promise<void> {
  if (isPlateRun(payload)) {
    await runStep(payload);
  }
}
