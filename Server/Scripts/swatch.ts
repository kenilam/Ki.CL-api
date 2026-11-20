/**
 * Chooses the swatches every visitor sees first on Swatch's home page, and
 * makes ready swatches' films again.
 *
 * Run (MONGODB_DATABASE picks the database, as for the server):
 *   npx tsx Server/Scripts/swatch.ts examples <hex> [<hex> ...]
 *   npx tsx Server/Scripts/swatch.ts refilm [<id> ...]
 *   npx tsx Server/Scripts/swatch.ts resound <id> [<id> ...]
 *
 * examples: each hex is a picked colour whose swatch is ready. They replace
 * the examples there were, up to five, and are listed in the order they were
 * made. A swatch is made through the API, by picking its colour on the page,
 * before it can be one.
 *
 * refilm: sets each swatch's photograph moving again, with its own sound,
 * for the swatches named, or every ready one. Each is one more paid film.
 *
 * resound: cleans the sound of the named swatches' films again with the
 * current settings, from Gemini's original, keeping the picture. Nothing is
 * paid for. A film made before originals were kept has to be made again.
 */
import 'dotenv/config';
import { connectDatabase, mongoose } from 'server/DataSources/MongoDB/index.js';
import { Swatches } from 'server/DataSources/MongoDB/Swatches/Model.js';
import { makeFilm } from 'server/Modules/Swatch/film.js';
import { encodeSound } from 'server/Modules/Swatch/encode.js';
import { persistVideo, readStored } from 'server/Modules/Swatch/persist.js';
import { SwatchSource, SwatchStatus } from 'server/Types/graphql.js';

const USAGE =
  'Usage: swatch.ts examples <hex> [<hex> ...], up to five; swatch.ts refilm [<id> ...]; or swatch.ts resound <id> [<id> ...]';
const HEX = /^#[0-9a-f]{6}$/i;
const MAX_EXAMPLES = 5;

async function examples(database: string, hexes: string[]): Promise<void> {
  if (!hexes.length || hexes.length > MAX_EXAMPLES || !hexes.every((hex) => HEX.test(hex))) {
    throw new Error(USAGE);
  }

  const wanted = hexes.map((hex) => hex.toUpperCase());
  const ready = await Swatches.find({ source: SwatchSource.Pick, status: SwatchStatus.Ready, hex: { $in: wanted } })
    .select('hex')
    .lean();
  const missing = wanted.filter((hex) => !ready.some((swatch) => swatch.hex === hex));

  if (missing.length) {
    throw new Error(`No ready swatch for ${missing.join(', ')} in ${database}. Pick those colours on the page first.`);
  }

  await Swatches.updateMany({ example: true }, { example: false });
  await Swatches.updateMany({ source: SwatchSource.Pick, hex: { $in: wanted } }, { example: true });

  console.log(`${wanted.length} swatch(es) are the examples in ${database}: ${wanted.join(', ')}.`);
}

async function refilm(ids: string[]): Promise<void> {
  const swatches = await Swatches.find({ status: SwatchStatus.Ready, ...(ids.length ? { _id: { $in: ids } } : {}) })
    .select('hex name motion scene sound still')
    .lean();

  for (const swatch of swatches) {
    if (!swatch.still || !swatch.motion || !swatch.scene) {
      console.log(`${swatch.hex} has no photograph or motion, so it was left as it is.`);
      continue;
    }

    const { audio, original, video } = await makeFilm(String(swatch._id), await readStored(swatch.still), {
      motion: swatch.motion,
      scene: swatch.scene,
      sound: swatch.sound ?? undefined,
    });

    await Swatches.updateOne({ _id: swatch._id }, { audio, original, video });
    console.log(`${swatch.hex} "${swatch.name}" has a new film ${audio ? 'with' : 'without'} sound: ${video}`);
  }
}

async function resound(ids: string[]): Promise<void> {
  if (!ids.length) {
    throw new Error(USAGE);
  }

  const swatches = await Swatches.find({ _id: { $in: ids }, original: { $ne: null } }).select('hex name original').lean();

  for (const swatch of swatches) {
    const film = await encodeSound(await readStored(String(swatch.original)));
    const video = await persistVideo(String(swatch._id), film.buffer);

    await Swatches.updateOne({ _id: swatch._id }, { audio: film.audio, video });
    console.log(`${swatch.hex} "${swatch.name}" has its sound cleaned again ${film.audio ? 'with' : 'without'} sound: ${video}`);
  }
}

async function run(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const commands: Record<string, () => Promise<void>> = {
    examples: () => examples(mongoose.connection.name, rest),
    refilm: () => refilm(rest),
    resound: () => resound(rest),
  };

  if (!command || !commands[command]) {
    throw new Error(USAGE);
  }

  await connectDatabase();
  await commands[command]();
}

run()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
