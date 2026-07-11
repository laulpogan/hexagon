# Limen Roguelite Campaign — "Descent" Design Spec

**Status:** design-complete, unbuilt. Deterministic-first, ruleset-agnostic. Every engine touchpoint below exists in the repo today (verified against `main.js`, `core/config.js`, `net/progress.js`, `core/game.js`, `core/agents/`).

**One-line concept:** A roguelite meta-layer that wraps Limen's existing seeded bot duel as the "combat" node of a branching Slay-the-Spire-style Descent — no fork of `game.js`/`mechanics.js`; all engine contact is through `startGame`, the agent interface, the `CONFIG` knob object, and the public `Game` API.

---

## 1. Concept & narrative framing

A run is a **Descent** through the rift toward the Meeting of Worlds. Each act is a realm the rift bleeds into — **Verdant Marches → Umbral Reach → Sundered Capital** — and each act ends at a boss who is that realm's warden. Losing a run is being pushed back to the surface: you keep what the rift taught you (Motes, unlocks), lose the run itself.

This maps onto Limen's existing music themes (`ui/music.js` already plays `'verdant'`/`'umbral'`/`'menu'`), so realm theming is a reskin of assets that exist, not new infrastructure.

The three-layer loop this genre always decomposes into:

```
Run (meta, persists) → Node graph (map, per-run) → Match (Limen duel, per-node)
```

Limen already owns the match layer (deterministic seeded duel). This spec adds the two layers above it.

---

## 2. Run loop & deterministic seeded map

### Node types (7)

All are thin wrappers over the same match engine or a between-match screen:

| Node | Fight? | Payload |
|---|---|---|
| **Skirmish** | yes (greedy) | win → pick 1-of-3 common relics OR skip for +3 shards |
| **Warden** (elite) | yes (harder agent + 1 modifier) | win → guaranteed pick 1-of-3 rare relics |
| **Boss** | yes (search agent + rule-warp) | win → pick 1-of-2 boss relics, each with a cost |
| **Rift-Cache** (draft) | no | add 1-of-3 card types to the run deck, or skip (keeps deck lean) |
| **Attunement** (rest) | no | remove a run-deck card, OR upgrade a relic, OR heal 1 life |
| **Bargain** (shop) | no | spend Shards on relics / card-removal / reroll |
| **Rupture** (event) | no | deterministic narrative gamble (relic-for-cost, lives-for-shards) |

Player sees **every node's type before committing** — the map is a strategy layer (route your risk exposure), not a progress bar.

### Lives — graceful degradation

A run carries **3 lives**. Losing a duel costs one life, banks partial Motes, and continues the run — it does not end it. Zero lives ends the Descent, but the run still banks Motes plus a **Scar** (§6). This is the explicit fix for Wildfrost's binary-loss "unfair" failure mode, and it keeps sessions in the 20–40 min band.

### Generation algorithm (fully deterministic)

Everything derives from one **run seed** (a string, same shape as `startGame`'s `seed`). Uses Limen's existing `mulberry32`/`hashSeed` (`core/rng.js`) — **no `Math.random`, no `Date.now` anywhere**, matching the guarantee the engine core already holds (`Game.clone()` is deliberately RNG-free).

```
mapRng = mulberry32(hashSeed(runSeed + '-map'))
for each act in [1,2,3]:
  columns = 5 or 6 (weighted draw from mapRng)
  for each column:
    nodeCount = 1..3 (weighted)
    for each node: type = weightedDraw(mapRng, TYPE_WEIGHTS[act])
    edges: each node gets 1-2 forward edges into the next column (DAG)
  last column of act = single Boss sink
generate up front, all at once: Bargain inventories, Rupture outcomes,
and each opponent's deck composition (a validated {TYPE: count} object).
```

Per-node **match seed** derives as `` `${runSeed}-a${act}-n${nodeIndex}` `` and is passed straight into `startGame({seed})`, which already drives board rift layout (`createBoard(rand)`, game.js) and deck shuffle (`_buildDeck`) deterministically. **A run seed therefore reproduces the entire Descent** — map shape, rewards, opponent decks, board layouts — making runs shareable and replayable, and daily-seed runs close to free.

Opponent comps are generated to satisfy `CONFIG.DECK_SIZE (20) / MAX_RARE (2) / COPY_CAP {common:3,uncommon:2,rare:1}` so `validateDeck()` (game.js:591) never silently rejects them and falls back to `defaultDeckComposition()` (game.js:38).

### Concrete example map (seed `"descent-alpha"`)

```
ACT 1 — VERDANT MARCHES
  c0:  [Skirmish]
  c1:  [Skirmish]────┐   [Rift-Cache]
  c2:  [Bargain]     [Warden]────┐
  c3:  [Rupture]     [Skirmish]  [Attunement]
  c4:  [Skirmish]────────┐  [Rift-Cache]
  c5:  ========== [BOSS: The Static Crown] ==========
ACT 2 — UMBRAL REACH   (agent tier steps up: makePolicy)
  ... 6 columns, +1 Warden ...
  cN:  ========== [BOSS: Gravekeeper] ==========
ACT 3 — SUNDERED CAPITAL  (makeSearch{depth:2} on all fights)
  ... 6 columns ...
  cN:  ========== [BOSS: The Hollow Mirror] ==========
```

Route choice example at Act 1 c1→c2: take the **Warden** for a guaranteed rare (spend a life-risk on a harder agent), or route to the **Bargain** and buy your build safely. That tradeoff is the whole strategy layer.

---

## 3. Relic system — hooking the match without forking core

**Design constraint:** a relic modifies a match without touching `game.js` or `mechanics.js`. Two injection mechanisms, both already supported by Limen's shape. The campaign wraps each `startGame` call: **apply-all-relics → run match → restore-all-relics.**

### Mechanism 1 — config-knob relics

`core/config.js` exports a plain **mutable** `CONFIG` object (not frozen) that every mechanic reads live: `RALLY_BONUS`, `SIEGE_BONUS`, `HIGH_CAP`, `RIFT_AURA`, `TROPHY_CAP`, `FORTIFIED_BONUS`, `CAPITAL_MIN_NEIGHBORS`, `TIER_MAX`, … (all confirmed present). A knob relic is a pair of pure functions:

```js
{ id:'ember-ledger',
  apply(cfg){ cfg._save.RALLY_BONUS = cfg.RALLY_BONUS; cfg.RALLY_BONUS += 1; },
  restore(cfg){ cfg.RALLY_BONUS = cfg._save.RALLY_BONUS; } }
```

Nothing in core changes; the relic tunes the single knob surface every mechanic already consults. Deltas from multiple relics **compose**.

### Mechanism 2 — hook relics

For effects no knob exposes, relics register into a small `relicHooks` registry the **campaign owns** (lives beside `scheduleBot` in the campaign shim, never inside `game.js`):

```
onMatchStart(game)   onTurnStart(game, player)   onPlacement(game, move)
```

A hook relic reads/writes only through the **public `Game` surface**, so it is ruleset-agnostic — it survives RULES-7 → RULES-8 untouched as long as `CONFIG` keys and `Game` method names hold. Hooks **chain**.

### The critical invariant

**Restore-on-end must never leak a mutated `CONFIG` into the next match, into hotseat, or into MP play.** Verified by the determinism gate: run a seeded relic'd match twice, diff resulting state, require byte-identical. This is the single highest-risk seam in the whole design (§10).

Start a run with 0–1 relics; a full Descent grants ~5–7. Because deltas compose and hooks chain, power compounds geometrically — the "this run clicked" moment.

### Full relic table (24 relics + notes)

**Commons (12) — small, always-on, combo seeds**

1. **Ember Ledger** (rally) — `RALLY_BONUS +1` all run.
2. **Siege-Etched Maul** (siege) — `SIEGE_BONUS +1`.
3. **Deeproot Charter** (capital) — `CAPITAL_MIN_NEIGHBORS −1`.
4. **Extra Augury** (draw, hook) — draw +1 card on turn 1 only.
5. **Low Tide Pact** (high-ground) — `HIGH_CAP +1`.
6. **Glint Tithe** (Riftlight, hook) — +1 Riftlight at match start.
7. **Warden's Habit** (fortified) — `FORTIFIED_BONUS +1`.
8. **Mendicant Coin** (economy, hook) — +2 Shards per node cleared.
9. **Thin Veil** (rift-stir) — rift stirs one turn later each match.
10. **Adjacent Minds** (adjacency) — adjacency counts one extra ring, tie-breaks only.
11. **Trophy Hoard** (capture) — `TROPHY_CAP +1`.
12. **Culled Deck** (deck) — permanently remove one card type from run deck (subtractive).

**Rares (9) — build-definers, geometric combo**

13. **Riftlight Engine** (hook) — each capture grants +1 Riftlight; Riftlight spends cost 1 less. *(combos 6, capture relics)*
14. **Avalanche Doctrine** (hook) — while you hold the board's highest tile, siege bonus doubles.
15. **Gravewind** (hook) — your buried tiles emit −1 influence to adjacent enemies.
16. **Compound Interest** (hook) — every 3rd card drawn is drawn twice (deterministic counter).
17. **Twin Capitals** (hook) — hold two capitals; each halves the other's min-neighbor need.
18. **Rally Cascade** (hook) — rally also fires on tiles adjacent to the rallied tile at half value.
19. **Fortress Bloom** (hook) — fortified tiles gain +1 influence per adjacent fortified tile (quadratic in clusters).
20. **Umbral Ledger** (hook) — capturing a tile lowers its future capture threshold by 1 this match.
21. **Seer's Draft** (hook) — see top card; once per turn bury it to draw the next. *(combos 15)*

**Boss relics (3) — build-defining, with a cost**

22. **Crown of Static** — rift stirs every turn for BOTH sides; +1 max Riftlight but −1 starting card.
23. **The Hollow Standard** — all your capture thresholds −1, but enemy captures of your tiles also −1.
24. **Tectonic Will** — raise one tile one tier/turn free; but enemy `HIGH_CAP` also +1.

**Signature synergy chains** (the Johnny "it clicks" payoff): `Riftlight Engine → Glint Tithe → Avalanche Doctrine`; `Gravewind → Whispering Vault → Seer's Draft`; `Fortress Bloom → Rally Cascade`.

---

## 4. Reward / draft flow

After every duel the campaign shows a **reward screen** (new UI, generalizes the Mote-spend "next unlock" concept from `nextUnlock()` and `Hud.showRewardStrip`). Card and relic offers are drawn deterministically from the tier-gated pool by the run RNG.

| Node | Win reward |
|---|---|
| Skirmish | pick 1-of-3 commons OR skip for +3 Shards; + Motes (existing pipeline) |
| Warden (elite) | pick 1-of-3 rares (guaranteed); +5 Shards; + Motes |
| Rift-Cache | pick 1-of-3 card types into run deck (validator-bypassed for campaign caps) |
| Bargain | commons 4 Shards / rares 9 Shards / card-removal 5 Shards / reroll 2 Shards |
| Attunement | heal 1 life OR upgrade a relic OR remove a run-deck card |
| Rupture | see §5 events |
| Boss | pick 1-of-2 boss relics (each with a cost); +10 Shards; big Mote spike |

**"Or skip" matters** — skipping keeps the deck lean, which keeps duels fast (~20 min). **Card-removal is deliberately a strong Bargain buy** (subtractive deckbuilding, underused in the genre). Chosen cards mutate the in-memory `runDeck` composition object; the next node's `startGame` passes it as `decks[1]`. Because campaign decks may exceed normal `COPY_CAP`, the run passes a **`validateDeck` bypass flag for player-side comps** — the one gate to route around.

**Loss degrades gracefully:** partial Shards + Motes still bank; never zeroed.

### Boss encounters (rule-warps, not stat blocks)

1. **The Static Crown** — permanent rift-stir aura against you; punishes slow tall builds.
2. **Warden Immovable** — all its tiles start fortified; out-siege it (rewards 2/14 builds).
3. **The Twin Below** — holds two capitals; kill one, the other empowers.
4. **Gravekeeper** — buries one of YOUR tiles each turn (Gravewind flips it to an asset).
5. **Ascendant** — starts on the map's highest tile with doubled `HIGH_CAP`.
6. **The Hollow Mirror** (capstone) — swaps to `makeSearch({depth:2+})` AND draws +1 card/turn; a genuine skill check, not inflation.

### Events / Ruptures

**Sundered Altar** (sac 1 life → random rare) · **Rift Merchant** (6 Shards → remove any relic incl. a boss-relic downside) · **Whispering Vault** (bury a card → free lower-tier echo) · **Twin Paths** (+1 rally OR +1 Riftlight/match, permanent) · **Campfire: Attune** (upgrade/heal/reroll) · **The Hungry Dark** (skip next Skirmish + full heal, but next Warden gets +1-card AI buff).

---

## 5. Difficulty & ascension

### In-run — node depth selects the opponent's agent

Limen already has an agent ladder (`core/agents/{greedy,search,policy}.js`), exercised today only by `tools/arena.js` — never by `main.js`. `scheduleBot()` (main.js:50) currently hardcodes `botTakeTurn(game, 2, botRand)`.

```
Act 1 Skirmish → makeGreedy()          (wraps today's botTakeTurn)
Act 2          → makePolicy({weights})
Act 3 + Bosses → makeSearch({depth:2})
```

**The one edit to `scheduleBot`:** accept the node's chosen agent and call `agent.takeTurn(game, 2, botRand)` instead of the hardcoded `botTakeTurn`. Additive — the agent interface (`{name, takeTurn(game, player, rand)}`) already exists and is already exercised in the arena tool. Wardens/Bosses **also** stack `CONFIG` modifiers (AI draws +1, extra rift stirs, lowered capture threshold) — the same mutation lever as relics, applied to the opponent.

### Ascension (opt-in, Hades-Heat model)

A pre-run panel toggles modifiers for bonus Mote payout: deeper agents earlier, +1 Warden/act, −1 starting life, boss rule-warp active from Act 1. Each toggle is a `CONFIG`/generation-parameter flip. Toggles **unlock permanently by spending Motes**, so the difficulty ladder is itself a Mote sink. (Hades-Heat chosen over Spire's forced-linear ladder because an AI-opponent game benefits from letting the player compose which buffs the bot gets.)

---

## 6. Meta-progression via the Mote economy

**Reuse the existing economy wholesale.** `checkGameOver()` (main.js:191) already calls `recordMatchResult` for `mode === 'bot' || mode === 'mp'` (main.js:204). **The change:** add `mode === 'campaign'` to that conditional, so campaign duel wins earn Motes against the same `PROGRESS_KEY = 'limen_progress'`, spendable in `ui/collection.js` on the same `COLLECTION_KEY = 'limen_collection'` pool the deckbuilder reads.

New Mote SKUs plug into `computeMotePrices()` (progress.js:68): unlock Ascension rungs, unlock a **Patron** (pre-run loadout), unlock new relics into the run pool. Unlocks grant **options, not power** — the calibration that keeps skill gating clears (unlock cards/paths, never flat stat buffs).

### Patrons / starting loadouts (4, Spire-character model)

1. **Verdant Warden** (defensive) — starts **Warden's Habit**; deck skews fortified/rally. Lane: Fortress Bloom → Rally Cascade.
2. **Umbral Seer** (tempo) — starts **Seer's Draft**; deck skews bury/draw. Lane: Gravewind → Whispering Vault.
3. **Riftbound Ascendant** (altitude) — starts **Glint Tithe**; deck skews Riftlight/high-ground; higher AI tier, +reward. Lane: Riftlight Engine → Avalanche → Tectonic Will.
4. **Gilded Exile** (economy) — starts **Mendicant Coin** + 10 Shards, no themed deck; buys its build in Bargains. Highest opening variance.

### Run-scoped currency: Shards ≠ Motes (hard rule)

**Shards** (in-run gold) live in the run-state object and evaporate at run end. They **must never touch `PROGRESS_KEY`/`COLLECTION_KEY`** — `computeMotePrices()`'s ladder assumes wins map 1:1 (+daily bonus) to Motes, and Shards would corrupt that. A lost run still banks Motes plus a **Scar** — a persistent minor debuff-card seeded from the failed run (Inscryption death-cards), so failure teaches and progresses.

---

## 7. Run-state model & real file touchpoints

### Run-state object

```js
{ runSeed, act, nodeIndex, mapDAG, runDeck /* {TYPE:count} */,
  relics: [id…], lives, shards, scars: [id…],
  ascension: { …flags }, patron, history: [{node, result}…] }
```

localStorage-authoritative, cloud-mirrored later if wanted. **`clone`/reset must fully clear it between runs** (restart-safety gate: run 3× in a row, no stale references).

### File touchpoints (grounded in real names)

**New files:**

- `core/campaign.js` — pure, engine-side: `mulberry32`-seeded DAG generator, opponent-comp generator, `relicHooks` registry, `applyRelics(cfg, relics)` / `restoreRelics(cfg, relics)`, run-state reducer. **No DOM.** Node-testable in isolation (this is what P0's gate hits).
- `ui/campaign.js` — node-map/run-select screen, reward/relic-choice screen, run-summary screen (distinct from `Hud.showWin`, which is one-match scoped). Closest existing precedent: the flat `#menu` button wiring (main.js ~396).
- `net/campaign.js` — persistence, modeled on `net/progress.js`'s local-first pattern: `CAMPAIGN_KEY = 'limen_campaign'`, its own `readLocal`/`writeLocal`, optional Supabase mirror via the `record_*` RPC precedent later.

**Edited files:**

- `main.js` — (a) `scheduleBot()` (line 50): accept the node's agent, call `agent.takeTurn(...)`. (b) `checkGameOver()` (line 204): add `mode === 'campaign'` to the `recordMatchResult` conditional. (c) `startGame()` (line 311): a `mode:'campaign'` path that wraps the existing `mode:'bot'` bootstrap with apply/restore-relics and passes the node's opponent comp as `decks[2]` and the run deck as `decks[1]` with the validate-bypass flag.
- `net/progress.js` — add campaign Mote SKUs to `computeMotePrices()` (Ascension rungs, Patrons, relic-pool unlocks). No change to the `PROGRESS_KEY` win→Mote accounting.
- `index.html` — mount points / script tags for `ui/campaign.js` and a "Descent" entry button beside the existing menu buttons.

**Reused unchanged:** `ui/deckbuilder.js` (pre-run deck build, already tier-cap aware), `ui/hud.js` `Hud` (per-match), `ui/collection.js` (Mote spend), `ui/account.js`/`net/auth.js`, `ui/sound.js`/`ui/music.js`, `core/game.js`/`core/mechanics.js` (**never forked**), `core/rng.js`, `core/agents/*`.

---

## 8. Phased, sim-gated build order

Each phase's gate is a sim/determinism check that must pass before the next phase — this protects the seeded core throughout. **No phase forks `game.js`/`mechanics.js`.**

### P1 — smallest playable slice (do this first)

**Scope:** seeded 3-node linear map (Skirmish → Skirmish → Skirmish, no branching) + `mode:'campaign'` path in `startGame` wrapping the existing bot duel + one card-pick reward mutating `runDeck` + the `scheduleBot` agent edit using `makeGreedy()`. Minimal `ui/campaign.js` (list the 3 nodes as buttons; reward = 3 buttons). No relics, no lives, no Shards, no Motes yet.

**Measurable gate:**
1. `node` test: same `runSeed` → identical 3-node map + identical opponent comps twice, byte-diff clean.
2. Opponent comps pass `validateDeck()`.
3. `npm start`: click through all 3 nodes to a win, pick a card after node 1, confirm node 2's `startGame` receives the mutated `runDeck` as `decks[1]`. **Zero console errors.**
4. `tools/sim.js`/`tools/arena.js` run the campaign opponent comps to completion, no exceptions.

This slice proves the entire load-bearing thesis (map gen deterministic + match bootstrap wraps cleanly + agent swap works + reward mutates the deck) with the least code.

### P2 — full map + run screens

Branching DAG (3 acts, all 7 node types), lives + graceful-loss flow, Shards + Bargain/Attunement/Rupture, run-summary screen. **Gate:** manual `npm start` Descent start-to-finish, zero console errors; restart 3× clean, no stale state.

### P3 — relic system

`relicHooks` registry + apply/restore wrapper around each match; reward screen for relics; commons + rares. **Gate:** run twice same seed **with relics** → identical state (proves restore leaks nothing into the next match / hotseat / MP); relic effects assert in `tests/*.test.js` node-style.

### P4 — Mote meta

`mode === 'campaign'` into `checkGameOver`; new `computeMotePrices()` SKUs; Scar-on-loss; Patron selection; Ascension panel. **Gate:** win/loss both record correctly against `PROGRESS_KEY`; assert Shards never write to `PROGRESS_KEY`/`COLLECTION_KEY`.

### P5 — content & polish

Realm theming (wire `music.play` per act), all 6 boss rule-warps, daily-seed board, all 24 relics + 4 Patrons. **Gate:** full `npm test` green + a scripted seeded Descent playthrough to completion.

---

## 9. Bought-skill QA checklist (run on the finished result)

Adopt the *process* from the installed skills, **not** their EventBus/GameState/Vite architecture (Limen is plain ES modules + `python3 -m http.server`; retrofitting pub/sub onto a deterministic sim core adds indirection with no payoff and risks event-timing-vs-seeded-RNG bugs — explicitly skip).

1. **`npm test`** (existing node suite) — stays green; add campaign assertions to `tests/*.test.js` in the same plain-node style, no new framework.
2. **Determinism check** — run a campaign at a fixed seed twice, diff resulting game states → byte-identical. Protects the seeded core.
3. **Self-play smoke** — `npm run sim` / `npm run arena` against new campaign content → bots complete without exceptions, behave sanely.
4. **Manual browser pass** — `npm start`, play a Descent start-to-finish, devtools console → zero errors.
5. **Restart/replay** — complete or abandon a run 3× in a row → state resets cleanly each time, no stale references (mirrors the self-play reset discipline).
6. **State-dump hook** — expose campaign run-state as JSON on `window` (a single global debug hook, *not* an EventBus); confirm it returns valid JSON at menu / mid-run / end.
7. **Optional Playwright** — one boot test + one gameplay-progression test using Limen's *own* seeded RNG injection, not a new helper.

---

## 10. Risks & open questions

**Highest risk — `CONFIG` restore leak.** Config-knob relics mutate a shared, non-frozen global. A missed `restore()` (thrown exception mid-match, early return, browser refresh mid-run) leaks a buffed knob into the next match, hotseat, or MP. **Mitigations:** wrap match execution in `try/finally` so restore always runs; snapshot the whole `CONFIG` before apply and hard-reset from the snapshot after (not per-key deltas); the P3 determinism gate (run twice, diff) is the acceptance test. *Open:* should relics deep-clone `CONFIG` for the match and hand `Game` the clone, rather than mutate the module global? Cleaner isolation, but requires `Game` to read an injected config instead of the imported singleton — a bigger change. Evaluate at P3.

**validateDeck bypass.** Campaign player decks intentionally exceed `COPY_CAP`/`MAX_RARE`. The bypass flag must gate on `mode === 'campaign'` and apply to **player-side comps only** — opponent comps must still validate (they're generated to be legal). *Open:* does any code path assume all in-play decks are validator-legal? Audit `_buildDeck` consumers before P1 ships the bypass.

**Agent determinism under `scheduleBot`.** `makeSearch` uses `Game.clone()` which is RNG-free by design; confirm the campaign passes the same `botRand` stream the current `botTakeTurn` gets, so swapping agents doesn't desync the per-node seed guarantee. *Open:* verify `makePolicy`/`makeSearch` consume `rand` identically to `botTakeTurn` (they share the interface but may draw a different number of RNG values → different board evolution). Test in P1's gate.

**Balance is unmodeled.** Relic power curves, Shard prices, agent-tier-per-act, and Ascension payouts are first-draft numbers. Limen already has `tools/meta.js`/`tools/arena.js` self-play — *open:* extend them to sim full Descents headlessly for balance sweeps before P5 content lock.

**Scar design.** "Persistent debuff-card seeded from the failed run" is narratively set but mechanically vague. *Open:* is a Scar a run-deck card injected into future runs (Inscryption-literal), or a meta-flag? Decide at P4; keep it an *option/flavor* cost, never a power-gate, to preserve the options-not-power meta rule.

**Cloud mirror deferred.** `net/campaign.js` ships localStorage-only. Cross-device runs need a Supabase table + `record_*` RPC. *Open:* is cross-device a launch requirement or post-launch? Assume post-launch; local-first is enough to ship.
