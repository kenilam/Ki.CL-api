import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The film's sound keeps its ambience: it only loses the lowest rumble and a little of the steady hiss,
// and is evened out to one loudness across swatches. A few hundredths of a second fade at each end
// keep the loop from clicking where it starts again.
const SOUND = [
  '-af', [
    'highpass=f=100',
    'afftdn=nr=12:nf=-45:tn=1',
    'loudnorm=I=-28:TP=-2:LRA=15',
    'afade=t=in:d=0.04,areverse,afade=t=in:d=0.04,areverse',
  ].join(','),
  '-c:a', 'aac',
  '-b:a', '96k',
  '-ar', '48000',
];

// Gemini's 1080p film is 7 to 13 MB; at CRF 24 it's 2 to 4 MB and about 43 dB PSNR from it.
const FILM = [
  '-c:v', 'libx264',
  '-preset', 'slow',
  '-crf', '24',
  '-maxrate', '5M',
  '-bufsize', '10M',
  '-pix_fmt', 'yuv420p',
  ...SOUND,
  '-movflags', '+faststart',
];

// A film made again from Gemini's original keeps its picture and only has its sound cleaned again.
const RESOUND = ['-c:v', 'copy', ...SOUND, '-movflags', '+faststart'];

const AUDIO = /Stream #\d+:\d+.*: Audio:/;

// A track whose loudest moment is under this is silence, and the page plays the tone instead.
const FAINTEST = -50;
const PEAK = /max_volume: (-?[\d.]+|-inf) dB/;

// Resolves with whether the film has a sound track.
function ffmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH?.trim() || 'ffmpeg', ['-hide_banner', ...args]);
    let log = '';

    child.stderr.on('data', (chunk: Buffer) => {
      log += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(log);
        return;
      }

      reject(new Error(`ffmpeg exited with ${code}: ${log.slice(-300)}`));
    });
  });
}

// Whether the encoded film has a sound track loud enough to be heard.
async function run(input: string, output: string, args: string[]): Promise<boolean> {
  const log = await ffmpeg(['-y', '-i', input, ...args, output]);

  if (!AUDIO.test(log)) {
    return false;
  }

  const peak = (await ffmpeg(['-i', output, '-vn', '-af', 'volumedetect', '-f', 'null', '-'])).match(PEAK)?.[1];

  return peak !== undefined && peak !== '-inf' && Number(peak) >= FAINTEST;
}
async function encode(film: Buffer, args: string[]): Promise<{ buffer: Buffer; audio: boolean }> {
  const folder = await mkdtemp(join(tmpdir(), 'swatch-'));
  const input = join(folder, 'in.mp4');
  const output = join(folder, 'out.mp4');

  try {
    await writeFile(input, film);
    const audio = await run(input, output, args);

    return { buffer: await readFile(output), audio };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

// `faststart` moves the index to the front, which needs a seekable file rather than a pipe.
export function encodeFilm(film: Buffer) {
  return encode(film, FILM);
}

export function encodeSound(film: Buffer) {
  return encode(film, RESOUND);
}
