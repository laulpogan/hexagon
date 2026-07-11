# Morning report — Limen MEDIA campaign (overnight 2026-07-11)

Companion to `MORNING_REPORT_2026_07_11.md` (campaign A: rules/shell/elevation).
This one is the media blitz: **the whole fleet ran all night and the world is
now on screen, in sound, and in the game.**

## What you'll see when you open the game
- **A cinematic intro** on the title screen ("⟡ The Meeting") — six shots of the
  two worlds colliding into the Rift, narrated, scored. Click-to-play, skippable,
  never blocks the Play button.
- **A living menu background** — a slow dusk drift over the threshold.
- **A Codex** button — a full lore browser: the 3-act Threshold Cycle, three
  faction codices, and a written entry for all 44 cards (an epigraph, a
  vignette, a scholar's note each). This is the "in-depth generated plot."
- **3D popouts** — inspect a card and its unit spins in 3D beside your hand.
  18 hero models so far (every original unit + both capitals), each sculpted
  from its sprite. The palace-tree and ember-spire capitals came out beautiful.
- **Win cinematics** — a golden bloom when the Verdant wins, an ember-city
  kindling when the Umbral does.

## What got made (all local generation — no cloud APIs)
| | Where | Count |
|---|---|---|
| Cutscene / b-roll video | LTX-2.3-22B on the GB10 Spark | 17 clips + 1 re-roll |
| 3D models | Hunyuan3D-2.1 on spark-472e | 33 GLBs (18 units + 15 env), 0 failures |
| Music | MusicGen-medium on the GB10 | 4 tracks (trailer build/peak, battle, rift stinger) |
| Lore (44 card vignettes + arc) | Qwen3.6-27B on the Dell | ~15k words |
| Voiceover | Chatterbox on the Dell | 9 narration lines |
| **Trailer** | ffmpeg on the Mac | **60s, delivered to your phone** |

The **60-second trailer** (`~/limen-media-masters/limen_trailer_60s.mp4`) and the
**intro cinematic** were sent to your device. Trailer opens on the Rift erupting,
puts real gameplay on screen by 0:08, and lands the title on a musical stinger.

## The Dell was handled with care
Its production services (Dot's brain on the 27B, the Twilio voice bot) were
**never touched** — the media campaign used only its HTTP endpoints for lore text
and narration, ran zero GPU jobs on it, and left 77GB of its VRAM alone.

## Two campaigns, one branch, zero collisions
I ran alongside campaign A (glacial-squall) on the same branch *and the same
working checkout*, coordinating entirely over `wire`. We split lanes, and I
shipped every game hookup as a self-contained module + a ≤5-line note that
campaign A landed. Their words at closeout: *"the codex/cinematics/env GLBs made
the shell land far richer than the rules work alone would have."*

## Gates (build-loop HIGH, both passed)
- **Plan gate:** 4 personas, 24 findings folded in before a byte was generated —
  the concurrent-campaign collision, style-drift lock, and GLTFLoader vendoring
  were all caught here.
- **Built-thing gate:** drove the fully-integrated live page — codex (51
  entries), popouts, cinematics, menu video all work, zero JS errors. Found and
  fixed a 404 on unmodeled cards (added a model manifest → silent skip). The one
  remaining console line (Supabase 422) is campaign A's *intended* guest-mode
  fallback, confirmed by their reviewers.

## Still cooking / next session
- Tree & spire environment props (Hunyuan round 2) were generating at close —
  first pass conditioned on scene-crops came out flat, so I re-ran them from
  clean single-object stills; they'll enrich campaign A's crashed-worlds
  perimeter.
- 18 popout models for the new R8 cards (their sprites are ready; needs one more
  GPU pass) → completes the 3D set to every non-rite card.

## One caveat to know
The local models used here (LTX, Hunyuan3D, MusicGen) are research/
non-commercial weights. Fine for the free browser game as-is; revisit licensing
before any paid/commercial framing — same standing note as the ElevenLabs gate.
