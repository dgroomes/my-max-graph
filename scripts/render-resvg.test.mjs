import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const cli = fileURLToPath(new URL('../dist/my-max-graph.js', import.meta.url));
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
  return spawnSync(process.execPath, [
    '--import', `data:text/javascript,${encodeURIComponent(guard)}`, cli, ...args,
  ], {
    encoding: 'utf8', timeout: 40_000,
    env: { ...process.env, PUPPETEER_EXECUTABLE_PATH: '/no-chrome', ...env },
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
  assert.equal(svg.getAttribute('viewBox'), '0 0 1600 1000');
  assert.equal(svg.getAttribute('width'), '1600');
  assert.equal(svg.getAttribute('height'), '1000');
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
  assert.equal(png.readUInt32BE(16), 3200);
  assert.equal(png.readUInt32BE(20), 2000);
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
