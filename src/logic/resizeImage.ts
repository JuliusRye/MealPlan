export const MAX_EDGE = 1600
export const JPEG_QUALITY = 0.8

/** Width and height scaled so the long edge is at most `maxEdge`. Never upscales. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/**
 * Downscale a photo to at most MAX_EDGE px on the long edge and re-encode it
 * as JPEG, so a 5–10 MB phone photo becomes a few hundred KB. Re-encoding
 * also applies the EXIF rotation and drops the metadata (e.g. GPS).
 * Rejects if the browser can't decode the file.
 */
export async function resizeImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE)
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is not available')
    // JPEG has no transparency; give transparent PNGs a white background.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })
  } finally {
    bitmap.close()
  }
}
