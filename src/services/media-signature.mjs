function jpegDimensions(bytes) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset++] !== 0xff) continue;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    const length = bytes.readUInt16BE(offset);
    if (length < 2) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  return null;
}

export function inspectMediaSignature(bytes, size) {
  if (bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    && bytes.toString("ascii", 12, 16) === "IHDR") {
    return { mimeType: "image/png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    const dimensions = jpegDimensions(bytes);
    return dimensions ? { mimeType: "image/jpeg", ...dimensions } : null;
  }
  if (bytes.length >= 30 && bytes.toString("ascii", 0, 4) === "RIFF"
    && bytes.toString("ascii", 8, 12) === "WEBP" && bytes.readUInt32LE(4) === size - 8) {
    const type = bytes.toString("ascii", 12, 16);
    if (type === "VP8X") return {
      mimeType: "image/webp", width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1,
      animated: Boolean(bytes[20] & 2),
    };
    if (type === "VP8L" && bytes[20] === 0x2f) {
      const dimensions = bytes.readUInt32LE(21);
      return { mimeType: "image/webp", width: (dimensions & 0x3fff) + 1, height: ((dimensions >>> 14) & 0x3fff) + 1 };
    }
    if (type === "VP8 " && bytes.toString("hex", 23, 26) === "9d012a") {
      return { mimeType: "image/webp", width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    }
  }
  if (bytes.length >= 14 && /^(GIF87a|GIF89a)$/.test(bytes.toString("ascii", 0, 6))) {
    return { mimeType: "image/gif", width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8), animated: true };
  }
  if (bytes.length >= 24 && bytes.toString("ascii", 4, 8) === "ftyp" && bytes.readUInt32BE(0) >= 16) {
    const brands = bytes.toString("ascii", 8, Math.min(bytes.readUInt32BE(0), bytes.length));
    if (/isom|iso[2-9]|mp4[12]|avc1|M4V /.test(brands)) return { mimeType: "video/mp4" };
  }
  if (bytes.length >= 16 && bytes.toString("hex", 0, 4) === "1a45dfa3" && bytes.includes(Buffer.from("webm"))) {
    return { mimeType: "video/webm" };
  }
  return null;
}
