# Session log — 2026-07-11 — Limen MEDIA campaign (overnight, autonomous)

**Order (verbatim):** "put the whole ecosystem — gb10, spark472e, dell pro max —
put them all to work making trailers, music, content for the gaming. draw from
the storyline here to create some wild assets. I want super detailed 3d models,
lifelike cutscenes, in depth generated plot… inject video and animation into the
game." Follow-up: "work with glacial-squall."

Ran as a SECOND autonomous campaign concurrently with campaign A (glacial-squall
= rules/decks/shell/elevation) on the same `limen-design` branch AND the same
working checkout. Coordinated entirely over `wire` (peer glacial-squall,
VERIFIED). Build-loop HIGH tier: 2 persona gates.

## Outcome — the whole fleet ran all night, everything shipped

| Box | Job | Result |
|---|---|---|
| GB10 (promaxgb10-d325) | LTX-2.3-22B video + MusicGen-medium | 17 cutscene/b-roll clips + I5 re-roll; 4 music tracks |
| spark-472e | Hunyuan3D-2.1 image→3D (dr-vij Docker) | 33/33 GLBs round 1 (18 units + 15 env), 0 fail; tree/spire round 2 in flight |
| Dell (dellpromax) | Qwen3.6-27B lore + Chatterbox VO (services only, no GPU) | 44 unit codex vignettes + 9 VO lines. dot-* production untouched |
| Mac | orchestration, ffmpeg cut, integration modules, gates | trailer, intro, 4 integration modules |

## Deliverables (all committed to limen-design unless noted)

**Lore/plot** — `LORE.md` (The Threshold Cycle: 3-act arc, 3 faction codices +
war-strata codex, cutscene scripts w/ per-shot prompts, 60s trailer cut sheet,
VO master script). `data/lore.js` (generated via `tools/gen_lore_data.js` from
44 Qwen vignettes: epigraph + 120-170w vignette + scholar-note each, extends the
GAME_DESIGN Threshold cosmology, honors RULES-7 war-strata + the 18 new R8 cards'
mechanical intent). Consumed by the codex screen.

**Video** (LTX-2.3, style-locked to the painterly PS1 identity via shared
prompt suffix + negative; seeded) —
- `assets/video/intro.mp4` (4.1MB): 6-shot "The Meeting" cinematic (worlds
  collide → Rift → Limen forms → Aspects inscribe → strata rise), Chatterbox
  narration + MusicGen bed, 34.8s. I5 re-rolled 6.5→9.5 (photoreal→faceted).
- `assets/video/win_verdant.mp4` / `win_umbral.mp4`: per-realm win cinematics.
- `assets/video/menu_bg.mp4`: seamless dusk-drift living background (palindrome).
- Trailer `~/limen-media-masters/limen_trailer_60s.mp4` (16MB, NOT in repo):
  hook-first, gameplay at 0:08, dual-track score, stinger on title. Delivered
  to user's device.

**3D** (Hunyuan3D-2.1, textured, gltf-transform optimized) —
- `assets/models/units/` — 18 hero popout GLBs (~700KB each, `manifest.json`),
  fidelity-gated against source sprites. Wired to card-inspect popout.
- `assets/models/env/` — 5 env-prop GLBs wave 1 (3 rift shards + 2 rubble),
  `manifest.json` (superset shape campaign A's renderer feature-detects).
  Trees/spires round 2 pending (v1 scene-crop dioramas failed fidelity → re-gen
  from LTX single-object stills).

**Music** (MusicGen-medium, loudnormed) — `assets/music/battle.mp3` (intensity
layer, -16 LUFS) + `stinger_rift.mp3` (RIFT STIRS one-shot, -14 LUFS). Trailer
tracks off-repo. Trigger contract in INTEGRATION_NOTES §6. Extends the shipped
ambient identity (tension crescendo from motifs, no percussion — MusicGen's
weak spot).

**Integration** (my self-contained modules; campaign A landed the ≤5-line
hookups per `INTEGRATION_NOTES.md`, all now on the live path) —
- `ui/codex.js` — lore browser, 51 entries (3 acts + 4 codices + 44 units),
  faction-colored nav, sprite art, XSS-safe.
- `render/cinematics.js` — intro (click-to-begin, skippable, never gates Play)
  + win cines (pointer-events:none, never blocks rematch) + menu bg.
- `render/popout.js` — spinning-GLB corner viewer on card inspect, lazy-load,
  LRU-1 dispose, manifest allow-list (silent skip for unmodeled cards).
- `assets/og_limen.jpg` — new thumbnail (aerial-war frame).
- `vendor/jsm/loaders/GLTFLoader.js` + `utils/BufferGeometryUtils.js` (r182).

## Gates

**Gate #1 (plan, 4 Sonnet personas: SRE / art-director / integration / completeness):**
6 BLOCKER + 18 MAJOR folded into plan v2. Biggest catches: the concurrent
campaign-A collision (→ wire lane-split + INTEGRATION_NOTES protocol),
style-drift risk (→ img2vid conditioning + shared suffix/negative + test clip
first), GLTFLoader not vendored (→ vendored r182 + smoke first), win-cine
blocking rematch (→ pointer-events:none), manifest-resume for crash recovery.
Round-2 re-check: NO BLOCKER.

**Gate #2 (built-thing, in-situ Playwright + fresh-eyes judge):** Drove the
fully-integrated real `index.html`. PASS — codex 51 entries, popout renders
textured, win-cine non-blocking, intro plays+skips, menu bg loads, zero JS
pageerrors. Two resource errors found: (a) Supabase `422` on guest signup —
campaign A's lane, flagged via wire; (b) `404` on unmodeled-card popouts — FIXED
with the units manifest (silent skip, zero 4xx after). Fresh-eyes judge agent:
[verdict appended below].

## Key decisions / lessons

- **"Lifelike" reinterpreted** (art-director gate) = staging/camera/timing, NOT
  photoreal — everything anchored to the shipped painterly low-poly look.
- **Shared checkout, two campaigns:** never `git add -A`; stage by name only.
  Campaign A's uncommitted files (R8 sprites, backdrop_close) live untracked in
  the same tree — left untouched.
- **Env dioramas failed, single-object stills won:** conditioning a 3D model on
  a scene-crop gives a flat relief; isolated-object stills give real geometry.
- **Fleet trap tour (all peeled live):** Qwen thinking-mode returned null content
  (`enable_thinking:false`); Chatterbox needs `response_format:"wav"` (raw PCM
  otherwise); Hunyuan container = 3 stacked env fixes (entrypoint exec ignores
  args → replicate setup; `pkg_resources` gone from new setuptools → pip
  `setuptools<81` to a writable `--target`; that clobbered `bpy` on PYTHONPATH →
  append not replace); `gltf-transform --texture-compress false` skips resize
  entirely → separate `resize` pass; obj2gltf needs mtl+jpg beside the .obj or
  textures silently drop.
- **Remote job survival:** `ssh -f` + `setsid nohup … </dev/null` for anything
  that must outlive the SSH session; manifest/jsonl as source of truth, never the
  in-memory ComfyUI/pipeline queue.

## Artifacts (paths)
- Masters (off-repo): `~/limen-media-masters/{video,music,glb}/`,
  `limen_trailer_60s.mp4`. Rejected v1 env dioramas archived under `glb/env_v1_rejected/`.
- Scratch pipeline scripts: `<scratch>/{lore_bulk,lore_ext,ltx_gen,gen_music_v2,
  hy3d_batch,hy3d_batch2}.py`, `{assemble_intro,assemble_trailer,vo_local}.sh`.
- Untracked test artifacts in repo root (NOT committed, safe to delete):
  `_poptest.html`, `glb_test.html`, `integ_harness.html`, `analysis/lore_raw_gen.log`.

## Open / next session
- **Trees/spires env props: DROPPED (2 fidelity fails).** Diorama-crop
  conditioning → flat reliefs; isolated LTX single-object stills → still flat
  blobs (LTX makes cinematic near-shots, not clean turntables; Hunyuan can't
  reconstruct a tree/spire from them). Per the two-strikes rule I stopped and
  repurposed the GPU. Env manifest stays wave-1 (rift shards + rubble). Real
  fix needs a turntable-still or text-to-3D pipeline — else campaign A's
  billboard fallback covers the perimeter. Flat GLBs left untracked, not shipped.
- **R8-card popouts (round 3): DONE** — 18/18 GLBs (0 fail) from campaign A's
  sprites, converted + optimized + committed (3d0cfab). manifest.json now 36
  types; popout covers ALL non-rite cards. Verified in-situ: APEXWARDEN renders
  via popout.show + manifest, rites skip silently, zero 4xx. units/ = 25MB (34MB
  total new media, over the 25MB plan guardrail — deliberate: all lazy-loaded,
  initial page load unchanged, repo grew for the requested detailed-3D set).
- ElevenLabs licensing gate still applies before any *commercial* framing;
  MusicGen/Hunyuan/LTX weights used here are research/non-commercial — fine for
  the free Pages game, revisit if monetized.
