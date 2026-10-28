import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';

/** Test-only decoder for our renderers' 8-bit, non-interlaced RGB/RGBA PNGs.
 * Reads stored colour values; does not apply colour profiles or validate CRCs.
 */
export function decodePng(png: Buffer) {
  assert.ok(png.length >= 33 && png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
    'Expected a PNG');
  assert.ok(png.readUInt32BE(8) === 13 && png.toString('ascii', 12, 16) === 'IHDR',
    'Expected PNG IHDR');
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.ok(width > 0 && height > 0, 'Expected nonempty PNG dimensions');
  assert.ok(png[24] === 8 && (png[25] === 2 || png[25] === 6) &&
    png[26] === 0 && png[27] === 0 && png[28] === 0,
    'Only non-interlaced 8-bit RGB/RGBA PNGs are supported');
  const channels = png[25] === 6 ? 4 : 3;
  const parts: Buffer[] = [];
  let ended = false;
  for (let offset = 33; offset < png.length;) {
    assert.ok(offset + 12 <= png.length, 'Truncated PNG chunk');
    const size = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const end = offset + 8 + size;
    assert.ok(end + 4 <= png.length, 'Truncated PNG chunk');
    assert.notEqual(type, 'tRNS', 'PNG colour-key transparency is unsupported');
    if (type === 'IDAT') parts.push(png.subarray(offset + 8, end));
    if (type === 'IEND') {
      ended = true;
      break;
    }
    offset = end + 4;
  }
  assert.ok(ended && parts.length > 0, 'Missing PNG image data or end');

  const stride = width * channels;
  const rowBytes = stride + 1;
  const rows = inflateSync(Buffer.concat(parts), { maxOutputLength: rowBytes * height });
  assert.equal(rows.length, rowBytes * height, 'Unexpected PNG scanline length');
  const data = Buffer.alloc(width * height * 4, 255);
  for (let y = 0; y < height; y++) {
    const start = y * rowBytes + 1;
    const filter = rows[start - 1];
    assert.ok(filter <= 4, 'Unknown PNG row filter');
    for (let x = 0; x < stride; x++) {
      const at = start + x;
      const left = x >= channels ? rows[at - channels] : 0;
      const above = y > 0 ? rows[at - rowBytes] : 0;
      const upperLeft = y > 0 && x >= channels ? rows[at - rowBytes - channels] : 0;
      let predictor = 0;
      switch (filter) {
        case 1: predictor = left; break;
        case 2: predictor = above; break;
        case 3: predictor = Math.floor((left + above) / 2); break;
        case 4: {
          const p = left + above - upperLeft;
          const a = Math.abs(p - left), b = Math.abs(p - above), c = Math.abs(p - upperLeft);
          predictor = a <= b && a <= c ? left : b <= c ? above : upperLeft;
          break;
        }
      }
      rows[at] = (rows[at] + predictor) & 255;
    }
    for (let x = 0; x < width; x++) {
      const source = start + x * channels;
      rows.copy(data, (y * width + x) * 4, source, source + channels);
    }
  }
  return { width, height, data };
}
