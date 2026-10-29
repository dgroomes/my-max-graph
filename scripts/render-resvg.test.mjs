import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { decodePng } from './png.ts';

const cli = fileURLToPath(new URL('../dist/mmg.js', import.meta.url));
const fixture = `<GraphDataModel><root>
  <Cell id="0"/><Cell id="1" parent="0"/>
  <Cell id="api" value="API &amp; Worker&#10;Line two" vertex="1" parent="1">
    <Geometry _x="43" _y="71" _width="197" _height="89" as="geometry"/>
    <Object fillColor="#0fa688" fontFamily="Arial" fontSize="18" as="style"/>
  </Cell>
  <Cell id="left" value="Left" vertex="1" parent="1">
    <Geometry _x="-70" _y="400" _width="100" _height="80" as="geometry"/>
    <Object fillColor="#abcdef" as="style"/>
  </Cell>
  <Cell id="long" value="${'W'.repeat(60)}" vertex="1" parent="1">
    <Geometry _x="900" _y="280" _width="90" _height="40" as="geometry"/>
    <Object fillColor="none" strokeColor="none" fontFamily="Courier New" as="style"/>
  </Cell>
  <Cell id="arrow" value="send" edge="1" parent="1" source="api" target="left">
    <Geometry relative="1" as="geometry"/><Object endArrow="block" as="style"/>
  </Cell>
</root></GraphDataModel>`;

// Enforce the CLI contract in the child: no Puppeteer dependency or listening socket.
const guard = `
  import { registerHooks } from 'node:module';
  import { Server } from 'node:net';
  Server.prototype.listen = () => { throw new Error('Listening is forbidden'); };
  registerHooks({ resolve(name, context, next) {
    if (name.startsWith('puppeteer')) throw new Error('Puppeteer is forbidden');
    return next(name, context);
  }});
`;

function workspace(t) {
  const directory = mkdtempSync(join(tmpdir(), 'my-max-graph-resvg-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const input = join(directory, 'diagram with spaces.xml');
  writeFileSync(input, fixture);
  return { directory, input };
}

function run(args, env = {}) {
  const browser = args.includes('puppeteer');
  return spawnSync(process.execPath, [
    ...(browser ? [] : ['--import', `data:text/javascript,${encodeURIComponent(guard)}`]),
    cli, ...args,
  ], {
    encoding: 'utf8', timeout: 40_000,
    env: { ...process.env, ...(!browser && { PUPPETEER_EXECUTABLE_PATH: '/no-chrome' }), ...env },
  });
}

test('resvg writes labeled SVG and 2x PNG without a browser or listener', (t) => {
  const { directory, input } = workspace(t);
  const imagePath = join(directory, 'nested output', 'diagram.png');
  const svgPath = join(directory, 'separate svg', 'diagram.svg');
  const result = run(['render', input, '--renderer', 'resvg', '--out', imagePath, '--svg', svgPath]);
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.equal(result.stderr, '', 'No missing-font or rasterization warnings');
  assert.deepEqual(JSON.parse(result.stdout), { diagramPath: input, imagePath, svgPath });
  const dom = new JSDOM(readFileSync(svgPath, 'utf8'), { contentType: 'image/svg+xml' });
  t.after(() => dom.window.close());
  const svg = dom.window.document.documentElement;
  assert.equal(svg.namespaceURI, 'http://www.w3.org/2000/svg');
  const [x, y, width, height] = svg.getAttribute('viewBox').split(' ').map(Number);
  assert.ok(x < -70 && y < 71, 'The crop includes negative geometry and padding');
  assert.ok(width < 1600 && height < 1000, 'Unused canvas is removed');
  const box = svg.querySelector('rect[fill="#0fa688"]');
  assert.deepEqual(['x', 'y', 'width', 'height'].map((name) => box.getAttribute(name)), ['43', '71', '197', '89']);
  assert.equal(svg.querySelector('rect[fill="#abcdef"]').getAttribute('x'), '-70');
  const labels = [...svg.querySelectorAll('text')].map((node) => node.textContent);
  for (const label of ['API & Worker', 'Line two', 'Left', 'send', 'W'.repeat(60)]) {
    assert.ok(labels.includes(label), `Missing label: ${label}`);
  }
  assert.ok(svg.querySelector('path'), 'The connecting arrow is present');
  assert.equal(svg.querySelector('foreignObject, image'), null);
  const png = readFileSync(imagePath);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), width * 2);
  assert.equal(png.readUInt32BE(20), height * 2);
});

function render(t, xml, renderer) {
  const { input } = workspace(t);
  writeFileSync(input, xml);
  const result = run(['render', input, '--renderer', renderer]);
  assert.equal(result.status, 0, result.stderr || String(result.error));
  const { svgPath, imagePath } = JSON.parse(result.stdout);
  const dom = new JSDOM(readFileSync(svgPath, 'utf8'), { contentType: 'image/svg+xml' });
  t.after(() => dom.window.close());
  const svg = dom.window.document.documentElement;
  const png = decodePng(readFileSync(imagePath));
  // Chromium may round fractional CSS dimensions; resvg uses whole-pixel SVG sizes.
  assert.ok(Math.abs(png.width - Number(svg.getAttribute('width')) * 2) <= 2);
  assert.ok(Math.abs(png.height - Number(svg.getAttribute('height')) * 2) <= 2);
  return { svg, png };
}

// Inspect actual rasterized pixels, independently of either engine's bounds API.
function paintedPixels(png) {
  let left = png.width,
    top = png.height,
    right = -1,
    bottom = -1;
  let red = 0,
    blue = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i],
        g = png.data[i + 1],
        b = png.data[i + 2],
        a = png.data[i + 3];
      if (a === 0 || (r > 240 && g > 240 && b > 240)) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      if (r > 200 && g < 50 && b < 50) red++;
      if (b > 200 && r < 50 && g < 50) blue++;
    }
  }
  assert.ok(right >= left && bottom >= top, 'The PNG must contain visible content');
  return { margins: [left, top, png.width - 1 - right, png.height - 1 - bottom], red, blue };
}

for (const renderer of ['resvg', 'puppeteer']) {
  test(`${renderer} crops negative and distant shapes, including strokes`, (t) => {
    const { svg, png } = render(
      t,
      `<GraphDataModel><root>
    <Cell id="0"/><Cell id="1" parent="0"/>
    <Cell id="left" vertex="1" parent="1">
      <Geometry _x="-140" _y="-75" _width="80" _height="45" as="geometry"/>
      <Object fillColor="#ff0000" strokeColor="#ff0000" strokeWidth="6" as="style"/>
    </Cell>
    <Cell id="far" vertex="1" parent="1">
      <Geometry _x="1900" _y="1100" _width="70" _height="55" as="geometry"/>
      <Object fillColor="#0000ff" strokeColor="#0000ff" strokeWidth="10" as="style"/>
    </Cell>
  </root></GraphDataModel>`,
      renderer,
    );
    const ink = paintedPixels(png);
    assert.ok(ink.red > 1000 && ink.blue > 1000, 'Both formerly off-canvas shapes must be visible');
    // At 2×, 24 units is 48 px. Chromium getBBox excludes stroke thickness.
    for (const margin of ink.margins) assert.ok(margin >= 35 && margin <= 52, `Margin: ${margin}`);
    if (renderer === 'resvg') {
      const [x, y] = svg.getAttribute('viewBox').split(' ').map(Number);
      assert.ok(x < -140 && y < -75, 'Preserve negative coordinates, do not shift the drawing');
    }
  });

  test(`${renderer} crops to the long label, not just its narrow node`, (t) => {
    const label = 'W'.repeat(60);
    const { svg, png } = render(
      t,
      `<GraphDataModel><root>
    <Cell id="0"/><Cell id="1" parent="0"/>
    <Cell id="label" vertex="1" parent="1" value="${label}">
      <Geometry _x="60" _y="90" _width="20" _height="40" as="geometry"/>
      <Object fontFamily="Courier New" fontSize="20" fillColor="none" strokeColor="none" as="style"/>
    </Cell>
  </root></GraphDataModel>`,
      renderer,
    );
    assert.equal(svg.querySelector('text').textContent, label);
    assert.ok(png.width > 1200, 'All 60 wide glyphs must fit, not only the 20-unit node');
    const { margins } = paintedPixels(png);
    for (const margin of margins) assert.ok(margin >= 40, `Clipped label, margin: ${margin}`);
    // Browser getBBox also includes the unpainted node's height; horizontal
    // margins expose truncation or an uncropped viewport without equating fonts.
    for (const margin of [margins[0], margins[2]])
      assert.ok(margin <= 72, `Horizontal margin: ${margin}`);
  });
}

test('resvg gives an empty diagram a finite, small canvas', (t) => {
  const { png } = render(
    t,
    '<GraphDataModel><root><Cell id="0"/><Cell id="1" parent="0"/></root></GraphDataModel>',
    'resvg',
  );
  assert.ok(png.width > 0 && png.width <= 100 && png.height > 0 && png.height <= 100);
  assert.ok(
    png.data.every((value) => value === 0),
    'The empty PNG stays transparent',
  );
});

test('resvg cropping is independent of the drawing’s distance from the origin', (t) => {
  const xmlAt = (x, y) => `<GraphDataModel><root>
    <Cell id="0"/><Cell id="1" parent="0"/>
    <Cell id="box" value="Move me" vertex="1" parent="1">
      <Geometry _x="${x}" _y="${y}" _width="120" _height="60" as="geometry"/>
      <Object fillColor="#ff0000" strokeColor="#0000ff" strokeWidth="8" as="style"/>
    </Cell>
  </root></GraphDataModel>`;
  const positive = render(t, xmlAt(1200, 750), 'resvg');
  const negative = render(t, xmlAt(-140, -120), 'resvg');
  assert.ok(Number(positive.svg.getAttribute('viewBox').split(' ')[0]) > 1000);
  assert.equal(positive.png.width, negative.png.width);
  assert.equal(positive.png.height, negative.png.height);
  assert.deepEqual(positive.png.data, negative.png.data);
});

test('renderer selection and a missing resvg executable fail clearly', (t) => {
  const { directory, input } = workspace(t);
  for (const [args, expected] of [
    [['--renderer', 'other'], /Unknown renderer/],
    [['--renderer'], /Missing value for --renderer/],
  ]) {
    const result = run(['render', input, ...args]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, expected);
  }
  const result = run(['render', input, '--renderer', 'resvg'], { PATH: directory });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /resvg CLI was not found/);
  assert.ok(existsSync(input.replace(/\.xml$/, '.svg')));
  assert.ok(!existsSync(input.replace(/\.xml$/, '.png')));
});

test('invalid XML, HTML labels, and images are rejected before producing outputs', (t) => {
  const { input } = workspace(t);
  for (const [xml, expected] of [
    ['<GraphDataModel>', /valid GraphDataModel/],
    ['<other/>', /valid GraphDataModel/],
    [fixture.replace('fontSize="18"', 'html="1"'), /not HTML labels/],
    [fixture.replace('fontSize="18"', 'shape="image" image="missing.png"'), /does not support images/],
  ]) {
    writeFileSync(input, xml);
    const result = run(['render', input, '--renderer', 'resvg']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, expected);
    assert.ok(!existsSync(input.replace(/\.xml$/, '.svg')));
    assert.ok(!existsSync(input.replace(/\.xml$/, '.png')));
  }
});
