import * as v from 'valibot';

import { runProviderFailover, UnusableReplyError } from 'server/DataSources/AI/failover.js';
import { buildWideImageProviders } from 'server/DataSources/AI/image/index.js';
import { parseModelList } from 'server/DataSources/AI/modelList.js';
import type { GeneratedImage } from 'server/DataSources/AI/image/types.js';
import { buildVisionProviders } from 'server/DataSources/AI/vision/index.js';
import { imageContentType } from 'server/Helpers/imageFormat.js';
import { parseModelJson } from 'server/Helpers/parseModelJson.js';
import type { Description } from './describe.js';
import { SCORE, stillPrompt } from './prompt.js';

const LOG = '[Swatch]';
const PASS = 7;
// Fabric and petals fill a frame without one focal point.
const SUBJECT_PASS = 6;
const IMAGE_MODELS = ['gemini-3-pro-image', 'gemini-3.1-flash-image'];

const ScoreSchema = v.object({
  colour: v.number(),
  photo: v.number(),
  subject: v.number(),
  clean: v.boolean(),
  notes: v.optional(v.array(v.string()), []),
});

type Score = v.InferOutput<typeof ScoreSchema>;

type Candidate = { image: GeneratedImage; score: Score | null };

function attempts(): number {
  const value = Number(process.env.SWATCH_MAX_ATTEMPTS);
  return Number.isInteger(value) && value >= 1 ? value : 2;
}

const passes = ({ clean, colour, photo, subject }: Score) =>
  clean && Math.min(colour, photo) >= PASS && subject >= SUBJECT_PASS;

const overall = (score: Score | null) =>
  score && score.clean ? score.colour + score.photo + score.subject : 0;

function imageModels(): string[] {
  const models = parseModelList(process.env.SWATCH_IMAGE_MODELS);
  return models.length ? models : IMAGE_MODELS;
}

// Null when no reviewer answered, so the still is kept unreviewed rather than given a made-up pass.
async function review(image: Buffer, hex: string, description: Description): Promise<Score | null> {
  const providers = buildVisionProviders({
    system: SCORE,
    user: `The colour is ${description.name} (${hex}). The brief was: ${description.scene}`,
    image,
    mime: imageContentType(image),
    maxTokens: 1_024,
    temperature: 0.1,
  });

  try {
    return await runProviderFailover(
      providers.map((provider) => ({
        ...provider,
        run: async () => {
          const parsed = v.safeParse(ScoreSchema, parseModelJson(await provider.run()));

          if (!parsed.success) {
            throw new UnusableReplyError('The review could not be read');
          }

          return parsed.output;
        },
      })),
      'vision',
    );
  } catch (error) {
    console.warn(`${LOG} no review: ${(error as Error).message}`);
    return null;
  }
}

export async function drawStill(hex: string, description: Description): Promise<GeneratedImage> {
  let best: Candidate | null = null;
  let notes: string[] = [];

  for (let attempt = 1; attempt <= attempts(); attempt += 1) {
    const image = await runProviderFailover(
      buildWideImageProviders(stillPrompt(hex, description, notes), imageModels()),
      'image',
    );
    const score = await review(image.buffer, hex, description);

    console.log(`${LOG} still ${attempt} ${image.generator} ${score ? JSON.stringify(score) : 'unreviewed'}`);

    if (!best || overall(score) > overall(best.score)) {
      best = { image, score };
    }

    if (!score || passes(score)) {
      break;
    }

    notes = score.notes.slice(0, 3);
  }

  if (!best) {
    throw new Error('No still was drawn');
  }

  return best.image;
}
