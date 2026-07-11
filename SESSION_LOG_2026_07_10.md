# Session log — 2026-07-10 — Limen full-auto build (phases 1–4 + 7)

**Outcome: Limen is live at https://laulpogan.github.io/hexagon/** — 3D hex-tile
collectible duel with hotseat, vs-bot, and Supabase multiplayer. Built from the
hexagon 2D prototype in one autonomous session on branch `limen-design`
(never merged to main; Pages serves the branch directly).

## What was built (commit trail)

- `20d2774` Phase 1 — `core/` rules engine extracted headless, resource economy
  (C/M/R/F, costs, tap) deleted whole. New: ATTUNED keyword, rift aura, seeded
  RNG (mulberry32 + FNV-1a) so MP clients derive identical boards from a shared
  seed. Fixed inherited SIEGE bug (original penalized the SIEGE tile itself).
  25 headless tests.
- `c86087e` Phase 2 — Three.js board (vendored three@0.182 — NOTE: r16x+ split
  build needs `three.core.min.js` alongside `three.module.min.js` or the module
  graph 503s). Hex prisms, emissive rift pulse, influence sprites, ghost
  preview, drag-orbit camera, HUD/hand/log/win overlay, WebAudio synth SFX.
- `a87f252` Phase 3 — greedy 1-ply bot + `tools/sim.js` balance harness.
  **First sim run: 100% stalls** — with 1 placement/turn, turtled blobs never
  break (the original's multi-placement resource bursts were the siege
  mechanic). Fix: influence victory (2 consecutive passes or card exhaustion →
  higher board influence wins). After: 0 stalls, 30% capital KOs, avg 32.6 turns.
- `18d2cb4` Review gate — 3-Sonnet fresh-eyes panel found and I fixed: WARD
  attack didn't reset pass counter (premature endgame), deck-shuffle key-order
  MP desync trap, unwired validateDeck, 2 GPU leak classes (ghost preview per
  pointermove; captured tiles never disposed), capturable-glow never resetting,
  plus deckbuilder UI (tier caps live, localStorage), hotseat handover blackout,
  help modal, responsive hand strip. Legacy prototype → `legacy/`.
- `2e244bc` Phase 4 — Supabase MP as **action-log relay**: deterministic core
  means clients replay each other's actions from an append-only jsonb log on
  `limen_rooms` (project `kghzdnspdsxrheuckizp`). Verified 2 real Chrome tabs:
  board fingerprints byte-identical both sides. RLS deliberately open (anon
  throwaway rooms — advisor WARNs acknowledged in GAME_DESIGN.md).
- `781d944` Phase 7 — GH Pages from `limen-design` + `.nojekyll`. Verified the
  public URL end-to-end (vs-bot game played on the live site, 0 console errors).

## Key decisions (why)

- **Shipped before assets.** Public playable loop > private pretty one. TRELLIS.2
  pipeline (Dell RTX PRO 6000) is next session; prism two-palette PS1 look is
  the coherent v1 aesthetic.
- **Influence victory** added as the decision win-con (capital capture stays the
  knockout) — sim proved 1-placement/turn can't break mutual-support turtles.
- **Captures need no adjacency** (carried from hexagon, kept deliberately;
  rift-drained tiles are snipeable — rift is dangerous ground).
- **Action-relay MP** over full-state sync — smaller, ordered, replayable;
  requires the canonical-deck-order fix (TILE_POOL iteration) that review caught.

## Open items (next session)

1. **Phase 5**: TRELLIS.2-4B on Dell → 15 tile GLBs; gpt-image-2 concept art;
   ElevenLabs SFX (⚠️ free tier = non-commercial — upgrade ~$5/mo or keep synth).
2. **Phase 6**: P2 wins 59% of bot mirrors (last-move advantage at exhaustion).
   Knobs: final-turn equalizer, or P1 tiebreak. Tune via `npm run sim 200`.
3. Untested surface: real pointer-input path (extension can't inject into a
   hidden-Space tab; raycast + handlers verified via module path only). First
   human click session will confirm.
4. MP polish: no reconnect/resume after refresh (action log makes it buildable),
   room-list cleanup cron, soft-hidden hands (seed-derivable — accepted for v1).
5. Consider `npx gitnexus analyze` for the repo (hook nags; small repo, low value).

## Verification evidence

- `npm test`: 28/28 green. `node tools/sim.js 100`: 0 stalls / 0 draws.
- MP: two-tab fingerprint match at turn 3 on real Supabase realtime.
- Live: https://laulpogan.github.io/hexagon/ title/vendor/main all 200,
  bot game played to turn 3 on the deployed site with empty error console.

## Round 2 (same day) — balance + flavor

- Balance persona panel (designer w/ live sim experiments + competitive Spike):
  2 critical exploits killed (pass-hoarding lock, turn-1 SCOUT capital rush),
  ward pops bounce the card, SIEGE 2→5, bot capitals deep. Seed-paired n=300
  sweeps → INFLUENCE_TIEBREAK_BONUS_P1=1, final **150/150, captures 3.8, 0 stalls**.
  Note: designer's scratch line leaked into 4d9003d via my `git add -A` while
  agents shared the tree — it self-reverted in e02ed13. Lesson: no `git add -A`
  while write-capable agents run concurrently.
- 17 gpt-image-2 tile illustrations (style anchor: low-poly PS1, hex base,
  magenta rim light) wired into hand cards, deckbuilder, 3D prism tops, og-image.
- 2 LTX-2.3 clips off the Dell ComfyUI (studio workflow-base contract);
  rift flyover = menu living background. Push trap: 3.6MB video needed
  `-c http.postBuffer=157286400`.
- Backlog: FLANK keyword (sim first), THICKET/OUTCROP twins, bot rift-hunt
  scan, trailer cut from gameplay + clips, TRELLIS 3D models still pending.

## Round 3 (same day) — arena, 967-card pool, design round 1

- SOTA spike confirmed the stack: cheap ES-heuristic agents for bulk meta sims
  (Cardiverse pattern), deterministic search for accuracy (random-rollout UCT
  lost 9-1 to greedy — replaced with depth-2 lookahead), PSRO-lite for meta
  hunts, inverse-Simpson + win-rate matrix as health metrics (field standard).
  No off-the-shelf skill runs match sims — arena hand-built. LLM combo-detection
  is unreliable (arXiv 2508.19484) → sim stays the ground truth.
- Built: core/agents/{greedy,search,policy}, tools/{arena,train,meta}.js,
  Game.clone(), core/mechanics.js hook registry, rite category end-to-end
  (engine → agents → shipped UI with target highlighting → MP relay).
- Wave-1 mechanics: FLANK/SUSTAIN/TRAMPLE/UNTOUCHABLE + SUNDER/FORESIGHT/
  RALLYING_CRY. 30→36 tests green.
- DeepSeek generated 967 validated cards (~$0.15); power-budget validator
  rejected over/under-budget chaff; rarity skewed 73/16/10 — loosen next round.
- Design round 1 verdict: all 11 keywords evergreen (48.9–57.3% band, ~1150
  games), diversity 24.3/32, RALLY hot / SCOUT cold as gen-cost tunings.
  Full verdicts + round-2 backlog in ARENA_PLAN.md.

## Round 4 (same day) — design round 2: WING/MENACE + the RALLY cap

- WING (flying) + MENACE shipped as rare training wheels; 1150-card pool
  (183 new cards under retuned gen costs); Wilson CIs in meta reports.
- Meta caught its first true degenerate: RALLY-stack 64.2% @ 5330g →
  RALLY_STACK_CAP=2 → 58.3%, diversity 21.7→24.1, baseline sim unmoved.
- Policy retrained post-rules-change with zero arena edits (the modularity
  guarantee held twice now).

## Round 5 (same day) — ruins, media blitz, visual persona loop

- Design reversal (user call): captures REPLACE enemy tiles again; stacking is
  friendly-only Ascension. Every destroyed tile (capture, peel, SUNDER) leaves
  ruins on the cell: −1 influence per layer (RUIN_CAP 2), ATTUNED immune.
  Ruins double as anti-ping-pong decay. Tiebreak knob re-swept to −2. 45 tests.
- Media: 23 transparent standing sprites (gpt-image-1; gpt-image-2 refuses
  transparency), MTG-Arena-style backdrop dome, MusicGen-small ran NATIVELY on
  the Spark (sm_121 fine, PYTHONNOUSERSITE=1 trap) → menu/verdant/umbral loops.
- Hand tooltips (hud.onCardHover → same reminder panel as board hover).
- Visual persona loop round 1: art director 4/10, juice designer (line-level
  scene.js fixes), stream viewer "No". Fixes: backdrop visible, rift dark-fill
  + magenta rims, contact shadows + owner glow pools, badge-chip numbers,
  capture flash/cam-kick/squash/shockwave, bloom chain needs OutputPass or
  colors flatten. Round-2 screenshot transformed; before/after sent to user.
- 2D→3D SOTA banked (ARENA_PLAN): Hunyuan3D-2.1 dr-vij Docker CONFIRMED on
  GB10 (faster than TRELLIS.2 there), Mesh2Motion (browser MIT) for rigging,
  LTX-2.3 loops fallback; spconv tools (UniRig/SAM3D) → Dell.

## Round 6 (same day) — backlog burn-down

- GAME_DESIGN.md core loop rewritten for ruins (was stale subjugation text).
- Live deploy verified: music/sprites/backdrop 200 on GH Pages.
- Parallel agents: visual juice (mote bursts, win camera, unify grade) +
  balance (tower/ruins-aware policy features, retrain, FLANK buff sweep).
  Results appended below / in ARENA_PLAN.md when landed.
