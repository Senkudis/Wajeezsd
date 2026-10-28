# Creative skills status

Installed 2026-10-28 into `.claude/skills/` (project scope). The Skills CLI was not available, so each repository was cloned and the complete skill folder was copied (scripts, engines, fonts, templates, examples and sound library included). No existing project skills were overwritten; `.claude/skills/` did not exist before.

| Skill | Source (commit) | Path | Size |
|---|---|---|---|
| motion-broll | Barty-Bart/motion-graphics `3d83d98` | `.claude/skills/motion-broll/` | 284 KB |
| object-separation | Barty-Bart/motion-graphics `3d83d98` | `.claude/skills/object-separation/` | 16 KB |
| explainer-high-energy | Barty-Bart/motion-graphics `3d83d98` | `.claude/skills/explainer-high-energy/` | 28 KB |
| explainer-default | Barty-Bart/motion-graphics `3d83d98` | `.claude/skills/explainer-default/` | 28 KB |
| sound-effects | Barty-Bart/motion-graphics `3d83d98` | `.claude/skills/sound-effects/` | 2.8 MB |
| d3-viz | chrisvoncsefalvay/claude-d3js-skill `e198c87` | `.claude/skills/d3-viz/` | 108 KB |
| canvas-design | ComposioHQ/awesome-claude-skills `be2a406` | `.claude/skills/canvas-design/` | 5.6 MB |

Not installed: `explainer-engaging` (also in motion-graphics) was not requested.

Overlaps to be aware of: a user-level `motion-reel` skill (`~/.claude/skills/motion-reel`) and the plugin skill `all-skills:canvas-design` already exist. The project copies above take precedence for this project; `motion-reel` stays available for the existing `motion-reel/` work.

## Validation

Every `SKILL.md` is present with valid frontmatter (`name`, `description`). Every file each SKILL.md refers to as part of the skill exists:

- motion-broll: `engine/` (base.css, beats.js, build.py, motion.js, render.js, 3 fonts), `scripts/` (setup.sh, inspect_video.py, words.py, composite.py, make_pages.py), `templates/` (compare.html, viewer.html), `reference/engine-api.md`, `examples/opus-aoe2/`.
- sound-effects: `scripts/sound_pass.py`, `scripts/report.py`, `sfx/manifest.json` and 120 OGG files across 13 categories, `LICENSES.md`, `MUSIC.md`, `TOP-PICKS.md`.
- d3-viz: `assets/` (chart-template.jsx, interactive-template.jsx, sample-data.json), `references/` (colour-schemes.md, d3-patterns.md, scale-reference.md).
- canvas-design: `canvas-fonts/` (TTF fonts, each with its OFL licence), `LICENSE.txt`.
- explainer-default / explainer-high-energy / object-separation: self-contained; their render and Python code lives inside SKILL.md and is written out at run time.

The remaining paths a validator flags (`plan.json`, `cues.json`, `report.html`, `motion/clips/NN-name.html`, `render.mjs`, `CREDITS.txt`, ...) are outputs the skills generate, not missing files.

## Environment (checked 2026-10-28)

| Tool | Status |
|---|---|
| OS | Windows 10 Pro 19045, Git Bash (MINGW64) |
| Node.js | v24.18.0 |
| Python | 3.14.6 as `python`. **`python3` is broken** (Windows Store alias fails to launch) |
| FFmpeg | 9.0.2 full build on PATH, has `prores_ks` (transparent clips work) |
| Git | 2.45.1 |
| Playwright Chromium | browsers present in `%LOCALAPPDATA%\ms-playwright`; the `playwright` npm package is not installed in this project |
| GPU | no NVIDIA GPU detected, so object-separation will run SAM 2.1 tiny on CPU (slow) |
| Python packages | present: numpy, scipy, soundfile, opencv (cv2), faster-whisper. Missing: librosa, matplotlib, torch, transformers |

## Missing dependencies and required commands

Install only when a skill is first used; each skill installs into its own deletable folder.

```bash
# motion-broll: its setup.sh calls python3, which is broken here. Run it with python3 pointed at python:
mkdir -p ~/bin && printf '#!/bin/sh\nexec python "$@"\n' > ~/bin/python3 && chmod +x ~/bin/python3
bash .claude/skills/motion-broll/scripts/setup.sh ./motion

# explainer-default / explainer-high-energy (in the working folder of the video)
npm i playwright
npx playwright install chromium

# sound-effects
python -m venv .sound-effects
.sound-effects/Scripts/pip install librosa soundfile numpy scipy matplotlib

# object-separation (CPU build of torch; ~1 GB download plus the 156 MB model)
python -m venv .object-separation
.object-separation/Scripts/pip install torch transformers opencv-python-headless pillow numpy

# d3-viz: no install; d3 is loaded from a CDN or `npm i d3` in the target project
# canvas-design: no install; Python + Pillow/reportlab as the skill requests
```

`.sound-effects/`, `.object-separation/` and `motion/node_modules/` are already in `.gitignore`.

## How each skill is triggered

Claude loads a skill automatically when the request matches its `description`, and can be forced with `/skill-name`. The routing rules in `CLAUDE.md` (section "Creative production") and the workflow in `.claude/CREATIVE_WORKFLOW.md` decide which skills combine.

| Skill | Trigger words / situations |
|---|---|
| motion-broll | talking-head video + transcript, B-roll, cutaways, animated overlays, visual explanation of what the speaker says |
| object-separation | rotoscope, cut out, isolate, remove background, separate speaker/product/hand in a video |
| explainer-high-energy | 12-20 s ad, teaser, launch sting, hype reel, kinetic typography, short energetic social content |
| explainer-default | 45-90 s product demo, app walkthrough, SaaS/homepage explainer, "how it works" |
| sound-effects | any video with animation, transitions, UI actions or kinetic type; final mix, loudness, cue sheet |
| d3-viz | charts, dashboards, animated data stories, maps, infographics built on real numbers |
| canvas-design | visual direction, style frames, posters, static infographics, key visuals, moodboards |

## Licences and attribution

- **motion-graphics skills** (motion-broll, object-separation, explainer-*, sound-effects): MIT, Copyright (c) 2026 Bart. Copy kept at `.claude/skills/LICENSE.motion-graphics-MIT`. Keep the notice if the skill code is redistributed. sound-effects credits its sound-pass approach to Vox (@Voxyz_ai).
- **Bundled SFX** (`sound-effects/sfx/`): CC0 1.0 (Kenney packs and Freesound CC0 sounds). Attribution optional; the per-file credit table is in `sound-effects/LICENSES.md`. Include a CREDITS file with ads anyway.
- **Exception**: the kit's typing sound is fetched at run time from Mixkit (`assets.mixkit.co`). That is the Mixkit Free licence, not CC0. Prefer a file from `sfx/typing/` for ads.
- **SAM 2.1 models** (object-separation, downloaded from Hugging Face at run time): Apache 2.0 (Meta).
- **canvas-design**: Apache 2.0 (`canvas-design/LICENSE.txt`). Each bundled font ships with its SIL Open Font License file. These fonts are for exploration only: Wassili brand work uses the three brand fonts (Alarabiya, Arabic Modern Bold, Intro).
- **d3-viz**: the repository ships no licence file, so the default is all rights reserved by the author. Fine for using the skill here; do not redistribute it. d3 itself is ISC.
- **Synthesised music** from the explainer skills is generated by code and carries no third-party licence.
