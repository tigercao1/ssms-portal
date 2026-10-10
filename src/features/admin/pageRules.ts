export const MAX_PAGE_BYTES = 2_097_152;
export const MAX_SLUG_LENGTH = 80;
export const MAX_TITLE_LENGTH = 200;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HTML_FILE_PATTERN = /\.html?$/i;

export function suggestSlug(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join('-')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
}

export function isValidSlug(slug: string): boolean {
  return slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug);
}

export type HtmlFileProblem = 'type' | 'size';

export function checkHtmlFile(file: File): HtmlFileProblem | null {
  if (!HTML_FILE_PATTERN.test(file.name)) return 'type';
  if (file.size > MAX_PAGE_BYTES) return 'size';
  return null;
}
