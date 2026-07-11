# Design Round 7 — "The Meeting of Worlds" (2026-07-11 overnight)

Synthesis of: monument steal-list (analysis/hexcombat_shortlist.md, 171 indexed
/ 35 shortlisted), tumble-dry round 1 (analysis/tumble1_{systems,retention,
placement}.md), SHELL_SPEC.md, and the user's five directives (NIGHT_PLAN.md).
Every rules change below is sim-gated: seed-paired A/B, retrain, drama index.

## The diagnosis (evidence, not vibes)

- Baseline: 101/200 greedy games and 30/60 search2 games have ZERO captures.
- 41-turn live game with zero captures when both sides play safe (P1 report).
- Peel is a free farm: attacker's card bounces at no cost; a bot peeled one
  tower every turn for 20 turns (P1). Ascension = 46% of all sim turns —
  a decision-free always-positive default (P3).
- Only 6–15% of legal moves are meaningfully distinct (P1). Forks are
  mechanically impossible: one influence scalar means touching more enemies
  weakens you exactly as much as it threatens them (P3).
- Turtling is safe because captures need no adjacency while expansion does —
  nothing ever forces armies to meet (P1 + P3, independently).
- The rift is not impassable in code (canPlace never checks cell.rift) —
  it's a walkable tax on ground nobody wants (P3; verified game.js:171-186).
- Starter decks ship ZERO copies of FLANK/WING/MENACE/SUSTAIN/TRAMPLE/
  UNTOUCHABLE and all rites — the tension mechanics are invisible (P1+P3).

## The ruleset (RULES-7)

R1. **Capture caps the stack** (user directive #1). Capturing places your
    card ON TOP of the enemy stack; everything below survives, buried and
    dormant. No replace, no peel, no bounce — capturing always spends the
    card. Cell height = total stack size, any mix of owners. MP action-log
    format unchanged (a capture is still "place at cell").

R2. **Captures require adjacency** (P1-F2 + P3-B + Faeria/Hive canon). You
    may only capture a cell adjacent to one of your tiles. SCOUT keeps its
    non-adjacent PLACEMENT on empty hexes but not captures. To threaten you
    must approach; to approach is to be exposed. (This deletes the
    "capturable from anywhere" rule — GAME_DESIGN + tooltips + cheat sheet
    must all be updated.)

R3. **Elevation & high ground** (user directives #1+#5). Height difference
    between adjacent tiles creates ASYMMETRIC pressure:
    - A tile presses on a LOWER adjacent enemy with +min(dH, HIGH_CAP) bonus
      (HIGH_CAP=2 initial).
    - A tile receives −min(dH, HIGH_CAP) less pressure FROM lower enemies
      (equivalently: attacking uphill is weak, downhill is strong).
    This is the fork enabler P3 demanded — high ground threatens without
    being equally threatened — and the user's "advantage from highground."
    Frequent battlegrounds tower and become genuinely harder to take.

R4. **Ascension reworked** (kills the 46% default). Self-stack cap TIER_MAX
    stays 3 BUT self-stacked tiers grant NO influence bonus — only buried
    ENEMY tiers count +1 each (war trophies). Self-ascending buys height
    (positional, R3) at the cost of a card; capture-stacking buys height AND
    influence. Total height cap 5 (combat can exceed self-cap); capturing at
    height 5 crushes the bottom tier out as rubble (visual). A/B variant to
    sim: self-tiers +1 as today vs trophy-only — pick by drama index + no
    degenerate self-stack lines.

R5. **The rift becomes the prize** (P3-F + king-of-the-hill canon: reward
    the attacker). Rift cells stay placeable (canonize the "bug") with the
    −1/adjacent-rift drain as-is (ATTUNED inverts). NEW — **Riftlight**:
    every rift-ADJACENT cell you hold counts +2 toward influence victory
    and the endgame tiebreak (badge glows). The seam is where the threshold
    listens hardest — narrative: ground nearest the wound decides which
    world is true. Forces both armies toward the center from turn 1.

R6. **THE RIFT STIRS ships** (slate survivor). Every 6th turn (telegraphed
    one turn ahead in the phase strip): tiles adjacent to the rift take −1
    until their owner's next turn; ATTUNED gain +1 instead. With R5 the
    seam is now POPULATED, so the event has teeth: periodic pressure spikes
    on the most contested ground. Iconic animation: seam eruption shockwave.
    Slate disposals per P3: REMEMBRANCE deferred to round 8 (needs R2
    shakeout), RIFTBORN dead (redundant with ATTUNED), DOMINION dead
    (rewards the dominant; rejected).

R7. **Ruins decay dies; rubble lives** (user directive #6). The −1/ruin-
    layer influence penalty is removed (R3/R4 supersede it as landscape
    memory, and it fought future REMEMBRANCE). Cells that hosted a capture
    keep a rubble counter for RENDERING ONLY: debris props, scorch tint.
    ATTUNED loses its ruins clause, keeps rift inversion.

R8. **Decks & pool** (user: "bigger, better"; Brode: small decks = every
    card matters; P1: the problem is decision thinness, not count).
    - Deck size 20 → 24 (modest; sim length must stay ≤ ~45 turns).
    - Shipped pool 22 → 40 types: promote ~14 sim-validated cards from
      data/cards_gen.json (art required for each) + 4 new designs that
      showcase R3/R5 (e.g. a climber that ignores uphill penalty, a
      rift-feeder). Rarity caps: 2 rare / 8 uncommon per deck.
    - STARTER DECKS REBUILT: both include FLANK, WING or MENACE, SUSTAIN,
      1 SUNDER + 1 RALLYING_CRY — the tension mechanics must be visible in
      game one. Bot always plays a competitive starter (bug: it ignores
      custom decks — keep behavior but make its default deck good).

R9. **Fun instrumentation**. tools/metrics.js — Drama Index 0-100 from:
    captures/game, median first-capture turn, lead-change count, comeback
    rate (winner behind at 75% of game), zero-capture-game rate, stall rate.
    Printed by sim/arena; logged per build in ARENA_PLAN.md. Target for
    RULES-7 acceptance: zero-capture rate < 10% (baseline: >50%), median
    first capture ≤ T8 (baseline T11/T28), P1 winrate 48-52% after tiebreak
    re-sweep, no keyword outside 42-58% at n≥1500, median length 25-45
    turns, plus policy retrained and beating greedy ≥60%.

## The felt layer (C3 — render/UI, each mechanic gets its icon)

V1. Capture-cap slam: card drops onto the stack from height, dust ring +
    stack punch; buried tier faces visible on the prism side (war strata).
V2. High-ground read: prism heights per tier, sprite raised, downhill
    pressure shown as subtle arrows... no — shown in the INFLUENCE PREVIEW:
V3. **Placement preview (Islanders steal — the #1 "strategic feeling" fix)**:
    hovering any legal cell with a selected card shows LIVE deltas on every
    affected badge (+2 green / −3 red floaters) plus capturable rings that
    WOULD result. The math becomes visible before commit.
V4. Resolution cascade (Balatro steal): after placement, influence updates
    pulse outward tile-by-tile (staggered ~60ms), running numbers tick.
V5. Rift prize read: riftlight glow on rift-adjacent held cells (+2 badge
    aura); RIFT STIRS seam eruption + phase-strip telegraph.
V6. Rubble props on captured cells (instanced low-poly debris, tier faces).
V7. Close-up crashed-worlds environment (user directive #6): perimeter ring
    of large near-board props — crystal forest crowding the verdant edge,
    obsidian ember spires the umbral edge, both leaning INTO the rift tear;
    new closer backdrop gen. Board must feel like the crack between them.
V8. First-blood/perfect-capture chime (Dorfromantik steal): one rare,
    unmistakable audio spike; win-screen rework with reward flow (P2).

## The shell (C2 — per SHELL_SPEC.md, unchanged)

Guest-by-default localStorage + optional email magic-link upgrade (anon
toggle OFF → pure-local guests until user flips it; then silent anon
sessions). Migration SQL as spec'd (profiles/collections/decks/progress +
record_match_result RPC, owner-only RLS). Fix client() singleton bug +
limen_rooms RLS roles FIRST. Screens: account modal, collection gallery
(art + locked states), Mote unlock ladder (1 win = 1 Mote; uncommon 3 /
rare 5; commons free), pack-reveal moment, post-match reward strip, deck-
builder v2 (multiple named decks, 24-card rule, cloud sync when signed in).

## Build order & ownership (NIGHT_PLAN map still binds)

C1 core-rules agent: R1-R8 in core/ + data/tiles.js + tools/metrics.js,
    tests rewritten to RULES-7, baseline→after drama report, retrain,
    tiebreak re-sweep, ARENA_PLAN entry. HIGHEST RISK — build first, alone.
C2 shell agent (parallel, disjoint files): SHELL_SPEC implementation.
C3 render agent (after C1 merges): V1-V8.
C4 art gen (background): ~18 new card arts + close-up environment pieces.
Gate #2: fresh panel (fun score /10) + full-flow Playwright + judge.
