/**
 * Normalizes any external URL (LinkedIn, GitHub, Portfolio, DOI) so that it always
 * starts with https://, preventing relative route navigation and blank pages in SPAs.
 */
export function formatExternalUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  // If already starts with http:// or https://, return as is
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // If starts with "//", prepend "https:"
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  // Prepend https://
  return `https://${trimmed}`;
}
