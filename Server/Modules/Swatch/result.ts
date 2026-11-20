import type { ISwatch } from 'server/DataSources/MongoDB/Swatches/Model.js';

type LeanSwatch = Pick<
  ISwatch,
  | '_id'
  | 'ownerGUID'
  | 'startedBy'
  | 'source'
  | 'status'
  | 'stage'
  | 'hex'
  | 'name'
  | 'tone'
  | 'still'
  | 'video'
  | 'audio'
  | 'failure'
  | 'createdAt'
  | 'updatedAt'
> & {
  // A lean read gives the map as a plain object.
  names?: Map<string, string> | Record<string, string>;
};

export type SwatchResult = ReturnType<typeof toResult>;

export function toResult(swatch: LeanSwatch) {
  return {
    id: String(swatch._id),
    ownerGUID: swatch.ownerGUID,
    startedBy: swatch.startedBy,
    source: swatch.source,
    status: swatch.status,
    stage: swatch.stage,
    hex: swatch.hex,
    name: swatch.name,
    names: swatch.names instanceof Map ? Object.fromEntries(swatch.names) : (swatch.names ?? {}),
    tone: swatch.tone,
    still: swatch.still,
    video: swatch.video,
    // Swatches made before films kept their sound have none.
    audio: swatch.audio ?? false,
    failure: swatch.failure,
    createdAt: swatch.createdAt,
    updatedAt: swatch.updatedAt,
  };
}
