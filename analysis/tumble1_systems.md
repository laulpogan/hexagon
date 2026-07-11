# Limen systems review — pacing, placement feel, and the "wow" gap

Reviewer stance: competitive CCG systems designer, playing to win. Read `GAME_DESIGN.md`,
`core/game.js`, `core/config.js`, `core/board.js`, `core/mechanics.js`, `core/bot.js`,
`data/tiles.js`, `main.js`, and `ARENA_PLAN.md`. Then played two full games to completion
against the shipped bot, driving the live `core/` engine in a real browser
(`python3 -m http.server 8940`, Playwright against `window.__limen.game` +
a dynamic import of `core/bot.js`) — not a mock, the same code path the shipped page runs.

Diagnosis under test: *"The game doesn't force combat or interaction quick enough, and
there isn't really any strategic feeling to tile placement. Missing the wow effect /
addictive hook."*

**Verdict: confirmed, and worse than the diagnosis states.** In one full 41-turn game,
zero captures occurred — not "slow," *never*. In a second game where I deliberately
played for contact, combat started turn 4, but the dominant follow-up move (build a
tower) turned out to be an active trap: the defender can dismantle a tower for free
from anywhere on the board, forever, while the builder bleeds real cards. Both games
ran longer (41 and 57 half-turns) than the design doc's own ~33-turn sim average and
its "~10–15 min matches" identity target.

---

## 1. Method

Two full vs-Bot games, played by driving `core/game.js` + `core/bot.js` directly
(bypassing the 750ms UI animation delay, not the rules — every move went through
`game.legalMoves()` / `game.placeFromHand()` / `game.isCapturable()`, the exact
functions the shipped page calls). Player 1 (human seat) was scripted with two
different one-ply heuristics standing in for two styles of thoughtful human play;
Player 2 was always the shipped `botTakeTurn` greedy bot, unmodified.

- **Game A — "safe" P1**: rewards own resulting influence, mildly penalizes
  ascending, lightly rewards marching toward the enemy capital (weight 0.5,
  matching the bot's own weighting). Meant to model a player who plays *well by
  the numbers* without picking a fight.
- **Game B — "aggressive" P1**: doubles down on capture bonus, triples the
  march-to-capital weight, penalizes ascension instead of lightly discounting it.
  Meant to model a player actively trying to make something happen.

Per turn I logged: legal move count, a "diversity bucket" count (moves grouped by
`{capture?, ascend?, rounded resulting influence}` — a proxy for how many
*meaningfully different* outcomes exist among the legal cells), the score gap
between the best and second-best move (a proxy for "obvious vs. real decision"),
and a board-wide capturable-tile scan after every single action (both players) to
timestamp the first capture *threat* and the first actual capture.

Board: 13×9 (117 cells), one rift hex per column jittered ±1 from row 4 (13 rift
cells total, confirmed from `board.js` at runtime). Starter deck (20 cards, the
default `defaultDeckComposition()`) carries **zero** rite cards — `SUNDER`,
`FORESIGHT`, and `RALLYING_CRY` all ship at `count: 0` in `data/tiles.js`. Neither
game ever saw a rite. That's a finding in itself (§4.7).

---

## 2. What happened

### Game A (safe play both sides) — zero contact, zero captures, 41 turns

| turn | legalMoves | diversity buckets | scoreGap top2 | capturable tiles on board |
|---|---|---|---|---|
| 7 | 202 | 15 (7%) | 0.00 | 0 |
| 15 | 210 | 22 (10%) | 2.99 | 0 |
| 27 | 200 | 11 (6%) | 0.03 | 0 |
| 37 | 79 | 9 (11%) | 0.02 | 0 |
| 40 (last) | 16 | — | — | 0 |

Final: `stats.captured = 0` for **both** players, across the entire game, verified
against the engine's own cumulative counter (not just my sampling). P1's tiles
never left columns 5–7, rows 0–2. P2's tiles never left roughly the mirror rows
5–8. The rift band (row 3–5) was never touched. Both sides spent most placements
**ascending** (stacking onto their own tile, capped at tier 3) rather than
expanding the frontier — by turn 39, P1 had made 20 placements but held only 9
board tiles; the other 11 were ascends recycling 2–3 "anchor" cells stacked with
RALLY/FORTIFIED auras. Game ended by the influence-victory clock (both decks and
hands empty), P1 159 vs P2 154.

**Why this is possible, mechanically:** placement legality only requires
adjacency to *your own* tile (`canPlace` in `core/game.js`); nothing requires or
rewards approaching the opponent. Ascending is always legal, always safe (captures
resolve on influence, not position, and towers built at home never dip toward 0
because RALLY/FORTIFIED/tier bonuses stack faster than anything erodes them when
uncontested). A player who never chooses to leave home is never punished for it.

### Game B (aggressive P1, turn-1 forward SCOUT) — fast contact, then a trap, then a real fight

- **Turn 1**: P1 drops a `LANTERN[SCOUT]` at (6,5) — deep in open ground near the
  seam, legal because SCOUT ignores the adjacency rule (everywhere except the
  enemy heartland). It lands at 0 relative influence immediately (no support).
  First capture *threat* on the board: **turn 1**.
- **Turn 4**: the bot captures that tile. **First actual capture: turn 4.**
- **Turns 9–28 (10 exchanges, ~13 half-turns)**: P1 repeatedly ascends onto the
  same cell (6,6) — ECHO, SKIRMISHER, THICKET, ALTAR, OUTCROP, SKIRMISHER,
  OUTCROP, HERALD, OUTCROP — and the bot **peels it right back off, every single
  time**, immediately, from a card that returns to its own hand for free.
  `stats.captured` for P2 climbs by 1 on every peel; P1 permanently loses a real
  deck card each cycle for zero lasting board presence. This is not a scripting
  artifact of my heuristic alone — it is a legal, repeatable, engine-level
  exchange that costs the attacker nothing (see §3.2).
- **Turns 29–57**: P1 stops feeding the trap, redeploys a second SCOUT, and a
  real frontier opens around cols 3–8, rows 5–7 — the actual rift band. From
  here the game plays the way the design doc wants: real trades, RIFT-aura
  pressure tipping contested tiles toward capturable, both sides trading real
  captures (P1 ends with 5, P2 with 11 — most of P2's haul is free peels from
  the trap above, not frontier fighting).
- Final: P2 wins by influence, 85 vs 72, turn 57.

**Read together**, Games A and B show the pacing problem isn't uniformly slow —
it's **bimodal and entirely a function of one early decision** (does P1 send a
forward SCOUT turn 1 or not). One branch never makes contact. The other makes
contact turn 4 but immediately routes into a mechanically-free farming loop that
looks like "combat" in the stats but is actually a card-disadvantage trap, not a
tactical fight. Neither branch is what "forces" interaction — both are what a
player's early instinct happens to produce.

---

## 3. Mechanism-level diagnosis

### 3.1 Nothing in the ruleset requires closing distance
`canPlace()` only checks adjacency to your **own** tiles (or SCOUT's blanket
exemption). `isCapturable()` and the influence math have no positional term
beyond the rift aura and FORTIFIED-edge bonus. A player can win the entire
20-card deck out without ever having a tile within several hexes of the
opponent. This is root cause #1 for "doesn't force combat" — it's not that
combat is slow to arrive, it's that arrival is optional and neither side is
compensated for skipping it.

### 3.2 Peeling a tower is free for the attacker; feeding one is not
`placeFromHand()`'s peel branch (`core/game.js` ~L310–319):
```js
if (target && cell.stack.length > 0) {
  cell.tile = cell.stack.pop();
  cell.ruins++;
  this.hands[player].push(tile);   // attacker's card bounces back — no cost
  this.stats[player].captured++;
  ...
}
```
Combined with "captures do not require adjacency" (by design, per
`GAME_DESIGN.md`), this means *any* card in the attacker's hand can snipe *any*
tower on the board, every single turn, forever, at zero card cost — only a
turn's tempo. Meanwhile the defender who built the tower spent a real,
permanently-consumed card on every tier. This is a strictly dominant strategy
for whichever side has board presence within striking distance of a tower and
nothing better to do: park a piece and free-farm the opponent's card advantage.
It is the single worst mechanism found in this review, because it actively
punishes the game's own flagship "new mechanic since baseline" (Ascension) and
converts contact, once it happens, into an unfun grind rather than a decision
point. `ARENA_PLAN.md` round 3's own note — "search agent exploits towers hard
(20-0 vs greedy)" — is very likely this same hole, previously observed as an AI
ladder anomaly rather than diagnosed as a rule bug.

### 3.3 Buried keywords go dark, so tower composition doesn't matter
"Only the top tile's keywords active" means stacking a HERALD (RALLY) then an
OUTCROP on top turns off RALLY the instant the OUTCROP lands. Towers look
strategic (which cards do I stack?) but functionally reduce to "which single
card has the highest raw influence, put it on top" — a non-decision, and it
compounds §3.2: you're one-shot-vulnerable to a free peel regardless of what's
buried underneath.

### 3.4 The board is mostly featureless, so most legal cells are identical
Across both games, "diversity buckets" (distinct outcome classes) sat at roughly
**6–15% of the raw legal move count** — turns with 150–300 legal placements
routinely had only 9–24 outcomes that differed in any way that matters (capture
vs. not, ascend vs. not, rounded resulting influence). The only cell-local
modifiers in the entire ruleset are FORTIFIED (board edge) and rift aura (13
hexes). Everywhere else, placing tile X next to your blob at cell (a) vs. cell
(b) produces the *same number* if both have the same count of friendly
neighbors — which is most of the frontier, most of the time. This is the
concrete mechanism behind "no strategic feeling to placement": the engine is
honest, there just isn't much for it to be honest *about*, cell to cell.
`scoreGapTop2` backs this up — it sat at 0.00–0.03 on a majority of turns in
both games, meaning the "best" and "next-best" moves were functionally tied.
That's not a close, meaningful decision; combined with the low diversity ratio
it's the same decision offered 40 times.

### 3.5 The one lever that forces early contact (SCOUT) punishes trying
SCOUT is the only way to break the adjacency requirement, and it's how Game B
got contact on turn 1. But an unsupported forward SCOUT lands at 0 relative
influence and dies almost immediately (captured turn 4) — the game's only
built-in "go make something happen" tool teaches a player who tries it that
initiative is punished, not rewarded, unless they already understand they need
to follow up with support (a non-obvious read for a new player looking for a
"wow" moment).

### 3.6 Rites — the one range-pressure tool — ship at zero copies
`SUNDER` (ranged removal at ≤2 influence, no adjacency needed) is exactly the
kind of card that could apply distant pressure and force a response without
needing armies to physically meet. It exists in the engine and the UI help
panel. It is **not in the starter deck** (`count: 0` for all three rites in
`data/tiles.js`). A fresh player, or a fresh vs-Bot game with no saved deck,
never sees it. This is a shipped-but-not-wired gap, not a design flaw — cheap
to fix.

### 3.7 Game length already overshoots the doc's own target
`GAME_DESIGN.md`'s Identity section states "~10–15 min matches." Both playtests
ran 41 and 57 half-turns (roughly 20–28 full rounds). Even at a brisk 20–30
seconds of human think time per turn, that's 14–28 minutes of placements alone,
before animation/UI overhead. Ascension is a meaningful contributor: in Game A,
20 real placements produced only 9 board tiles — more than half of all "turns"
were filler that didn't advance the board state at all. Fixing §3.1/§3.2 should
also fix this; it's listed as a symptom of the same root causes, not a separate
one.

---

## 4. Ranked fixes

Ranked by expected impact on the pacing complaint vs. effort to ship. Each notes
predicted effect on turn-of-first-capture (ToFC), decisions-per-turn (quality,
not raw legal-move count), and comeback potential (can a losing side claw back).

### F1. Make peeling cost the attacker their card (HIGH impact / LOW effort)
Remove the free bounce-back in the peel branch (`core/game.js` peel block) —
peeling a tower should consume the attacking card the same way a normal capture
does, or at minimum cost something (a discard, a cooldown) beyond pure tempo.
Single, surgical rule change; keep WARD's bounce-back as is (WARD is explicitly
meant to waste an attack, that's its identity — peel currently gets the same
treatment by accident, not by design).
- ToFC: unaffected (doesn't change when contact starts).
- Decisions/turn: up, meaningfully — "should I peel or develop elsewhere" becomes
  a real trade-off instead of a free action.
- Comeback potential: up — a tower-builder who gets sniped once isn't
  auto-doomed to lose the whole cell for free every turn after.
- This is the single highest-leverage fix in this review. Ship it first;
  everything else (especially DOMINION, §5) is entangled with it.

### F2. Require adjacency for captures (HIGH impact / HIGH effort, HIGH risk)
The most structural fix: make capture (including peel) require the attacker to
have a tile adjacent to the target, same as normal placement. This is a bigger
change than it looks — "captures don't require adjacency" is a deliberate,
named carried-over rule from the original hexagon game — but it is also the
rule most directly responsible for both root causes in §3.1 and §3.2: it's why
turtling is completely safe (nobody can be threatened from a distance) *and*
why sniping is free (the attacker doesn't even have to travel to punish a
tower). Requiring adjacency would force both armies to physically close ground
before any capture pressure exists at all — the single most direct way to make
"placement" spatial again.
- ToFC: goes up in the worst case (Game A's zero-contact branch becomes
  impossible only if paired with F3/F6 — adjacency alone doesn't force anyone
  to approach, it just means nobody CAN be punished until they do, so passive
  turtling is still viable without a second lever).
- Decisions/turn: up a lot — every placement near the frontier now has to weigh
  "do I expose a capture lane" as a real spatial question.
- Comeback potential: up — you can no longer be sniped from clear across the
  map while playing defense elsewhere.
- Needs a full HIGH-tier build-loop pass (sim sweep, meta re-check) before
  shipping — this is a core-rule change, not a tuning knob. Recommend doing F1
  first (cheap, low-risk, ships this week) and treating F2 as the next design
  round's headline item.

### F3. Ship THE RIFT STIRS, but pair it with a reason to be near the seam (MEDIUM-HIGH impact / MEDIUM effort)
The proposed "every 6th turn, rift-adjacent tiles take -1" event is explicitly
designed as an "anti-turtle timer" — but as written it only punishes tiles that
are *already* near the seam. Game A shows this doesn't help by itself: neither
side went anywhere near the rift band for 41 turns, so a periodic rift-adjacent
penalty would have fired on nothing. Pair it with a small **positive** draw to
the seam — e.g., a flat influence bonus for holding a cell within 2 of the rift
("contested ground"), so the middle third of the board becomes worth
contesting instead of purely worth avoiding. THE RIFT STIRS then adds real
tempo pressure once players are there instead of being dead code against a
turtled game.
- ToFC: down, meaningfully — this is the most direct lever for pulling both
  sides toward the middle early.
- Decisions/turn: up — the rift band becomes a live tactical zone instead of a
  no-go strip.
- Comeback potential: neutral-to-up — a losing side has a defined objective
  (the contested middle) to fight for instead of only "grind the edges."

### F4. Add a soft cap on home-cluster density (MEDIUM impact / MEDIUM effort)
Cap the number of tiles+tower-tiers a player may hold within N rows of their own
capital (or make crowding your own capital zone increasingly influence-inefficient
— e.g., a mild penalty for a 3rd+ tile within 2 rows of your capital). Forces the
frontier to grow outward once the home area fills, directly attacking §3.1
without touching the capture-adjacency rule. Cheaper and lower-risk than F2, and
composes with it.
- ToFC: down.
- Decisions/turn: up slightly (placement now has to think about zone crowding).
- Comeback potential: neutral.

### F5. Un-bury aura-class keywords (LOW-MEDIUM impact / LOW effort)
Let RALLY/FORTIFIED/SIEGE (passive, aura-style keywords) keep contributing even
when buried under a taller tower; keep capture-gate keywords (FLANK, MENACE,
WARD) top-face-only since those are legitimately about the current combat face.
Makes tower **composition** (what order you stack, not just what's biggest) a
real decision.
- ToFC: unaffected.
- Decisions/turn: up — tower-building becomes a genuine sub-puzzle instead of
  "biggest number on top."
- Comeback potential: neutral.

### F6. Bring capitals closer together (LOW effort / MEDIUM impact, needs a resim)
`CAPITAL_MIN_DIST_FROM_SEAM = 2` on a 9-row board puts capitals up to 8 rows
apart. Shrinking this (or the board height) cuts the raw travel distance before
frontiers can meet. Cheapest possible lever, but this exact axis was already
tuned once — shallow capitals caused a 30% turn-1 KO exploit that the "deep and
central" bot doctrine was built to close (`ARENA_PLAN.md` round-6 notes). Any
change here needs the same seed-paired sweep discipline to avoid reopening that
hole.
- ToFC: down.
- Decisions/turn: neutral.
- Comeback potential: neutral, watch capital-rush risk closely.

### F7. Ship 1–2 rite copies in the starter deck (LOW effort / LOW-MEDIUM impact)
Add `SUNDER: 1` (or `FORESIGHT`/`RALLYING_CRY`) to the default deck composition
in `data/tiles.js`. SUNDER in particular gives a player a distance-independent
way to apply pressure or punish an overextended tile without needing to be
adjacent — a small, cheap complement to F2/F3 and a quick fix for the fact this
mechanic is currently invisible in actual play.
- ToFC: down slightly (gives players a tool to manufacture a threat early
  without a fragile forward SCOUT).
- Decisions/turn: up slightly.
- Comeback potential: up slightly (ranged removal is a classic catch-up tool).

### F8. Retune the AI's own tempo tax on ascension, once F1 lands (LOW priority)
`core/bot.js`'s ascend score currently applies only a flat -2.5 tempo tax
(`own - 2.5 + noise`). Once peeling costs a real card (F1), re-sweep this
constant — it may need to fall further to stop the bot itself from over-valuing
towers relative to frontier expansion. Sequencing note, not a standalone fix.

---

## 5. Existing PROPOSED mechanics vs. the pacing problem

From `GAME_DESIGN.md`'s "Design round: Threshold slate" (RIFTBORN, THE RIFT
STIRS, DOMINION, REMEMBRANCE) — evaluated specifically against turn-of-first-contact
and placement-feel, not against their flavor merits.

| mechanic | effect on pacing problem |
|---|---|
| **RIFTBORN** | Neutral-to-mild-help. A collectible chase keyword, not a systemic lever — only nudges the handful of players who draw it toward the seam. Doesn't move the needle on Game A's zero-contact branch. Ship for flavor/collection depth, not as a pacing fix. |
| **THE RIFT STIRS** | Helps, but only downstream of another fix. As written it punishes tiles already near the rift; Game A shows both sides can simply never go there, so it fires on nothing. Pair with F3's positive seam incentive before shipping, or it's dead code against turtled games. |
| **DOMINION** | **Hurts until F1 ships.** A tier-3 tower debuffing its neighbors makes tall-building even more attractive in a world where towers are already free to build and (per §3.2) can't be economically punished by peeling anyone would actually attempt — except peeling is free for the ATTACKER regardless of DOMINION, so DOMINION doesn't even protect the tower it's supposed to reward; it just adds an extra debuff on top of a structure that's still one free peel from disappearing. Sequence this after F1, then it's a legitimate reward for pushing a tower to the frontier (a home-turtled tower has no enemy neighbors to debuff, so DOMINION only pays off if the tower is already near contact — that's actually a decent nudge once towers stop being free to demolish). |
| **REMEMBRANCE** | Helps, but for late-game texture, not for time-to-first-contact. Rewarding a player for reclaiming a cell they already lost tile-on-tile is a good complement to F1 — once peeling costs both sides a real card, REMEMBRANCE gives the original owner a reason to fight to take the cell back rather than write it off, converting attrition into a value-accumulating tug-of-war instead of a pure resource sink (which is what Game B's turns 9–28 currently are). Ship after F1. |

**Sequencing recommendation**: F1 (fix the free-peel exploit) before DOMINION;
a positive seam incentive (part of F3) before THE RIFT STIRS; REMEMBRANCE
anytime after F1. RIFTBORN can ship independently, it's orthogonal.

---

## 6. Deck size and hand mechanics — "bigger, better decks"

Current: 20-card deck, hand size 5, draw-1/place-1 (net-neutral hand size while
the deck lasts), tier caps (max 2 rare / 6 uncommon / rest common, per-card copy
caps 3/2/1). Both playtests consumed the **entire** 20-card deck
(`stats.placed: 20` for both players, both games) — this matches the design
doc's own sim note that ~70% of games end by influence-clock, i.e., decks
regularly run dry.

**Don't just make the deck bigger.** Two findings argue against it directly:

1. **Games already overshoot the design's own 10–15 min target** (§3.7) at 20
   cards. A bigger deck without fixing what makes half of every game filler
   (ascension recycling 2–3 anchor cells, §2 Game A) just extends an
   already-too-long game, it doesn't add decision density.
2. **Diversity-bucket data (§3.4) shows the deck's problem isn't size, it's
   thinness of distinct decisions.** THICKET and OUTCROP are functionally
   identical vanilla 2-influence commons — `ARENA_PLAN.md` already flags this
   itself as an open backlog item ("THICKET/OUTCROP twins"). Going from 20 to
   30 cards mostly means drawing more copies of interchangeable filler, not
   more meaningful choices — my empirical ~6–15% "meaningfully different"
   rate on placements would likely hold at any deck size, since it's a board
   -homogeneity problem (§3.4), not a card-count problem.

**What would make deckbuilding matter more**, roughly in priority order:

- **Give hand size a hard cap with real discard pressure**, decoupled from
  deck size. Right now hand size floats 1:1 with the deck (draw replaces what
  you place) and the once-per-turn discard/redraw is a free mulligan valve, not
  a constraint — there's no moment where a player is forced to choose between
  two good cards because the hand is full. A hard cap (say 6–7) with draws
  fizzling past it turns "which 2 of my 3 good draws do I keep" into a real,
  repeated deckbuilding-relevant decision, which is closer to what makes MTG's
  card advantage matter than raw deck size is.
- **Reduce the vanilla-twin tail before growing the pool.** Fewer
  interchangeable commons, more commons that care about board state (adjacent
  tower height, ruins count, rift distance) — cheap variance that raises the
  diversity-bucket ratio without needing new UI or balance categories.
  `data/cards_gen.json`'s 967-card sim pool (already generated, sim-only per
  the doc) is a resource here — mine it for board-state-aware commons instead
  of "vanilla stat stick #6," rather than porting it wholesale into the
  shipped pool.
- **If deck size does grow, grow it modestly (20 → 24) and only alongside a
  cost-adjacent tension** — since resource costs were deliberately stripped,
  the only remaining brake on "just play your best cards" is the tier caps.
  Consider a light per-tile cooldown (already flagged as a "if playtesting
  demands it" contingency in `GAME_DESIGN.md`'s Pacing Valve section) gated
  specifically on rares, so a 24-card deck with 2 rares doesn't let both rares
  land back-to-back on turns 1–2 — this is the lever that would make "which
  rares to run" a real deckbuilding question instead of "always run the best
  2."
- **Ship the rites** (F7 above) as part of this — three cards currently exist,
  balanced, tested, and invisible. That's free deckbuilding depth already paid
  for.

---

## 7. Summary table — fix impact matrix

| fix | ToFC | decisions/turn | comeback | effort | risk |
|---|---|---|---|---|---|
| F1 peel costs a card | — | ++ | ++ | low | low |
| F2 captures need adjacency | + (needs pairing) | +++ | ++ | high | high |
| F3 RIFT STIRS + seam incentive | +++ | ++ | + | medium | medium |
| F4 home-cluster soft cap | ++ | + | 0 | medium | medium |
| F5 un-bury aura keywords | 0 | ++ | 0 | low | low |
| F6 capitals closer | ++ | 0 | 0 | low | medium (resim) |
| F7 ship rites in starter deck | + | + | + | low | low |
| F8 retune bot ascend tax | 0 | 0 | 0 | low | low |

(`+`/`++`/`+++` = improves the metric in the stated direction, roughly by
magnitude; `0` = no expected effect; `—` = harms.)

Recommended sequence for one build-loop round: **F1 → F7 → F3 → F6**, each
individually cheap and low-risk, sim-swept together (they interact: F6 shrinks
the map F3's incentive needs to pull people across). Save F2 (adjacency-gated
captures) for its own dedicated HIGH-tier round — it's the correct long-term
fix but it rewrites a rule the game currently advertises as a deliberate,
named design choice, and deserves its own persona review and full sim sweep
before shipping.
