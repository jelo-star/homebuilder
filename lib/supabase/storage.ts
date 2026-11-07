export function resolvePortfolioImageUrl(filePath: string | null | undefined) {
  if (!filePath) return '';
  if (/^(?:https?:|data:|blob:|\/)/i.test(filePath)) return filePath;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return supabaseUrl
    ? `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/portfolio/${encodeURI(filePath)}`
    : filePath;
}
