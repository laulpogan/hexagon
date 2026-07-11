# Limen — retention & session-loop design (tumble1)

Reviewer: F2P retention/liveops pass, read-only against the repo at HEAD
(`limen-design` branch, post round-6 sim/visual work). Feeds `DESIGN_ROUND_7.md`
and the night-plan gate #1 panel (workstream A: shell/meta-game research).

## Baseline — what exists today (verified against source)

- **Menu** (`index.html`): Hotseat, vs Bot, Multiplayer, Deck Builder, How to
  Play. No account entry point.
- **Deckbuilder** (`ui/deckbuilder.js`): all 24 curated card types in
  `data/tiles.js` `TILE_POOL` are buildable from turn one — nothing is locked.
  Persisted to `localStorage['limen_deck']` only.
- **Win screen** (`ui/hud.js:showWin`): title, one-line reason, a 3-row
  placed/captured/discarded table, "Play Again." Stats (`game.stats`) live
  only inside the `Game` object — nothing persists past the match.
- **No accounts.** `net/supabase.js` only has `limen_rooms` (match state,
  action-log relay). No `profiles` table, no auth.
- **No collection screen, no unlock/currency system, no pack/reveal moment.**
- Persistence today is 3 flat `localStorage` keys: `limen_deck`,
  `limen_sound`, `limen_music`. That's the whole substrate to build on.
- **Card pool math** (counted from `data/tiles.js`): 24 shipped types — 8
  common (6 tiles + 2 rites), 9 uncommon (8 tiles + 1 rite), 7 rare. Deck
  size 20 (`CONFIG.DECK_SIZE`), caps `MAX_RARE=2`, `MAX_UNCOMMON=6`,
  `COPY_CAP={common:3, uncommon:2, rare:1}`. Only 15 of the 24 have art
  (`assets/tiles/`); 9 (FANGWOLF, LEECHSPRITE, JUGGERNAUT, VEILWISP,
  GALEHARRIER, DREADMAW, SUNDER, FORESIGHT, RALLYING_CRY) ship without it.
- **`data/cards_gen.json`**: 1150 sim-validated cards (834 common / 195
  uncommon / 121 rare), loaded only by node balance tools
  (`registerCards()`), never shipped to the browser. Of the 1150, **4 have
  art**. This is raw unlock-content inventory, not shippable content — it
  needs an art pass before any card in it can headline a reveal moment.
- Matches run ~10-15 min already (`GAME_DESIGN.md`), 20-45 turns per the
  round-6 sim gate. A "15-minute session" is functionally **one match**, not
  a multi-match pack — the loop design below treats it that way.

The brief's read is accurate: this is a complete rules engine with zero
meta-game. Every retention lever below is additive on top of a working game,
not a rebuild.

---

## 1. Session loop

### The 15-minute session, open to close

```
OPEN (0:00)
  Title screen → "Daily bonus ready" badge if unclaimed (client-computed,
  no server round-trip) → one click into a match (bot/hotseat/MP unchanged)

WARM (0:00–0:30)
  Deckbuilder pre-filled with last-used deck. No forced screen — friction
  here kills the loop. First-time-only: nudge toward starter deck.

PLAY (0:30–13:00)
  Unchanged core loop. The one new in-match beat: THE RIFT STIRS boss event
  (already spec'd, GAME_DESIGN.md) becomes the session's mid-point peak —
  it's a free "something big is about to happen" moment already designed,
  just needs shipping/confirming.

REWARD (13:00–14:00)
  Win screen extends into a reward reveal: Motes earned, unlock-track bar
  ticks, card-flip if a threshold was crossed. This is the single highest-
  leverage new screen — see wow audit §4.

CLOSE (14:00–15:00)
  "Play Again" stays primary, but the reward panel plants next-session bait:
  "2 wins to RIFTWARDEN" / "Daily bonus resets in Nh" / collection meter
  delta ("19/24 → 20/24"). The player leaves with a known, small, specific
  reason to come back — that's the whole mechanism.
```

No forced dailies, no timers that punish absence, no login streak that
resets to zero and shames the player — solo-dev static-site retention has to
survive irregular play patterns (a browser CCG's honest usage curve, not a
mobile-app-with-push-notifications curve).

### Minimum-viable hook set, ranked by retention impact / build effort

| # | Hook | Impact | Effort | Why (and what it steals) |
|---|---|---|---|---|
| 1 | **Post-match reward panel** (Motes + progress bar + occasional card reveal on the existing win screen) | High | **S** | Extends `hud.js showWin()` in place — no new screen, no new route. Every match already ends here; this is pure upside on an existing beat. Snap's "the match result screen is also the progression screen" pattern. |
| 2 | **Win-based unlock ladder** (Nth win unlocks card N — deterministic array, no currency abstraction) | High | **S** | One JSON array + one localStorage counter. No shop UI, no RNG to design around. Cheapest possible "why do I keep playing" answer. |
| 3 | **Daily first-win bonus** (first win each calendar day grants bonus Motes/an extra pack-tick) | High | **S** | Hearthstone's oldest, cheapest lever — pure client-side date check against a `lastBonusDate` localStorage key. No server needed. Biggest lever for *daily* return rate specifically (vs. lifetime engagement, which the ladder covers). |
| 4 | **Collection screen with completion meter** ("20/24 Verdant/Umbral" + gen-pool "Season 1" teaser) | Med-High | **S-M** | Reuses the deckbuilder's `.db-grid` card component read-only, greyed-out for locked entries. Gives the chase a visible destination — without this screen the unlock ladder has no home to check progress in. |
| 5 | **Card-flip reveal animation** on unlock (CSS transform, rarity-colored particle burst reusing `RARITY_COLOR`) | Med | **S** | The "wow" that makes #1/#2 land emotionally instead of as a stat line. Pure CSS/DOM, no new render pipeline. |
| 6 | **Post-match streak counter** (consecutive wins, shown small on the reward panel, no punishment for breaking it) | Med | S | Runeterra-style soft streak — cheap dopamine, cheap to build, skip if scope-constrained. |
| 7 | **Pack-opening as its own screen** (multi-card, shuffle, tap-to-reveal ceremony) | Med | **M** | Worth it once the ladder is proven and there's enough art-backed content to make 3-5-card packs feel different from single-card reveals. Don't build this before #1/#2 exist — the reveal *content* matters more than the reveal *ceremony*. |
| 8 | **Accounts (Supabase magic-link + guest)** | Med (mostly unlocks cross-device persistence, not engagement per se) | **M** | Needed so the collection survives a cleared cache / new device, and so multiplayer opponents can eventually see meta stats. Ship guest mode (localStorage) as the real v1 substrate; treat account creation as *sync*, not a gate — never block play behind sign-up. |
| 9 | **Ladder/rank/ELO** | Low (for a solo-dev static site, this needs a live population + matchmaking backend to mean anything) | **H** | Defer. No backend, no matchmaking service exists; building a fake rank number with no opponent pool to justify it is worse than no rank at all. |
| 10 | **Weekly quest board** | Low-Med | M | Steal from Runeterra's weekly vault later — needs a week-boundary concept and quest-generation logic neither of which exist. Not v1. |

**Read:** rows 1-5 are all cheap (localStorage + CSS, no new backend, no new
render pipeline) and together *are* the addictive hook. Rows 6-8 are the
next wave once 1-5 are live and proven in analytics-free vibes-based
playtesting. Rows 9-10 need infrastructure this project doesn't have and
shouldn't build speculatively.

---

## 2. Screen map

### Screens/modals and their load-bearing elements

| Screen | Status | Load-bearing elements (2-3) | v1 tier |
|---|---|---|---|
| **Title/Menu** | exists (`index.html #menu`) | Play buttons; **daily-bonus badge** (new, small); collection/unlock entry point (new button) | **v1-critical** (badge is the only addition) |
| **Account** | missing | Guest-mode default (silent, localStorage); optional magic-link "save my collection" CTA, never a gate | **v1-critical**, but as a *non-blocking* modal, not a forced first screen |
| **Collection** | missing | Grid of all 24 base types, greyed-out locked ones, X/24 meter; gen-pool "Season 1" locked-teaser row | **v1-critical** |
| **Pack/Unlock reveal** | missing | Card-flip animation, rarity-colored burst, "added to collection" confirm | **v1-critical** (single-card version — see §4); multi-card pack ceremony is **deferrable** |
| **Deckbuilder** | exists (`ui/deckbuilder.js`), needs gating | Grid filtered to *unlocked* cards only; tier caps/copy caps (already built); save/cancel (already built) | **v1-critical** to extend (gate the existing grid) |
| **Post-match rewards** | missing, extends win screen | Motes-earned counter, unlock-progress bar, "Play Again" as primary CTA | **v1-critical** |
| **Settings** | exists but scattered (sound/music buttons in HUD controls) | Consolidate sound/music toggle + "reset collection" (debug) into one modal | **deferrable** — current inline buttons work; only worth a real screen once account/sync settings exist |
| **How to Play** | exists (`#helpOverlay`) | unchanged | already shipped |

### Navigation graph

```
                         ┌────────────────────┐
                         │   Title / Menu      │◄──────────────────────┐
                         │ [daily-bonus badge] │                       │
                         └─────────┬────────────┘                      │
        ┌───────────┬──────────────┼──────────────┬───────────────┐   │
        ▼           ▼              ▼              ▼               ▼   │
   Hotseat      vs Bot      Multiplayer      Deck Builder     Collection│
     │             │           (room code)    (gated grid)    (X/24)   │
     │             │                │              │               │  │
     └─────┬───────┴────────────────┘              │               │  │
           ▼                                        │               │  │
      ── Match (unchanged core loop) ──              │               │  │
           │                                         │               │  │
           ▼                                         │               │  │
   Win screen → Reward panel (Motes, bar) ────────────┘               │
           │                                                          │
           ├─ threshold crossed → Pack/Unlock reveal (card flip) ─────┘
           │
           └─ "Play Again" ───────────────────────────► back to Match
```

Account modal is reachable from Title (optional) and from Collection/Reward
panel ("sign in to keep this collection on another device") — never
interposed between menu and play. Settings reachable from in-match HUD
(unchanged) and Title.

---

## 3. Unlock economy

### Design call: ladder, not shop — deterministic by construction

Two structures were on the table. **Recommendation: build the win-count
unlock ladder (below) for v1**; a currency+shop layer is a v2 add-on once
there's enough art-backed content to make choosing between packs meaningful.
Reasoning:

- A currency (Motes) plus a shop needs a pricing model, a "what do I spend
  it on" decision surface, and edge cases (can't afford anything, wasted
  currency). A ladder needs one array and one counter.
- Both can share the same reveal ceremony (§4) — the ladder just skips the
  "what's next" choice, which for a 24-card base pool the player will fully
  own within weeks anyway isn't a real choice.
- It's trivially "deterministic-friendly, no server-side loot logic," as
  required: unlock order is a **precomputed array**, not a runtime RNG call.
  A pack-opening *presentation* still works — you flip a card that was
  already decided the moment the account (or localStorage collection) was
  created — but nothing is actually random at grant time, so there's no
  save-scumming surface and no fairness dispute to adjudicate.

### Currency: "Motes"

Free thematically — `GAME_DESIGN.md` already defines the rift as "leaking
raw unreality (the motes)." No invented lore, no new naming exercise.

- **1 win = 1 Mote.** Loss = 0. (No loss-Motes — keeps the loop honest:
  losing shouldn't feel like progress, winning should.)
- **Daily first win = +2 bonus Motes** (hook #3 above) — the only bonus
  multiplier, so the "why today" answer stays legible.
- Store as `{ motes: number, unlockedTypes: string[], lastBonusDate: string }`
  in `localStorage['limen_collection']` (same pattern as `limen_deck`),
  promoted to a Supabase `profiles` row keyed by auth user id once accounts
  land — sync-on-login, still no server authority needed. Same accepted-risk
  class as the existing "hidden hand derivable via devtools" note in
  `GAME_DESIGN.md`: a player editing localStorage only unlocks cosmetically
  more deckbuilding options for themselves in a casual, non-ranked, no-money
  game — not worth building server validation against.

### Cadence

- **Starter set (0 Motes, day one):** all 8 common types unlocked by
  default — a new player needs a legal, playable 20-card deck immediately;
  gating commons would make the first session unplayable, which kills the
  hook before it starts.
- **Remaining 16 types** (9 uncommon incl. 1 rite, 7 rare): unlock cost
  scales by rarity — **uncommon = 3 Motes, rare = 5 Motes**. Order is a
  fixed, pre-shuffled array (seeded once) that interleaves rarities so a
  rare shows up roughly every 4th-5th unlock, not all at the end — avoids
  the "grind 40 wins before anything exciting happens" failure mode.
- Total to fully own the base pool: `9×3 + 7×5 = 62` Motes ≈ **62 wins**
  (minus daily-bonus acceleration, realistically **45-55 wins** for a player
  who plays most days). At ~10-15 min/match that's several weeks of casual
  play to "complete" the base set — long enough to matter, short enough
  that a semi-casual player sees the finish line.
- **After full base-pool completion:** the ladder rolls into the gen-pool
  ("Season 1: Rift Expedition" track, §below) rather than stopping — the
  meter never reads "nothing left to earn."

### The 1150-card gen pool: don't unlock what has no art

`data/cards_gen.json` is sim-validated (win-rate/CI/flag data exists in
`data/meta_report.json` — `topCards`/`bottomCards` already rank it by
balance signal) but 1146 of 1150 entries have no illustration. Granting a
card with no art breaks the reveal moment (§4) — there's nothing to flip
over. Two structural options, pick one deliberately rather than shipping
1150 grey rectangles:

- **A — curated Season batches (recommended):** use `meta_report.json`
  `topCards`/non-`OVER`-flagged entries to hand-pick ~30-50 cards per
  season, run the already-decided art pipeline (`gpt-image-2` concept art →
  TRELLIS.2-4B 3D, per `GAME_DESIGN.md`'s asset pipeline section — no new
  tooling decision needed) on just that batch, and extend the win-ladder
  into a "Season 1" track once base-pool completion is reached. Keeps
  content generation bounded and each new card provably balanced.
- **B — full-pool auto-generation:** batch every 1150 through the art
  pipeline. Rejected for v1: unbounded cost/time for a solo dev, and most
  of those 1150 cards exist as balance-sim fodder, not curated design (the
  brief itself flags "most have no art" as the blocker, not an oversight).

### Keeping rares exciting without power creep

- Rarity distribution is already thin at the top (7 rares vs 8 common / 9
  uncommon) and `MAX_RARE=2` in the deckbuilder means owning a *favorite*
  rare or two, not all seven, is the real short-term chase — frame the
  collection screen around "which 2 rares define your deck," not raw
  completion percentage.
- Because power is tier-capped rather than resource-costed (`GAME_DESIGN.md`
  "pacing valve"), a rare has to earn excitement through build-around
  identity (ATTUNED+SCOUT, TRAMPLE, MENACE) rather than raw stat
  superiority — keep the existing sim-balance discipline (48.9-57.3% win
  band, no degenerate/dead keywords) so unlocking a rare never reads as
  "now I win more," only "now I can build differently." That protects
  against pay-to-win optics even with no real money anywhere in this loop.

---

## 4. Wow audit — where the dopamine moments live vs. where they should

| Moment | Currently | Cheapest version to ship |
|---|---|---|
| **Win screen / post-match** | Flat stat table, "Play Again." **Biggest missed opportunity in the whole loop** — every match ends here and nothing pays it off. | Extend `hud.js showWin()` in place: Motes-earned counter (ticks up, ~0.5s), unlock-progress bar with the delta highlighted, "Play Again" restyled as the primary CTA with reward context baked into its label ("2 wins to RIFTWARDEN"). No new screen, no new route — a DOM addition to a template that already exists. |
| **Card unlock reveal** | Doesn't exist. | Single-card flip: a card-back div rotates on `transform: rotateY`, reveals the `.card` component that already renders in the hand/deckbuilder (reuse `RARITY_COLOR`, reuse the art path convention), particle burst is a CSS radial-gradient pulse, not a Three.js effect. ~150 lines, no new dependency. |
| **Collection screen** | Doesn't exist. | Read-only clone of `ui/deckbuilder.js`'s `.db-grid` render — same card component, greyed via CSS filter for `!unlockedTypes.includes(type)`, header shows "X/24." Almost zero new component work; it's the deckbuilder grid with `add()`/`remove()` stripped. |
| **THE RIFT STIRS** (every 6th turn world event) | Spec'd in `GAME_DESIGN.md` design round with a full animation description (seam eruption, magenta shockwave, camera rumble, doubled mote storm) — not confirmed shipped as of this read. | Already the right mid-match peak — it's a scheduled, telegraphed "something big is coming" beat that needs no new design, only confirming/finishing the implementation against the existing spec. This *is* the session's built-in tension spike; don't invent a second one. |
| **Ascension apotheosis** (tier-3 tower completion, DOMINION) | Also spec'd with an animation description (vertical pillar + realm-tint bleed) — same status, verify-and-finish rather than design-from-scratch. | Same note as above — the design work is done, this is an implementation-completeness check, not a new ask. |
| **Capture** | Has a sound cue (`sound.capture()`) and landing-mote-burst visual juice per the git history (round 4/6 visual passes). No "cascade" exists mechanically — Limen captures are one-tile-per-placement, not chain reactions, so a Hearthstone/Snap-style board-wide cascade doesn't fit this ruleset. Don't force one in. | Leave as-is; the existing single-capture juice is proportionate to what the rule actually does. |
| **Pack opening (multi-card)** | Doesn't exist. | **Defer.** Worth building only once there's a Season-1 art-backed batch (see §3) large enough that a 3-5-card pack reads as different from a single-card ladder reveal. Building pack ceremony before there's varied content to reveal is spending effort on presentation with nothing to present. |

**Net:** the two cheapest, highest-impact wow moments — the win-screen
reward panel and the single-card flip reveal — are pure UI additions on top
of components (`hud.js`, the `.card` CSS class, `RARITY_COLOR`) that already
exist. The two "boss moment" mechanics (RIFT STIRS, DOMINION apotheosis)
are already designed on paper; the audit's finding there is "confirm it
shipped," not "design something new." The only genuinely deferrable wow
moment is the multi-card pack ceremony, and only because its raw material
(art-backed gen-pool cards) doesn't exist yet.
