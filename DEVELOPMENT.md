# Development

Installation and development instructions for `my-max-graph`.


## Instructions: Installation

Follow these instructions to build and install `my-max-graph`. Run commands from the repository root.

1. Pre-requisites: Node.js 24+ and Google Chrome
   - Chrome is needed for rendering. To use another Chromium executable, set `PUPPETEER_EXECUTABLE_PATH` to its path.
2. Install dependencies
   - ```shell
     npm ci
     ```
3. Build
   - ```shell
     node build.mjs
     ```
   - Produces `public/app.js` (browser) and `dist/my-max-graph.js` (CLI). Rebuild after changing source files.
4. Install globally
   - ```shell
     npm install -g .
     ```
5. Verify the installed command
   - ```shell
     my-max-graph version
     ```
   - Shows the package version and the build timestamp embedded by `node build.mjs`, displayed in your local time with its UTC offset.
   - The command is now available from any directory. See [README.md](README.md) for usage.


## Code Mix

The code is split into TypeScript modules under `modules/`.

<!--
Instructions to agents: run the Code Mix script and refresh the table below only when explicitly requested by the user. Do not run it as part of routine code changes. When requested, use `node scripts/module-line-counts.ts` to get active line counts (and/or edit that script as needed).
-->

| Module                   |     Lines | Role                                                             |
|--------------------------|----------:|------------------------------------------------------------------|
| `modules/browser/`       |       680 | React + maxGraph viewer and edit controls                        |
| `modules/cli/`           |       294 | Entrypoint, argument parsing, help, command dispatch, starter    |
| `modules/diagram/`       |        37 | Shared diagram report types                                      |
| `modules/render/`        |       148 | Headless (puppeteer) diagram rendering to PNG/SVG                |
| `modules/server/`        |       259 | HTTP/WebSocket server; file watch                                |
| `modules/shared/`        |       112 | Paths, Chrome launch, small helpers                              |
| `public/` (static shell) |       187 | HTML/CSS shell served to the browser (excludes generated app.js) |
| **Total**                | **1,717** |                                                                  |

Counts include tests, comments, and blank lines. Regenerate them only when
requested by the user, with `node scripts/module-line-counts.ts`.

The [diagram gallery](diagrams/README.md) holds editable XML, reference artwork,
and rendered SVGs. `scripts/` contains code-size reporting.


## Instructions: Development

Follow these instructions to check changes to `my-max-graph` during development.

1. Type check
   - ```shell
     npx tsc --project tsconfig.browser.json --noEmit
     ```
   - ```shell
     npx tsc --project tsconfig.node.json --noEmit
     ```
