---
name: angles
description: Turn a screen recording or screenshot into a calm, photographic product video (a slow camera move, a real screen look, soft focus, close and angled) with the Angles studio, running locally. Use when someone wants a demo video, product shot, launch clip or "mockup video" of an app or site from a recording or screenshot.
---

# Angles

Angles renders on this machine. You write a small JSON spec, run one command, and get an mp4 and a contact sheet back. Don't drive the studio's UI, and don't edit its code to get a look: the spec covers everything the studio can make, and it rejects anything it can't.

## Do this

1. **Write a spec** (`spec.json`). Keep it short, because the defaults already look good:
   ```json
   { "source": "~/Desktop/demo.mov", "out": "~/Desktop/angles",
     "style": "close", "level": "gentle", "look": "bright", "background": "mist", "shadow": "soft" }
   ```
2. **Preview it**: `node <this folder>/angles.mjs make spec.json --preview`. It prints one JSON line: `{ ok, mp4, sheet, seconds, speed, budget, warnings }`.
3. **Look at the `sheet`**: four moments in one small JPEG. Check it rather than the video, because it costs one image. If the action isn't in frame, change `focus` or `trim` and preview again.
4. **Render it**: run the same command without `--preview` (1920 wide by default, or set `"width"` in the spec).

If you're unsure what a value can be, run `node angles.mjs schema`. It prints every choice as compact JSON. When it says `ok: false`, the warnings name each bad value and list the valid ones. Fix the spec; never guess.

## The spec

| Field | What it does |
|---|---|
| `source` | Path to a recording (`.mov`/`.mp4`/`.webm`) or screenshot (`.png`/`.jpg`). The recording is cut into frames once and reused; pass `--fresh` to redo it. |
| `aspect` | `16:9` (default), `4:3`, `1:1`, `9:16`, `21:9`, `3:1`, or any `W:H`. |
| `trim` | `{ "in": 2, "out": 8 }` in seconds, for recordings. `loop: true` crossfades the end into the start. |
| `style` | `float`, `angle`, `flyby`, `focus`, `push`, `reveal`, `rise`, `tiltshift`, `close`, `raking`. Use **close** or **raking** to show something up close at a real angle. |
| `level` | How much it moves: `still`, `whisper` (default), `gentle`, `lively`, `bold`. Each level is a speed budget, and the move is shrunk to fit it. |
| `ease`, `dir`, `travel` | `steady`/`soft`/`settle`/`constant`; `left`/`right`; `travel` 0–2 (default .8) is how much of the budget the move uses. |
| `beats` | Several styles in one clip: `[{ "at": 0, "style": "float" }, { "at": 4, "style": "close", "level": "gentle" }]`. Joins ease in, or cut when they're too far apart. |
| `look`, `lookAmount` | The screen look: `bright`, `crisp grain`, `glossy`, `sunlit`, `pixel macro`, `cool studio`, `film print`, `none`; amount 0–1. |
| `background` | `mist`, `linen`, `sky`, `sage`, `blush`, `dusk`, or `#hex`. |
| `shadow` | `none`, `soft`, `close`, `float`. |
| `focus` | `{ "at": 0, "u": .6, "v": .4, "size": 30 }`: a focus point in screen coordinates (0–1), and how shallow the focus is. Leave out `u`/`v` to focus on the action, where things change in the recording. |
| `overlays` | `[{ "at": 1, "dur": 1.5, "keys": ["⌘", "K"] }]` or `{ "text": "Paste anywhere" }`: shortcut and caption badges that the camera doesn't move. |

## Taste (what the studio is built around)

- Subtle wins. Start at `whisper` or `gentle`. The `speed` it reports is the picture's p95 speed in % of the frame per second; at or under `budget` reads as calm.
- One idea per clip: a style for the whole thing, or two or three `beats` at most.
- Trim to the moment that matters (3–8s), and let the camera end on the action.

## Needs

Google Chrome, `ffmpeg`, `node` 18+ and `python3` with `numpy` and `pillow`. Run `npm i` once in this folder. It starts its own local server on port 8790 (set `ANGLES_PORT` to change it).
