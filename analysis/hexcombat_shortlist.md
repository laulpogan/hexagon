# Limen Hex-Combat Monument — Shortlist

Source: 200 rows scouted across 22 axes (`scout-*.jsonl`), deduped to 171, ranked by `signal*0.4 + relatedness*0.4 + novelty*0.2`. Full ranked index: `hexcombat_index.jsonl`. This doc: top 35, balanced across the five `take_into` buckets (core-rules gets 9 since problems 1+2 live there; pacing 8; progression/vfx-juice/deckbuilding 6 each).

## Executive read (10 lines)

1. **Corner-turtling has a convergent fix across seven independent fronts**: Faeria (place lands toward the opponent, not defensively), Havannah/Starweb (superlinear reward for connected/contested clusters beats hoarding), Marvel Snap's Snap wager, Riftbound (score only from contested/enemy zones, never your own), Duelyst mana tiles (scarce center bonus), Clash Royale overtime elixir, Summoner Wars ("units peak the turn they're summoned"). None of these are hex-specific tricks — they're the same lever (make the center/contested ground the only place value is created) applied by wildly different genres. This is the strongest single pattern in the set and maps directly onto Limen's problem 1.
2. **Fixed, short, escalating match length is the second convergent pattern**: Marvel Snap's hard 6-turn cap with +1 mana/turn, and Clash Royale's double/triple-elixir overtime, both exist specifically so no "quiet build-up" runway exists — every turn is a visible fraction of a bounded game, which independently reinforces #1 and could also address decks-feel-thin (fewer turns, denser draws).
3. **Denial needs to be a first-class, legible move, not a side effect** — Carcassonne tempo-blocking, Arcs' Lead/Follow card economy, and Go's sente/forcing-move value model all warn that if attacking/denying only removes upside from the opponent without giving the attacker anything, players avoid the fight (Bumbling Through Dungeons names this explicitly as the anti-pattern behind turtling).
4. **Placement "feel" problem (2) has a concrete, cheap fix**: show the influence/effect radius as a live cursor overlay before commit (Islanders), not after — this is a UI change, not a rules change, and every VFX-juice source that hits problem 2 reduces to "telegraph consequence before the click."
5. **"Wow" moments cluster around three techniques**: sequential/staggered reveal of a chain reaction (Balatro's left-to-right joker pulse), a reserved, rare, unmistakable audio+reward spike for the best-case event (Dorfromantik's perfect-match chime), and a jackpot payoff that cashes in accumulated board state in one visible swing (MTG reanimator decks). Limen has no mechanic today that converts "stacked towers / captured tiles" into a single spike moment — that's the gap these three sources point at together.
6. **The deckbuilding sources contradict the "add more cards" instinct**: Marvel Snap deliberately shrank to 12-card decks to raise hit-rate; Duelyst added a filtering button (Replace) instead of deck size; Hearthstone's duplicate-protection widens the *pool* without widening the *deck*. Multiple independent sources say a 20-card deck feeling thin is usually a consistency/filtering problem, not a card-count problem.
7. **Progression is the weakest-signal bucket** (16 rows, avg relatedness lowest of any axis) — most of what scouting found here is live-service reward-cadence machinery (pity timers, weekly vaults, wildcard tracks) built for a persistent meta-game Limen doesn't have. It's usable for a session-level hook (Riot's Weekly Vault pattern, MTGA's front-loaded daily-win curve) but is the thinnest, most-borrowed-not-native bucket in the set.
8. **Named tactical vocabulary recurs as a retention/mastery lever**: Hive's strategy book names fixed board-shape patterns (Pin, Gate, Ring, Elbow) the way chess names forks — this is cheap (documentation, not code) and plugs directly into the "math exists but no feeling" problem by giving players words for what they're already doing.
9. **Hex-native precedent is thinner than expected**: only Neuroshima Hex, Hive, and Havannah are true hex-grid competitive games in the whole scout set; most of the strongest matches (Marvel Snap, Duelyst, Riftbound, Clash Royale) are non-hex games whose *turn/scoring economy* transfers, not their board geometry. Board-geometry-specific hex tricks are scarcer than turn-economy tricks.
10. **Cheapest high-leverage moves for a first pass**: (a) Faeria's "place toward the opponent" tempo rule + Riftbound's "score only from contested ground" — both S-effort rule tweaks that hit problem 1 directly; (b) Islanders' cursor-radius overlay — an S/M UI change that hits problem 2 directly; (c) Balatro's staggered chain reveal on capture cascades — an S-effort VFX change that hits problem 3.

---

## core-rules (interaction speed + placement stakes)

| Name | Take | Problem(s) | Effort |
|---|---|---|---|
| [Faeria: How to Improve](https://boards.faeria.com/t/how-to-improve-at-faeria-a-guide/438) | Place your first tiles toward the OPPONENT's base, not defensively in front of your own — denies them a free summon-and-swing turn and forces early resource spend. | 1 | S |
| [Connection Games III: Havannah and Starweb](https://drericsilverman.com/2020/03/03/connection-games-iii-havannah-and-starweb/) | Starweb's score formula rewards connected clusters superlinearly (n+(n-1)+...+1) — turtling one corner is strictly worse than contesting multiple fronts. | 1 | M |
| [Marvel Snap: The Definitive Deconstruction](https://www.deconstructoroffun.com/blog/2023/5/23/marvel-snap-the-definitive-deconstruction) | The Snap/retreat escalating-wager mechanic forces a confrontation decision every turn instead of quiet corner-building. | 1, 3 | M |
| [Bumbling Through Dungeons: King of Hill](https://bumblingthroughdungeons.com/king-of-hill-combative-board-games/) | Warning: if contesting the center is purely punitive (denies but doesn't reward the attacker), players skip the fight — contested zones need concrete attacker upside, not just denial. Explains *why* Limen's capture-at-zero alone may not be enough. | 1 | S |
| [Arcs Designer Diary 3: The Trick's the Thing](https://ledergames.com/blogs/news/arcs-designer-diary-3-the-trick-s-the-thing) | Lead/Follow action economy: whoever plays the high card seizes the lead action and dictates what's even available that round — everyone reacts every turn, killing multiplayer solitaire. | 1, 2 | M |
| [Carcassonne tempo-blocking](https://www.chessandpoker.com/carcassonne-rules-and-strategy-guide.html) | A placement whose entire value is denial (no offensive upside, purely blocks an enemy combo/completion) should be a first-class strategic option, named explicitly. | 1, 2 | M |
| [Dorfromantik: quest tiles placed ON the board](https://www.gamedeveloper.com/business/sparking-joy-through-tile-placement-in-idyllic-village-builder-i-dorfromantik-i-) | Bind objectives to a literal board hex, not a sidebar checklist — the goal IS the map, pulling the eye toward it while placing. | 2 | M |
| [On the Value of Sente](https://www.nordicgodojo.eu/post/96/on-the-value-of-sente) | Forcing-move economy: give some tiles/keywords an explicit "forcing" flag that obligates same/next-turn response; surface who holds initiative as a visible indicator. | 1, 2 | M |
| [The Four Core Pillars of Marvel Snap Strategy](https://www.hipstersofthecoast.com/2022/11/the-four-core-pillars-of-marvel-snap-strategy/) | Locations reveal progressively (turn 1 of 3 visible) — first moves become forced bets under incomplete information instead of safe corner-building. | 1 | M |

## pacing (turn/match structure)

| Name | Take | Problem(s) | Effort |
|---|---|---|---|
| [Neuroshima Hex: Battle Review](https://www.meeplemountain.com/reviews/neuroshima-hex-battle/) | Board fills silently for many turns until ONE Battle tile ends the turn and detonates every armed tile at once — violence deferred into a single player-chosen instant, not distributed. | 3 | M |
| [Duelyst mana tiles](https://duelyst.fandom.com/wiki/Mana_Tile) | Scarce, one-shot resource bonuses sit at contested center squares — magnetically pulls both players to center turn 1-2 instead of farming their own corner. | 1 | S |
| [Marvel Snap match structure](https://blakeir.com/heres-why-marvel-snaps-game-design-is-so-ingenious) | Hard 6-turn cap with escalating per-turn energy — every turn is 1/6th of the game, no "build for 10 turns" runway exists. | 1, 4 | M |
| [Riftbound TCG scoring](https://riftwatcher.com/rules/scoring/) | Score points ONLY from contested/enemy-adjacent territory (conquer + hold), never from your own uncontested corner — turtling scores zero. | 1 | M |
| [Clash Royale: Double Elixir & Overtime](https://clashdecks.com/guides/advanced/overtime-sudden-death-strategy) | Resource regen doubles then triples in the match's final third — over 40% of matches decide in this compressed window because saved-up aggression suddenly becomes affordable. | 1 | S |
| [Duelyst General mechanic](https://duelyst.fandom.com/wiki/Getting_Started) | A single always-vulnerable win-condition unit starts ON the board turn 1 — every summon near it is simultaneously offense and defense, so aggression is never wasted tempo. | 1 | M |
| [Summoner Wars 2E Beginner's Guide](https://sw-zone.com/articles/6) | Explicit design principle: fresh units have their biggest impact the turn they're summoned — holding cards is a trap, not a strategy; gates adjacent to enemy units can't be summoned to, making static resources contestable. | 1 | S |
| [Marvel Snap designer interview (Hagman)](https://www.gameshub.com/news/features/marvel-snap-designer-interview-kent-erik-hagman-smart-card-game-design-31692/) | Match length is a hard structural constant (6 turns, +1 mana/turn, 4 slots/lane) — every placement is legible against a known countdown, not an open-ended race. | 1, 2 | M |

## progression (hook / meta-loop)

| Name | Take | Problem(s) | Effort |
|---|---|---|---|
| [LoR Weekly Vault](https://support.riotgames.com/legends-of-runeterra/gameplay/weekly-vaults) | One chest/week whose tier scales with a visible weekly-XP meter that only goes up — the open-the-chest moment is a deliberate variable-reward hook decoupled from spend. | 3 | M |
| [LoR Region Reward Roads](https://support.riotgames.com/en-us/legends-of-runeterra/gameplay/region-reward-roads) | Persistent, never-resetting per-archetype progress bar filled only by playing that archetype — guarantees (not RNG-gates) the next unlock for what you're already committed to. | 3, 4 | M |
| [MTG Arena Wildcard tracks](https://mtgarena.pro/guides/mtg-arena-wildcards-guide/) | Dual guaranteed-progress tracks (per rarity) that convert to a player-chosen specific card craft at a fixed threshold — removes bad-luck streaks without removing pack-opening's pull. | 3, 4 | M |
| [Pity timers explained](https://gameanatomy.blog/2025/05/03/pity-timers-in-games-explained/) | Soft/hard pity: probability of the big reward rises the longer you go without one, hitting 100% at a cap — bounds worst-case variance without killing randomness's excitement. | 3 | S |
| [MTG Arena Daily Wins curve](https://mtgazone.com/daily-wins/) | Steeply front-loaded per-session reward curve (win 1 worth 2.5x wins 2-4) — strong "get my first win in" hook plus a soft stop signal after ~4 wins. | 3 | S |
| [Hearthstone legendary pity timer](https://www.gosunoob.com/guides/hearthstone-pity-timer-legendary-drop-rate/) | Rolling pity counter, per-set not global, guarantees the big-card "wow" moment on a bounded schedule instead of leaving it to raw variance. | 3 | S |

## vfx-juice (placement feel + spike moments)

| Name | Take | Problem(s) | Effort |
|---|---|---|---|
| [ISLANDERS radius preview sphere](https://en.wikipedia.org/wiki/Islanders_(video_game)) | Translucent sphere shows exactly which tiles are within scoring/effect range BEFORE you commit the placement, live on the cursor — attacks "math exists but no feeling" directly. | 2 | M |
| [Balatro joker chain feedback](https://blakecrosley.com/guides/design/balatro) | Effects trigger left-to-right in a visual pulse sequence, running total updates after each individual trigger (~300ms/step) — causality is watched, not read from a log. | 2, 3 | S |
| [Dorfromantik Perfect Placement chime](https://gamerant.com/dorfromantik-perfect-placement-tile-how-to-get/) | A single sharp, distinct sound reserved ONLY for the rarest best-case placement, contrasted against calm ambient audio, paired with a tangible bonus (extra tile), not just points. | 3 | S |
| [God-Pharaoh's Gift jackpot pattern](https://mtgrocks.com/god-pharaohs-gift-modern/) | Cheap enabler cards feed a setup that a single payoff piece cashes in for a visibly enormous swing — design 1-2 rite/tiles that convert accumulated board state (stacked towers, captures) into one explosive turn-ending effect. | 3 | L |
| [Dorfromantik retroactive double-scoring](https://steamcommunity.com/sharedfiles/filedetails/?id=2440566562) | A placement that completes a previously-imperfect neighbor re-checks and rewards that neighbor too — creates a cascade/chain-reaction feeling from one placement. | 2, 3 | M |
| [Forbidden Island/Jungle design diary (Leacock)](https://www.leacock.com/blog/2023/8/10/forbidden-jungle-design-diary) | Hazard state must be legible to a passive observer, not just tracked numbers — exaggerate hazard visuals (the rift) beyond what's mechanically needed so danger reads instantly. | 2 | S |

## deckbuilding (deck thinness + card economy)

| Name | Take | Problem(s) | Effort |
|---|---|---|---|
| [Play Hive Like a Champion TOC](https://sites.google.com/site/playhivelikeachampion/home/table-of-contents) | Named, teachable tactical patterns with fixed board shapes (Pin, Gate, Ring, Elbow) — deliberately builds player pattern-recognition vocabulary, chess-fork style. | 2 | S |
| [Ben Brode on Marvel Snap's speed bet](https://venturebeat.com/pc-gaming/ben-brode-bets-super-speed-will-make-marvel-snap-stand-out/) | 12-card decks (not 40+) chosen specifically to cut decision paralysis — smaller decks with denser draws beat larger decks with thin draws for "every card matters" feel. Directly contradicts the instinct to just add more cards to Limen's ~20-card deck. | 4 | S |
| [Geometric Elegance: Neuroshima Hex Now and Forever](https://therewillbe.games/articles-beyond-reviews/7533-geometric-elegance-neuroshima-hex-now-and-forever-part-i) | Each faction gets only 4-6 Battle tokens across its whole ~20-tile deck — a scarce, deck-defining resource players must ration; faction identity comes from initiative-value distribution, not just stat totals. | 4 | M |
| [Duelyst "Replace" mulligan-any-turn](https://forums.duelyst.com/t/fan-card-design-hub-submissions-updated-10-31/2746?page=5) | Once-per-turn discard-and-redraw button lets a player filter a bad hand without adding raw card advantage — a small deck feels much less thin if it can be actively filtered, not just drawn from. | 4 | S |
| [Hearthstone duplicate protection](https://blizzardwatch.com/2020/03/23/hearthstones-duplicate-protection-new-player-experience-completely-change-game/) | Packs contain zero duplicates of any rarity until every card of that rarity is owned — every reward strictly widens the collection instead of bloating fodder. | 4 | S |
| [TFT targeting mechanics roundup](https://www.tacter.com/tft/guides/positioning-guide-set-13-cf0cae49) | Varied per-unit targeting rules (nearest/farthest/lowest-in-radius) turn positioning into rock-paper-scissors instead of one dominant strategy — give 1-2 more keywords an explicit targeting rule, not just a stat modifier. | 2 | M |

---

## Coverage

- **Rows in**: 200, across 22 `scout-*.jsonl` files (row counts 8-12 each).
- **Malformed lines**: 0 — every line in every file parsed as valid JSON.
- **Dupes removed**: 29 total (19 collapsed by canonical URL — e.g. the TFT Ninja positioning guide, Kingdomino's Cathala interview, and the Marvel Snap Deconstructor teardown were each scouted 2-4x from different axes; 10 more collapsed by canonical name after URL-dedup, e.g. two differently-worded "Hearthstone duplicate protection" entries). 200 → 172 (URL) → 171 (name).
- **take_into distribution post-dedup**: core-rules 78, pacing 33, vfx-juice 22, deckbuilding 22, progression 16. All five buckets clear a 5-row floor by a wide margin — no bucket is structurally empty.
- **Under-covered axes** (naming them honestly for the gate panel):
  - **runeterra-economy** is the weakest scout axis by relevance: avg relatedness 4.1 (next-lowest is 5.7), avg rank 4.63 vs. a 6.6 median across all axes. Its rows are mostly live-service reward-cadence machinery (pity timers, vault tiers, wildcard tracks) built for a persistent meta-game Limen doesn't have — usable at the margins (session-hook framing) but the thinnest, most-borrowed-not-native content in the set. If the gate panel wants a stronger "progression/hook" answer, this axis is the one to re-run with a narrower brief (e.g. "session-length hooks in non-live-service 1v1 games" instead of general CCG economy).
  - **carcassonne-kingdomino, slay-polytopia, dorfromantik-islanders** each sit at exactly 5 rows post-dedup — the floor, not below it, and quality is fine (dorfromantik in particular scored the single highest-signal row in the whole set), but there's no headroom left in these axes if a reviewer wants a second opinion from the same source family.
  - **Hex-grid-native precedent is thin everywhere**: of the 22 axes, only three (neuroshima-hex, hive, go-shape/Havannah) are actual hex-or-hex-adjacent competitive games. Every other axis's value is a transplanted turn/scoring economy from a non-hex game. If "does anyone else fight ON a hex board" is a question the panel cares about, this monument under-delivers on it by design — it optimized for mechanic-transfer breadth over geometry-match precision.
  - **No axis returned zero usable rows or all-low-signal**; the floor held everywhere.
