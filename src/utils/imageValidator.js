/**
 * Utility to extract image format and dimensions (width, height)
 * directly from binary buffers (supports PNG, JPEG, WebP).
 */
function getImageDimensions(buffer) {
  if (!buffer || buffer.length < 4) {
    throw new Error('Empty or invalid file buffer.');
  }

  // 1. Check PNG Signature
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    if (buffer.length < 24) throw new Error('Invalid or corrupted PNG file.');
    // PNG width and height are 32-bit big-endian integers starting at offsets 16 and 20
    const width = buffer.readInt32BE(16);
    const height = buffer.readInt32BE(20);
    return { width, height, type: 'png' };
  }

  // 2. Check JPEG Signature
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (offset + 4 > buffer.length) break;
      const marker = buffer.readUInt16BE(offset);
      offset += 2;
      
      // SOF (Start of Frame) markers contain dimensions
      // SOF0 (0xFFC0), SOF1 (0xFFC1), SOF2 (0xFFC2), SOF3 (0xFFC3)
      // SOF5 (0xFFC5), SOF6 (0xFFC6), SOF7 (0xFFC7)
      // SOF9 (0xFFC9), SOFA (0xFFCA), SOFB (0xFFCB)
      // SOFD (0xFFCD), SOFE (0xFFCE), SOFF (0xFFCF)
      if (
        (marker >= 0xFFC0 && marker <= 0xFFC3) ||
        (marker >= 0xFFC5 && marker <= 0xFFC7) ||
        (marker >= 0xFFC9 && marker <= 0xFFCB) ||
        (marker >= 0xFFCD && marker <= 0xFFCF)
      ) {
        // Skip length (2 bytes) and data precision (1 byte)
        offset += 3;
        if (offset + 4 > buffer.length) break;
        const height = buffer.readUInt16BE(offset);
        const width = buffer.readUInt16BE(offset + 2);
        return { width, height, type: 'jpeg' };
      }
      
      // Skip the rest of the segment
      const length = buffer.readUInt16BE(offset);
      offset += length;
    }
    throw new Error('Invalid or corrupted JPEG file: could not resolve dimensions.');
  }

  // 3. Check WebP Signature
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && // 'RIFF'
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50    // 'WEBP'
  ) {
    let offset = 12;
    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) break;
      const chunkHeader = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      offset += 8;

      if (chunkHeader === 'VP8X') {
        if (offset + 10 > buffer.length) break;
        // 24-bit width and height stored in VP8X chunk
        const width = buffer.readUInt32LE(offset + 4) & 0xFFFFFF;
        const height = buffer.readUInt32LE(offset + 7) & 0xFFFFFF;
        return { width: width + 1, height: height + 1, type: 'webp' };
      } else if (chunkHeader === 'VP8 ') {
        if (offset + 10 > buffer.length) break;
        // Lossy key frame signature check
        if (buffer[offset + 3] === 0x9d && buffer[offset + 4] === 0x01 && buffer[offset + 5] === 0x2a) {
          const width = buffer.readUInt16LE(offset + 6) & 0x3FFF;
          const height = buffer.readUInt16LE(offset + 8) & 0x3FFF;
          return { width, height, type: 'webp' };
        }
      } else if (chunkHeader === 'VP8L') {
        if (offset + 5 > buffer.length) break;
        // Lossless WebP format check: starts with 0x2f signature
        if (buffer[offset] === 0x2f) {
          const val = buffer.readUInt32LE(offset + 1);
          const width = (val & 0x3FFF) + 1;
          const height = ((val >> 14) & 0x3FFF) + 1;
          return { width, height, type: 'webp' };
        }
      }
      // Chunk sizes are padded to even boundaries
      offset += (chunkSize + 1) & ~1;
    }
    throw new Error('Invalid or corrupted WebP file: could not resolve dimensions.');
  }

  throw new Error('Unsupported image format. Only JPEG, PNG, and WEBP formats are supported.');
}

module.exports = {
  getImageDimensions
};
