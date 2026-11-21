import type { mongo } from 'mongoose';

import { mongoose } from './index.js';

type ChangeStream = mongo.ChangeStream;
type ChangeStreamDocument = mongo.ChangeStreamDocument;
type Document = mongo.Document;
type ResumeToken = mongo.ResumeToken;

type Listener = (document: Document) => void;

const RETRY_MS = 5000;

const listeners = new Map<string, Listener[]>();

let stream: ChangeStream | null = null;
let resumeAfter: ResumeToken | undefined;
let stopped = false;

/**
 * Calls `listener` with the whole document whenever a record in `collection`
 * is written, by this process or any other. A module registers here how its
 * records become the events its subscriptions push.
 */
export function onChange(collection: string, listener: Listener): void {
  listeners.set(collection, [...(listeners.get(collection) ?? []), listener]);
}

/**
 * Whether the change stream is open. While it is, events come from it, so a
 * module doesn't publish its own writes as well. While it isn't, a module
 * publishes in this process, as before.
 */
export function watchingChanges(): boolean {
  return stream !== null;
}

function dispatch(change: ChangeStreamDocument): void {
  if (!('fullDocument' in change) || !change.fullDocument || !('ns' in change)) {
    return;
  }

  for (const listener of listeners.get(change.ns.coll ?? '') ?? []) {
    try {
      listener(change.fullDocument);
    } catch (error) {
      console.error(`[Changes] ${change.ns.coll} listener failed:`, error);
    }
  }
}

function open(): void {
  const { db } = mongoose.connection;

  if (stopped || !db || listeners.size === 0) {
    return;
  }

  try {
    const opened = db.watch(
      [{
        $match: {
          operationType: { $in: ['insert', 'update', 'replace'] },
          'ns.coll': { $in: [...listeners.keys()] },
        },
      }],
      { fullDocument: 'updateLookup', ...(resumeAfter ? { resumeAfter } : {}) },
    );

    // The first resume token comes with the stream's first answer from the server.
    opened.once('resumeTokenChanged', () => {
      stream = opened;
      console.log(`[Changes] watching ${[...listeners.keys()].join(', ')}`);
    });
    opened.on('change', (change: ChangeStreamDocument) => {
      resumeAfter = change._id;
      dispatch(change);
    });
    opened.on('error', (error: Error) => {
      console.error(`[Changes] stream closed: ${error.message}`);
      stream = null;
      void opened.close().catch(() => undefined);
      setTimeout(open, RETRY_MS);
    });
  } catch (error) {
    console.error(`[Changes] could not watch: ${(error as Error).message}`);
    stream = null;
    setTimeout(open, RETRY_MS);
  }
}

/** Opens the process's one change stream. Atlas Flex allows only a few. */
export function watchChanges(): void {
  stopped = false;
  open();
}

export async function stopWatchingChanges(): Promise<void> {
  stopped = true;
  await stream?.close().catch(() => undefined);
  stream = null;
}
