import { HttpError } from './validation.mjs'

export const MAX_IMAGE_BYTES = 1_500_000

const matches = (bytes, signature, offset = 0) =>
  signature.every((value, index) => bytes[offset + index] === value)

export function validateImage(bytes, declaredType = '') {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0)
    throw new HttpError(400, '请选择一张图片再上传。')
  if (bytes.byteLength > MAX_IMAGE_BYTES)
    throw new HttpError(413, '图片不能超过 1.5 MB，请压缩后再上传。')

  let mimeType = ''
  if (matches(bytes, [0xff, 0xd8, 0xff])) mimeType = 'image/jpeg'
  else if (matches(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    mimeType = 'image/png'
  else if (
    matches(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    matches(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) mimeType = 'image/gif'
  else if (
    matches(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    matches(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) mimeType = 'image/webp'
  else throw new HttpError(415, '仅支持 JPEG、PNG、GIF 或 WebP 图片。')

  if (declaredType && declaredType.toLowerCase() !== mimeType)
    throw new HttpError(415, '图片格式与文件内容不一致，请重新选择。')
  return mimeType
}
