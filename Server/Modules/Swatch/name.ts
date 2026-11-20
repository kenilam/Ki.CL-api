import * as v from 'valibot';

import { runProviderFailover, UnusableReplyError } from 'server/DataSources/AI/failover.js';
import { buildTextChatProviders } from 'server/DataSources/AI/text/index.js';
import { findAcceptLanguageStatuses } from 'server/DataSources/MongoDB/translationsCache.js';
import { currentAcceptLanguages } from 'server/Helpers/acceptLanguage.js';
import { SOURCE } from 'server/Helpers/language.js';
import { parseModelJson } from 'server/Helpers/parseModelJson.js';
import type { SwatchResult } from './result.js';

const ENGLISH = new Intl.Locale(SOURCE).language;

const isEnglish = (language: string) => new Intl.Locale(language).language === ENGLISH;

const NamesSchema = v.record(v.string(), v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)));

// Translated once while it's made: a picked colour is shared, and asking per read would put a model call behind every list.
export async function translateNames(name: string): Promise<Record<string, string>> {
  const languages = (await findAcceptLanguageStatuses())
    .map(({ acceptLanguage }) => acceptLanguage)
    .filter((language) => !isEnglish(language));

  if (!languages.length) {
    return {};
  }

  const providers = buildTextChatProviders({
    system: [
      'You translate the name of a colour, as a paint chart prints it, into each language listed by its',
      'BCP 47 tag. Write it the way a paint maker in that language would name the colour: short and',
      'natural, not word for word. Reply with ONLY valid JSON: an object with each tag as a key and the',
      'name as its value.',
    ].join(' '),
    user: `${name}\n${languages.join(', ')}`,
    // Reasoning tokens come out of the same budget before the JSON starts.
    maxTokens: 4_096,
    temperature: 0.2,
  });

  return runProviderFailover(
    providers.map((provider) => ({
      ...provider,
      run: async () => {
        const parsed = v.safeParse(NamesSchema, parseModelJson(await provider.run()));

        if (!parsed.success) {
          throw new UnusableReplyError(`The names of "${name}" could not be read`);
        }

        return Object.fromEntries(languages.flatMap((language) => {
          const translated = parsed.output[language];
          return translated ? [[language, translated]] : [];
        }));
      },
    })),
    'translation',
  );
}

export function nameFor({ name, names }: SwatchResult): string | null {
  const [language = SOURCE] = currentAcceptLanguages();

  if (!name || isEnglish(language)) {
    return name;
  }

  return names[language] ?? name;
}
