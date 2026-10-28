## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Creative production

For any video, edit, ad, animation, infographic, product demo or visual design request, follow `.claude/CREATIVE_WORKFLOW.md` and automatically invoke the relevant project skills in `.claude/skills/` without waiting for them to be named:

- motion-broll: talking-head video, transcript-timed overlays, B-roll, cutaways
- object-separation: rotoscoping, background removal, isolating a speaker or product
- explainer-high-energy: 12-20 s ads, teasers, launch stings, reels
- explainer-default: 45-90 s product demos, app walkthroughs, homepage explainers
- sound-effects: every video with animation, transitions, UI actions or kinetic type
- d3-viz: charts, dashboards, data infographics from real numbers
- canvas-design: visual direction, style frames, posters, static infographics

Show the creative direction and beat sheet before any long or expensive render unless told to proceed. Never invent stats, prices, testimonials, reviews, logos or features. Dependencies, licences and known environment issues (`python3` is broken here; use `python`) are in `.claude/CREATIVE_SKILLS_STATUS.md`.
