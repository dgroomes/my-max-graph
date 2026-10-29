# Wish List

- [x] DONE Add a screenshot of the browser view.
- [ ] Create a custom, dogfooded diagram of the render process, including cropping.
- [ ] SKIP (can't be done cheaply because V8 doesn't have APIs for this and there isn't a particularly foundational open source one that enables this; they come with bloat or are not widely used) Prettify the XML. It's important to be across multiple lines because we are version controlling it and the diff matters.
- [ ] Consider examples. This is cart before the horse stuff. I need to actually get use out of this thing before deciding to flesh it out with examples. And if I do get use out of it, I want to encode those styles/examples/idioms as reference examples so that it accelerates future diagramming. Utlimately, this shouldn't get too exotic. My README style (-playground, Overview, Instructions of specifically formatted bulleted lists, Reference) is prior art for the leverage of repeating a fixed amount of conventions.
- [ ] Agent skill. Make it lean. It could even be a sub-command of my-max-graph to just output a skill .md
   - Teach the XML conventions, the `mmg render` workflow, and visual checks for alignment, clipped text, and colors. Point to the existing authoring reference rather than duplicating it.
- [ ] Revisit draw.io / mxGraph import and export.
   - Study the original experiment on `codex/drawio-converter` (saved at `9e54cee`), especially `modules/convert/` and `docs/drawio-interop.md`. The implementation, fixtures, and verification tools are preserved there.
   - Convert maxGraph XML to and from bare, wrapped, and compressed draw.io XML. Preserve labels, styles, geometry, connections, and group parent relationships.
   - Keep conversion in the CLI and the browser focused on coarse editing. Do not bring back the expanded styling toolbar as part of this work.
   - Verify model round-trips and visual fidelity separately, using draw.io's prebuilt JavaScript viewer in headless Chrome. No Java server, Ant build, or draw.io dependency install should be needed.
   - Preserve XML comments and logical block ordering through saves and conversions so version-controlled source stays readable.
   - Resolve named group styles (`baseStyleNames` needs an array), and check resizing, folding, and `transparentBounds` groups before claiming compatibility.
