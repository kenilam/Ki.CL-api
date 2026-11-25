import { createHash, randomBytes, randomUUID } from 'node:crypto';
import mongoose, { Schema } from 'mongoose';

import * as cookies from './cookies.js';
import * as tokens from './tokens.js';

/** The copy a renewal replaced still works this long, so two tabs renewing at once both keep the session. */
const LEEWAY_MS = 30_000;

interface Session {
  hash: string;
  previousHash?: string;
  rotatedAt?: Date;
  userGUID: string;
  kind: 'anon' | 'user';
  expiresAt: Date;
}

/* Core created this collection and its indexes, and still writes to it. */
const Sessions = mongoose.model<Session>(
  'Sessions',
  new Schema<Session>(
    {
      hash: { type: String, required: true },
      previousHash: String,
      rotatedAt: Date,
      userGUID: { type: String, required: true },
      kind: { type: String, enum: ['anon', 'user'], required: true },
      expiresAt: { type: Date, required: true },
    },
    { collection: 'sessions', timestamps: { createdAt: true, updatedAt: false }, autoIndex: false, autoCreate: false },
  ),
);

const digest = (token: string) => createHash('sha256').update(token).digest('hex');

export async function connect(): Promise<void> {
  const uri = process.env.MONGODB_ATLAS_URI;

  if (!uri) {
    throw new Error('MONGODB_ATLAS_URI is not set.');
  }

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DATABASE || 'test', retryWrites: true, w: 'majority' });
}

/** The kind of the live session a refresh token belongs to, or null when it has expired or was never issued. */
export async function kind(refreshToken: string): Promise<Session['kind'] | null> {
  const now = new Date();
  const hash = digest(refreshToken);

  const session = await Sessions.findOne(
    {
      $or: [{ hash }, { previousHash: hash, rotatedAt: { $gt: new Date(now.getTime() - LEEWAY_MS) } }],
      expiresAt: { $gt: now },
    },
    { kind: 1 },
  ).lean();

  return session?.kind ?? null;
}

export async function remove(refreshToken: string): Promise<void> {
  await Sessions.deleteOne({ hash: digest(refreshToken) });
}

export async function anonymous(): Promise<cookies.TokenSet> {
  const userGUID = randomUUID();
  const refreshToken = randomBytes(32).toString('base64url');

  await Sessions.create({ hash: digest(refreshToken), userGUID, kind: 'anon', expiresAt: cookies.refreshTokenExpiry() });

  return {
    access_token: await tokens.sign(userGUID, cookies.accessTokenExpiry()),
    refresh_token: refreshToken,
    aud: 'anon',
  };
}
