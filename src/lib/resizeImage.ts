export const MAX_IMAGE_DIMENSION = 2000;
export const RESIZED_IMAGE_TYPE = 'image/jpeg';
export const RESIZED_IMAGE_QUALITY = 0.85;

export function fitWithin(
  width: number,
  height: number,
  maxDimension: number = MAX_IMAGE_DIMENSION,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxDimension) return { width, height };
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return createImageBitmap(file);
  }
}

export async function resizeImage(
  file: Blob,
  maxDimension: number = MAX_IMAGE_DIMENSION,
): Promise<Blob> {
  const bitmap = await decode(file);
  try {
    const { width, height } = fitWithin(
      bitmap.width,
      bitmap.height,
      maxDimension,
    );
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob && blob.type === RESIZED_IMAGE_TYPE
            ? resolve(blob)
            : reject(new Error('Image encoding failed')),
        RESIZED_IMAGE_TYPE,
        RESIZED_IMAGE_QUALITY,
      );
    });
  } finally {
    bitmap.close();
  }
}
