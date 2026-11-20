import mongoose, { Schema, type Document, Types } from 'mongoose';

import {
  SwatchSource,
  SwatchStatus,
  type SwatchStage,
  type SwatchTone,
} from 'server/Types/graphql.js';

const FOR_GOOD_MS = 99 * 365 * 24 * 60 * 60 * 1000;

export const SwatchFailure = {
  Rejected: 'rejected',
  Unavailable: 'unavailable',
} as const;

export type SwatchFailure = (typeof SwatchFailure)[keyof typeof SwatchFailure];

export interface ISwatch extends Document {
  _id: Types.ObjectId;
  ownerGUID: string | null;
  startedBy: string | null;
  source: SwatchSource;
  status: SwatchStatus;
  stage: SwatchStage | null;
  hex: string | null;
  name: string | null;
  names: Map<string, string>;
  scene: string | null;
  motion: string | null;
  sound: string | null;
  tone: Omit<SwatchTone, '__typename'> | null;
  still: string | null;
  video: string | null;
  original: string | null;
  audio: boolean;
  failure: SwatchFailure | null;
  example: boolean;
  startedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SwatchSchema = new Schema<ISwatch>(
  {
    ownerGUID: { type: String, default: null },
    startedBy: { type: String, default: null },
    source: { type: String, required: true },
    status: { type: String, required: true },
    stage: { type: String, default: null },
    hex: { type: String, default: null },
    name: { type: String, default: null },
    names: { type: Map, of: String, default: () => new Map() },
    scene: { type: String, default: null },
    motion: { type: String, default: null },
    sound: { type: String, default: null },
    tone: { type: Schema.Types.Mixed, default: null },
    still: { type: String, default: null },
    video: { type: String, default: null },
    // Gemini's film as it came, before it was encoded.
    original: { type: String, default: null },
    // The film has its own sound track.
    audio: { type: Boolean, default: false },
    failure: { type: String, default: null },
    example: { type: Boolean, default: false },
    startedAt: { type: Date, required: true, default: () => new Date() },
    expiresAt: { type: Date, required: true, default: () => new Date(Date.now() + FOR_GOOD_MS) },
  },
  {
    timestamps: true,
    collection: 'swatches',
  },
);

SwatchSchema.index({ startedBy: 1, startedAt: -1 });
SwatchSchema.index({ ownerGUID: 1, createdAt: -1 });
SwatchSchema.index({ status: 1, startedAt: -1 });
SwatchSchema.index(
  { startedBy: 1 },
  { unique: true, partialFilterExpression: { status: SwatchStatus.Making, startedBy: { $type: 'string' } } },
);
SwatchSchema.index(
  { hex: 1 },
  { unique: true, partialFilterExpression: { source: SwatchSource.Pick } },
);
SwatchSchema.index(
  { example: 1, createdAt: 1 },
  { partialFilterExpression: { example: true } },
);
SwatchSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Swatches =
  (mongoose.models.Swatches as mongoose.Model<ISwatch>)
  || mongoose.model<ISwatch>('Swatches', SwatchSchema);
