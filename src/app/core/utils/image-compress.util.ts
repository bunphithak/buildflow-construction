const MAX_EDGE = 480;
const MAX_BYTES = 700000;

export async function compressImageToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('UPLOAD_FAILED');
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_BYTES) {
      return dataUrl;
    }
  }
  throw new Error('IMAGE_TOO_LARGE');
}

export function isRemoteStorageUrl(url: string | undefined): boolean {
  return !!url && /^https?:\/\//i.test(url) && url.includes('firebasestorage');
}
