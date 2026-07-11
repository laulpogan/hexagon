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

## Gate #1 verdicts → RULES-7.1 amendments (BINDING for C1/C2/C3)

Panel: 5 reviewers, all BUILD-WITH-CHANGES. Every decision below is final for
tonight; sim experiments named here are acceptance gates, not suggestions.

### Core (C1)
A1. Liberation stays DEAD (explicit decision, not oversight): buried tiles
    are permanent war strata. Rationale: user's latest directives ("stack
    higher and higher", "harder to combat") + no resurface path = simpler,
    and trophy scoring gives buried tiles meaning. Document in GAME_DESIGN.
A2. R2 extends to rites: SUNDER may only target a tile adjacent to one of
    YOUR tiles. (Otherwise SUNDER re-opens the anywhere-snipe R2 closes.)
A3. WARD exception to R1: capture attempt on a warded tile fails, ward pops,
    attacker's card returns to hand — ONCE per tile. This is the single
    surviving bounce; no farm loop possible. All other keywords: SIEGE
    stacks with R3 (sim watch, cap if runaway), MENACE = tile-count gate
    with NO height interaction (documented), FLANK threshold applies after
    all influence math, FORTIFIED/RALLY/DOUBLESTRIKE/SUSTAIN/TRAMPLE/
    UNTOUCHABLE unchanged — C1 adds unit tests R3xWING, R3xMENACE, R3xFLANK.
A4. R3 composition order: height bonus (+min(dH,HIGH_CAP=2)) is added to the
    attacker's contribution BEFORE WING halving — WING is a true counter to
    high ground (deliberate: gives WING a role, answers uphill-impossible).
A5. Trophy value = enemy tiers in the LIVE stack array, capped TROPHY_CAP=3.
    Crushed-out tiers (height>5) stop counting. Unit test: 6 alternating
    captures on one cell → influence bounded.
A6. Riftlight: separate accumulator in boardSummary()/victory tally ONLY —
    NEVER folded into relativeInfluence() (else rift cells get an accidental
    defense buff). Rift cells themselves count for Riftlight. Flat +2/cell,
    per-player total capped RIFTLIGHT_CAP=8 (knob). Metric: Riftlight share
    of final margin <30%.
A7. RIFT STIRS timing: fires every 12 plies (= each player has taken 6
    turns), telegraphed 2 plies ahead. New knob RIFT_STIRS_ESCALATION
    (default 0): each firing adds +N to the pulse — the pre-approved
    anti-mutual-turtle fallback if sim shows double-turtle survives.
A8. Corner hill-king (BLOCKER): capitals forbidden on cells with <3
    neighbors (isLegalCapitalCell gains a neighbor-count check). Sim gate:
    corner-turtle bot arm (capital+ascend in corner, never advance) n>=1000
    seed-paired — its winrate must land 42-58% AND zero-capture rate <10%.
    Fallback if still degenerate: cap combined positional bonuses per cell.
A9. Ascension contest A/B/C sim (pick by drama index + ascend-rate 15-35%):
    A = trophy-only (R4 as written); B = self-ascend legal only when the
    tower is enemy-adjacent (height earned under duress); C = self-ascend
    costs placement + 1 discard. CONFIG.ASCEND_VARIANT knob for withConfig.
A10. Deck-length joint gate: deck 20 vs 24 paired arms (all else RULES-7),
    n>=500 — median length must stay 25-45 turns at the chosen size.
A11. tools/metrics.js Drama Index adds: mutual-turtle rate (neither side
    ever places rift-adjacent), recapture-cycle count per cell, max trophy
    bonus observed, ascend rate, Riftlight margin share.
A12. Named rework deliverables (not "retrain"): core/agents/policy.js
    feature vector (remove towerPeel/wardPop-as-was, add height-delta,
    trophy-gain, riftlight-gain, bury features), core/bot.js capture
    simulate must grow the stack (bury) not overwrite, core/agents/search.js
    evaluate. THEN retrain.
A13. If R9 targets still miss after gate-2 cap: ship the best tuning
    achieved + honest morning report + BLOCKERS.md. NEVER revert to
    baseline (baseline is the proven-broken state).
A14. C1 final deliverable: a 15-line RULES-7 plain-language summary written
    to analysis/rules7_summary.md — C2 rewrites the in-game How-to-Play
    from it; orchestrator rewrites GAME_DESIGN core loop from it.

### Shell (C2)
B1. record_match_result ships WITH the atomic 20s-cooldown guard (security
    reviewer's SQL — WHERE clause guard, not check-then-act) + daily
    first-win column. Follow-up ticket (not tonight): N-unlocks/day cap.
B2. limen_rooms: rewrite ALL THREE policies (INSERT, UPDATE, and the
    live-verified SELECT "anon can read rooms") to grant anon+authenticated.
    Post-apply check: pg_policies query must show all three with both roles.
B3. Starter-collection + unlock_track SQL is GENERATED from live
    data/tiles.js AFTER C1's pool lands (C2 writes the generator; the
    migration applies in phase C2b). Never hand-copied literals.
B4. Economy repriced for 40 types: base ladder completion 50-65 wins
    (taper back-half pricing); newly-promoted cards live on a Season-1
    track, not the base ladder.
B5. Daily first-win bonus RESTORED to scope (localStorage date check +
    RPC daily column) — it is the only day-2 hook.
B6. Multi-deck management CUT: single cloud-synced deck (one row), the
    picker/rename/delete UI deferred. Ownership-gated deckbuilder stays.
B7. Auth: signInWithOtp returning-user flow wired to the "already
    registered" error branch; sign-out + "start fresh guest session"
    control in the account modal; REDIRECT_URL is a hardcoded constant
    exactly matching the allowlist entry.
B8. net/client.js singleton; gate-2 check: `grep -rn "createClient(" `
    returns exactly one hit.
B9. Deck legality vs collection at play time: client-side advisory check
    only; the honest trust model (client-authoritative, cheatable by
    devtools, acceptable for a friendly game) is documented in SHELL_SPEC.
B10. Gate-2 budgets exactly ONE real magic-link email test (2/hr cap).
B11. ui/hud.js is C2-OWNED (win-screen reward strip); render agent submits
    hud needs as patch notes. ui/sound.js + ui/music.js also campaign-A
    owned; media tracks arrive via INTEGRATION_NOTES.

### Felt layer (C3)
C1v. V2 = raised prism heights only; all deltas surface through V3 preview.
C2v. V7 perimeter environment = FIRST CUT if time runs short; billboard
    fallback if media GLBs miss ETA. V6 rubble keeps its stated fallback.
C3v. Pack reveal = single-card flip (multi-card ceremony deferred).
C4v. Build order within C3: V3 preview → V4 cascade → V1 slam + V5 rift
    read → V8 (patch notes to C2) → V6 → V2 → V7.

### Lane patches (locked with media session over wire)
L1. tools/ is campaign-A except named exception tools/gen_lore_data.js.
L2. Media vendors GLTFLoader (r182) into vendor/jsm/loaders/; C3 consumes,
    never vendors its own. Signal = wire ping.
L3. ARENA_PLAN round entries: C1 agent only (the "balance agent" and C1
    are the same role).
L4. Live-verify (post-push) is a defined step: Playwright smoke against
    the GH Pages URL (menu boot, one bot game, account modal, collection),
    plus served-main.js hash compare vs local to catch CDN staleness.
