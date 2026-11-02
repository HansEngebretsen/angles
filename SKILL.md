---
name: angles
description: Make a calm, photographic product video (slow camera move, close and angled, real screen look, soft focus) from a screen recording or screenshot, rendered locally with the Angles studio. Use for demo videos, product shots, launch clips and "mockup videos".
---

# Angles

Write a small JSON spec, run one command and read back one JSON line. Don't open or edit the studio; the spec reaches everything it can make, and it rejects anything it can't.

```bash
node <this folder>/angles.mjs check spec.json   # ~5s, no video: one sheet, a row of 4 frames per variant
node <this folder>/angles.mjs make spec.json    # the mp4 (1920 wide, about 4s of work per second of video) + a sheet
```

1. **Check before you make.** Put the options you're weighing in `variants`. One `check` shows them all as labelled rows in a single small image. Look at the sheet, pick a row, and then `make` once with that row's fields merged into the spec (and `variants` dropped). Don't render videos to compare looks.
2. **Look at a sheet, never the mp4.** Read the `sheet` path it prints. That's enough to judge framing, angle and focus.
3. **On `ok: false`, fix only what the `warnings` name.** They list the valid choices. `node angles.mjs schema` prints every choice if you need it. Don't guess.

```json
{ "source": "~/Desktop/demo.mov", "out": "~/Desktop/angles", "trim": { "in": 2, "out": 8 },
  "look": "bright", "background": "mist", "shadow": "soft",
  "variants": [{ "style": "close", "level": "gentle" }, { "style": "raking" }, { "style": "float" }] }
```

| Field | Values |
|---|---|
| `source` | a recording (`.mov` `.mp4` `.webm`) or screenshot (`.png` `.jpg`). Recordings are cut into frames once and reused (`--fresh` redoes it). |
| `style` | `close`, `raking` (up close at a real angle); `float`, `angle`, `flyby`, `focus`, `push`, `reveal`, `rise`, `tiltshift` |
| `level` | `still`, `whisper` (default), `gentle`, `lively`, `bold`. Each is a speed budget, and the move shrinks to fit it. `speed` ≤ `budget` reads as calm. |
| `trim`, `loop`, `aspect` | `{ "in": s, "out": s }`; `true` crossfades the end into the start; `16:9` (default), `1:1`, `9:16`, any `W:H` |
| `beats` | several styles in one clip: `[{ "at": 0, "style": "float" }, { "at": 4, "style": "close" }]` |
| `look`, `lookAmount` | `bright`, `crisp grain`, `glossy`, `sunlit`, `pixel macro`, `cool studio`, `film print`, `none`; 0–1 |
| `background`, `shadow` | `mist` `linen` `sky` `sage` `blush` `dusk` or `#hex`; `none` `soft` `close` `float` |
| `focus` | `{ "at": s, "u": 0–1, "v": 0–1, "size": 30 }`. Leave out `u`/`v` to focus on where the recording changes. |
| `overlays` | `[{ "at": 1, "dur": 1.5, "keys": ["⌘", "K"] }]` or `{ "text": "…" }`: badges above the camera |
| `ease`, `dir`, `travel` | `steady` `soft` `settle` `constant`; `left` `right`; 0–2 (default .8) |

Taste: subtle wins (`whisper` or `gentle`), one idea per clip (a style, or two or three `beats`), and a trim of 3–8s ending on the action.

Needs Chrome, `ffmpeg`, `node` 18+ and `python3` with `numpy` and `pillow`; run `npm i` once here. It serves itself on port 8790 (set `ANGLES_PORT` to change it).
