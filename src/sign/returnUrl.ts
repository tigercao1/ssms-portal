export const RETURN_HOSTS = ['ssnow.club', 'www.ssnow.club'];

export function allowedReturnUrl(raw: string | null): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  return RETURN_HOSTS.includes(url.hostname) && !url.port ? url.href : null;
}
