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

## Narrative — the Threshold (2026-07-10, retrofits every shipped mechanic)

Two worlds never meant to touch. **The Verdant**: a reality where life perfected
itself into permanence — forests of glass and gold, growth that keeps everything.
**The Umbral**: a reality of ember and obsidian — appetite and transformation,
cities lit by what they burn. Neither is evil. Both are whole.

No one knows which side broke the law, but the two realities intersected along a
line. Where they met, both failed: **the Rift**, a seam where nothing stays true,
leaking raw unreality (the motes). Around the wound formed **Limen** — the
threshold country. Ground here can belong to either world, but must end up
belonging to one.

Reality in Limen is contested by **conviction** — the influence number. Each
player IS a reality, writing its **Aspects** (the cards: a thicket, a wolf, a
saint) into the threshold. Placement is inscription: *here, my world is true.*
Nothing fights and nothing dies. When a tile's relative influence reaches zero,
the ground stops believing in it — the Aspect is **unwritten** and the rival's
takes its place. Doubt is ambient, not a projectile: that is why captures need
no adjacency.

- **Ruins** — ground rewritten too often stops believing anything. Scar tissue
  of contradiction; everything stands less firmly on it. The ATTUNED learned to
  stand in ambiguity.
- **Ascension** — write the same truth over itself and the place deepens. A
  tower is a stanza repeated until the ground knows it by heart. Deep places
  cannot be unwritten in one stroke — strip a layer at a time (peel), and every
  strip scars.
- **Rites** — not weapons, petitions. Your reality leaning in for one heartbeat:
  SUNDER — your world briefly refuses to acknowledge a place exists. FORESIGHT —
  your world shows you what it wants to become. RALLYING CRY — a surge of belief.
- **Capitals** — each world enters Limen through one anchor: the palace-tree,
  the ember spire. Unwrite the anchor and its whole world drains out of the
  threshold (knockout). If both worlds spend everything and the anchors stand,
  the threshold itself decides: whichever reality holds more ground becomes true.
- **The rift** — the original wound. Neither world is true there; conviction
  drains near it. Some things were born in it.

## Design round: Threshold slate (flavor-informed, PROPOSED 2026-07-10)

Mechanics mined from the narrative. Each ships with its **iconic animation** —
the animation is part of the mechanic, not decoration. All four fit the
mechanics.js hook registry (game.js core paths stay frozen; RIFT STIRS needs
one new `onTurnStart` hook point in the registry). Every one is sim-gated:
seed-paired sweep + policy retrain + meta check before shipping.

1. **RIFTBORN** (keyword) — *"Born in the wound, they carry it with them."*
   Immune to rift drain; +1 influence on or adjacent to a rift hex. Retag
   RIFTWALKER / VEILWISP / RIFTWARDEN + gen-pool candidates. Formalizes the
   "rift-attuned" chase category above.
   **Animation:** glitch materialization — the sprite assembles from magenta
   shards on placement (fragments converge, one chromatic flicker) instead of
   the landing squash; idle adds a rare two-frame position glitch.

2. **THE RIFT STIRS** (world event) — *"The wound never closed. It breathes."*
   Every 6th turn the rift surges: tiles adjacent to rift hexes lose 1
   influence until the owner's next turn; RIFTBORN gains 1 instead. Telegraphed
   one turn ahead in the phase strip. Anti-turtle timer on the board's center.
   **Animation:** seam eruption — rift rim pulse goes white-hot, a magenta
   shockwave rolls down the seam cell by cell, low camera rumble, mote storm
   doubles for the turn. The board's recurring boss moment.

3. **DOMINION** (tier-3 landscape projection) — *"Where a world runs deep,
   rivals struggle to exist."* A tier-3 tower projects deep terrain onto its
   neighbors: enemy tiles there suffer −1 influence; yours are unaffected.
   Lapses if the tower peels below tier 3. Extends landscape effects from
   scars (ruins) to claims. Sweep risk: stacks with +1/tier — if towers turn
   oppressive, DOMINION replaces the tier-3 bonus instead of adding.
   **Animation:** Apotheosis — completing tier 3 erupts a vertical pillar
   (verdant gold / umbral violet), then realm-tint bleeds outward across the
   neighbor hexes: moss-glow veins vs ember cracks. The landscape visibly
   becomes yours.

4. **REMEMBRANCE** (echo reclaim) — *"The ground remembers what it was, and
   wants to be it again."* When your tile is unwritten, the cell keeps its
   echo (latest per player). Placing your tile onto your echo consumes it for
   +1 permanent influence there — offsets one ruin layer for the avenger.
   Grief becomes resolve; deliberate tension with ruins decay. Sim watch:
   net swinginess on contested cells.
   **Animation:** ghost after-image — a translucent gray sprite of the lost
   Aspect lingers kneeling on the cell, slow-breathing; on reclamation it
   stands, steps into the new tile, and ignites in owner color.

## Core loop (carried from hexagon)

1. Capital placement phase — each player places capital (own half, ≥2 rows off the
   seam, never on a rift hex).
2. Turns: draw 1 → place 1 tile from hand → influence resolves → captures resolve.
   (RULES-7, 2026-07-11 — full spec + amendments in DESIGN_ROUND_7.md;
   plain-language version in analysis/rules7_summary.md.)
   Captures **bury** (cap the stack): the enemy tile goes under yours,
   permanently — no replace, no peel, no bounce, the attacker's card is
   always spent. WARD is the single exception (once per tile, the attempt
   bounces). **Captures require adjacency** — you must already hold a
   neighboring tile; SUNDER obeys the same gate. Placement may instead
   **Ascend**: stack onto your own non-capital tile (max 3 high) — height
   only, no influence; only buried ENEMY tiers pay +1 each (war trophies,
   cap 3, live-stack only). Total height caps at 5; beyond it the oldest
   tier crumbles out as rubble. **High ground** (elevation): a taller stack
   presses +min(dH,2) harder on lower adjacent enemies and takes that much
   less from below — battlegrounds tower and become genuinely harder to
   take. Rubble is a render-only battle scar (ruins decay removed).
   Once per turn a card may be discarded and redrawn (right-click; carried
   from hexagon iteration 14 — kept, it's the hand-smoothing valve).
3. Influence: base ± friendly/enemy neighbor contributions ± rift aura ±
   height asymmetry; tile at ≤0 relative influence is capturable (adjacency
   gate applies). **The rift is the prize**: rift hexes are placeable, and
   every rift/rift-adjacent cell you hold adds +2 **Riftlight** to your
   final score (per-player cap 8, tallied at game end only — never affects
   capturability). Every 12 plies **THE RIFT STIRS** (telegraphed 2 plies
   ahead): rift-adjacent tiles take −1 for the round, ATTUNED gain +1.
   Capitals need ≥3 open neighbors (no corner fortresses).
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
- Keyword *chassis* stays — repopulated 2026-07-10 (design round 1, MTG analogs):
  FLANK (deathtouch), SUSTAIN (lifelink), TRAMPLE, UNTOUCHABLE (hexproof) +
  the **rite** card category (spells cast as your placement: SUNDER targeted
  removal, FORESIGHT cycling, RALLYING_CRY buff; capitals rite-immune).
  New mechanics land in core/mechanics.js hooks + data/tiles.js — game.js
  core paths stay frozen. Evergreen set = the 11 keywords, arena-validated
  (48.9–57.3% win band, no degenerate, no dead — see ARENA_PLAN.md).
  Arena: `npm run arena|train|meta` (greedy/search/ES-policy agents, PSRO-lite
  deck meta over data/cards_gen.json — 967 DeepSeek-generated cards, sim-only;
  the shipped browser pool stays curated).

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
- Rift hexes are impassable — nothing may be placed on them (doc corrected
  2026-07-10 to match the shipped engine; the seam splits the board and forces
  flank-or-suffer routing).
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
