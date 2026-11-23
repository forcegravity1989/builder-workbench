import { describe, expect, it } from 'vitest'
import {
  MAX_FEEDBACK_IMAGE_BYTES,
  MAX_FEEDBACK_IMAGE_COUNT,
  isSupportedFeedbackImageContentType,
  validateFeedbackImages
} from './feedback-image-attachments'

function image(contentType: string, bytes = 4): { contentType: string; data: Uint8Array } {
  return { contentType, data: new Uint8Array(bytes).fill(1) }
}

describe('isSupportedFeedbackImageContentType', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])('accepts %s', (contentType) => {
    expect(isSupportedFeedbackImageContentType(contentType)).toBe(true)
  })

  it.each(['image/bmp', 'image/svg+xml', 'application/pdf', ''])('rejects %s', (contentType) => {
    expect(isSupportedFeedbackImageContentType(contentType)).toBe(false)
  })

  // Why: the allow-list is an object literal, so a prototype member must not
  // pass as a content type and get spliced into the upload filename.
  it.each(['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty'])(
    'rejects the inherited member %s',
    (contentType) => {
      expect(isSupportedFeedbackImageContentType(contentType)).toBe(false)
      expect(validateFeedbackImages([image(contentType)])).toBe('Unsupported image type.')
    }
  )
})

// Why (BW #553): the feedbackImageFilename / appendFeedbackImagesToFormData
// cases were removed with the HTTP multipart transport — the WeLink sink
// writes attachments to disk and derives extensions from the same allow-list.

describe('validateFeedbackImages', () => {
  it('accepts a full batch of supported images', () => {
    expect(
      validateFeedbackImages(
        Array.from({ length: MAX_FEEDBACK_IMAGE_COUNT }, () => image('image/png'))
      )
    ).toBeNull()
  })

  it('rejects more than the supported count', () => {
    expect(
      validateFeedbackImages(
        Array.from({ length: MAX_FEEDBACK_IMAGE_COUNT + 1 }, () => image('image/png'))
      )
    ).toBe(`Attach ${MAX_FEEDBACK_IMAGE_COUNT} images or fewer.`)
  })

  it('rejects malformed attachment collections and byte payloads', () => {
    expect(validateFeedbackImages('image/png')).toBe('Image attachments must be a list.')
    expect(validateFeedbackImages([null])).toBe('Invalid image attachment.')
    expect(validateFeedbackImages([{ contentType: 'image/png', data: '8388608' }])).toBe(
      'Invalid image attachment bytes.'
    )
  })

  it('rejects an empty attachment', () => {
    expect(validateFeedbackImages([image('image/png', 0)])).toBe('Image attachment is empty.')
  })

  it('rejects an attachment over the byte cap', () => {
    expect(validateFeedbackImages([image('image/png', MAX_FEEDBACK_IMAGE_BYTES + 1)])).toBe(
      `Each image must be ${MAX_FEEDBACK_IMAGE_BYTES} bytes or fewer.`
    )
  })
})
