# DESIGN ROUND 8 — "LIMEN: CROSSING" (RULES-8 synthesis)

Status: crystallized redesign, dialectic resolved. Supersedes DESIGN_ROUND_7.md as
the forward plan. This is the SYNTHESIS of the RULES-8 thesis (maximalist, ten
levers) and antithesis (Convergence Cut, two structural bets), reconciled against
the judge panel, the round-8 critique, and the actual codebase (`core/game.js`,
`core/config.js`, `core/mechanics.js`, `tools/sim.js`, `tools/metrics.js`,
`BLOCKERS.md`, `GAME_DESIGN.md`).

---

## 0. The dialectic, resolved honestly

Two fun-lens judges scored **thesis** ahead (82-70 on wow-density, 78-72 on depth):
the maximalist stack fields more distinct wow-shapes and more decision axes. The
third judge checked the code and scored **hybrid** — because pure thesis fails the
project's own sim-validation bar and pure antithesis's flagship breaks the engine.

The synthesis is **not a coin-flip pick**. It is the hybrid the code forces, pushed
to honor the operator's full feature checklist by **sequencing** thesis's levers onto
antithesis's structural spine — each lever landing in its own dedicated sim round,
never all-at-once — and dropping the two pieces that break the sim.

**Spine (from antithesis — geometric, cheap, sim-safe):**
1. **The Seam Advances** — a collapsing frontier that eats the board's outer ring on
   a fixed clock. This is the geometric fix `BLOCKERS.md` demands for the dead
   opening, and both fun-judges independently grafted it back.
2. **Roads as a primitive** — edge-stub connectivity, chain-slide surge, loop-closure
   doubling, severance. One visible graph subsumes reach, "economy", "trap", and
   "big turn" — and it is the operator's #1 explicit ask (roads as pre-inscribed
   paths).

**Grafts (from thesis — cheap on THIS codebase, honor operator asks):**
3. **Cascade** multi-placement (kills 1-tile-per-turn; `placementsLeft` is already a
   live counter — a one-line graft in the existing `fireOnPlacement` hook).
4. **Wards** — face-down capture-the-attacker traps (`clone()` deep-copies full
   state, so search/self-play still see everything; only the human render is fogged
   — Wards are **not** a sim-validation problem, contrary to thesis's own risk list).
5. **Sagas / On-Reveal inscriptions** — telegraphed on-placement effects, scheduled
   on the same `onTurnStart` clock the RIFT STIRS already rides.
6. **Threshold beat** — ONE bounded FAST-rite/Ward-flip window opened only on a
   *declared capture*. Not thesis's five-stage priority machine, not antithesis's
   every-ply simultaneity.

**Rejected, with cause (stated, not buried):**
- **Player-tracked Mote banking economy** — re-litigates `config.js`'s won
  pacing-valve decision (`DECK_SIZE` IS the valve; `GAME_DESIGN.md`: "No in-match
  currency of any kind"). The operator's "resource economy → big turns" is satisfied
  instead by **road-momentum**: a derived, always-visible number (longest
  capital-connected road) that compounds every turn, so big late turns emerge from
  graph state, not a spend pool. This delivers the *intent* with zero new currency
  bookkeeping. If the operator wants a literal spendable/bankable currency, that is a
  further explicit override needing its own diagnosed problem and its own sim round —
  flagged, not defaulted.
- **Simultaneous commit-and-reveal** — the single most expensive sim-breaker across
  both pitches. `player !== this.currentPlayer` is hard-gated in every action method;
  `search.js`'s `bestReply()` assumes sequential minimax. Simultaneity turns the
  solver into a bimatrix/equilibrium problem (an algorithm-class change), breaks the
  MP action-log relay, and fights V3's live-preview (the playtest's highest-rated
  feature). The problem it solved — "depth-2 search crushes the policy" — is attacked
  instead by Cascade branching + road-compounding + the Threshold beat.
- **The full five-stage turn machine** — replaced by strict alternation with a light
  phase order (Upkeep → Main → optional Threshold beat).

---

## (i) Diagnosis recap — what RULES-7 gets wrong (measured)

RULES-7 is a real improvement over baseline (captures/game ~6.1, zero-capture <5%,
war-strata + RIFT STIRS telegraph land as identity) but three defects are measured
and unresolved:

| Defect | Evidence (measured) | Root cause |
|---|---|---|
| **Dead opening** | median first-capture **T9-10** (target ≤T8); `BOT_RIFT_NUDGE` swept 3/5/8/12 @ n=1000 moved zero-capture 26.5%→3% but never moved the median | Geometric floor: `CAPITAL_MIN_DIST_FROM_SEAM=2` on a 9-row board → capitals ~4 rows apart; expansion to contact takes several plies regardless of bot eagerness. `BLOCKERS.md`: "the lever is board geometry, not bot tuning." |
| **Solved / shallow** | arena n=12: greedy vs **search2 0-24 (depth-2 wins 100%)**; search2 vs policy 24-0 | Branching factor at 1 placement/turn is low enough that depth-2 lookahead solves placement. No mixed-strategy depth. |
| **Silent endings** | ~70% of games end by influence-tally subtraction; playtest fun 6/10 (tension 6, one-more-game 6) | No climactic beat, no comeback/swing lever, no per-turn cost axis (rationing only at deckbuild). |

Secondary (from the critique): capital placement is low-feedback; RIFT STIRS fires
late (interval 12) and never escalates (`RIFT_STIRS_ESCALATION=0`); high-ground bonus
flat-capped (`HIGH_CAP=2`) regardless of true height diff; faction identity purely
cosmetic; hand secrecy is client-derivable.

---

## (ii) RULES-8 — the new core loop & turn structure

**One resource axis, and it is derived, not tracked: MOMENTUM = the length of your
longest capital-connected road.** Always visible, one number per player. It ramps by
itself (your network grows each turn), so the late "big turn" is a property of the
board, not a pool you fill. No currency, no banking, no `usedThisTurn`.

**Turn = strict alternation (unchanged relay contract).** A turn runs three phases:

```
── UPKEEP (auto, animated) ─────────────────────────────────────────────
  • onTurnStart(): advance the Seam clock (telegraph next ring), fire any
    Saga chapter due this turn, recompute momentum. No input.
── MAIN (the player acts) ──────────────────────────────────────────────
  • placementsLeft = BASE_PLACEMENTS (1).  Spend it on ONE of:
      – place a road/tile (extends your network; may CAPTURE, ASCEND, set a
        WARD face-down, or inscribe an ON-REVEAL/SAGA)
      – cast a SLOW rite (sorcery-speed)
      – discard→redraw / pass
  • CASCADE: a placed tile that reads "on place, place 1 more" does
    placementsLeft++ (bounded by CASCADE_MAX). Mote-rich… no — MOMENTUM-rich
    late turns chain 2-4 drops because Cascade tiles chain off long roads.
  • A road placement runs CHAIN-SLIDE: influence surges along the whole
    connected network in one action; closing a LOOP doubles that road's
    momentum.
── THRESHOLD BEAT (conditional, ≤1 per turn) ───────────────────────────
  • Opens ONLY when this turn's action was a DECLARED CAPTURE (or a Saga
    detonation). The defender gets exactly ONE response: play a FAST rite or
    flip a WARD. No back-and-forth, no priority ping-pong. Then resolve.
── END: placementsLeft==0 → _endTurn() flips currentPlayer (unchanged).
```

Ply-by-ply, a representative mid-game turn (P1, turn 14, a 6-long road):

1. Upkeep: Seam telegraph shows the next ring to fall in 3 plies; P1's Saga
   (chapter II) auto-extends a leyline; momentum recomputed to 6.
2. Main: P1 drops a **Cascade** road tile connecting two segments → `placementsLeft`
   goes 1→ (spent) then +1 from Cascade =1 again.
3. Chain-slide fires down the now-9-long network; an enemy tile adjacent to the
   network drops to capturable and P1 **declares a capture** with the same drop.
4. Threshold beat opens: P2 flips a face-down **Ward** on the captured cell → the
   attacker is unwritten instead. Beat closes.
5. P1 spends the Cascade placement to **close a loop** → that road's momentum doubles
   (6→12); enclosed hexes lift a stratum.
6. `placementsLeft==0` → turn passes to P2.

**Placements/turn:** base 1, Cascade pushes the median > 1 (charter success #4). The
`PLACEMENTS_PER_TURN=1` sim calibration is **not** changed globally — extra
placements are tile-driven and bounded, so the pacing valve stays intact.

---

## (iii) Mechanics — rule · signature animation · problem killed · source

Every mechanic lands in the existing extension surface: `KEYWORD_HOOKS` (captureGate
/ onPlacement / targetable) + `data/tiles.js`, plus the `onTurnStart` clock. `game.js`
core action paths stay frozen except the two structural bets (Seam clock, road
legality in `canPlace`) and the one scoped Threshold-beat window.

### 1. Roads / leylines — pre-inscribed paths (the spine primitive)
- **Rule:** Tiles print 0-3 road stubs per hex edge (Tantrix). A road tile is legal
  only where a printed stub aligns with a neighbor's stub OR off your capital/existing
  network (Faeria frontier-anchor) — **never into enemy heartland**
  (`_inEnemyHeartland` gate, already in `canPlace`). On placement, influence
  **chain-slides** through the whole connected network in one action (Tsuro): every
  enemy tile adjacent to the network takes one deterministic unwrite check. Reach and
  capture strength read off **momentum** (longest connected road), not flat adjacency.
  Closing a network into a topological **loop** doubles that road's momentum and lifts
  the enclosed hexes one stratum. **Severance:** capturing a mid-road hex orphans
  everything downstream — that segment's momentum instantly zeroes.
- **Animation:** molten-gold light races edge-to-edge along the whole chain from the
  placed tile outward, one bright pulse per hop; loop-closure snaps the ring white
  with a struck-bell tone and the enclosed hexes lift in unison; severance flashes the
  orphaned tail grey as it drops dead.
- **Kills:** shallow-placement (placement compounds + has geometry), no-big-turns
  (chain-slide + loop doubling), no-push-pull (severance), slow-open (frontier march),
  silent-endings (the sweep/sever read huge on stream).
- **Source:** Tantrix edge-matching + loop-closure · Tsuro chain-slide · Faeria
  frontier-anchor · Tak roads-as-resource · **severance grafted from antithesis**.
- **Codebase:** extends the adjacency test in `canPlace()` (swap "adjacent to any
  friendly" for "connected via edge-stub or frontier-anchored"); momentum is a derived
  read over the board like `boardSummary()`. Kept heartland-gated from day one.

### 2. The Seam Advances — collapsing frontier (how the dead opening dies, part 1)
- **Rule:** Board starts full. Every `SEAM_ADVANCE_CADENCE` plies from turn
  `SEAM_ADVANCE_START`, the outermost ring of empty hexes is consumed by the Rift and
  removed from play; the seam advances one row toward the further capital. The next
  ring to fall is ghosted one tick ahead (Into the Breach telegraph). The play area
  monotonically clenches to a final capital-vs-capital arena, guaranteeing contact by
  ~ply 6-8 and a sudden-death endgame no matter how passively either side plays.
- **Animation:** the rift line ignites and eats the outer ring hex-by-hex, the board
  visibly contracts a row, screen-shake scaled to hexes consumed; the final ring
  snaps to a two-capital duel with a held freeze-frame.
- **Kills:** slow-open (geometric, not bot-tuning — the fix `BLOCKERS.md` names),
  no-wow, no-big-turns (a guaranteed symmetric climax over the ground that mattered
  early), and caps game length automatically.
- **Source:** battle-royale shrinking storm + Into the Breach telegraph + Carcassonne
  River forced convergence + Kemet VP sudden-death (antithesis core bet).
- **Codebase:** rides `onTurnStart(game)` exactly like `riftStirsState()` — a
  per-turn board mutation with a 1-tick telegraph, the pattern already in
  `mechanics.js`. This is the single biggest sim perturbation and gets its own round.

### 3. Cascade + Vanguard — action stages (kills single-placement)
- **Rule:** Base 1 placement. A **Cascade** tile reads "on place, place 1 more
  immediately" (`game.placementsLeft++`), bounded by `CASCADE_MAX`, so momentum-rich
  late turns chain 2-4 drops and the branching factor climbs past depth-2's reach. The
  **Vanguard token** is a single alternating initiative flag: only its holder may
  declare the round's FIRST capture; it flips every round; passing forfeits nothing but
  initiative. One proactive / one reactive side from round 1.
- **Animation:** each cascade placement leaves a comet-trail to the next drop, trails
  compounding into a bright lattice on a big turn; the Vanguard banner arcs across the
  seam to the other capital at round change.
- **Kills:** shallow-placement, solved-by-depth-2 (branching up), no-push-pull, dead
  opening (Vanguard forces a round-1 aggressor).
- **Source:** Dominion +Actions chain-trigger · LoR Attack Token.
- **Codebase:** `placementsLeft` is already a decrementing counter set in
  `_beginTurn()` — Cascade is one line in the existing `fireOnPlacement` hook. Vanguard
  is a lightweight per-round flag reusing `currentPlayer` bookkeeping. Neither touches
  the global `PLACEMENTS_PER_TURN` calibration.

### 4. Wards — trap tiles that capture the attacker
- **Rule:** A Ward is placed **face-down**: the owner sees its type, both players see a
  neutral marker (hidden to the human, board legibility preserved). Inert until an
  enemy declares a capture into it (or a shove lands a stack on it); then it flips at
  the Threshold beat and resolves BEFORE capture math — **unwriting the attacker
  instead of the defender**. Built-in counterplay: a **Sapper** on-reveal reveals and
  disarms an adjacent Ward; an attacker may pre-reveal a matching **Feint** to foil it
  (Root). Wards cannot be set in enemy heartland. (Upgrades RULES-7's WARD, which today
  only bounces the attacker's card back once — see `placeFromHand`.)
- **Animation:** face-down tile is a rippling dark-glass pane; on trigger it shatters
  upward, obsidian shards close like a jaw around the attacking stack, the attacker's
  art inverts to the defender's world and sinks a stratum.
- **Kills:** no-wow (trap-flip reversal), no-push-pull.
- **Source:** Yu-Gi-Oh! set trap · Stratego Miner counter · Root Ambush foil ·
  Betrayal flip-on-entry.
- **Codebase:** a `KEYWORD_HOOKS` entry + a face-down flag on the tile. **Not a sim
  problem:** `clone()` deep-copies the full tile incl. keywords, so search and
  self-play evaluate the true board — only the opposing human's render is fogged.
  **Honest flag:** the hidden info is *client-derivable* (seed + decks reconstruct it),
  so face-down Wards are a hard blocker for **ranked** mode until server-authoritative
  hidden state exists. Fine for single-player / casual now.

### 5. Sagas & On-Reveal — on-placement effects (telegraphed)
- **Rule:** Two tiers. **On-Reveal** inscriptions fire once on placement (draw,
  unwrite a target of influence ≤N, pull a stack). **Saga** inscriptions schedule three
  escalating chapters that auto-fire at the start of each of your next three turns (I:
  draw/scout · II: buff or extend a leyline · III: detonate a radius of enemy tiles).
  Every pending chapter and its target hex **glow a full turn ahead** so both players
  see the bomb coming and are pulled to contest it early.
- **Animation:** On-Reveal stamps a glowing sigil that flares and dissolves; Saga tiles
  show Roman-numeral chapter pips, one igniting each turn; chapter III cracks the tile
  into a column of light that detonates the marked radius with a screen-freeze scaled
  to tiles hit.
- **Kills:** slow-open (telegraph forces early contact), no-big-turns, no-interaction.
- **Source:** Marvel Snap On-Reveal + staged location reveal · MTG Saga · Into the
  Breach telegraphed intent.
- **Codebase:** On-Reveal = the existing `onPlacement` hook. Saga = a small scheduled
  queue keyed on turn number, evaluated in `onTurnStart` next to the Seam clock —
  RNG-free so MP replay stays deterministic.

### 6. Threshold Rites — instants & sorceries with real timing
- **Rule:** Rites split **SLOW** (sorcery-speed, your Main only — the existing
  `castRite` path) and **FAST** (instant). A FAST rite is playable ONLY during the one
  bounded **Threshold beat** that opens after an opponent declares a capture or a Saga
  detonation — one response window, no stack. FAST rites: SUNDER (a hex briefly ceases
  to exist), UNDERTOW (shove a stack 1 hex — onto a Ward, off a tier for a crush check,
  or into a friendly stack for splash), STILL THE SEAM (freeze the Seam advance one
  round), REWRITE (swap two adjacent tiles' owners). Each is a card spent, so reacting
  trades against your own tempo.
- **Animation:** the beat opens, the whole board desaturates and time-freezes under a
  low held-breath hum; the reacting rite slams in as a reality-tear ripple that
  recolors the board; time resumes with a snap.
- **Kills:** no-interaction, no-push-pull (Undertow), and the "not the pitched MTG
  meta" honesty gap.
- **Source:** MTG Instant/Sorcery split · Spirit Island Fast/Slow 2-bucket · Hive
  Pillbug displacement (Undertow).
- **Codebase:** the ONE piece that touches turn/relay structure. Scoped to a *single
  capture-triggered window*, not every ply — the MP action-log relay gains one optional
  "response" message after a declared-capture action, and `search.js` extends
  `bestReply` to consider only the defender's ≤1 response at that node (bounded, still
  sequential — NOT the bimatrix blow-up that simultaneity would force). Its own sim
  round.

### 7. Escalating collapse + sudden-death countdown (comeback valve & climax)
- **Rule:** THE RIFT STIRS now **escalates** (`RIFT_STIRS_ESCALATION > 0`): each
  firing grows radius and power. The final stir is the **CATACLYSM** — a telegraphed,
  Seam-gated wipe of a radius (friendly AND enemy), forcing a leader to hedge instead
  of dumping their hand. Separately, when the play area clenches to the final arena (or
  a conviction threshold is crossed) a 1-round sudden-death **countdown** arms, so every
  match ends on a loud beat, not silent tally subtraction.
- **Animation:** each stir the seam breathes wider and brighter; the Cataclysm is a
  white-out shockwave scrubbing its radius to rubble in a screen-shaking freeze; the
  countdown pulses the board edges red under a ticking clock.
- **Kills:** no-big-turns, silent-endings (the ~70% problem), missing comeback lever.
- **Source:** MTG board wipe · Blood Rage Doom province · Kemet VP sudden-death.
- **Codebase:** flips `RIFT_STIRS_ESCALATION` off 0 (already a knob) and couples the
  final firing to the Seam clock. Sudden-death rides the collapse endgame.

### The dead opening dies — attacked from four geometric directions at once
No single tuning knob owns the fix (bot-nudge already swept to no effect):
1. **Seam Advances** clenches the board from turn `SEAM_ADVANCE_START`, squeezing both
   networks into contact by ~ply 6-8 by geometry — the fix `BLOCKERS.md` names.
2. **Frontier-anchored road legality:** every legal placement extends your network
   toward the seam, so development marches at the enemy instead of building in a corner.
3. **Seam Wellsprings** (see §iv KEPT) sit on the converging fault and add Riftlight
   from turn 1 — a contested prize before either army is threatened, reusing the
   existing Riftlight accumulator (no new currency).
4. **Vanguard token** forces exactly one declared aggressor every round from round 1.
Plus Saga/On-Reveal intent glows menace a hex a turn ahead, so even the first
placement can threaten — puzzle-dread replaces six plies of solitaire.

---

## (iv) Kept from RULES-7 · Cut / changed

**KEPT (load-bearing, do not touch):**
- **Bury-on-capture** — permanent war strata, no liberation (`placeFromHand` bury +
  `HEIGHT_CRUSH_CAP` crush-out). Roads capture *through* this, they don't replace it.
- **Adjacency-to-capture** — you must be there to strike. Roads add a *second*
  connectivity legality path, heartland-gated; adjacency capture stays intact.
- **High-ground pressure** (R3/A4, `HIGH_CAP`, asymmetric `dH`) — the strata now also
  gate Undertow crush checks.
- **Trophy scoring** (R4/A5, `TIER_BONUS`, `TROPHY_CAP`) and self-ascend.
- **Riftlight rift-prize** (R5/A6) — reused directly for Seam Wellsprings.
- **RIFT STIRS telegraph machine** (R6/A7) — repurposed as the escalating collapse.
- **Keyword-hook architecture** (`KEYWORD_HOOKS` + `data/tiles.js`) — the whole graft
  surface. The 11 evergreen keywords + 4 showcase keywords stay.
- **Deck-size pacing valve** (`DECK_SIZE=20`, tier caps) — momentum replaces "economy",
  it does NOT reopen the currency question.
- **Influence tiebreak** (`INFLUENCE_TIEBREAK_BONUS_P1`), **capital corner-ban** (A8),
  **SCOUT heartland ban** — all reused as the road/displacement gating substrate.

**CUT / CHANGED:**
- **Single placement/turn** → base 1 + bounded Cascade (median > 1).
- **Flat adjacency-only reach** → adjacency + road-connectivity chain-slide.
- **Flat RIFT STIRS** (`ESCALATION=0`, interval 12) → escalating collapse + Cataclysm.
- **Silent influence-tally ending** → collapse-driven sudden-death climax.
- **WARD-as-bounce** → WARD-as-face-down-capture-trap (with Sapper/Feint counters).

**Explicitly NOT added** (rejected with cause, §0): player-tracked Mote/banking
currency; simultaneous commit-reveal; the five-stage turn machine.

---

## (v) Phased build order — every phase names a sim-measurable gate

Honors the project's demonstrated process (one mechanic → one dedicated sim round →
retrain → seed-paired re-sweep). This is the direct answer to "10 systems at once
can't be validated." Cap **2-3 rounds per phase**, then STOP + write `BLOCKERS.md`
(charter constraint). Every phase: `npm run train` + seed-paired re-sweep vs the
RULES-7 baseline AND the prior phase.

| Phase | Ships | SIM-MEASURABLE GATE |
|---|---|---|
| **P0 — instrument** | Fun Index in `tools/metrics.js` (per `analysis/fun_metric_spec.md`); baseline RULES-7 | Fun Index computes from the deterministic log, seed-paired A/B harness runs, numbers stable across two n≥500 batches (±1.0). Records the RULES-7 baseline number. |
| **P1 — dead opening (biggest perturbation, alone)** | Seam Advances + frontier-anchored road legality (connectivity only, NO chain-slide yet) | **first-capture median ≤ 6** (was T9-10) · zero-capture ≤ 5% · ply band 25-45 held · P1 winrate 48-52%. |
| **P2 — roads full** | chain-slide surge + loop-closure doubling + severance; heartland gating + a dedicated **road-rush adversarial bot arm** | road-rush bot winrate in **42-58%** (not an exploit — the SCOUT/capture-from-anywhere bar) · captures/match ≥ RULES-7 · Fun KillerMoves + Permanence up · LeadChange stays inside its band · ply band held. |
| **P3 — action stages** | Cascade + Vanguard | **median placements/turn > 1** · RAPP SkillDepth pulls strong-vs-weak OUT of 100% into the **65-85%** band (greedy/search2/policy arena) · ply band held · balance held. |
| **P4 — traps & telegraphs** | Wards (face-down capture-trap + Sapper/Feint) + Sagas/On-Reveal | Fun Index ↑ vs P3 · comeback rate ↑ · balance 48-52% · **flag:** face-down hidden info client-derivable → ranked-mode blocker logged. |
| **P5 — interaction & climax** | Threshold beat (capture-only FAST window) + escalating collapse/Cataclysm + sudden-death | MP relay round-trips the response window deterministically (replay-identical) · silent-ending share drops well below ~70% · Fun Uncertainty(Late) ↑ · ply band held. |

Acceptance for the whole round (charter): RULES-8 beats RULES-7 on Fun Index, does
not regress balance or the 25-45 ply band, first-capture ≤6, zero-capture ≤5%,
median placements/turn > 1, every headline mechanic has a signature animation (above).

---

## (vi) Open risks & balance knobs to sweep

**Knobs (new `CONFIG` entries to add + sweep):**
- `SEAM_ADVANCE_START`, `SEAM_ADVANCE_CADENCE` (plies/ring) — co-tune against first-
  capture ≤6 AND the 25-45 ply band (this pair is the whole dead-opening/length lever).
- `ROAD_CHAINSLIDE_REACH_CAP`, `LOOP_CLOSURE_MULT` (default 2), severance orphan rule.
- `CASCADE_MAX` (extra placements ceiling), Cascade grant count per tile.
- `WARD_COST`/counter availability (Sapper/Feint density in the pool).
- `SAGA_CHAPTER_POWER` curve (I/II/III scaling).
- `THRESHOLD_BEAT_SCOPE` (capture-only vs also-Saga-detonation).
- `RIFT_STIRS_ESCALATION` (off 0), Cataclysm radius, sudden-death threshold.

**Risks (honest, from both risk lists + the critique):**
1. **Sim recalibration is non-negotiable** — Seam Advances + Cascade invalidate the
   ply-band and `PLACEMENTS_PER_TURN=1` calibration. P1 is the largest single sim
   perturbation the project has attempted; it gets its own round, not tuning.
2. **Road reach is the exploit class that's been patched twice** (SCOUT rush,
   capture-from-anywhere). Ships heartland-gated from day one AND must clear the
   dedicated road-rush bot arm (P2 gate) — not a mirror-winrate check.
3. **Momentum snowball** — longest-road compounds for the leader. Severance is the
   designed answer; it must be tuned strong enough to be a real comeback lever, and
   comeback-rate must be *measured* (Fun Index ComebackRate), not inferred.
4. **Threshold beat is the one relay rewrite** — the MP action-log must carry an
   optional post-capture response; keep it bounded to ≤1 response (still sequential,
   never bimatrix). If the relay rewrite stalls, P5 ships without the FAST window and
   Wards still flip on the resolving turn (graceful degrade).
5. **Face-down hidden info is client-derivable** — hard blocker for ranked until
   server-authoritative hidden state. Casual/SP unaffected. Do not ship ranked on it.
6. **Economy override is on the operator's authority** — killing 1-placement and
   adding a resource ramp overrules `GAME_DESIGN.md`'s "no in-match currency" line.
   The synthesis honors the *intent* with derived momentum (no tracked currency) to
   minimize re-litigation. A literal spendable/bankable Mote pool remains a further
   explicit override with its own diagnosed problem and its own sim round — not
   adopted by default.
