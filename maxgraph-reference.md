# maxGraph authoring reference

A working reference for authoring `my-max-graph` diagram XML by hand or by agent.
Everything in the "verified" sections was confirmed end-to-end through this
repository's own render loop (`mmg render`) against **maxGraph 0.24.0**,
the exact version pinned in `package.json`.

This is a starting point, not a complete catalog.


## Sources of truth (for refreshing/extending this document)

When asked to refresh or extend this reference:

1. Consult the sources below
2. Verify any new claim with the [verification loop](#the-verification-loop)
   - Write a scratch diagram under `.local/` (gitignored), render it, and look
     at the PNG. Do not document a style key you have not seen render correctly.

| Source | Where | What it's good for |
|---|---|---|
| Local maxGraph clone | `.my/repos/maxGraph/` (local-only, not committed) | Reading source when you need semantics, not just names |
| Installed package | `node_modules/@maxgraph/core/` | Exactly what this project runs; check version skew vs the clone |
| `CellStateStyle` type | `packages/core/src/types.ts` in the clone | The complete style vocabulary (every key usable in `<Object as="style">`) |
| Shape registry | `packages/core/src/view/shape/register-shapes.ts` | The definitive list of built-in shape names |
| Edge style registry | `packages/core/src/view/style/register.ts` | The definitive list of built-in `edgeStyle` names |
| XML codec | `packages/core/src/serialization/ModelXmlSerializer.ts` | How the XML maps to the model |
| Official website | [maxgraph.github.io/maxGraph](https://maxgraph.github.io/maxGraph) | Docs, demos, feature list |
| GitHub repository | [github.com/maxGraph/maxGraph](https://github.com/maxGraph/maxGraph) | Issues, changelog, upstream truth |


## The XML file format (verified)

A diagram is a `GraphDataModel` document. Cells `0` and `1` are the required
root and default-parent scaffolding; everything else is a vertex or an edge
with `parent="1"` (or a container cell, see below).

```xml
<GraphDataModel>
  <root>
    <Cell id="0"><Object as="style" /></Cell>
    <Cell id="1" parent="0"><Object as="style" /></Cell>

    <!-- A vertex: geometry attributes are prefixed with underscores -->
    <Cell id="a" value="label text" vertex="1" parent="1">
      <Geometry _x="40" _y="40" _width="160" _height="60" as="geometry" />
      <Object rounded="1" fillColor="#dae8fc" strokeColor="#6c8ebf" as="style" />
    </Cell>

    <!-- An edge between two vertices -->
    <Cell id="e" value="edge label" edge="1" parent="1" source="a" target="b">
      <Geometry relative="1" as="geometry" />
      <Object endArrow="block" strokeColor="#344054" as="style" />
    </Cell>
  </root>
</GraphDataModel>
```

Verified geometry techniques:

- **Multi-line labels**: `&#10;` inside `value`.
- **Edge waypoints**: `<Array as="points"><Point _x="380" _y="540" /></Array>`
  inside the edge's `Geometry`.
- **Dangling edges** (no source/target cells): `<Point _x=".." _y=".." as="sourcePoint" />`
  and `as="targetPoint"` inside the edge's `Geometry`. Good for axis lines and rules.
- **Edge label nudging**: `<Point _x="0" _y="-11" as="offset" />` inside the
  edge's `Geometry` lifts the label off the line. Pair with
  `labelBackgroundColor="#ffffff"` for legibility over other ink.
- **Containers**: give a cell `parent="<containerId>"` and its geometry becomes
  relative to the container's origin. Works for vertices and edges; combine
  with `shape="swimlane"` for a titled panel.
- **Anchor pins**: `exitX`/`exitY` on the source and `entryX`/`entryY` on the
  target pin an edge to fractional positions on a shape's border (e.g.
  `exitX="0.5" exitY="1"` is bottom-center). Fractions like `exitY="0.442"`
  against a tall invisible or `line` vertex are how the sequence diagram
  (`diagrams/one-round.xml`) pins messages at arbitrary heights.


## Verified style vocabulary

All of these go as attributes on `<Object ... as="style" />`.


### Shapes

`shape="rectangle"` (default), `ellipse`, `rhombus`, `cylinder`, `actor`,
`hexagon`, `cloud`, `doubleEllipse`, `triangle`, `swimlane`, `line`.

- `rounded="1"` with `arcSize="20"` controls corner radius on rectangles.
- `shadow="1"` adds a drop shadow.
- `shape="line"` draws a centerline through the cell bounds; add
  `direction="north"` for vertical (used for sequence-diagram lifelines).
- `shape="swimlane"` gets a title band; size it with `startSize="36"`, fill the
  body with `swimlaneFillColor="#ffffff"` (plain `fillColor` colors the band).

Registered but not yet used/verified here: `arrow`, `arrowConnector`, `image`,
`label`.


### Edges

- Routing: `edgeStyle="orthogonalEdgeStyle"` (right angles) and
  `edgeStyle="manhattanEdgeStyle"` (right angles, avoids obstacles) are
  verified. Also registered: `elbowEdgeStyle`, `entityRelationEdgeStyle`,
  `segmentEdgeStyle`, `sideToSideEdgeStyle`, `topToBottomEdgeStyle`, `loopEdgeStyle`.
- `rounded="1"` rounds the corners of routed edges.
- `curved="1"` draws a curve instead of straight segments.
- Arrowheads: `endArrow` / `startArrow` with `block`, `open`, `oval`, `diamond`,
  `blockThin`, `diamondThin` verified; also available: `classic`, `classicThin`,
  `openThin`, `none`. Set both `startArrow` and `endArrow` for double-headed.
- `sourcePerimeterSpacing="4"` / `targetPerimeterSpacing="4"` put a small gap
  between the arrowhead and the shape border.
- `strokeWidth="2.5"` for emphasis lines.


### Dashes

- `dashed="1"` for the default dash.
- `dashPattern="1 3"` (dotted) or `"2 4"` (fine dash) for custom cadence —
  requires `dashed="1"` too.


### Text and labels

- `fontSize`, `fontColor`, `fontFamily` (e.g. `Courier New` for code/paths),
  `fontStyle` bitmask (1 bold, 2 italic, 4 underline; add them: 3 = bold italic).
- `whiteSpace="wrap"` wraps long labels inside the cell bounds.
- `align` / `verticalAlign` position the label inside the shape;
  `verticalLabelPosition="bottom"` pushes it outside (used with `actor`).
- `labelBackgroundColor` paints a chip behind edge labels.
- `align="left"` with `spacingLeft="14"` makes terminal-prompt style cells.
- Text-only cells: `fillColor="none" strokeColor="none"` with just a label.


### Color and opacity

- `fillColor`, `strokeColor`, `fillColor="none"`, `strokeColor="none"`.
- `opacity="40"` ghosts a whole cell; `strokeOpacity` / `textOpacity` exist too.
- This repo's actor palette (keep new concept diagrams consistent):
  you `#f8cecc`/`#b85450` · browser `#dae8fc`/`#6c8ebf` · diagram XML
  `#d5e8d4`/`#82b366` · agent `#e1d5e7`/`#9673a6` · render `#fff2cc`/`#d6b656`.


## Leads worth exploring (unverified)

From `CellStateStyle` in `types.ts`, promising but not yet probe-rendered:
`gradientColor`/`gradientDirection`, `glass`, `labelPosition`, `labelPadding`,
`labelBorderColor`, `spacingTop/Bottom/Right`, `perimeter` functions,
`portConstraint`, `rotation`, `flipH`/`flipV`, `noLabel`, `indicator*` keys,
`image` shapes with `imageAlign`/`imageBorder`, `jettySize`, `segment`,
`endSize`/`startSize` (arrowhead sizing), `endFill`/`startFill` (hollow arrowheads).


## The verification loop

1. Write or edit a scratch file
   - ```shell
     vi .local/probe/probe.xml
     ```
2. Render it
   - ```shell
     mmg render .local/probe/probe.xml
     ```
   - Writes `probe.png` and `probe.svg` next to it.
3. Look at the PNG
   - If it isn't what you meant, edit the file and go to step 2.

Worked examples live in `diagrams/*.xml` — each one is real, rendered source.
