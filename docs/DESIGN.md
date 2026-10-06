# LifeOS Design System — "Mission Control"

Chosen 2026-07-07 from the five-concept design lab ([design-lab.html](./design-lab.html), concept C.01).
Reference: user's sci-fi FUI/HUD screenshot — pure black ground, signal orange, industrial condensed type,
mono data readouts, hazard stripes, schematic frames. The app is a **personal telemetry console**:
journaling framed as operating a satellite. Hard edges. Dense data. Every pixel reports something.

## Color tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#050505` | App ground |
| `--panel` | `#0A0A0B` | Cards / modules |
| `--panel-2` | `#0E0E10` | Raised panels, inputs |
| `--line` | `#202024` | Default 1px borders |
| `--line-2` | `#2A2A30` | Hover / emphasized borders |
| `--fg` | `#F2F2EE` | Primary text (warm white) |
| `--dim` | `#8B8B90` | Secondary text |
| `--faint` | `#57575C` | Micro-labels, disabled |
| `--acc` | `#FF6200` | Signal orange — THE accent, used for state/action/alive |
| `--acc-line` | `rgba(255,98,0,.45)` | Orange borders |
| `--acc-soft` | `rgba(255,98,0,.12)` | Orange tint fills |
| `--danger` | `#E5484D` | Destructive only (rare) |

One accent hue. No blues, no greens — "OK" states are orange or white, encoded by shape/label.

## Typography

| Role | Face | Notes |
|---|---|---|
| Display | **Saira Condensed** 500/700 | UPPERCASE, tracking `.02–.14em`. Headings, big numerals, buttons, tab labels |
| Data / micro | **Share Tech Mono** 400 | Readouts, index codes, micro-labels (9–10px, tracking `.14–.26em`, uppercase) |
| Body / prose | **IBM Plex Mono** 400/600 | Multi-line body text, editor, markdown prose (12–13px) |

Scale: micro 9–10px · body 12–13px · row titles 12–14px · section titles 15–17px · hero numerals 56–76px (line-height ~0.85).

## Surface grammar (the signature devices)

- **Corner ticks** — 2px orange L-brackets on key panels (top-left + bottom-right only).
- **Hazard stripes** — `repeating-linear-gradient(-45deg, var(--acc) 0 8px, transparent 8px 16px)`.
  Reserved for ARMED/LIVE states (recording, ingestion running). Animate background-position ("marching") when active.
- **Index codes** — entries `JX.214`, files `FX.096`, drafts `DR.004`. Section labels read like paths: `RECENT ENTRIES // JOURNAL`.
- **Notched gauges** — 7px bars filled with `repeating-linear-gradient(90deg, acc 0 5px, transparent 5px 8px)`.
- **Status chips** — 1px bordered, blinking 6px dot: `● SYS.OK`, `● REC`.
- **Section labels** — 9px caps, letterspaced, trailing hairline rule to the right edge.
- **Alert strip** — solid orange background, black text. Highest-priority info only (e.g. drafts awaiting ingestion).
- **Scanline sweep** — ambient 7s vertical sweep at ~5% orange opacity, dashboard only.
- **Radius 0** — hard corners everywhere (max 2px on tiny chips). Depth via 1px lines, not shadows. Orange elements may glow (`box-shadow: 0 0 24px rgba(255,98,0,.45)`).

## Motion

Functional, never decorative: `steps(2)` blink (1.1–1.6s) for live dots/cursors; marching stripes while armed;
scanline ambient; 120–180ms ease-out for taps/transitions. Always respect `prefers-reduced-motion`.

## Copy voice

Telegraphic uppercase system labels (`CAPTURES AWAITING INGESTION`, `RUN ▸`, `SYS.OK`); sentence case
only inside user content/prose. Buttons say the exact action verb. No emoji in UI. No apologies in errors —
state what failed and the fix.

## Core components (from the chosen mockup)

- **Masthead**: day-of-year giant numeral + date micro-label + streak, beside notched gauges (entries / files / queue). Corner ticks.
- **REC module**: hazard-striped capture bar — orange square dot, `REC — NEW CAPTURE`, sub-label `VOICE · TEXT · AUDIO FILE → GEMINI`.
- **Entry row**: index code (orange, 8.5px) + title (12px) + path meta (8.5px faint) + chevron.
- **Alert strip**: orange bg, condensed title + count block + bordered action.
- **Tab bar**: 5 slots — HOME · VAULT · [REC] · GRAPH · ASK. Center REC is a raised orange square (−26px) with dashed orange frame. Icons 19px stroke 1.6, labels 8.5px caps.
- **Phone chrome**: respect iOS safe areas (`env(safe-area-inset-*)`); app is a PWA, standalone display.

## Don'ts

No rounded cards. No gradient fills (only orange glow shadows). No second accent color. No soft drop
shadows on panels. No lorem — always real vault data.
