# Limen — Game Design (source of truth)

Every build session reads this first. Current `hex-tile-game-multiplayer.html` is the
mechanical baseline; this doc records what carries over, what dies, and what's new.
Decisions here override the README.

## Identity

- **Name:** Limen (Latin: threshold).
- **Hook:** collectible hex-tile duel — MTG meta on a Catan-shaped board, no resources.
- **Theme:** two realities crashed together. Each player champions one reality; a volatile
  rift seam runs between them. Visual split: lush/verdant vs arcane/dark, glitch zone at the seam.
- **Format:** 1v1, ~10–15 min matches. 3D (Three.js), browser, static hosting, Supabase multiplayer.

## Core loop (carried from hexagon)

1. Capital placement phase — each player places capital (unchanged).
2. Turns: draw 1 → place 1 tile from hand → influence resolves → captures resolve.
3. Influence system unchanged: base influence ± friendly/enemy neighbors; tile at ≤0
   relative influence is capturable.
4. **Win:** capture the enemy capital (current mechanic, unchanged).

## Stripped (the resource economy dies whole)

- C/M/R/F resource types, tile costs, income, tap/untap, `usedThisTurn`.
- Resource-coupled keywords: MERCHANT, HASTE, VIGILANT (all defined in terms of paying/tapping).
- Resource UI: resourcesPanel, cost pips, produces pips.
- Keyword *chassis* stays — repopulate with influence-flavored keywords later
  (e.g. AURA, ANCHOR, VOLATILE). Not v1-blocking.

## Pacing valve (replaces cost)

Costs were the brake on strong tiles. Replacement, simplest first:

- **Deck construction limits by tier** (tier system already exists in deckbuilder):
  e.g. deck of 20 = max 2 rare, 6 uncommon, rest common. Exact caps = playtest knob.
- Placement stays 1/turn. No in-match currency of any kind.
- If rares still dominate: add per-tile cooldown ("charge N turns after draw") — only if
  playtesting demands it. Do not build speculatively.

## Rift (the new mechanic — only genuinely new rule in v1)

- Board seeded at generation with a seam of **rift hexes** between start zones.
- Rift hex = neutral hazard: emits −1 influence aura to all adjacent tiles, both players.
- Placing *onto* a rift hex is allowed but the tile suffers the aura of remaining rift
  neighbors — high risk, shortest path.
- Rare **rift-attuned** tiles invert the penalty (gain +1 there instead) — the collectible
  chase category.
- Mutation (rift hexes shifting/spawning over time): v2. Keep v1 static and tunable.

## Collectible meta

- Tiers: common / uncommon / rare (existing tier system is the substrate).
- Collection + deckbuilder persist (localStorage first; Supabase profiles v2).
- Pack opening: v1.5 — after core 3D game is playable.

## Tech

- **Render:** Three.js. Hex prism board, GLB model per tile type sitting on the prism,
  low-poly PS1-adjacent look, two-palette reality split, emissive glitch shader on rift seam.
- **Structure:** ES modules, no build step, static-hostable:
  `core/` (rules, state — renderer-agnostic, headless-runnable), `render/` (Three.js),
  `net/` (Supabase, ported as-is), `ui/` (hand, deckbuilder, HUD), `data/tiles.js`.
  `core/` headless = balance simulator comes free.
- **Multiplayer:** keep Supabase realtime; same sync model, new payload shape.

## Asset pipeline

- **Concept art per tile:** gpt-image (OPENAI_API_KEY, vault) / slancha-studio / Vertex
  Imagen (ADC). One style-anchor prompt reused across all tiles for consistency.
- **3D models:** open-source image-to-3D, self-hosted on the Dell (RTX PRO 6000, 96GB).
  Candidates: Hunyuan3D-2.x, TRELLIS, TripoSR — run `sota-check` at asset-phase start
  before committing. Output GLB → decimate → Three.js.
- **Music:** Suno free tier, manual gen (4 tracks: theme, build, rift tension, win sting).
- **SFX:** ElevenLabs (key in vault): place, capture, rift pulse, win.
- **Video:** slancha-studio for trailer at ship time.

## Model routing (ease Claude strain)

- **Claude (this):** architecture, game rules, Three.js scene, multiplayer, taste calls.
- **DeepSeek v4-flash (`llm deepseek`):** mechanical bulk — tile data tables, localization,
  boilerplate expansion, doc drafts. Remember `"thinking":{"type":"disabled"}`.
- **Gemini Flash-Lite (Vertex, `llm gemini`):** vision QA — judge rendered tile art/model
  screenshots against style anchor in batch.
- **slancha-delegate:** read-only research/synthesis tasks.

## Phase plan

| # | Phase | Output |
|---|---|---|
| 0 | Design lock | this doc ✅ |
| 1 | Extract `core/` from current HTML, strip resources, headless tests | rules engine, renderer-free |
| 2 | Three.js board + placement + camera | playable 3D hotseat |
| 3 | Rift mechanic + bot opponent | full loop vs AI |
| 4 | Port Supabase MP onto new core | 3D multiplayer |
| 5 | Asset pipeline batch (art → 3D → audio) | real look + sound |
| 6 | Balance sim + daily play loop | tuned tiers/rift |
| 7 | Ship: GH Pages, trailer, thumbnail | public URL |

Parallel sessions valid from phase 2 (disjoint modules). Balance knobs live in
`data/tiles.js` + `core/config.js` only — never scattered.
