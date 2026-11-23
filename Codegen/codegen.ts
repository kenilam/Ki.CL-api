import type { CodegenConfig } from '@graphql-codegen/cli';

const SCALAR_MAP_CLIENT = {
  DateTime: '../scalars#DateTimeString',
  EmailAddress: '../scalars#EmailAddress',
  JWT: '../scalars#JWT',
  UUID: '../scalars#UUID',
  URL: '../scalars#URL',
  NonEmptyString: '../scalars#NonEmptyString',
  AcceptLanguage: 'string',
  JSONObject: 'Record<string, string | number>',
};

const config: CodegenConfig = {
  schema: './schema.graphql',
  generates: {
    // Auto-generated operations (all fields), typed documents and client types
    '../Client/src/generated/': {
      preset: 'client',
      plugins: [],
      presetConfig: {
        gqlTagName: 'gql',
      },
      config: {
        scalars: SCALAR_MAP_CLIENT,
        dedupeFragments: true,
      },
      documents: '../Client/src/operations.graphql',
    },
  },
};

export default config;
