# Limen

A collectible hex-tile duel across the threshold between two realities. MTG-style
deckbuilding meta on a Catan-shaped board: no resources, no dice — just tiles,
influence, and a glowing rift seam that punishes the careless and feeds the attuned.

Built with Claude Code + Three.js. Design source of truth: [GAME_DESIGN.md](GAME_DESIGN.md).

## Play

```bash
npm start        # serves on http://127.0.0.1:8931
```

Any static file server works (ES modules need an http origin; `file://` won't).
Modes: **Hotseat** (2 players, 1 screen, hand-hidden handover), **vs Bot**.
Multiplayer via Supabase lands in phase 4.

## Rules in one breath

Place your capital, then each turn draw 1 and place 1 tile adjacent to your own.
A tile's influence = base ± neighbors (friends add, enemies subtract, the rift
drains). At 0 it's in revolt — place onto it to capture it. Capture the enemy
capital to win outright, or hold more total influence when all cards are spent.
Decks are 20 tiles, tier-capped (max 2 rares / 6 uncommons) — the deckbuilder is
the pacing valve.

## Development

```bash
npm test         # headless rules-engine + bot tests (no browser)
npm run sim 100  # bot-vs-bot balance simulator
```

- `core/` — rules engine, renderer-free, seeded RNG only (multiplayer clients
  derive identical boards from the room code)
- `render/` — Three.js board (hex prisms, rift shader-glow, picking, camera)
- `ui/` — HUD, deckbuilder, WebAudio synth SFX
- `data/tiles.js` + `core/config.js` — every balance knob lives in these two files
- `tools/sim.js` — balance harness
- `legacy/` — the original 2D PixiJS hexagon prototype (mechanical baseline;
  resource economy and all) plus its old Supabase setup files. Reference only.
