import { randomUUID } from 'node:crypto';

import { Types } from 'mongoose';

import { runLater, runsQueued, type RunPayload } from 'server/DataSources/Google/Tasks/index.js';
import {
  deleteObject,
  downloadObject,
  PRIVATE_PREFIX,
  uploadBuffer,
} from 'server/DataSources/Google/Storage/index.js';
import { failReading, runReading } from './run.js';

const SHEETS = `${PRIVATE_PREFIX}kinetic-light/`;

/**
 * Hands a sheet to the queue. A task can carry only a megabyte, and the whole
 * read needs the sheet, so it's kept privately until the read ends and then
 * deleted. Without a queue it's read in this process and never stored.
 */
export async function startReading(id: Types.ObjectId, name: string, bytes: Buffer, mime: string): Promise<void> {
  const here = () => runReading(id, name, bytes, mime);

  if (!runsQueued()) {
    await runLater('kinetic-light', {}, here);
    return;
  }

  const sheet = `${SHEETS}${String(id)}-${randomUUID()}`;

  try {
    await uploadBuffer({ buffer: bytes, objectName: sheet, contentType: mime, cacheControl: 'private, no-store' });
    await runLater('kinetic-light', { id: String(id), name, mime, sheet }, here);
  } catch (error) {
    await deleteObject(sheet).catch(() => undefined);
    await failReading(id, error);
  }
}

/** A sheet's read, from the queue. The sheet is deleted however it ends. */
export async function runKineticLightTask({ id, name, mime, sheet }: RunPayload): Promise<void> {
  const valid = typeof id === 'string' && Types.ObjectId.isValid(id)
    && typeof name === 'string' && typeof mime === 'string'
    && typeof sheet === 'string' && sheet.startsWith(SHEETS);

  if (!valid) {
    return;
  }

  try {
    await runReading(new Types.ObjectId(id), name, await downloadObject(sheet), mime);
  } finally {
    await deleteObject(sheet).catch((error: Error) => {
      console.error(`[KineticLight] ${sheet} was not deleted: ${error.message}`);
    });
  }
}
