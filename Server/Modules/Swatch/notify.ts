import { Notifications } from 'server/DataSources/MongoDB/Notifications/Model.js';
import { notify, text } from 'server/DataSources/MongoDB/Notifications/notify.js';
import { Swatches } from 'server/DataSources/MongoDB/Swatches/Model.js';
import { SwatchStage, SwatchStatus } from 'server/Types/graphql.js';
import { nameFor } from './name.js';
import type { SwatchResult } from './result.js';

const SWATCHES = Swatches.collection.collectionName;

function messageOf({ failure, stage, status }: SwatchResult) {
  if (status === SwatchStatus.Failed) {
    return text('api:swatch_error', { context: failure ?? 'unavailable' });
  }

  if (status === SwatchStatus.Ready) {
    return text('swatch', { context: 'ready' });
  }

  return text('swatch', { context: (stage ?? SwatchStage.Naming).toLowerCase() });
}

function titleOf(swatch: SwatchResult) {
  const name = nameFor(swatch);

  return name ? text('notification_title', { title: name }) : text('experiment', { context: 'swatch' });
}

// A shared colour picked while it's being made has several visitors waiting; their records are the list.
export async function notifySwatch(swatch: SwatchResult): Promise<void> {
  const waiting = await Notifications.distinct('ownerGUID', { collection: SWATCHES, documentId: swatch.id });
  const owners = new Set([...waiting, ...(swatch.startedBy ? [swatch.startedBy] : [])]);
  const title = titleOf(swatch);
  const message = messageOf(swatch);

  await Promise.all(
    [...owners].map((owner) => notify(owner, SWATCHES, swatch.id, { title, message })),
  );
}

export async function joinSwatch(ownerGUID: string, swatch: SwatchResult): Promise<void> {
  await notify(ownerGUID, SWATCHES, swatch.id, { title: titleOf(swatch), message: messageOf(swatch) });
}
