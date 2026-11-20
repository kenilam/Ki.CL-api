import { createHash } from 'node:crypto';

import { Storage } from 'server/DataSources/Google/index.js';
import { imageContentType, imageExtension } from 'server/Helpers/imageFormat.js';

const PREFIX = 'swatch/';

function objectName(id: string, buffer: Buffer, extension: string): string {
  const digest = createHash('sha256').update(buffer).digest('hex').slice(0, 12);
  return `${PREFIX}${id}-${digest}.${extension}`;
}

export async function persistStill(id: string, buffer: Buffer): Promise<string> {
  const { path } = await Storage.uploadBuffer({
    buffer,
    objectName: objectName(id, buffer, imageExtension(buffer)),
    contentType: imageContentType(buffer),
  });

  return path;
}

// The bytes behind a path `persistStill` or `persistVideo` gave.
export async function readStored(path: string): Promise<Buffer> {
  const [buffer] = await Storage.getBucket()
    .file(path.slice(Storage.publicObjectPath('').length))
    .download();

  return buffer;
}

// Gemini's film as it came, kept so its sound can be cleaned again with other settings.
export async function persistOriginal(id: string, buffer: Buffer): Promise<string> {
  const { path } = await Storage.uploadBuffer({
    buffer,
    objectName: objectName(`${id}-original`, buffer, 'mp4'),
    contentType: 'video/mp4',
  });

  return path;
}

export async function persistVideo(id: string, buffer: Buffer): Promise<string> {
  const { path } = await Storage.uploadBuffer({
    buffer,
    objectName: objectName(id, buffer, 'mp4'),
    contentType: 'video/mp4',
  });

  return path;
}
