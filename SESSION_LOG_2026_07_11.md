# Session log — 2026-07-11 (overnight autonomous campaign)

Full user-facing summary: MORNING_REPORT_2026_07_11.md. This is the build trail.

## The order
Five user directives (NIGHT_PLAN.md, verbatim): (1) capture caps-on-stack not
replace, (2) decks bigger+better, (3) find the addictive hook / force combat /
strategic placement — via tumble-dry persona review + monument research,
(4) full online shell by morning, (5) battleground elevation, (6) rubble +
close-up crashed-worlds backdrop. Plus mid-flight: a fun/wow metric.

## Research wave (A)
- **Monument**: 22 web scouts → 171 indexed / 35 shortlisted hex-combat steals
  (analysis/hexcombat_shortlist.md). Key: force contact structurally (Faeria,
  Havannah, king-of-hill), compress runway (Snap 6-turn cap; Brode: small decks),
  make math felt (Islanders live preview), wow patterns (Balatro cascades).
- **Tumble-dry (3 personas, live play)**: systems designer found a 41-turn
  zero-capture game + a free peel-farm exploit; retention designer designed the
  Mote ladder + reward strip; placement purist found the rift wasn't impassable
  in code and forks were mechanically impossible. All in analysis/tumble1_*.md.
- **Shell spec**: SHELL_SPEC.md — verified anon auth OFF live, guest-default +
  magic-link design, exact SQL + RLS, found the client() singleton + limen_rooms
  role bugs before building.

## Design round 7 (DESIGN_ROUND_7.md)
Synthesis → RULES-7. Gate #1: 5 Sonnet reviewers, all BUILD-WITH-CHANGES →
RULES-7.1 amendments (A1-A14, B1-B11): corner hill-king blocked, trophy value
capped, Riftlight kept out of relativeInfluence, WARD's single bounce, SUNDER
adjacency-gated, RPC cooldown guard, pool-dependent SQL generated post-C1.

## Build waves
- **C1 (core)**: RULES-7 in core/*, tools/metrics.js Drama Index, 42-type pool,
  rebuilt starters, sims (deck-24 reverted, ascend variant A, corner ban),
  policy retrained (60.8% vs greedy), 61 tests. Zero-capture 51%→3.6%, Drama
  64.4→78.2. Misses → BLOCKERS.md.
- **C2a (shell)**: singleton client, live migration (cooldown RPC, 3 rooms
  policies fixed), auth, Mote economy, collection, reward strip, deckbuilder v2.
  Fixed a pre-existing menu z-index bug (Deck Builder etc. invisible from title).
- **C2b**: progression SQL generated from live pool (28 unlock rows), ladder
  65 Motes ≈ 50-60 wins, How-to-Play rewritten, GAME_DESIGN core loop rewritten.
- **C3 (render)**: V1-V8 felt layer — placement preview, resolution cascade,
  capture slam + war strata, riftlight glow + STIRS eruption, rubble, close
  backdrop. Caught a real cell.ruins→cell.rubble regression.
- **C4 (art)**: 18 new card arts + 18 sprites + close backdrop, then a 9-card
  legacy top-up → 100% art coverage (44 types), ~$2.50.
- **Media session (cordial-jasper)**: parallel campaign, own branch lanes;
  lore (44 entries), cinematics, 3D env GLBs, music. Integrated via
  INTEGRATION_NOTES (codex, intro/win cinematics, popout, living menu, og-image).

## Gate #2 (built-thing review)
3 reviewers: shell verifier PASS all 6 (guest loop, MP byte-sync, RPC abuse
rejected, console clean); completeness audit → actioned every finding (media
hookups landed, narrative coherence, artifacts committed, migration verified);
fun-score judge 6/10, found the delta-chip/badge overlap BLOCKER → fixed
(06248bd), re-verify confirmed readable.

## Closeout
All pushed to limen-design; GH Pages main.js hash-matches local (live-verified);
live smoke agent confirmed first-visitor playability. Handoff + memory updated.

## Coordination note
Repeated agent-stall pattern: subagents that "arm a watcher" then stop have no
harness-tracked child, so nothing re-invokes them — had to SendMessage-nudge
C4/balance/judge agents. Lesson for next campaign: tell background agents to use
Bash run_in_background with an until-loop (harness-tracked) OR expect a manual ping.
