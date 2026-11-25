import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Storage } from '@google-cloud/storage';
import { composeServices } from '@theguild/federation-composition';
import { parse } from 'graphql';

export interface ServiceRecord {
  name: string;
  url: string;
  sdl: string;
  mount?: string;
  jwks?: string;
}

const FOLDER = 'services/';

const isDirectory = (registry: string) => registry.startsWith('.') || registry.startsWith('/');

async function fromBucket(bucket: string): Promise<ServiceRecord[]> {
  const [files] = await new Storage().bucket(bucket).getFiles({ prefix: FOLDER });

  return Promise.all(
    files
      .filter((file) => file.name.endsWith('.json'))
      .map(async (file) => JSON.parse((await file.download())[0].toString('utf8')) as ServiceRecord),
  );
}

async function fromDirectory(directory: string): Promise<ServiceRecord[]> {
  const folder = path.join(directory, FOLDER);
  const names = (await readdir(folder)).filter((name) => name.endsWith('.json'));

  return Promise.all(
    names.map(async (name) => JSON.parse(await readFile(path.join(folder, name), 'utf8')) as ServiceRecord),
  );
}

export function read(registry: string): Promise<ServiceRecord[]> {
  return isDirectory(registry) ? fromDirectory(registry) : fromBucket(registry);
}

export function compose(records: ServiceRecord[]) {
  const result = composeServices(
    records.map((record) => ({ name: record.name, url: record.url, typeDefs: parse(record.sdl) })),
  );

  if (result.errors) {
    throw new Error(`Composition failed:\n${result.errors.map((error) => `- ${error.message}`).join('\n')}`);
  }

  return result;
}
