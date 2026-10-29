# voice

This is a *voice protected* document to capture some more of my own notes about this project, protected from edits by an agent.

## Guiding Principles

My vision has gotten clearer on this over time as I've attempted this project in fits and starts. Here are some guiding principles that help me keep this project well-scoped and to my needs.

- The browser is for looking and coarse changes
    - I don't want to maintain a bunch of rich GUI controls. I only need the ability to drag boxes, connect arrows, and add new boxes and arrows. I don't need a control plane for styles, moving elements forward/backward, or having much of any text input. Procedural work can be delegated to the CLI, like running auto-layout, universally upping/decreasing font size, etc. Much other work can be delegated to the LLM.
- Detail and custom work is direct XML edits
    - Before agents, this would have been a tough sell. But with agents, they can do a ton of tedious stuff and very quickly. We can review the changes by looking at the rendered diagram and the XML diff. We can even hand-edit the XML when needed.
