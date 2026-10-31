/**
 * Trims and lowercases an email address before sending it to Supabase Auth.
 */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}
