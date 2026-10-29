# Rendering and cropping

![XML becomes SVG, the viewport is cropped, then the SVG is rasterized and encoded as PNG](rendered/rendering-pipeline.svg)

[Editable XML](rendering-pipeline.xml) · [SVG](rendered/rendering-pipeline.svg) · [Gallery](README.md)

The orange gear boxes are transformations; the other boxes are data. Both
renderers follow this path. **The uncropped SVG already contains the shapes,
arrows, and text labels.** Cropping does not add labels or lay out the graph.


## A drawable SVG does not need automatic cropping

A logo with a suitable `viewBox`, `width`, and `height` already renders correctly.
These attributes specify the visible rectangle and its output size. Content
outside that rectangle can exist in the SVG but be invisible in the image.

Our XML diagrams can put boxes at negative coordinates, far beyond the initial
canvas, or put a long label on a narrow box. Measuring the drawing lets the app
choose a rectangle containing that content and remove surplus blank canvas.
That is the crop step. It is not a prerequisite for SVG rendering in general.

The initial resvg implementation skipped that step and always saved a
1600 × 1000 SVG, producing a 3200 × 2000 PNG. It now queries content bounds
before choosing the output rectangle.


## Each route measures first, then the app changes the viewport

| Responsibility | Chromium route (default / `--renderer puppeteer`) | Native route (`--renderer resvg`) |
|---|---|---|
| Construct SVG | maxGraph 0.25.1 in Chromium's DOM | The same maxGraph in jsdom's DOM |
| Labels | Browser text layout and SVG text | Plain SVG text; jsdom has no text layout |
| Fit drawing to a working viewport | `prepareForExport()` scales and centers it, with a maximum scale of 1.25 | No fitting; original drawing coordinates and scale are retained |
| Measure bounds | Chromium's `svg.getBBox()` | Native `resvg --query-bbox` (0.49+) measures shapes, font glyphs, and strokes |
| Crop and save SVG | `extractSvgMarkup()` updates `viewBox`, `width`, and `height`, with 24 units of padding | `renderWithResvg()` updates the same attributes with 24 units of padding; dimensions round up to whole pixels |
| Rasterize | Chromium turns the saved SVG into pixels at 2× | `resvg --zoom 2` turns the saved SVG into pixels at 2× |
| Encode PNG | Puppeteer's SVG-element screenshot requests PNG from Chromium | The same resvg command encodes those pixels as PNG |

The browser crop lives in [`modules/render/render.ts`](../modules/render/render.ts),
after [`prepareForExport()`](../modules/browser/main.tsx). The resvg crop lives
in [`modules/render/resvg.ts`](../modules/render/resvg.ts), **between SVG creation
and PNG rendering**. Its bounds query uses an SVG without a `viewBox` transform,
so the returned coordinates remain the original drawing coordinates, including
negative positions. The query does not create a PNG.

The exporter removes empty SVG groups first: resvg otherwise assigns empty
maxGraph layers a nominal box at the origin, which would retain unwanted space
between the origin and a drawing placed elsewhere.

For bounds `x, y, width, height`, the crop starts at `x − 24, y − 24`, and
adds 48 to each dimension. This changes the viewport, not the node positions
or text. The final SVG is saved before PNG generation, so both files show
the same region. Empty resvg drawings get a small transparent padded canvas.


## Cropping is shared behavior, not pixel-identical rendering

Chromium fits the drawing first; resvg keeps its original scale. Chromium's
`getBBox()` includes geometric/text boxes, but not ordinary stroke thickness;
resvg measures painted bounds including strokes. Unpainted node geometry and
font metrics can therefore leave different margins. The two routes need not
produce identical dimensions or pixels.

Chromium adds a white background; resvg stays transparent. The resvg route
still omits text-sized label backgrounds/borders and rejects HTML labels and
images. Cropping does not restore those features. Both engines need suitable
fonts, and differences in installed fonts can change text bounds.

Puppeteer controls Chromium; it does not compute maxGraph geometry, crop the
SVG, or rasterize it itself. jsdom supplies DOM objects; resvg supplies real
font measurement and SVG rasterization without a browser or listening port.


## Integration tests check exported pixels, not mocked measurements

[`scripts/render-resvg.test.mjs`](../scripts/render-resvg.test.mjs) uses Node's
built-in test runner. It invokes the built CLI with installed resvg and Chromium,
parses the exported SVG, and
decodes PNG pixels with a [small TypeScript helper](../scripts/png.ts) and Node's
built-in `zlib`. The helper supports the renderers' non-interlaced 8-bit RGB/RGBA
output, including all five PNG row filters. It rejects other pixel formats and
colour-key transparency; it does not apply colour profiles or validate chunk
checksums. This is test code, not a rendering backend or general image library.

The cases check negative and distant shapes, thick strokes, a 60-character
label on a 20-unit node, padding, small empty output, and matching SVG/2× PNG
dimensions. Translating a diagram across the origin must preserve its cropped
PNG pixels and dimensions. The pixel checks would fail if content were silently clipped or
only node rectangles were used for the crop. resvg runs with Puppeteer imports
and Node listening sockets forbidden. Invalid input and missing tools are also
tested. No engine bounds API is used to generate the pixel expectations.

1. Install dependencies and rendering tools as described in [Development](../DEVELOPMENT.md)
2. Build and run the tests
   - ```shell
     node build.mjs
     node --test scripts/*.test.mjs
     ```
   - Chromium uses an installed Google Chrome or `PUPPETEER_EXECUTABLE_PATH`. resvg must be on `PATH`; tests do not silently skip missing rendering tools.
3. Regenerate this one diagram with the native route
   - ```shell
     node dist/mmg.js render diagrams/rendering-pipeline.xml --renderer resvg \
       --svg diagrams/rendered/rendering-pipeline.svg \
       --out diagrams/rendered/rendering-pipeline.png
     ```
