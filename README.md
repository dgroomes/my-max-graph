# my-max-graph

My tooling over [maxGraph][max-graph] for working on diagrams with an agent.

<img alt="The my-max-graph collaboration loop" src="diagrams/rendered/my-max-graph-flow.svg" width="600"/>


## Overview

I need boxes and arrows. I need them version controlled, and I need them accessible to other people and to agents. [maxGraph][max-graph] is great for this because it is open source, its diagrams are just XML, and it is the successor to mxGraph, which powers the popular [draw.io][draw-io] diagram tool.

My main use case is to diagram non-trivial software systems. [Mermaid][mermaid] is great for small things, but ultimately doesn't offer the richness, flexibility and information density that we can get with more powerful diagramming tools. This repository is my own tooling over maxGraph, to make it easy to view and edit a maxGraph diagram. 

This is designed for my own personal use. It is not a goal to invent yet another diagramming tool, but instead to tailor an existing tool (maxGraph) with some ergonomics that fit my exact needs so that I can (hopefully) get repeated use from it. I want a really tight view/edit/review loop that both me and an agent can collaborate on.


## Usage

This is what it looks like to use my-max-graph via the `mmg` CLI in the view/edit/review loop.

1. Pre-requisite: Install `mmg`
   - Follow the instructions in [DEVELOPMENT.md](DEVELOPMENT.md).
2. Initialize a new diagram
   - ```shell
     mmg new my-diagram.xml
     ```
3. Serve it and view it in the browser
   - ```shell
     mmg serve my-diagram.xml
     ```
   - Click the printed link to view the diagram in the browser.
4. Edit the diagram (you)
   - Drag boxes around, make new ones, edit text labels, etc. Any changes  you make are synced back to the XML file.
5. Edit the diagram (agent) 
   - Ask an agent to edit the diagram. So long as the agent is aware of `mmg` by way of an agent skill, then put it to use! Tell your agent, "mute the color pallete" and it will go ahead and make the many XML edits to get the job done. To verify it's work, the agent doesn't view the rendered diagram in the browser, but uses the `mmg render` command to render a `.png` of the diagram. An agent with vision support can verify things like line alignment, text clipping, colors, etc. Edits to the XML will also be synced and reflected in the diagram in the browser. This is the virtuous view/edit/review loop.
6. Final render
   - When you're happy with the diagram, use the `mmg render` command, to create the asset (`.png` or `.svg`) that you ultimately need. 
   - ```shell
     mmg render my-diagram.xml
     ```


## Reference

- [maxGraph][max-graph]
- [draw.io][draw-io]

[max-graph]: https://github.com/maxGraph/maxGraph
[draw-io]: https://github.com/jgraph/drawio
[mermaid]: https://github.com/mermaid-js/mermaid
