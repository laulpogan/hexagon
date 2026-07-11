# Civ 6 → Limen steal-list: LOYALTY (the core we're based on) + adjacency (2026-07-11)

Sources: Civ Fandom wiki (Loyalty_(Civ6), Adjacency_bonus_(Civ6), District_(Civ6)),
CivFanatics loyalty guide + pressure-formula thread, GamesBeat R&F review, GameDeveloper
design essay, GameRant/KeenGamer/HogoGame. Wiki fetch 402'd; formulas cross-confirmed via
search summaries + stable R&F-era knowledge. [S, web, 85]

## Part A — LOYALTY: the system Limen IS (operator correction 2026-07-11)

Limen's influence/capture core is Civ 6 loyalty at tile granularity:

| Civ 6 loyalty | Limen today |
|---|---|
| Per-city loyalty score; pressure from nearby population | `relativeInfluence` (game.js:150): friendly neighbors add, enemies subtract |
| Pressure formula `10·(Dom−For)/(min+0.5)`, capped ±20 | Contribution sums with SIEGE/height/WING modifiers, floor 0 |
| Population scales pressure | Height/stack presses harder (dH bonus) |
| Governors/amenities as point defense | WARD (absorb one capture), MENACE, WING |
| City flips at 0 loyalty | Tile capturable at `influence ≤ captureThreshold` |

**What Limen dropped from the source — the loyalty steals:**

| # | Steal | Civ 6 shape | Limen shape | When |
|---|---|---|---|---|
| L1 | **Waver (gradual flip)** — THE headline steal | Cities bleed loyalty per turn; you SEE the flip coming and can rescue it | Tile at `influence ≤ threshold` on owner's turn-start accrues a waver counter (shown on tile); at N=2-3 it flips (or goes Unbound, L2). Active capture-by-placement stays. Telegraphed, rescuable captures. | **Candidate P4** — it IS a telegraph mechanic; may beat face-down Wards for that round's slot. Directly attacks U-late 0.18 (the measured drag: games decided early, no visible impending swings) |
| L2 | **Unbound (free-city) state** | 0-loyalty city revolts NEUTRAL first; highest pressure claims it | Flipped/severed tiles turn neutral 1 ply, claimable by either side → contested prizes mid-board. Natural partner to P2 severance (orphaned road segments go Unbound instead of just zeroed) | P2 design consideration + L1 partner |
| L3 | **Pressure radius w/ falloff** | Population presses to 9 tiles, −10%/tile | Capitals + tier-3 towers project 2-hex pressure at half strength (tall = regional power beyond SUMMIT) | Own round, expensive (all influence math + retrain); unscheduled |
| L4 | **Age factor (momentum multiplier)** | Dark 0.5× / Normal 1× / Golden 1.5× pressure | P2 MOMENTUM (longest road) doubles as the age factor: pressure multiplier keyed to road momentum — big road = golden age | Fold into P2 design as a knob (`MOMENTUM_PRESSURE_SCALE`), not extra mechanic |
| L5 | **Anchor point-defense** | Governor +8 loyalty | Keyword: adjacent friendlies never accrue waver counters | Only if L1 ships |

**Design cautions (loyalty's documented failures — do not import):**
1. **Opacity** — loyalty's #1 criticism: flips are hard to plan/read despite UI lenses. If L1
   ships, tiles must show pressure number + plies-to-flip explicitly. Same UI investment as
   S1 adjacency preview below — one overlay serves both.
2. **Expansion punishment** — forward settles rebel in a few turns; players call domination
   "tedious". Lesson for P1 frontier-anchor: forward placement must be *defensible*, not a
   sacrifice — echoes gate-#1 reviewer finding that rear-backfill dies under the current cut.

## Part B — adjacency layer (districts)

## The Civ 6 system, compressed
1. **Three-tier grammar:** major +2 · standard +1 · minor +0.5 — every bonus readable at a glance.
2. **Typed pair matrix:** each district cares about DIFFERENT neighbor classes (Campus←mountain,
   Industrial Zone←mine/quarry, Harbor←sea resource, Holy Site←woods). The puzzle is WHICH type
   goes WHERE, not "biggest number anywhere."
3. **Hub aggregator:** Government Plaza gives +1 to ANY adjacent district → city cores form
   around it; a spatial commitment enemies can read.
4. **Opportunity cost:** a district destroys its tile's base yield → best-yield cells are the
   WORST district spots. Placement = sacrifice decision.
5. **Cluster chaining:** districts give each other minor bonuses → triangle/diamond metas,
   multi-turn planning.
6. **Doublers:** policy cards double a class's adjacency → timing layer on top of geometry.

## What Limen already has (verified against working tree)
`relativeInfluence` (game.js:150) IS adjacency-summed — friendly neighbors add, enemies
subtract (SIEGE/height/WING modifiers). Aura keywords: RALLY (+1 adj friendlies, capped
+2 = Gov-Plaza-lite), SIEGE, DOUBLESTRIKE. Terrain-typed: FORTIFIED (edge), ATTUNED/
SEAMBOUND (rift), SUMMIT (height). Missing: pair matrix, preview UX, cell heterogeneity
(ruins decay removed in R7 — board is uniform except rift).

## Steals, ranked
| # | Steal | Limen shape | Seam | When |
|---|---|---|---|---|
| S1 | **Adjacency preview UX** | Hover legal cell → projected influence, per-neighbor ± pips, capture-threat flag. Civ's readability is why its puzzle is fun; Limen's math is invisible today. | main.js hover + scene.js hints. Pure UI — no rules, no retrain, no sim gate. | **Ship anytime** (next UI pass) |
| S2 | **Attunement pairs** (typed synergy matrix) | 4-6 pairs at standard +1, stack-capped like RALLY: THICKET↔THICKET (grove cluster), PALISADE↔BASTION (wall line), ALTAR↔HERALD (choir), SKIRMISHER↔REAVER (warband). `synergy` field on TILE_POOL entries + one loop in relativeInfluence beside RALLY. | data/tiles.js + game.js:150. Rules change → own sim round + retrain. | Candidate **P3.5** — after Cascade, so multi-placement can assemble a triangle in one big turn (the payoff moment) |
| S3 | **Doubler rite** ("Resonance": target friendly tile's positive adjacency ×2 for 2 plies) | Policy-card steal; rides existing rite machinery (mechanics.js RALLYING_CRY pattern). | mechanics.js rites. | P4/P5 filler, cheap |
| S4 | **Ley nodes** (sparse seed-gen cell features, +1 occupant influence, minor tier) | Restores cell-value texture R7's ruins removal deleted; nodes on outer rings become early contested prizes the Seam then eats — composes with P1. | board.js createBoard (deterministic from seed) + relativeInfluence. Board-gen change → own round + retrain. | Candidate, unscheduled |
| S5 | **Tier grammar** | Adopt major/standard/minor LANGUAGE in keyword descs + UI badges (don't force-renormalize SIEGE −5 etc.). | data/tiles.js descs, UI copy. | Free, ride any pass |

## Anti-steal note (why Limen can beat Civ here)
Civ adjacency is solitaire optimization — nobody attacks your Campus triangle. Limen capture
flips it: a synergy hub (RALLY anchor, S2 triangle center) is a CAPTURE TARGET, and P2
severance already makes network-breaking a comeback lever. Typed adjacency + capture =
placement puzzle with counterplay Civ never had. That interaction is the real prize.

## Discipline
One mechanic per sim round (RULES8_BUILD_LEDGER). S1/S5 are UI-only — exempt. S2/S4 each
need their own Fun-Index-gated round; do NOT fold into P1/P2 perturbations.
