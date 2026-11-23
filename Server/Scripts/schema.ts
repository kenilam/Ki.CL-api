/**
 * Writes the gateway's public schema, composed from every service in the
 * registry, to Codegen/schema.graphql. The client's documents are generated
 * from it, so a field the client needs has to be published by its service
 * first.
 *
 * Run:
 *   npx tsx Server/Scripts/schema.ts <registry>
 *
 * registry: a bucket name, or a directory for local work.
 */
import { writeFileSync } from 'node:fs';
import appRoot from 'app-root-path';

import * as registry from 'server/registry.js';

const [source] = process.argv.slice(2);

if (!source) {
  throw new Error('Usage: schema.ts <registry>');
}

const records = await registry.read(source);
const { publicSdl } = registry.compose(records);

writeFileSync(appRoot.resolve('Codegen/schema.graphql'), `${publicSdl}\n`);
console.log(`Wrote the public schema of ${records.map((record) => record.name).join(', ')} from ${source}.`);
