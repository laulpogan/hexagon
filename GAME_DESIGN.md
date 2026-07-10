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
- **Platform target v1:** desktop browser first. Narrow screens get scrollable hand +
  trimmed HUD; full touch controls (pinch zoom, tap-discard) are post-ship.

## Core loop (carried from hexagon)

1. Capital placement phase — each player places capital (own half, ≥2 rows off the
   seam, never on a rift hex).
2. Turns: draw 1 → place 1 tile from hand → influence resolves → captures resolve.
   Once per turn a card may be discarded and redrawn (right-click; carried from
   hexagon iteration 14 — kept, it's the hand-smoothing valve).
3. Influence system unchanged: base influence ± friendly/enemy neighbors; tile at ≤0
   relative influence is capturable. **Captures do not require adjacency** (carried
   from hexagon; a revolting tile anywhere can be taken — rift-drained tiles are
   deliberately snipeable, the rift is dangerous ground).
4. **Win (knockout):** capture the enemy capital.
5. **Win (decision, added 2026-07-10 after the first 100-match sim ran 100% stalls):**
   two consecutive passes, or all cards spent on both sides, ends the game — higher
   total board influence wins (tiebreak: tile count, then draw). With 1 placement/turn,
   turtled blobs never break; this makes every game terminate (~33 turns avg,
   30% capital KOs / 70% influence wins in sim). Known knob: P2 wins 59% of bot
   mirrors — second-player tempo; revisit in phase 6.

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
  (Babylon.js considered — 2026 consensus favors it for physics-heavy games, but Limen is
  turn-based/no-physics; Three.js wins on bundle (~168KB vs ~1.4MB), LLM training corpus,
  and the proven capybara-workflow precedent [S, cinevva/logrocket, 55].)
- **Structure:** ES modules, no build step, static-hostable:
  `core/` (rules, state — renderer-agnostic, headless-runnable), `render/` (Three.js),
  `net/` (Supabase, ported as-is), `ui/` (hand, deckbuilder, HUD), `data/tiles.js`.
  `core/` headless = balance simulator comes free.
- **Multiplayer:** Supabase realtime, rebuilt as an **action-log relay** (better than
  the original's full-state sync): the core is deterministic given seed + decks, so
  clients replay each other's actions from an append-only `actions` jsonb column on
  `limen_rooms`. Ordered, durable, tiny payloads. Table has open anon RLS policies
  (WARN by design: casual anonymous rooms, throwaway game state, no user data —
  advisor lints acknowledged 2026-07-10). Hidden hands are soft-hidden (a devtools
  user could derive the opponent's hand from the seed — accepted for v1, same class
  of leak as the original's full-state sync).
  Project: `limen` (ref `kghzdnspdsxrheuckizp`, us-west-1, free tier, created 2026-07-10).
  URL `https://kghzdnspdsxrheuckizp.supabase.co`, publishable key
  `sb_publishable_TTNv39Gsg8o20dmCOj2lfQ_rttaEvPR` (client-safe by design).

## Asset pipeline

- **Concept art per tile:** gpt-image-2 (OPENAI_API_KEY, vault) — top of blind-vote image
  arena as of 2026-07 [S, llm-stats.com, 60]. One style-anchor prompt reused across all
  tiles for consistency. If cross-tile consistency drifts, switch to FLUX Kontext
  (open-weights, edit-consistency strength, self-hostable on Dell) [S, fluxnote/siliconflow, 55].
  slancha-studio / Vertex Imagen = fallbacks.
- **3D models (sota-checked + last30days 2026-07-10):** **TRELLIS.2-4B** primary —
  `microsoft/TRELLIS.2` GitHub + `microsoft/TRELLIS.2-4B` HF, MIT, released 2025-12-16,
  8.6K stars [P, GitHub/HF, 95]. Wins ~68% vs Hunyuan3D in 2026 comparisons; fastest
  (1–3 min/model), full PBR, handles hollow/thin/complex topology, GLB out [S, 3daistudio +
  trellis2.app, 55]. Community: ComfyUI one-click installs + rigging pipelines already
  circulating (r/SideProject, r/TopologyAI). Self-host on Dell (RTX PRO 6000, 96GB).
  **Hunyuan3D-2.1** fallback for multi-view/text-to-3D and max-detail hero pieces
  (40K–1.5M face control) — note: Hunyuan3D 3.x is hosted-API only, NOT open weights;
  the open line stops at 2.x [P, hunyuan3d.cc + Replicate, 80].
- **Music:** CUT from v1 (decided 2026-07-10). Existing WebAudio synth sounds carry the
  game; revisit post-ship. (Context: Suno has no public API — partner intake only opened
  2026-07-01 [P, MBW/DMN, 85] — so music was manual-labor anyway.)
- **SFX:** ElevenLabs SFX v2 (key in vault): 0.5–30s clips, seamless looping, 48kHz
  [P, elevenlabs.io docs, 90]. Place, capture, rift pulse, win.
  ⚠️ **PRE-SHIP GATE:** account is FREE tier (confirmed 2026-07-10) = non-commercial
  license only. Before public ship: upgrade to Starter (~$5/mo) or regenerate SFX
  with WebAudio synth.
- **Video:** slancha-studio for trailer at ship time.

## Model routing (ease Claude strain)

- **Claude (this):** architecture, game rules, Three.js scene, multiplayer, taste calls.
- **DeepSeek V4 Flash (`llm deepseek`):** mechanical bulk — tile data tables, localization,
  boilerplate expansion, doc drafts. Confirmed cheapest verified tier 2026-07: $0.14/M in
  ($0.0028 cache hit), $0.28/M out [P, api-docs.deepseek.com, 90]. Remember
  `"thinking":{"type":"disabled"}`.
- **Gemini 2.5 Flash-Lite (Vertex, `llm gemini`):** vision QA — judge rendered tile art/model
  screenshots against style anchor in batch. Still the cheap pick at $0.10/$0.40 per M;
  Gemini 3.1 Flash-Lite exists but costs 2.5× ($0.25/$1.50) — not worth it for batch QA
  [P, blog.google + ai.google.dev pricing, 85].
- **slancha-delegate:** read-only research/synthesis tasks.

## Phase plan

| # | Phase | Output | Status |
|---|---|---|---|
| 0 | Design lock | this doc | ✅ 2026-07-10 |
| 1 | Extract `core/` from current HTML, strip resources, headless tests | rules engine, renderer-free | ✅ `20d2774` — 25 tests |
| 2 | Three.js board + placement + camera | playable 3D hotseat | ✅ `c86087e` |
| 3 | Rift mechanic + bot opponent | full loop vs AI | ✅ `a87f252` (rift landed in 1–2; bot+sim here) |
| 4 | Port Supabase MP onto new core | 3D multiplayer | ✅ `2e244bc` — action-log relay, 2-client verified |
| 5 | Asset pipeline batch (art → 3D → audio) | real look + sound | ⏭ next session — TRELLIS.2 on the Dell; prism look ships v1 |
| 6 | Balance sim + daily play loop | tuned tiers/rift | ✅ round 1 (2026-07-10, 2-persona review + seed-paired sweeps): **150/150 at n=300**, captures 2.5→3.8, 0 stalls. Changes: pass only when stuck (kills hoard-lock), SCOUT banned from enemy heartland (kills turn-1 capital rush), ward pops bounce the card back (turn cost, not card cost), SIEGE 2→5, bot capitals deep, P1 resolution bonus 1. Open: FLANK keyword idea (designer #3), THICKET/OUTCROP twins, bot can't hunt rift-weakened tiles beyond adjacency |
| 7 | Ship: GH Pages (only — no itch.io, decided 2026-07-10), trailer, thumbnail | public URL | ✅ **https://laulpogan.github.io/hexagon/** (serves `limen-design`; trailer/thumbnail ride with phase 5) |

Shipped 2026-07-10 ahead of assets on purpose: a public playable loop beats a private
pretty one; phase 5/6 iterate against the live URL (capybara-workflow precedent).
Parallel sessions valid from phase 2 (disjoint modules). Balance knobs live in
`data/tiles.js` + `core/config.js` only — never scattered.
