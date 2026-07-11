# Night campaign B — MEDIA BLITZ (2026-07-11, overnight autonomous) — v2 post gate #1

User order (verbatim intent): put the whole ecosystem — GB10, spark-472e,
Dell Pro Max — to work making trailers, music, content for the game. Draw
from the storyline to create wild assets: super detailed 3D models, lifelike
cutscenes, in-depth generated plot. Work all night; inject video and
animation into the game. Follow-up order: work with glacial-squall (campaign
A session, wire peer, VERIFIED).

INTERPRETATION (art-director gate finding): "lifelike" = staging, camera
motion, dramatic timing — NOT photoreal render fidelity. Everything stays
anchored to the shipped painterly low-poly identity. "Animation" baseline =
video cutscenes + GLB turntable popouts; Mesh2Motion rigging = stretch goal;
LTX animated loops = fallback per unit.

## Coordination with campaign A (LIVE — verified commits 00:31–00:39)
Campaign A (glacial-squall) runs rules/decks/shell on this same branch.
Lane-split + pipeline-offer sent over wire (event f5cc8fbd, ~00:55).
- My lanes: assets/**, ui/codex*, render/cinematics*, LORE.md, data/lore.js,
  this file, SESSION_LOG_2026_07_11_MEDIA.md.
- Contested (index.html, main.js, ui/hud.js, render/scene.js): I ship
  self-contained modules + INTEGRATION_NOTES.md with ≤5-line hookups; A
  lands them, or grants a write window via wire ack. No touch without ack.
- `git pull --rebase` before every commit; stage by name; small commits.
- Pipeline offer: env GLBs (crystal trees / ember spires / rubble props)
  for A's directive 6a/6b, from my spark-472e Hunyuan3D batch. Awaiting ack.
- Rollback reference: HEAD at campaign start = 88cb728. Integration reverts
  target last-green before MY first integration commit (re-record then).

## Tier: HIGH — output-quality-is-the-product + cross-machine
GATE1_ROUNDS: 1 (4 personas: SRE, art director, integration engineer,
completeness critic — 6 blockers + 18 majors folded into this v2; round-2
single fresh-eyes re-check before generation batch commits)
GATE2_ROUNDS: 0

## Fleet assignment (recon-verified)
| Box | Assignment | Discipline |
|---|---|---|
| GB10 promaxgb10-d325 | LTX-2.3 video: cutscenes, trailer b-roll, menu bg. ComfyUI ALREADY RUNNING (127.0.0.1:8188, pid 2463) — drive via ssh curl. MusicGen fallback host | 46GB mem available — if OOM: letta container pausable; resident dev vLLM investigated before any kill. Masters: ~/limen-media/out/ |
| spark-472e | Hunyuan3D-2.1 (dr-vij compose build IN FLIGHT ~00:50) → hero GLBs + env props; then MusicGen-medium music suite | Every GPU run: GPU_JOB_OWNER=paul GPU_JOB_TAG=paul/limen-media gpu-launch --kind inference. Exit 3 = per-item backoff-retry (Willard outranks), never batch-fatal. Build fail by 03:00 → fallback LTX loops + skip popouts gracefully |
| Dell dellpromax | SERVICES ONLY: Qwen3.6-27B :8011 lore bulk (Mac-direct, VERIFIED); Chatterbox TTS :8058 VO (VERIFIED 200 + 65KB via dot-air hop; ServerAliveInterval on hops); Kokoro :8055 = TTS fallback #2; text-card fallback #3 | NO GPU jobs. dot-* services untouchable |
| Mac | Orchestration, lore taste-pass, scripts, drivers, integration, trailer cut, gates | Manifest = source of truth (below) |

## Reliability rules (SRE gate findings — binding)
- Orchestrator manifest at analysis/media_manifest.json: every asset
  planned → submitted → done/failed + output path + seed + attempt count.
  ComfyUI queue NEVER trusted as state; resume = resubmit missing manifest
  rows. Output-file existence = the resume signal (idempotent, keyed names).
- Remote jobs: `setsid nohup … < /dev/null > log 2>&1 &` + PID + survival
  check after ssh disconnect.
- Hang detection: poll ComfyUI /queue + /history; no progress in 3×
  baseline (baseline 180s/clip) → kill + resubmit once → else mark failed.
- df check on GB10/spark before each batch wave; abort wave < 50G free.
- Re-roll cap: 2 per clip (judge < 7/10), then ship best-of-N. Cap 3 per GLB.
- LLM-generated text NEVER interpolated into shell commands/paths — slugs
  from my own allowlisted keys only.
- Seeds: base_seed 20260711, per-shot = base + shot_index (coherence ≠
  reproducibility; conditioning stills carry look across shots).

## Style lock (art-director gate — binding for every clip)
- Hero/character shots: LTX image-to-video conditioned on EXISTING art
  (sprites / tile illustrations / backdrop) or gpt-image-1 stills in the
  anchor style. Text-to-video only for wide environment shots.
- Shared suffix on every positive prompt: "painterly low-poly PS1-era
  fantasy render, faceted geometry, hand-painted flat shading, muted
  palette, magenta rift glow only near the seam, verdant gold and umbral
  ember accents". Shared negative: "photorealistic, hyperreal skin, PBR
  reflections, ray tracing, film grain, DSLR bokeh, 4K micro-detail" (+
  existing game-negative list).
- 1 TEST CLIP through judge rubric BEFORE committing the batch.
- ffmpeg grade pass: one LUT/eq matched to in-game look (blacks toward
  #101218, gold/magenta push) applied to every trailer source incl.
  gameplay capture.

## Deliverables + checks (v2)
1. LORE.md "The Threshold Cycle" — 3-act arc, 2 faction codices + rift
   codex, vignette per shipped unit (roster from data/tiles.js), cutscene
   scripts (intro ≤30s, 2 win cines ~10s, rift teaser), 60s trailer shot
   list w/ prompts. Consumer named: tools/gen_lore_data.js → data/lore.js
   (codex source; tooltips keep existing flavor text — different tier, no
   duplication). VO script: short declaratives, ≤12 words/sentence, no
   faux-archaic inversions. CHECK: every unit named; data/lore.js parses +
   test imports it.
2. Video ≥12 clips @704p: intro 4–6 shots, verdant win, umbral win, menu
   living bg (muted-loop-safe), ≥4 b-roll. CHECK: judge ≥7/10 hero clips
   (composition/style-fit/artifacts) + style-consistency pairwise check.
3. 3D ≥8 hero GLBs — roster: RIFTWALKER, GALEHARRIER (WING silhouette),
   DREADMAW, COLOSSUS, MIRRORSAINT, JUGGERNAUT, CAPITAL_VERDANT,
   CAPITAL_UMBRAL (+FANGWOLF, REAVER stretch). Input prep: 512px sprites,
   transparency verified, centered. Turntable render vs source sprite =
   judge fidelity gate (silhouette/palette match), not just parse. Optimize:
   gltf-transform decimate+resize+meshopt; budget ≤1.5MB/GLB, ≤12MB total.
   + ENV PROP SET for campaign A if acked (trees/spires/rubble ×2 each).
4. Music — trailer track 60–90s: tension crescendo EXTENDING the shipped
   motifs (rising string ostinato, thickening drone/choir) — NO percussion
   ask; battle layer; rift stinger ≤10s. Impacts sweetened in ffmpeg, not
   MusicGen. loudnorm (-14 LUFS) on final mixes. Non-commercial use
   consistent w/ shipped MusicGen loops. CHECK: durations + judge listen.
5. VO — Chatterbox (verified). CHECK: audible + judge "mythic not cheesy";
   fallbacks Kokoro → text cards.
6. Trailer ~60s: hook readable silently in first 3s; REAL GAMEPLAY inside
   first 15s; tagline card + mechanic card ("Inscribe your reality.
   Unwrite theirs."). Gameplay capture: Playwright context video record of
   scripted vs-bot game on live URL (fallback: clips-only cut). Not
   committed to repo; delivered as file + new-filename og thumbnail.
7. Integration (modules mine; hookups via INTEGRATION_NOTES.md → A):
   - render/cinematics.js: intro (click-to-play w/ audio; skippable;
     never blocks Play), win cines (decoration BESIDE stats + rematch
     button, button clickable frame 1), menu bg swap (stays muted loop).
     VideoTexture/video colorSpace set explicitly; dispose discipline;
     no decode during MP with pending opponent action (mode guard +
     requestIdleCallback loads).
   - ui/codex.js reading data/lore.js.
   - render/popout.js: GLTFLoader vendored at r182 EXACTLY into
     vendor/jsm/loaders/ + headless GLB smoke test BEFORE feature work;
     lazy-load; graceful skip.
   CHECK: Playwright live-URL flows (autoplay via scripted real click),
   console clean; 45 core tests stay green (guard only — render untested
   by them); MP smoke (2-tab fingerprint) after main.js hookups land.
8. Ship: by-name commits to limen-design; media push postBuffer; live
   verify; SESSION_LOG_2026_07_11_MEDIA.md; morning report covers BOTH
   campaign statuses; memory update.

## Sequencing (v2)
- W0 done: ComfyUI up; Hunyuan3D building; TTS verified; wire link live.
- W1 NOW: LORE (Dell Qwen bulk + Claude structure/taste) → scripts +
  prompts. || GLTFLoader vendor + smoke. || sprite prep for 3D.
- W2: 1 LTX test clip → judge → batch GB10. || Hunyuan3D smoke (1 sprite)
  → batch spark-472e → MusicGen-medium. || VO takes.
- W3: integration modules on Mac while batches run; pull assets as they
  land; gltf-transform pass.
- W4: trailer cut (grade → loudnorm → assemble); gate #2 (judge panel +
  Playwright + fidelity gates); ≤3 fix rounds; re-roll caps enforced.
- W5: hookups land via A (or acked window); live verify; docs; morning
  report; wire summary to glacial-squall.

## Status log (orchestrator appends)
- ~00:45 plan v1; recon done.
- ~00:55 gate #1 round 1: 4 personas, 6 BLOCKER + 18 MAJOR → v2 (this).
  Campaign A discovered LIVE; lane-split + pipeline offer sent via wire.
  TTS verified. Hunyuan3D build launched. ComfyUI confirmed warm.
- ~01:00 gate #1 round 2: NO BLOCKER (3 watch items folded). Lane patch from
  A acked: tools/gen_lore_data.js mine, GLTFLoader vendoring mine, ui/music.js
  +sound.js theirs. OpenAI = zero calls from media side.
- ~01:10 LORE.md + data/lore.js landed (26 Qwen vignettes, taste-passed);
  commit 3d40054: modules (codex/cinematics/popout), GLTFLoader r182 +
  BufferGeometryUtils vendored, INTEGRATION_NOTES.md (7 hookups). Wire-pinged.
- ~01:15 LTX test clip 9/10 style-fit (195s/clip baseline); 16-shot batch
  running. VO: 18 Chatterbox takes landed (response_format=wav fix; earlier
  json-quoting + raw-stream failures diagnosed). Gameplay capture: 71s of
  live-site vs-bot footage w/ game-end, WebGL verified headless.
- ~01:20 intro shots I1–I6 done. I1 judged 9.5/10 (trailer hero). I5 6.5/10
  (photoreal drift on wolf — re-roll queued, budget 1 of 2). Music auto-chain
  armed on GB10 (fires when LTX frees GPU). Hunyuan chain armed on spark-472e
  (build → gpu-launch batch: 15 env props for campaign A first, then 10
  heroes, 8 stretch). Masters archiving to ~/limen-media-masters/.
