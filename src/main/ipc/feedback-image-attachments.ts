// Why: mirrors the supported-image allow-list. Every accepted type needs a
// filename extension — the reporting sink (BW #553) writes attachments to
// disk for the WeLink group-space upload, where the extension is the only
// content-type signal.
export const FEEDBACK_IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
}

export const MAX_FEEDBACK_IMAGE_COUNT = 4
export const MAX_FEEDBACK_IMAGE_BYTES = 8 * 1024 * 1024

export type FeedbackImageAttachment = {
  contentType: string
  data: Uint8Array
}

export function isSupportedFeedbackImageContentType(contentType: string): boolean {
  // Why: `in` walks the prototype chain, so "constructor" or "__proto__" would
  // pass the allow-list and name the upload after an inherited member.
  return Object.hasOwn(FEEDBACK_IMAGE_EXTENSIONS, contentType)
}

/** Defence in depth: the renderer validates first, but this channel is reachable directly. */
export function validateFeedbackImages(images: unknown): string | null {
  if (!Array.isArray(images)) {
    return 'Image attachments must be a list.'
  }
  if (images.length > MAX_FEEDBACK_IMAGE_COUNT) {
    return `Attach ${MAX_FEEDBACK_IMAGE_COUNT} images or fewer.`
  }
  for (const image of images) {
    if (!image || typeof image !== 'object') {
      return 'Invalid image attachment.'
    }
    if (typeof image.contentType !== 'string') {
      return 'Invalid image attachment content type.'
    }
    if (!isSupportedFeedbackImageContentType(image.contentType)) {
      return 'Unsupported image type.'
    }
    if (!(image.data instanceof Uint8Array)) {
      return 'Invalid image attachment bytes.'
    }
    if (image.data.byteLength === 0) {
      return 'Image attachment is empty.'
    }
    if (image.data.byteLength > MAX_FEEDBACK_IMAGE_BYTES) {
      return `Each image must be ${MAX_FEEDBACK_IMAGE_BYTES} bytes or fewer.`
    }
  }
  return null
}
