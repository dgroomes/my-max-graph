import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodePng } from './png.ts';

// Fixed 3×5 images with split IDAT chunks and all five row filters.
// Pixels were independently checked with Sharp before removing it. The last
// row exercises Paeth ties; earlier rows exercise wraparound and odd averages.
const rgbPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAAFCAIAAAAPE8H1AAAAGXRFWHRwdXJwb3NlAGZpbHRlciByZWdyZXNzaW9uryPWRgAAAA1JREFUeJwBMgDN/wT6BaAQwyrUnX4AAAAwSURBVH5GYOEBBfqMww9uO9MNAvtqc3Rlhu10+QM8KEniAPJBpcYED+wyZN2IQ91/LkMWv/lSDWMAAAAASUVORK5CYII=',
  'base64',
);
const rgbaPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAAFCAYAAACAcVaiAAAAGXRFWHRwdXJwb3NlAGZpbHRlciByZWdyZXNzaW9uryPWRgAAAA1JREFUeJwBQQC+/wD6BaD/CrW64rcAAAA/SURBVMgeAFAo/4ABBfqMIcMPbqc70w2DAvtqc/B0ZYYy7XT5tgM8KEmI4gDyREGlxsQED+wyYGTdiI5D3X+asXseBMKSmHwAAAAASUVORK5CYII=',
  'base64',
);

test('PNG decoding preserves RGB/RGBA samples across row filters', () => {
  const rgb = [
    250, 5, 160, 10, 200, 30, 80, 40, 255,
    5, 250, 140, 200, 9, 250, 3, 220, 7,
    0, 100, 255, 60, 110, 128, 240, 80, 0,
    60, 90, 200, 30, 100, 150, 200, 255, 17,
    75, 70, 250, 130, 35, 80, 11, 220, 144,
  ];
  const alpha = [255, 0, 128, 33, 200, 75, 17, 250, 1, 144, 9, 201, 240, 30, 99];
  for (const png of [rgbPng, rgbaPng]) {
    const expected = [];
    for (let pixel = 0; pixel < 15; pixel++) {
      expected.push(...rgb.slice(pixel * 3, pixel * 3 + 3), png === rgbPng ? 255 : alpha[pixel]);
    }
    assert.deepEqual(decodePng(png), { width: 3, height: 5, data: Buffer.from(expected) });
  }
});

test('PNG decoding rejects unsupported formats and truncated data', () => {
  for (const [offset, value] of [[24, 16], [25, 3], [28, 1]]) {
    const unsupported = Buffer.from(rgbPng);
    unsupported[offset] = value;
    assert.throws(() => decodePng(unsupported), /Only non-interlaced 8-bit RGB\/RGBA/);
  }
  for (const length of [20, rgbPng.length - 17, rgbPng.length - 12]) {
    assert.throws(() => decodePng(rgbPng.subarray(0, length)), /PNG/);
  }
});
