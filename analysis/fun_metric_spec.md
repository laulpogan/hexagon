# Fun Index — spec for `tools/metrics.js` (RULES-8 gate instrument)

The composite the round-8 charter requires: computable from the **deterministic game
log** (moves + per-ply `relativeInfluence` for each side + winner + ply count),
seed-paired A/B-able, grounded in Browne's empirical predictors of human-perceived
game quality. It **replaces the ad-hoc `dramaIndex()` composite** while reusing its
tracker plumbing.

Grounding: Browne, C. (2008) *Automatic Generation and Evaluation of Recombination
Games*, PhD thesis QUT, Ch.8 (Aesthetic Measures) + Ch.11 (Experiment II regression,
corr 0.82 for the best-17 set). His leave-one-out regression names **six** dominant
predictors with signs: **Uncertainty(Late) [+], Killer Moves [+], Permanence [+],
Lead Change [−], Completion [+], Duration-deviation [−]**. The RAPP skill-depth
companion is grounded in Liu et al., IEEE CIG 2017 (arXiv:1703.06275) and Nielsen et
al., EvoApplications 2015.

---

## 0. What the log already gives us (no new engine state)

`tools/metrics.js` `createTracker()` already records, per ply:
`influenceSamples: [{turn, p1, p2}]` where `p1/p2` are `boardSummary()` influence.
Plus `winner`, `turns`, `totalCaptures`, `firstCaptureTurn`, etc.

**One small addition** to `recordPly()`: store the mover on each sample —
`influenceSamples.push({ turn, player, p1, p2 })` (`player` is already an argument).
Permanence needs mover identity; everything else derives from `p1−p2`.

Per-game series (M = `influenceSamples.length`):
```
lead_n   = s[n].p1 - s[n].p2                 // signed P1-perspective lead at ply n
L        = max(1, max_n |lead_n|)            // per-game peak |lead|, guards /0
w        = winner ∈ {1, 2, null}
wl_n     = (w === 1 ? lead_n : -lead_n)      // winner-perspective lead
nwl_n    = wl_n / L                          // normalized to [-1, 1]
```

---

## 1. Sub-metrics — exact formulas, all normalized to [0,1]

### U — Uncertainty (Late)  · weight +0.30 · **band [0.55, 0.85]**
Browne's single strongest predictor. Area between the actual winner-lead curve and the
"line of average certainty" (rises to 1 at game end), **late-weighted** so end-game
gaps dominate.
```
e_n  = (nwl_n + 1) / 2                        // winner lead mapped to [0,1]
wt_n = (n / (M-1))^2                          // Browne late-weighting precedent, k=2
U    = Σ_n wt_n · min(1, |(n/(M-1)) - e_n|)  /  Σ_n wt_n
```
Direction: higher = outcome stayed live longer. **Sweet-spot, not pure higher:** above
~0.90 the game is coin-flippy to the last ply (Browne's over-uncertainty penalty). Band
midpoint ~0.70.

### K — Killer Moves  · weight +0.20 · **band [0.15, 0.45]**
Largest single-ply swing in the winner-oriented lead — the "one move that turned it".
```
K_game = max_{n≥1} |nwl_n - nwl_{n-1}|        // biggest normalized ply-over-ply swing
K      = mean over games of K_game
```
Direction: sweet-spot. Some decisive swings = drama; every game hinging on one all-or-
nothing ply = swingy/random. Band midpoint ~0.30.

### P — Permanence  · weight +0.15 · **higher-better, target ≥ 0.6**
A strong move should stick, not be undone by the opponent's immediate reply (Browne
top-6, positive). Needs mover identity.
```
sgn(player) = +1 if P1 else -1
mDelta_n = sgn(player_n) · (lead_n - lead_{n-1})     // mover's self-improvement at ply n
// immediate trade = both the mover and the very next opponent help themselves back:
R_n = clamp01( min(max(0, mDelta_n), max(0, mDelta_{n+1})) / L )
P   = 1 - mean over interior plies (n = 1 .. M-2) of R_n
```
Direction: higher = effects persist. Target ≥ 0.6 (heavy immediate-reversal games sink).

### C — Completion  · weight +0.15 · also a **hard gate ≥ 0.90**
```
C = (winsP1 + winsP2) / G                     // 1 - fraction that hit ply cap / stalled
```
Batch-level. Direction: higher-better.

### LC — Lead-Change excess  · weight −0.10 · **band |rate − target| small**
Browne enters lead-change with a **negative** sign (excess flips read chaotic). Penalize
deviation from a target rate, not raw count.
```
flips_n   = 1 if sign(lead_n) ≠ sign(lead_{n-1}) (ties carry prior sign) else 0
rate      = Σ flips_n / (M-1)                  // per-game, then mean over batch
LC_excess = clamp01( |mean_rate - LEAD_CHANGE_TARGET| / LEAD_CHANGE_TARGET )
```
`LEAD_CHANGE_TARGET` default **0.25** — Browne/arXiv-2310.20008 use ~0.5 for their
games, but Limen's influence lead is sticky (RULES-7 averaged well under 1 flip/game),
so 0.5 would perpetually penalize. **Calibrate this one constant against the RULES-7
baseline distribution in P0** (Browne fit it empirically; so do we). Subtracted.

### D — Duration deviation  · weight −0.10 · **target M ≈ 35 (band 25-45)**
```
M_PREF     = 35                                // midpoint of the 25-45 ply target band
Dur_dev    = clamp01( |M_PREF - M| / M_PREF )  // per-game, then mean over batch
```
Direction: lower-better (deviation penalty). Subtracted.

---

## 2. Composite

```
FunIndex = clamp01(
    0.30·U  +  0.20·K  +  0.15·P  +  0.15·C
  - 0.10·LC_excess     -  0.10·Dur_dev
) · 100                                          // report 0-100
```
Weights are an engineering approximation of Browne's published **rank order** (he
plotted relative importance as increase-in-prediction-error, Fig.11.4, not a tabulated
weight vector — treat 0.30/0.20/0.15/0.15/0.10/0.10 as that rank, not verbatim
coefficients).

**Viability gates (pass/fail BEFORE the composite is trusted — Browne treats these as
prior playability filters, not quality signals):**
```
Balance     = 1 - |winsP1 - winsP2| / (winsP1 + winsP2)      ≥ 0.80   (fail ⇒ FunIndex flagged invalid)
Completion  = (winsP1 + winsP2) / G                          ≥ 0.90
Drawishness = draws / G                                      ≤ 0.05
```
The charter's tighter **P1 winrate 48-52%** is the real balance bar; Balance ≥ 0.80 is
the coarse gate, the 48-52% check is the acceptance bar.

---

## 3. RAPP Skill-Depth — cross-batch companion (arena, not the sim log)

The charter's headline solvability target — "pull strong-vs-weak into 65-85%, not
100%" — is **not** computable from one sim batch; it needs the agent ladder in
`tools/arena.js` (greedy < policy < search2). Report it beside FunIndex; it is a **hard
round-acceptance target**, weight 0 in the log-only composite.
```
w_{i,i+1}      = (wins(strong) + 0.5·draws) / games        // adjacent ladder rungs, seed-paired
SkillDepth_norm = 2·(mean_i w_{i,i+1} - 0.5)               // in [0,1]
```
Target band **[0.30, 0.70]** (≡ 65-85% adjacent-rung winrate). RULES-7 baseline is
**1.0** (search2 beats greedy 24-0 = a solved placement layer) — the number RULES-8
must pull down into band. Below 0.30 = luck-dominated; above 0.70 = still solvable.

---

## 4. Seed-paired A/B (rules-A vs rules-B)

The rng is fully seeded (`mulberry32(hashSeed(seed))`, no `Math.random`/`Date.now` in
core), and `sim.js` already generates deterministic seeds `${prefix}-${i}`. So pairing
is exact:

1. Run the SAME seed set `i = 0..N-1` through both rule sets — either via
   `withConfig(patch, () => runBatch(N))` for knob diffs, or two checkouts/flags for
   structural diffs. Identical seed ⇒ identical board + deck shuffle ⇒ the only
   variable is the rules.
2. Compute `FunIndex_A(seed_i)` and `FunIndex_B(seed_i)` **per game** (the composite is
   per-batch, but U/K/P/Dur are per-game; aggregate C/LC/Balance per batch — for the
   paired test compute the per-game quality terms and hold the batch-level gates
   constant across the pair).
3. Report **Δ_i = FunIndex_B(i) − FunIndex_A(i)**, the mean Δ, and a **paired bootstrap
   95% CI** (resample seeds with replacement, 10k draws) or a paired sign test.
   Seed-pairing removes board/deck variance, so a small consistent Δ is significant at
   far lower N than an unpaired comparison.
4. Acceptance: RULES-8 wins iff mean ΔFunIndex > 0 with CI excluding 0, **and** no
   viability gate regresses, **and** ply band + P1 48-52% hold, **and** SkillDepth_norm
   moved toward [0.30,0.70]. (Charter success criterion #2.)

Run at **N ≥ 500** per side (charter baseline used n=500); stability check = two N=500
batches agree within ±1.0 FunIndex.

---

## 5. What this subsumes / replaces in the current `dramaIndex()`

The existing `dramaIndex()` blend (captures 0.20 · firstCapture 0.15 · leadChanges 0.15
· comeback 0.10 · notZeroCapture 0.15 · notStall 0.10 · notMutualTurtle 0.10 ·
recaptureCycles 0.05) mixes **quality** and **viability/diagnostic** signals and rewards
raw lead-changes (which Browne shows is backwards). Reorganize:

| Old Drama term | Fate under Fun Index |
|---|---|
| `leadChanges` (+0.15) | **REPLACED** by `LC_excess` (−0.10, penalty around a target) — Browne's sign is negative, not positive. |
| `comeback` (+0.10) | **SUBSUMED** by Uncertainty(Late) + Permanence; keep `comebackRate` as a reported headline (interpretable "winner was behind in X% of games"), weight 0. |
| `captures/game`, `notZeroCapture`, `medianFirstCapture` | **MOVED to diagnostics + gates** — not "fun" quality signals but Limen-specific viability. `firstCapture ≤ 6` and `zeroCapture ≤ 5%` are charter **gates**, reported next to FunIndex, not blended in. |
| `notStall`, `notMutualTurtle` | **FOLDED into Completion** (stall = incompletion) + kept as diagnostics. |
| `recaptureCycles` (+0.05) | **DROPPED from the composite** (texture, not a Browne predictor); keep as a diagnostic. |

**Plumbing:** keep `createTracker/recordPly/finishTracker` (add `player` to each
`influenceSamples` entry). Add `funIndex(trackers, {G, winsP1, winsP2, draws})` beside
`dramaIndex()`; `dramaIndex()` stays callable for continuity. `sim.js` prints both:
FunIndex is the RULES-8 gate, Drama Index the legacy diagnostic. The four charter gates
(first-capture ≤6, zeroCap ≤5%, ply band 25-45, P1 48-52%) print as an explicit
PASS/FAIL block above the composite.
```
funIndex → {
  composite,                       // 0-100, the gate number
  U, K, P, C, LC_excess, Dur_dev,  // sub-scores
  balance, completion, drawishness,// viability gates (with pass/fail)
  skillDepthNorm,                  // filled from arena batch, else null
  // diagnostics (not weighted): capturesPerGame, medianFirstCapture,
  //   zeroCaptureRate, comebackRate, stallRate, mutualTurtleRate, avgPlies
}
```
