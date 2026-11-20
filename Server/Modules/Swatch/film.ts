import { runProviderFailover } from 'server/DataSources/AI/failover.js';
import { buildLoopProviders } from 'server/DataSources/AI/video/index.js';
import { imageContentType } from 'server/Helpers/imageFormat.js';
import type { Description } from './describe.js';
import { encodeFilm } from './encode.js';
import { persistOriginal, persistVideo } from './persist.js';
import { motionPrompt } from './prompt.js';

const LOG = '[Swatch]';

function videoSeconds(): number {
  const value = Number(process.env.SWATCH_VIDEO_SECONDS);
  return Number.isInteger(value) && value >= 3 && value <= 10 ? value : 8;
}

// Sets the still moving with its own sound, encodes the film and stores it.
export async function makeFilm(
  id: string,
  still: Buffer,
  description: Pick<Description, 'motion' | 'scene' | 'sound'>,
): Promise<{ audio: boolean; original: string; video: string }> {
  const made = await runProviderFailover(
    buildLoopProviders({
      frame: still,
      mime: imageContentType(still),
      prompt: motionPrompt(description),
      seconds: videoSeconds(),
      resolution: process.env.SWATCH_VIDEO_RESOLUTION?.trim() || '1080p',
    }),
    'video',
  );

  // The film is already paid for, so a failed re-encode keeps Gemini's file, played without its
  // sound, rather than failing the swatch.
  const film = await encodeFilm(made.buffer).catch((error: Error) => {
    console.error(`${LOG} ${id} kept the film as Gemini made it: ${error.message}`);
    return { buffer: made.buffer, audio: false };
  });

  const [original, video] = await Promise.all([persistOriginal(id, made.buffer), persistVideo(id, film.buffer)]);

  return { audio: film.audio, original, video };
}
