const MAX_STRING_LENGTH = 500;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export interface SanitizeResult {
  valid: boolean;
  sanitized: string;
  error?: string;
}

export function sanitizeString(input: string, maxLength = MAX_STRING_LENGTH): SanitizeResult {
  if (input.length > maxLength) {
    return {
      valid: false,
      sanitized: input,
      error: `Input string exceeds the maximum allowed length of ${maxLength} characters (got ${input.length}).`,
    };
  }

  const sanitized = input.replace(CONTROL_CHARS, "").trim();
  return { valid: true, sanitized };
}
