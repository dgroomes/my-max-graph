# Backstage

Project conventions and notes that would clutter the root README.

- [Development](../DEVELOPMENT.md): setup, code layout, and checks.
- [Authoring reference](../maxgraph-reference.md): diagram XML and rendering techniques.
- [Wish List](wish-list.md): ideas, completed work, and deferred items.


## Voice protection

The root [README.md](../README.md) is voice protected: it belongs to the owner
to express the project's purpose and user experience in their own words.
Only the owner edits it, by hand or speech-to-text.

Agents read the README to understand the project, but must never change it.
Not even typo fixes, link corrections, or changes made by scripts. Suggest
changes to the owner instead.

All content outside voice-protected files may be AI-generated or AI-edited,
including these instructions. The root README is currently the only
voice-protected file; its words are the owner's own. All other files are open
to agent work. Keep this authorship convention here rather than adding
AI-output warnings to individual files.


## Rules

- Keep the `mmg help` description, the root README one-liner, and the
  `package.json` description identical in content, allowing only formatting
  differences such as Markdown links. Treat the voice-protected README as
  the source; update the other descriptions to match it.
- Use `.my/README.md` for checkout-local notes and reference repos.
  `AGENTS.md` imports it when present. Keep it local; `.my/` is ignored by Git.
- Put suggestions for the voice-protected root README in `.my/README.md`, under
  `README suggestions`, instead of editing the root README or creating a separate advice file.
- Leave two blank lines before each Markdown section heading.
- Run the Code Mix script and update its table only when explicitly requested
  by the user, not as part of routine code changes.
- Whenever updating the Code Mix table, manually pad its Markdown cells so
  the columns and pipe separators align in the source. Right-align line counts.
- Write instructions as numbered steps (`1.`, `2.`, etc.). Use hyphens for
  sub-bullets, indented three spaces. Put explanations and fenced commands in
  those sub-bullets, with the opening fence immediately after `- ` and the
  command and closing fence indented five spaces. Use a language tag such as
  `shell`. Follow this exact format:

  ````markdown
  1. Pre-requisites: Node.js 24+ and Google Chrome
     - Chrome is needed for rendering. To use another Chromium executable, set `PUPPETEER_EXECUTABLE_PATH` to its path.
  2. Install dependencies
     - ```shell
       npm ci
       ```
  ````


## Agent instructions

Get context from the code, documentation, and existing global instructions.
Reduce new rules, reuse what's already written, and improve existing explanations
where they belong. Keep `AGENTS.md` as the entry point; use this section for
instructions specific to agents that have no better home.


### Diagram XML

- Limit each box to six words; prefer one or two. Put explanatory details in
  companion Markdown rather than on the drawing.
- Start each logical block with a short XML comment explaining what the elements
  make together. Describe intent, such as a browser icon or a speech bubble;
  don't narrate every rectangle or repeat the attributes.
- Use descriptive, stable cell IDs. Keep a parent followed by its children in
  the source, preserving drawing order where shapes overlap.
- Group composite objects that should move together. Use `parent="group-id"`
  and coordinates relative to that parent; keep the `Cell` elements flat under
  `root`. A visible node can itself be the parent. Add an invisible parent only
  when needed, with `connectable="0"`, `fillColor="none"`, and `strokeColor="none"`.
- Follow [the collaboration diagram](../diagrams/my-max-graph-flow.xml) as an example.
- Preserve these comments when editing XML. Browser saves currently discard them,
  so restore the relevant comments and block organization before
  committing regenerated source. Rendering alone does not rewrite the XML.
