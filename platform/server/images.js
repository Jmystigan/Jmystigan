// Photo uploads from riders: accept only real JPEG/PNG, strip ALL metadata (EXIF GPS, camera serials, thumbnails,
// comments) by rewriting the container without re-encoding pixels. No native deps.

const MAX_PIXELS = 36_000_000;

function cleanJpeg(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  const out = [b.subarray(0, 2)];
  let i = 2, w = 0, h = 0, sawSof = false;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    let m = b[i + 1];
    if (m === 0xff) { i++; continue; }                       // fill byte
    if (m === 0xd9) { out.push(b.subarray(i, i + 2)); i += 2; break; }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { out.push(b.subarray(i, i + 2)); i += 2; continue; } // standalone markers
    const len = b.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > b.length) return null;
    const seg = b.subarray(i, i + 2 + len);
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m) && len >= 8) { sawSof = true; h = b.readUInt16BE(i + 5); w = b.readUInt16BE(i + 7); }
    // Keep JFIF (E0), ICC colour profile (E2) and Adobe (EE). Drop EXIF/XMP (E1), IPTC/Photoshop (ED), other APPn, comments (FE).
    const drop = (m >= 0xe1 && m <= 0xef && m !== 0xe2 && m !== 0xee) || m === 0xfe;
    if (!drop) out.push(seg);
    i += 2 + len;
    if (m === 0xda) { out.push(b.subarray(i)); i = b.length; break; } // entropy-coded image data to the end, untouched
  }
  if (!sawSof || !w || !h || w * h > MAX_PIXELS) return null;
  return Buffer.concat(out);
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'pHYs']);
function cleanPng(b) {
  if (b.length < 33 || !b.subarray(0, 8).equals(PNG_SIG)) return null;
  const out = [b.subarray(0, 8)];
  let i = 8, first = true, ended = false;
  while (i + 12 <= b.length) {
    const len = b.readUInt32BE(i), type = b.toString('latin1', i + 4, i + 8), end = i + 12 + len;
    if (end > b.length) return null;
    if (first) { if (type !== 'IHDR' || len !== 13) return null; if (b.readUInt32BE(i + 8) * b.readUInt32BE(i + 12) > MAX_PIXELS) return null; first = false; }
    if (PNG_KEEP.has(type)) out.push(b.subarray(i, end));   // drops tEXt/zTXt/iTXt/eXIf/tIME and animation chunks
    i = end;
    if (type === 'IEND') { ended = true; break; }
  }
  return ended ? Buffer.concat(out) : null;
}

/** @returns {{mime:string, ext:string, data:Buffer}|null} null = not an acceptable image */
export function sanitizeImage(buf) {
  const j = cleanJpeg(buf); if (j) return { mime: 'image/jpeg', ext: 'jpg', data: j };
  const p = cleanPng(buf); if (p) return { mime: 'image/png', ext: 'png', data: p };
  return null;
}
