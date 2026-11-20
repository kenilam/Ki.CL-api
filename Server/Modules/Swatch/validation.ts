import * as v from 'valibot';
import { message } from 'server/Helpers/Validation/message.js';

export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_FILE_SIZE = '8 MB';

export const UploadSchema = v.object({
  file: v.object({
    data: v.pipe(
      v.string(),
      v.minLength(1, message('swatch_error_empty')),
      v.maxLength(Math.ceil(MAX_FILE_BYTES / 3) * 4, message('swatch_error_too_large', { size: MAX_FILE_SIZE })),
    ),
  }),
});

export const PickSchema = v.object({
  hex: v.pipe(v.string(), v.trim(), v.regex(/^#[0-9a-f]{6}$/i, message('swatch_error_colour')), v.toUpperCase()),
});
