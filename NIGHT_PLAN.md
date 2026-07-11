# Night campaign — 2026-07-11 (overnight autonomous run)

User order (verbatim intent, do not drift):
1. **Capture semantics fix**: enemy capture must CAP ON TOP of the target
   stack (bury it), not remove/replace it. This restores subjugation-style
   stacking (round 3.5) — the round-4 "replace + ruins" was a misread of the
   user's message. Design round decides how buried tiles / peel / ruins /
   liberation compose now. Sim-gated.
2. **Decks better AND bigger** — more cards per deck, better starter decks,
   expanded shipped card pool.
3. **Find the addictive hook** — game doesn't force combat/interaction fast
   enough; tile placement lacks strategic feeling; missing "wow" effect.
   Deep multi-round ("tumble dry") persona review of the core mechanic +
   monument research on comparable hex-tile placement combat games
   (Faeria, Duelyst, Hive, Polytopia, Dorfromantik, Summoner Wars, Slay,
   Carcassonne scoring tension…) — steal what works.
4. **Full online shell by morning**: menu screens, account creation,
   deck building, collection screen, unlock/progression loop that motivates
   play. "Everything screens you would expect."

## Tier: HIGH (auth + core rules + product-quality deliverable)
Gate #1 = persona review of the unified design before building.
Gate #2 = fresh-eyes panel + in-situ Playwright full-flow test on the built
thing (account → deck → play → unlock), plus judge screenshot review.
Iteration cap: 3 rounds per gate; blockers → BLOCKERS.md; round counter in
this file (bump on every gate round):
GATE1_ROUNDS: 0
GATE2_ROUNDS: 0

## Success criteria (falsifiable, checked before morning report)
- [ ] Capturing a tile or stack places the attacker's card ON TOP; buried
      tiles persist under it (exact semantics per design round); tests cover
      capture-of-stack and recapture; 45+ tests green.
- [ ] Policy retrained post-rules-change; seed-paired tiebreak re-sweep run;
      stall rate ~0; avg game length within 20-45 turns; no keyword outside
      42-58% band at n≥1500.
- [ ] Median turn-of-first-capture measurably earlier than baseline (sim
      metric — interaction forced sooner). BASELINE (measured 2026-07-11,
      pre-change): greedy n=200: median first capture T11 but 101/200 games
      had ZERO captures, captures/game median 0, length median 41T; search2
      n=60: first capture median T28, 30/60 zero-capture, captures/game
      median 1. Over half of games contain no interaction — this is the
      number to destroy.
- [ ] FUN/WOW SCORE (user order, mid-flight): (a) tools/metrics.js "Drama
      Index" 0-100 — composite of captures/game, median first-capture turn,
      lead changes (influence-lead sign flips), comeback wins (winner behind
      at 75% mark), stall rate; deterministic, printed by sim/arena runs,
      tracked per build in ARENA_PLAN. (b) Judge-side fun score /10 from the
      gate-#2 playtest panel (rubric: tension / agency / spectacle /
      one-more-game pull), tracked per round like the visual score. Both
      reported in the morning report with before/after.
- [ ] Deck size increased (design round picks number); starter decks rebuilt;
      deckbuilder enforces new rules; pool expanded with art for every new
      shipped card.
- [ ] Live site has: title/menu flow, account creation (Supabase magic-link +
      guest mode), collection screen, unlock progression (wins grant cards/
      packs), deckbuilder integrated with account, all reachable and tested
      in-situ via Playwright.
- [ ] New-mechanic iconic animations implemented (per design round picks).
- [ ] Everything pushed to limen-design, live URL verified, docs/session log/
      handoff updated, morning report written.

## Constraints (standing, do not violate)
- Never commit/merge to main; Pages serves limen-design.
- Never `git add -A` while write agents run; stage by name.
- No secrets in transcript/commits; Supabase publishable key is client-safe
  by design; new tables MUST have RLS appropriate to design (rooms stays
  open by prior decision; auth'd tables scoped to user).
- Rules changes: deterministic core only (seeded rand), retrain + seed-paired
  sweeps after; mechanics via core/mechanics.js hooks where possible.
- Reviewer personas = Sonnet; only consolidation may be Opus.
- Agents don't inherit context — paste needed state into every prompt.
- ElevenLabs free tier = non-commercial; no commercial framing.

## Workstream sequencing
- A (parallel, now): monument research; shell/meta-game research; persona
  tumble-dry round 1 on core mechanic.
- B: design synthesis → DESIGN_ROUND_7.md → gate #1 panel.
- C1: core rules (capture-cap + interaction-forcing picks) → sim/retrain.
- C2 (parallel with C1, disjoint files): Supabase schema + auth + shell
  screens (menu/account/collection/unlocks/deckbuilder).
- C3 (after C1): iconic animations + pool expansion art gen (background).
- D: gate #2 (panel + in-situ full flow + judge) → fix rounds → push →
  live verify → docs → morning report.

## File ownership map (concurrency guard)
- core/, tools/, data/tiles.js, data/cards_gen.json → core-rules agent only.
- net/, ui/account*, ui/collection*, ui/menu*, index.html, main.js (shell
  wiring), Supabase migrations → shell agent only.
- render/scene.js → animations agent only (after C1 lands).
- Docs (NIGHT_PLAN, DESIGN_ROUND_7, SESSION_LOG, GAME_DESIGN, ARENA_PLAN) →
  orchestrator (main session) only, except ARENA_PLAN round entries by the
  balance agent.
- Conflicts on main.js between shell and animations: shell owns it; animations
  agent submits main.js needs to orchestrator as a patch note.

## Status log (orchestrator appends)
- 2026-07-11 ~00:xx: plan written; research wave A launching.
