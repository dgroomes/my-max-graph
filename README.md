# my-max-graph

My tooling over [maxGraph][max-graph] for diagramming software systems.

![The my-max-graph collaboration loop](diagrams/rendered/my-max-graph-flow.svg)


## Overview

I need boxes and arrows. I need them version controlled, and I need them accessible to other people and to agents. [maxGraph][max-graph] is great for this because it is open source, its diagrams are just XML, and it is the successor to mxGraph, which powers the popular [draw.io][draw-io] diagram tool.

My main use case is to diagram non-trivial software systems. [Mermaid][mermaid] is great for small things, but ultimately doesn't offer the richness, flexibility and information density that we can get with more powerful diagramming tools. This repository is my own tooling over maxGraph, to make it easy to view and edit a maxGraph diagram. 

This is designed for my own personal use. It is not a goal to invent yet another diagramming tool, but instead to tailor an existing tool (maxGraph) with some ergonomics that fit my exact needs so that I can (hopefully) get repeated use from it. I want a really tight view/edit/review loop that both me and an agent can collaborate on.


## Guiding Principles

My vision has gotten clearer on this over time as I've attempted this project in fits and starts. Here some guiding principles that help me keep this project well-scoped and to my needs.

- The browser is for looking and coarse changes
   - I don't want to maintain a bunch of rich GUI controls. I only need the ability to drag boxes, connect arrows, and add new boxes and arrows. I don't need a control plane for styles, moving elements forward/backward, or having much of any text input. Procedural work can be delegated to the CLI, like running auto-layout, universally upping/decreasing font size, etc. Much other work can be delegated to the LLM.  
- Detail and custom work is direct XML edits
  - Before agents, this would have been a tough sell. But with agents, they can do a ton of tedious stuff and very quickly. We can review the changes by looking at the rendered diagram and the XML diff. We can even hand-edit the XML when needed.


## Code Mix

The code is split into TypeScript modules under `modules/`.

<!--
Instructions to agents: refresh the table below as this codebase evolves. Use the following command to get active line counts (and/or edit that script as needed): `node scripts/module-line-counts.ts`
-->

| Module                   |     Lines | Role                                                             |
|--------------------------|----------:|------------------------------------------------------------------|
| `modules/browser/`       |       675 | React + maxGraph viewer with light edit controls                 |
| `modules/cli/`           |       279 | Entrypoint, argument parsing, help, command dispatch, starter    |
| `modules/diagram/`       |        39 | Shared diagram report types                                      |
| `modules/render/`        |       151 | Headless (puppeteer) diagram rendering to PNG/SVG                |
| `modules/server/`        |       262 | HTTP/WebSocket server; file watch                                |
| `modules/shared/`        |       121 | Paths, Chrome launch, small helpers                              |
| `public/ (static shell)` |       188 | HTML/CSS shell served to the browser (excludes generated app.js) |
| **Total**                | **1,715** |                                                                  |


# Instructions

Follow these instructions to build and run `my-max-graph`.

1. Pre-requisite: Node.js 22+
2. Install dependencies
   - ```shell
     npm install
     ```
3. Type check
   - ```shell
     npx tsc --project tsconfig.browser.json --noEmit
     npx tsc --project tsconfig.node.json --noEmit
     ```
4. Build
   - ```shell
     node build.mjs
     ```
   - Produces `public/app.js` (browser) and `dist/my-max-graph.js` (CLI).
5. Install globally
   - ```shell
     npm install -g .
     ```
6. Create a diagram
   - ```shell
     my-max-graph new my-diagram.xml
     ```
7. View it in the browser
   - ```shell
     my-max-graph my-diagram.xml
     ```
8. Edit the XML (you or an agent), then render and inspect
   - ```shell
     my-max-graph render my-diagram.xml
     ```
   - The open browser syncs from the file. See `my-max-graph help` for flags.


## Wish List

- [x] DONE tame the AI output and get a good base project
  - DONE Hand edits
  - DONE Get rid of the "scripts" in package.json
- [x] DONE Consider a shell script entrypoint and typical install. Go to Node first.
- [x] DONE Go to Node. Bun takes away from the focus with its current showiness/churn.
- [x] DONE (I used this to dog food. Lots of creations (unedited but promising) by GPT 5.6 Sol and Fable 5) Revisit the usage/concept diagram. Get symmetry between the user and agent (they are both actors). Drop the color from the connector lines and prefer orthogonal (90 degree angles) instead of direct.
- [ ] SKIP (can't be done cheaply because V8 doesn't have APIs for this and there isn't a particularly foundational open source one that enables this; they come with bloat or are not widely used) Prettify the XML. It's important to be across multiple lines because we are version controlling it and the diff matters.
- [ ] Consider examples. This is cart before the horse stuff. I need to actually get use out of this thing before deciding to flesh it out with examples. And if I do get use out of it, I want to encode those styles/examples/idioms as reference examples so that it accelerates future diagramming. Utlimately, this shouldn't get too exotic. My README style (-playground, Overview, Instructions of specifically formatted bulleted lists, Reference) is prior art for the leverage of repeating a fixed amount of conventions.
- [ ] Agent skill. Make it lean. It could even be a sub-command of my-max-graph to just output a skill .md
- [ ] import/export to mxGraph. I indeed need a version of this, but keep it light. No need to check a bunch of edge cases.


## Reference

- [maxGraph][max-graph]
- [draw.io][draw-io]
- [Puppeteer][puppeteer]

[max-graph]: https://github.com/maxGraph/maxGraph
[draw-io]: https://github.com/jgraph/drawio
[puppeteer]: https://pptr.dev/
[mermaid]: https://github.com/mermaid-js/mermaid
