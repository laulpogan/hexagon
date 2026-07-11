# Limen — overnight campaign report (2026-07-11)

Live: https://laulpogan.github.io/hexagon/ (deployed + verified this morning).
Everything below is pushed to `limen-design` and serving.

## What you asked for → what shipped

**1. "Capture should cap on top of the stack, not replace."** Done. Capturing
now BURIES the enemy tile under yours — permanently, war-strata style. Your
earlier round-4 message got mis-built as "replace + ruins"; that was the bug
you were seeing. Captures always spend the card now; the only bounce left is
WARD (once per tile).

**2. "Decks bigger AND better."** Split verdict, honest: the card POOL went
22 → **42 types** (18 new, all with generated art), and the **starter decks
were rebuilt** so FLANK/WING/SUSTAIN/SUNDER/RALLYING_CRY show up in game one
(they used to ship at zero copies — the tension mechanics were invisible).
Deck SIZE stayed at 20: the sim proved 24 pushed games past the length target.
"Bigger" is delivered as pool + collection depth, not hand size — the research
(Marvel Snap's designer: small decks make every card matter) backed staying tight.

**3. "Find the addictive hook / force combat / make placement strategic."**
This was the core of the night. Diagnosis first: I measured the baseline —
**over half of all bot games had ZERO captures** (51% greedy, 50% search2).
Players turtled in their corners because captures needed no adjacency (nothing
forced armies to meet) and stacking your own tiles was a free always-good move.

The fix (RULES-7, sim-gated and adversarially reviewed):
- **Captures require adjacency** — you must be there to strike.
- **High ground** — taller stacks press harder downhill and resist uphill;
  contested cells tower and become genuinely harder to take (your directive #5).
- **Self-stacking gives height but no power** — only buried ENEMY trophies
  make you stronger, so ascension is a real positional bet, not a default.
- **The rift became the prize** — hold rift-adjacent ground for bonus
  "Riftlight" score; every 12 turns THE RIFT STIRS (a telegraphed board event).
- **Live placement preview** (the #1 "strategic feeling" fix, stolen from
  Islanders) — hovering a card shows the exact influence changes before you commit.

**Result: zero-capture games 51% → 3.6%. Drama Index 64.4 → 78.2/100.
Captures per game 3.81 → 6.09.** A fresh playtest judge scored it 6/10 fun
(up from an implied ~3 — "measurably works, midgame is transformed").

**4. "Full online shell — accounts, deckbuilding, collection, unlocks."** Done
and live. Guest-by-default (plays instantly, no signup wall), optional email
account, a **collection screen** (42 cards, owned vs locked), a **Mote unlock
economy** (1 win = 1 Mote, ~50-60 wins to complete the base set, daily
first-win bonus), a **post-match reward strip** that counts up your gains and
shows the next unlock, and an **ownership-gated deckbuilder** with cloud sync
when signed in. Multiplayer still works for everyone. All verified end-to-end.

**5. "Rubble and interesting stuff on the battlefield + a detailed CLOSE-UP
crashed-worlds background."** Partial-to-done. The close-up backdrop shipped
(verdant crystal forest vs obsidian ember spires tearing apart at the rift —
replaces the distant dome). Rubble props appear on fought-over cells, now using
real 3D crystal/obsidian shard models the media session generated. The full
perimeter 3D environment ring was cut for time (banked for next round).

## The two honest misses (in BLOCKERS.md)

- **First capture lands turn ~9-10, not the turn-8 target.** It's a geometric
  floor — capitals start 2 rows off the seam, so armies physically can't meet
  sooner. Real improvement over the T11/T28 baseline; going lower means moving
  capitals, a bigger change for a later round.
- **The opening 6-7 turns still lack stakes.** Midgame is transformed; the
  setup phase isn't. Same root cause. This is the top item for design round 8.

## How this was built (for the record)

A monument research sweep (171 games/mechanics indexed → 35-item steal-list),
a 3-persona "tumble-dry" review of the core mechanic, a 5-reviewer design gate
before any code, then parallel build waves (core rules / online shell / render
/ art) with a second 3-reviewer gate on the built thing. A sister session ran
the media campaign (lore, cutscenes, 3D models, music) on the same branch;
we split lanes over a live agent-to-agent link. Full trail: NIGHT_PLAN.md →
DESIGN_ROUND_7.md → ARENA_PLAN.md → SESSION_LOG_2026_07_11.md.

## Next session's backlog

- Design round 8: kill the dead opening (board geometry / an early objective).
- Wire the media music manifest (battle layer + rift stinger) once triggers
  are specced; land the hero-unit 3D popouts + perimeter environment ring.
- REMEMBRANCE mechanic (deferred from this round); close the policy-vs-search2
  agent gap; human playtest calibration of the 6/10 fun score.
