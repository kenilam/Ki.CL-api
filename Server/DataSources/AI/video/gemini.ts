import { throwIfProviderLimitError } from 'server/DataSources/AI/providerLimitError.js';
import type { LoopOptions } from './types.js';

const API = 'https://generativelanguage.googleapis.com/v1beta';

// Veo 3.1 left the Gemini API on 2026-10-22.
export const DEFAULT_GEMINI_VIDEO_MODEL = 'gemini-omni-1.2-flash';

const FILE_READY_ATTEMPTS = 24;
const FILE_READY_WAIT_MS = 5_000;

type Content = { type?: string; mime_type?: string; data?: string; uri?: string };

interface Interaction {
  steps?: Array<{ type?: string; content?: Content[] }>;
  error?: { message?: string; status?: string; code?: number };
}

interface GeminiFile {
  state?: string;
  error?: { message?: string };
}

export function resolveGeminiVideoModel(): string {
  return process.env.GEMINI_VIDEO_MODEL?.trim() || DEFAULT_GEMINI_VIDEO_MODEL;
}

export function isGeminiVideoConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': process.env.GEMINI_API_KEY?.trim() ?? '',
  };
}

function videoOf(interaction: Interaction): Content | undefined {
  return interaction.steps
    ?.filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .find((content) => content.type === 'video');
}

// A file delivered by URI can still be processing when the reply comes.
async function waitForFile(uri: string): Promise<void> {
  const name = new URL(uri).pathname.replace(/^\/v1beta\//, '').replace(/:download$/, '');

  for (let attempt = 0; attempt < FILE_READY_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${API}/${name}`, { headers: headers() });
    const file = (await response.json()) as GeminiFile;

    if (file.state === 'FAILED') {
      throw new Error(file.error?.message ?? 'Gemini could not process the video file');
    }

    if (!response.ok || file.state === undefined || file.state === 'ACTIVE') {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, FILE_READY_WAIT_MS);
    });
  }

  throw new Error('Gemini video file did not become ready');
}

async function download(video: Content): Promise<Buffer> {
  if (video.data) {
    return Buffer.from(video.data, 'base64');
  }

  if (!video.uri) {
    throw new Error('Gemini returned a video with neither data nor a URI');
  }

  await waitForFile(video.uri);

  const response = await fetch(video.uri, { headers: headers(), redirect: 'follow' });

  if (!response.ok) {
    throw new Error(`Gemini video download failed (${response.status})`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function generateLoopGemini(
  { frame, mime, prompt, resolution, seconds }: LoopOptions,
  model: string,
): Promise<Buffer> {
  const provider = `gemini:${model}`;
  const image = { type: 'image', data: frame.toString('base64'), mime_type: mime };

  const response = await fetch(`${API}/interactions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model,
      input: [image, image, { type: 'text', text: prompt }],
      response_format: {
        type: 'video',
        duration: `${seconds}s`,
        aspect_ratio: '16:9',
        resolution,
        delivery: 'uri',
      },
    }),
  });

  const payload = (await response.json()) as Interaction;

  if (!response.ok) {
    const message = payload.error?.message
      ?? payload.error?.status
      ?? `Gemini HTTP ${response.status}`;
    throwIfProviderLimitError(message, provider);
    throw new Error(message);
  }

  const video = videoOf(payload);

  if (!video) {
    throw new Error('Gemini returned no video');
  }

  return download(video);
}
