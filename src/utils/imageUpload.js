const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { AppError } = require("./errors");

function matchesSignature(buffer, signature, offset = 0) {
  if (!Buffer.isBuffer(buffer) || buffer.length < offset + signature.length) {
    return false;
  }

  return signature.every((value, index) => buffer[offset + index] === value);
}

function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return null;
  }

  if (matchesSignature(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return {
      extension: "png",
      mimeType: "image/png"
    };
  }

  if (matchesSignature(buffer, [0xff, 0xd8, 0xff])) {
    return {
      extension: "jpg",
      mimeType: "image/jpeg"
    };
  }

  if (matchesSignature(buffer, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || matchesSignature(buffer, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) {
    return {
      extension: "gif",
      mimeType: "image/gif"
    };
  }

  if (
    matchesSignature(buffer, [0x52, 0x49, 0x46, 0x46])
    && matchesSignature(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return {
      extension: "webp",
      mimeType: "image/webp"
    };
  }

  return null;
}

function storeUploadedImage(file, uploadsDir) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw new AppError(400, "No file uploaded.", {
      code: "missing_upload"
    });
  }

  const detectedType = detectImageType(file.buffer);
  if (!detectedType) {
    throw new AppError(400, "Only PNG, JPEG, GIF, and WebP image uploads are allowed.", {
      code: "invalid_upload_type"
    });
  }

  const filename = `${Date.now()}-${randomUUID()}.${detectedType.extension}`;
  const filePath = path.join(uploadsDir, filename);
  fs.writeFileSync(filePath, file.buffer);

  return {
    filename,
    filePath,
    mimeType: detectedType.mimeType
  };
}

module.exports = {
  detectImageType,
  storeUploadedImage
};
