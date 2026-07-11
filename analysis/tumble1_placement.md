# Limen — placement-depth review (abstract-strategy lens)

Reviewer stance: Go/Hive player evaluating a hex-tile placement duel on decision
depth, tempo, and whether every move carries initiative meaning. Read-only on
the repo. Method below; findings, structural causes, proposed fixes, and a
verdict on the "Threshold slate" round close the report.

## Method

- Read `core/game.js`, `core/config.js`, `core/mechanics.js`, `core/board.js`,
  `core/bot.js`, `data/tiles.js`, `main.js`, `ui/hud.js`, `GAME_DESIGN.md`
  end to end — the rules below are traced to exact lines, not inferred.
- Served the app (`python3 -m http.server 8941`) and drove it live via
  Playwright against `window.__limen` (bot mode). An early multi-step session
  hit a browser-timing race (moves appeared between my calls that I hadn't
  issued — likely stale queued `setTimeout` chains across slow tool
  round-trips); I do not trust that transcript. I re-ran the playthrough as a
  single atomic in-page script (one `browser_evaluate` call, internal polling,
  no external round-trips) — that transcript is clean and is what's quoted
  below.
- Because `core/` is explicitly "renderer-free, headless-runnable" (file
  header, `core/game.js:1`), I also ran the *exact same* engine + bot
  (`core/bot.js`) directly in Node for race-free, deterministic full-game
  traces and a 40-game batch, to get aggregate numbers no single playthrough
  can give.

## 0. Rules as implemented (verification pass)

Confirms/contradicts `GAME_DESIGN.md` against the shipped code:

- **Turn**: draw 1 (`_beginTurn`), place 1 (`PLACEMENTS_PER_TURN: 1`). Matches doc.
- **Influence**: `effectiveBase` = tile influence + FORTIFIED-on-edge + RALLY
  aura (capped) + `stack.length * TIER_BONUS`. `relativeInfluence` = own
  effectiveBase + Σ(friendly-neighbor effectiveBase, ×2 if DOUBLESTRIKE) −
  Σ(enemy-neighbor effectiveBase + SIEGE, halved by WING) ± rift aura − ruin
  penalty, clamped ≥ 0 (`core/game.js:96-144`). Matches doc.
- **Capture**: `isCapturable` = relativeInfluence ≤ threshold (0 default;
  FLANK loosens to 2; MENACE requires 2+ adjacent attackers or blocks
  entirely). **Confirmed: the capture branch of `canPlace` has no adjacency
  check at all** (`core/game.js:171-181` — `if (cell.tile) { ...; return
  this.isCapturable(col, row, player); }`, no neighbor test). Verified live:
  `game.canPlace(1, tile, farCol, farRow)` returns `true` for any capturable
  enemy tile regardless of distance. This is the documented "no adjacency for
  captures" design intent, and it's real in code, not just prose.
- **Ascension**: place onto your own non-capital tile, height < `TIER_MAX`
  (3), +1 influence/buried tier, only top tile's keywords active
  (`core/game.js:284-293`). Matches doc. Capturing a tower peels one tier
  only, attacker's card bounces to hand, cell gains a ruin layer
  (`core/game.js:310-319`). Matches doc.
- **Capitals**: `CAPITAL_INFLUENCE: 2`, must be ≥2 rows off the seam on your
  side, **and explicitly barred from rift hexes** (`isLegalCapitalCell`
  checks `cell.rift`, `core/game.js:154-160`). Capture = instant win. Matches doc.
- **Win**: capital KO, or influence-decision at 2 consecutive passes / both
  sides fully spent, with a signed `INFLUENCE_TIEBREAK_BONUS_P1: -2` (net
  favors P2 in the resolution snapshot). Matches doc.
- **Rift aura — confirmed live**: placed a tile two hexes from my capital;
  its neighbor at the rift-adjacent cell read exactly base(2) + friendly(+2)
  − rift(1) = 3, matching the formula by hand. ATTUNED reverses the sign.
  This part works exactly as documented.
- ⚠️ **Discrepancy found — rift is not actually impassable.**
  `GAME_DESIGN.md` states: *"Rift hexes are impassable — nothing may be
  placed on them (doc corrected 2026-07-10 to match the shipped engine...)"*.
  But `canPlace()` (`core/game.js:171-193`) never checks `cell.rift` for a
  normal placement — only `isLegalCapitalCell` does, and only for capitals.
  Verified live: `game.canPlace(1, riftwalkerTile, 6, 3)` (an empty rift hex
  adjacent to a friendly tile) returned `true`, and the placement succeeded.
  Worse: because `cell.rift` never gets cleared once a tile occupies it
  (`board.js` sets it once at generation, nothing resets it), a tile parked
  on a rift hex takes **no self-penalty** (the aura formula only checks
  neighbors' `rift` flag, never the cell's own), while its neighbors still
  see it as an adjacent rift hex. Net effect: the rift is not a wall, not a
  routing constraint — it's a permanent −1 tax you can walk straight through,
  or garrison for free. This directly undercuts the "flank-or-suffer" framing
  the design doc claims, and it matters for the analysis below (structural
  cause #4).
- ⚠️ **Finding — the default 20-card deck ships none of the tension
  mechanics.** `data/tiles.js` `TILE_POOL` `count` fields sum to exactly
  `DECK_SIZE` (20) using **only** the vanilla common/uncommon/rare set
  (THICKET, OUTCROP, LANTERN, PALISADE, ALTAR, SKIRMISHER, WARDSTONE, ECHO,
  HERALD, REAVER, RIFTWALKER, COLOSSUS). Every "wave 1 MTG-analog" card
  (FANGWOLF/FLANK, LEECHSPRITE/SUSTAIN, JUGGERNAUT/TRAMPLE,
  VEILWISP/UNTOUCHABLE, GALEHARRIER/WING, DREADMAW/MENACE), every rite
  (SUNDER, FORESIGHT, RALLYING_CRY), and 3 more cards (BASTION, MIRRORSAINT,
  RIFTWARDEN) have `count: 0`. And in vs-Bot mode the bot's deck **always**
  falls back to `defaultDeckComposition()` — `main.js`'s `botBtn` handler
  passes `decks: { 1: saved, 2: null }`, and the `Game` constructor's
  fallback (`(decks && decks[p]) || defaultDeckComposition()`) is falsy for
  `p=2` regardless of what the human deckbuilt. **The bot can never play
  FLANK/MENACE/WING/SUSTAIN/TRAMPLE/UNTOUCHABLE or any rite.** `ARENA_PLAN.md`'s
  "48.9–57.3% evergreen, no degenerate, no dead" balance claim is a
  `tools/arena.js` sim result over the separate 967-card `data/cards_gen.json`
  pool, not the shipped 20-card starter deck — so that validation doesn't
  describe what a player (or the bot) actually experiences.

## 1. Placement-theory analysis

**Sente.** Partial and one-directional. A tile at relative influence ≤
threshold stays capturable indefinitely — no clock forces resolution — until
either reinforced (a new friendly neighbor raises its total) or someone
actually spends a placement to take it. That's a real "must answer or lose
material" situation, structurally close to Go atari. But there's no
compounding: answering a threat doesn't buy tempo or outside strength the way
a forcing move does in Go, and the attacker paid nothing extra to keep the
threat alive (it was never "built," it just fell below zero from the ambient
formula). Verdict: **thin, gote-only defense; no sente-generating attacks.**

**Shape.** Ascension is the closest analog to Go shape (local density) but
it's unconditional and risk-free: always +1 influence, and the opponent
cannot contest it in progress — only peel it *after*, at the cost of a
card that bounces back and removes exactly one tier. In the 40-game headless
batch (below), ascends account for **46% of all turns** — a ratio that would
be alarming in any real shape-based game, since it means "shape" here isn't
a tradeoff against other shapes, it's a free savings account nobody can touch
mid-deposit.

**Expand vs. invade tension.** Absent for roughly the first third of the
game by pure geometry: capitals start ≥2 rows off a seam that sits at
board-row 4 of 9, on a 13-wide board — first contact is ~8+ hexes away. In
the clean atomic Playwright run, 9 of my own turns (18 total plies) were
tagged `expand` because literally no other category of move existed yet —
there was nothing to invade, no scoring zone to race for, no reason the
center mattered before it happened to have an enemy in it. Once contact
happens the tension doesn't become balanced, it flips hard against invading
(next point).

**The fork.** Directly tested: I scored moves by "touches 2+ enemy tiles" as
a fork-seeking heuristic and let it drive my turns once armies met. Result:
a rout. Seven of my tiles were captured in eight consecutive enemy turns
(t24–t38 in the transcript below), final score 235–66. The reason is
structural, not tactical error: `relativeInfluence` is one undifferentiated
scalar that subtracts *every* adjacent enemy's contribution from your own
tile's survivability, the same sum that determines how much you're
"threatening" them. Touching more enemies always weakens you exactly as much
as it pressures them — there is no separate attack stat and defense stat the
way a Hive beetle or a chess knight decouples "what I threaten" from "can I
be taken." A real fork — the sharpest tool in the placement-game
repertoire, because it lets a locally weaker side generate leverage through
geometry rather than raw material — **cannot exist here as a comeback
mechanic.** The only way to safely touch two enemies is to already have
enough friendly local support that you'd have survived there anyway, at
which point the "fork" isn't creating any leverage the position didn't
already have.

**Capture-from-anywhere vs. spatial commitment.** Confirmed in code and in
play (§0). Because *defense* still requires adjacency (reinforcing a
threatened tile needs a new friendly neighbor) while *attack* doesn't, the
game has a built-in reach asymmetry: the attacker's threat range is the whole
board, the defender's is one hex-ring. This is *why* tall/compact beats
wide/thin in both my playthrough and the sim — a spread formation produces
many independently-exposed cheap tiles, each snipeable from anywhere by the
opponent's cheapest card, while a 3-tier tower is one hard cell (peel-only,
card-bounce cost). There is no positional cost to reaching across the map to
snipe — only the same one-card-one-turn cost as placing anywhere else — so
the rift's "you have to route around it" flavor never bites: nothing ever
had to walk anywhere to fight.

**Do neighbors feel plannable two moves ahead?** Locally, yes — the additive
formula is fully exposed in the hover tooltip (`main.js updateBoardTip`,
verified live) and a player can read "if I place X at (c,r), enemy tile at
(c2,r2) drops to 0." But because captures need no adjacency, that local read
never compounds into a forced multi-move sequence the way a Go ladder does —
nothing here is more than 1-ply forcing, since the opponent can always
either reinforce locally or ignore it and snipe something of yours elsewhere.
The formula is **legible but shallow**: it supports 1-ply tactics, not
combinations.

### Evidence — clean atomic Playwright playthrough (vs Bot, default deck)

Opening 9 of my turns: pure `expand`, no alternative existed (rift + distance
made contact impossible). Once formations met around turn 18–20, a `FORK-setup`
heuristic (touch 2+ enemies) walked straight into the bot's ascended
RALLY/SIEGE cluster and got mowed down:

```
t23 p1: placed PALISADE at (8,7)
t24 p2: captured enemy PALISADE at (8,7)
t25 p1: placed LANTERN at (5,5)
t26 p2: captured enemy REAVER at (8,6)
t27 p1: placed PALISADE at (8,5)
t28 p2: captured enemy LANTERN at (7,5)
t29 p1: placed THICKET at (6,5)
t30 p2: captured enemy LANTERN at (5,5)
t31 p1: placed OUTCROP at (9,5)
t32 p2: captured enemy THICKET at (6,5)
t33 p1: placed OUTCROP at (7,4)
t34 p2: captured enemy OUTCROP at (7,4)
t35 p1: placed ALTAR at (9,6)
t36 p2: captured enemy ALTAR at (9,6)
t37 p1: placed ALTAR at (10,6)
t38 p2: captured enemy OUTCROP at (9,5)
t41 p2: influence victory — 235 vs 66
```

Bot's winning formation across the same span: `ascended at (6,7) — THICKET`,
`...OUTCROP`, `...HERALD` (tier-3 by t22) plus a second tower at (6,6) — two
compact towers versus my eight scattered singles.

### Evidence — 40-game headless batch (same engine, same greedy bot both sides)

```
N=40
win reason: capital-KO=3  influence-decision=37  draw=0
side wins: p1=23  p2=17
avg turns=39.0  (min 13, max 42)
avg total captures/game = 2.0
avg ascends/game       = 18.1   (≈46% of all turns)
```

One outlier seed (`trace-1`) produced a 15-turn recapture ping-pong over a
single cluster of cells (`(5,0)`, `(5,1)`, `(5,2)`, `(6,2)`, `(6,3)`, `(7,3)`
traded 8+ times) before both sides gave up and returned to ascending — a
direct illustration of "capture replaces, doesn't require adjacency" letting
a fight spiral before the ruins penalty finally makes it unprofitable.

## 2. Structural causes — placement decisions collapse into "extend/ascend the blob"

1. **Ascension is a strictly-dominant, risk-free filler move.**
   (`core/game.js:284-293`, `TIER_BONUS`, no adversarial response short of a
   card-losing peel.) Whenever nothing clearly better exists, "stack on my
   own tile" is always positive-EV and uncontested — 46% of turns in the
   sim. It gives both players a "good enough" default that never has to be
   weighed against a real alternative.

2. **Attack has global reach; defense has only local reach.**
   (Capture branch of `canPlace` has no adjacency check; reinforcement is
   pure neighbor-sum.) Wide/thin formations are strictly worse than
   tall/compact ones independent of skill — confirmed by the 235–66
   playthrough. This collapses "extend vs. consolidate" into "always
   consolidate, expand only as much as needed to feed future captures."

3. **The influence formula is one undifferentiated scalar for threat and
   vulnerability.** (`relativeInfluence` subtracts *all* enemy-neighbor
   contributions symmetrically, no separate attack/defense stat.) Touching
   more enemies always weakens you exactly as much as it threatens them —
   the fork, placement-strategy's sharpest tool, is structurally unreachable
   except as mop-up on an already-won exchange.

4. **The board's one designed obstacle doesn't obstruct.**
   (`canPlace` has no `cell.rift` check; only `isLegalCapitalCell` does.)
   Verified live: placing directly onto an empty rift hex is legal. What was
   meant to force "flank-or-suffer routing" degrades to "a few cells cost
   −1 to live near," with zero effect on where contact actually happens.

5. **The default deck — used in 100% of vs-Bot games on both sides — ships
   none of the tension-creating keywords.** (`data/tiles.js` `count` fields;
   bot's deck always falls back to `defaultDeckComposition()` in `main.js`.)
   FLANK's threshold gate, MENACE's 2-attacker requirement, WING's halved
   incoming damage, SUSTAIN/TRAMPLE's capture payoffs — all exist in
   `core/mechanics.js`, none exist in an actual game unless a human manually
   deckbuilds them in, and even then the bot never reciprocates.

## 3. Proposed fixes

Each: rule change → tension created → degenerate line to sim-check.

**A. Ship the wave-1 keywords + rites in the default deck; make the bot
deckbuild-aware.** Swap 4–6 vanilla commons for FANGWOLF / DREADMAW /
GALEHARRIER / LEECHSPRITE + one rite; have `botBtn` roll a curated
wave-1-inclusive deck instead of always falling back to
`defaultDeckComposition()`.
→ *Tension*: MENACE's 2-attacker gate is a coordination requirement (a
fork prerequisite that currently has nothing to unlock); WING gives a real
defensive shape tool; FLANK creates local execution zones.
→ *Degenerate risk*: low engine-side (ARENA_PLAN already cleared these
keywords at 48.9–57.3% on the sim pool) but that clearance was on a
different, larger card pool — re-sweep on the actual 20-card composition
before shipping.

**B. Adjacency-gate captures.** Require the capturing tile to land adjacent
to the target (or require an existing friendly tile adjacent to the target
to "mark" it capturable this turn).
→ *Tension*: restores real territory and routing — you have to walk to the
fight, which makes the rift matter and makes forward expansion genuinely
risky/rewarded instead of moot.
→ *Degenerate risk*: turtling gets *worse* — an unexposed fortress with no
bordering enemy becomes unreachable. Needs pairing with a forced-contact
mechanic (E) or a hard turn-count pressure valve. Sim-check stall rate and
avg turns.

**C. Split threat from vulnerability into two stats.** A tile's own
survivability stays the current neighbor-sum; its *contribution* to an
enemy's capturability becomes a separate, possibly rarer stat (glass-cannon
vs. tank archetypes, Hive queen/beetle-style asymmetry).
→ *Tension*: the highest-leverage single change for enabling real forks — a
tile can threaten two targets while a separate stat keeps it locally safe.
→ *Degenerate risk*: could produce a dominant "pure attack stat, zero
defense investment" archetype; needs a hard cap or diminishing curve, sim
aggressively before shipping.

**D. Make ascension contestable — a "cut."** An enemy tile adjacent to a
stack should reduce its effective tier bonus, or an ascend that would leave
the stack immediately capturable should be illegal (Go-suicide-rule
analog), so towers built inside contested ground carry real risk that towers
built safely in the rear don't.
→ *Tension*: makes *where* you build a tower matter, not just *that* you
build one — currently every tower migrates to the safest possible cell.
→ *Degenerate risk*: too harsh a penalty reverts to pure-expand meta with
zero ascension; tune against ascend-rate-per-game in sim.

**E. Contested scoring zones (Go corner→side→center echo).** Mark a small
number of high-value cells (the rift hexes themselves, or 3–5 "shrine" hexes
near the seam) that grant a fixed influence bonus at game-end if held, or a
local buff while occupied.
→ *Tension*: gives players a reason to fight over specific ground *early*,
directly fixing the "nothing to invade for the first third of the game"
problem instead of waiting for armies to wander into range.
→ *Degenerate risk*: could become the only viable line (all-in shrine
rush, ignore the rest of the board) — cap the bonus relative to typical
game-end influence totals (~100–150 in the sim above) and sim for rush lines.

**F. Rift as a fightable prize, not a wall.** First actually fix the
impassability bug (§0) so ordinary tiles cannot walk across rift hexes; then
let a tile that legitimately claims a rift hex convert its aura — own the
seam, curse the opponent's tiles within N hexes instead of just draining
both sides equally.
→ *Tension*: turns the board's one geographic feature into the actual
center of gravity, echoing Go's center becoming valuable once the edges
settle — gives the mid-game an object worth walking toward.
→ *Degenerate risk*: could make ATTUNED/SCOUT rares mandatory
auto-includes; require the claim to be earned by adjacency-reached ordinary
placement (post-B), not gated behind rarity, so it's a positional skill test
rather than a collection tax.

**G. Sente via a declared-threat window.** A placement that would drop an
enemy tile to ≤ threshold marks it "in revolt" (the tooltip already calls it
this narratively) for one full round instead of resolving instantly; the
capture only completes if the defender fails to reinforce by their next
turn.
→ *Tension*: converts every threat into real Go-atari-style sente — answer
this turn (gote, but you keep the tile) or lose it next turn (real material
cost for ignoring) — the tempo differential that's currently completely
flat.
→ *Degenerate risk*: enables fake-out spam (cheap pokes that bait a
reinforcement, wasting opponent tempo for free) — gate triggerable warnings
behind a minimum target influence value so 0-value pokes can't cheese it.

## 4. Verdict on the "Threshold slate" (PROPOSED, `GAME_DESIGN.md` §Design round), placement-depth only

**RIFTBORN** (keyword — immune to rift drain, +1 on/adjacent to rift).
Functionally identical to the already-shipped ATTUNED keyword (the doc
itself says it "formalizes the rift-attuned chase category above" —
ATTUNED already does exactly this: "+1 influence per adjacent rift hex
instead of −1," `data/tiles.js:11`). It's a numeral swap on a subset of
cards, no new decision axis, no interaction with sente/shape/fork/reach.
**Verdict: neutral-to-negative — card-pool bloat, not depth. Fold it into
ATTUNED, or repurpose it as "the only keyword allowed to *claim* a rift
hex" once fix F ships**, which would at least give it a placement-legality
role instead of a pure number.

**THE RIFT STIRS** (world event — periodic −1 pulse near the rift,
telegraphed). The most interesting of the four, because it's the only
mechanic in the entire proposal set that introduces *time* as a planning
axis — nothing else in Limen currently rewards or punishes *when* you place,
only *where*. But as specified it only touches a region of the board that,
per finding #4, almost nobody voluntarily occupies today (rift proximity is
currently pure downside for non-ATTUNED tiles, so formations avoid it). A
periodic pulse over empty ground doesn't break any turtle. **Verdict: good
seed, wrong target — ship after F (rift-as-prize), not before**, so the
"boss moment" actually has an audience standing near it.

**DOMINION** (tier-3 tower projects −1 to enemy neighbors, unaffected
itself). This directly compounds structural cause #1 (ascension already
risk-free and dominant) and cause #2 (attack already outreaches defense): it
makes *finishing* the already-strictly-dominant strategy also grant a free
area-denial aura with zero added risk. It doesn't create a decision, it
raises the payoff of the decision players were already defaulting to,
making "always ascend when nothing better presents" even more strictly
correct and further discouraging anyone from ever placing near an enemy
tower (already close to suicidal per cause #3). The design doc's own
sweep-risk note ("if towers turn oppressive, DOMINION replaces the tier-3
bonus instead of adding") shows this exact worry was already flagged.
**Verdict: reject as specified, or gate it to only fire when the tower cell
is adjacent to the rift** — tie the payoff to fighting over contested ground
(F) rather than rewarding safe-rear ascension anywhere on the board.

**REMEMBRANCE** (echo reclaim — your unwritten tile leaves a ghost;
resettling it consumes the echo for +1 permanent). The most philosophically
aligned of the four with real placement depth: it gives a *specific cell* a
value beyond its raw influence number — recapturing lost ground beats
placing fresh, which is a genuine echo of Go's *aji* (latent potential in
previously-fought ground) and directly answers "why would I ever go back to
contested ground" with "because I have unfinished business there." But it's
only safe to ship *after* fix B (adjacency-gated capture): today's
capture-from-anywhere already produced a 15-turn ping-pong recapture war on
a single cluster with no REMEMBRANCE bonus in play (`trace-1`, §1); adding a
reason to specifically return to that exact cell, while the opponent can
still un-write it from across the map the instant it's weak again, risks
amplifying the ping-pong rather than resolving it. **Verdict: ship, but only
paired with B** — otherwise it's fuel on the exact fire ruins were added to
put out.

**Placement-depth ranking: REMEMBRANCE (conditional on B) > THE RIFT STIRS
(conditional on F) > RIFTBORN (neutral, redundant with ATTUNED) > DOMINION
(net negative — entrenches the already-dominant strategy).**
