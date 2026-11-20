import * as v from 'valibot';

import { runProviderFailover, UnusableReplyError } from 'server/DataSources/AI/failover.js';
import { buildTextChatProviders } from 'server/DataSources/AI/text/index.js';
import { buildVisionProviders } from 'server/DataSources/AI/vision/index.js';
import { parseModelJson } from 'server/Helpers/parseModelJson.js';
import { SwatchMode, SwatchTimbre, type SwatchTone } from 'server/Types/graphql.js';
import { DESCRIBE_PICK, DESCRIBE_UPLOAD } from './prompt.js';

const MAX_TOKENS = 2_048;
// Warm, so two visitors who pick the same kind of colour don't get the same scene.
const TEMPERATURE = 0.9;
const HEX = /^#[0-9a-f]{6}$/i;
const ROOT = { min: 36, max: 60 };
const UNIT = { min: 0, max: 1 };

const MODES = {
  major: SwatchMode.Major,
  minor: SwatchMode.Minor,
  lydian: SwatchMode.Lydian,
  dorian: SwatchMode.Dorian,
  phrygian: SwatchMode.Phrygian,
  mixolydian: SwatchMode.Mixolydian,
};

const TIMBRES = {
  pad: SwatchTimbre.Pad,
  glass: SwatchTimbre.Glass,
  bell: SwatchTimbre.Bell,
  drone: SwatchTimbre.Drone,
  air: SwatchTimbre.Air,
};

const Line = v.pipe(v.string(), v.trim(), v.minLength(1));

const ReplySchema = v.object({
  hex: v.optional(v.pipe(v.string(), v.trim(), v.regex(HEX))),
  name: v.pipe(Line, v.maxLength(40)),
  scene: v.pipe(Line, v.maxLength(1_200)),
  motion: v.pipe(Line, v.maxLength(400)),
  sound: v.optional(v.pipe(Line, v.maxLength(300))),
  tone: v.object({
    root: v.number(),
    mode: v.picklist(Object.keys(MODES) as (keyof typeof MODES)[]),
    timbre: v.picklist(Object.keys(TIMBRES) as (keyof typeof TIMBRES)[]),
    brightness: v.number(),
    movement: v.number(),
    density: v.number(),
  }),
});

export type Description = {
  hex: string;
  name: string;
  scene: string;
  motion: string;
  sound?: string;
  tone: Omit<SwatchTone, '__typename'>;
};

const clamp = (value: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, value));

function toDescription(text: string): Omit<Description, 'hex'> & { hex?: string } {
  const parsed = v.safeParse(ReplySchema, parseModelJson(text));

  if (!parsed.success) {
    throw new UnusableReplyError(`The description could not be read: ${text.slice(0, 200)}`);
  }

  const { hex, name, scene, motion, sound, tone } = parsed.output;

  return {
    hex: hex?.toUpperCase(),
    name,
    scene,
    motion,
    sound,
    tone: {
      root: Math.round(clamp(tone.root, ROOT)),
      mode: MODES[tone.mode],
      timbre: TIMBRES[tone.timbre],
      brightness: clamp(tone.brightness, UNIT),
      movement: clamp(tone.movement, UNIT),
      density: clamp(tone.density, UNIT),
    },
  };
}

export async function describePick(hex: string): Promise<Description> {
  const providers = buildTextChatProviders({
    system: DESCRIBE_PICK,
    user: hex,
    maxTokens: MAX_TOKENS,
    temperature: TEMPERATURE,
  });

  return runProviderFailover(
    providers.map((provider) => ({
      ...provider,
      run: async () => ({ ...toDescription(await provider.run()), hex }),
    })),
    'description',
  );
}

// The picture is never stored: only what the model says about it is kept.
export async function describeUpload(image: Buffer, mime: string): Promise<Description> {
  const providers = buildVisionProviders({
    system: DESCRIBE_UPLOAD,
    user: 'Describe the swatch for this picture.',
    image,
    mime,
    maxTokens: MAX_TOKENS,
    temperature: TEMPERATURE,
  });

  return runProviderFailover(
    providers.map((provider) => ({
      ...provider,
      run: async () => {
        const { hex, ...description } = toDescription(await provider.run());

        if (!hex) {
          throw new UnusableReplyError('The description has no colour');
        }

        return { ...description, hex };
      },
    })),
    'vision',
  );
}
