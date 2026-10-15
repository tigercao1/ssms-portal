/**
 * Downloads a presigned file served as an attachment. Navigating this tab to
 * it starts the download without leaving the page or opening another tab, so
 * no popup blocker is involved even after an await.
 */
export async function downloadPresigned<T extends { url: string }>(
  get: () => Promise<T>,
): Promise<T> {
  const signed = await get();
  window.location.assign(signed.url);
  return signed;
}
