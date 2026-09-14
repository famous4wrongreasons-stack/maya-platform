# Maya owner-reference motion — visual QA

final result: passed

Scope: the seven supplied key poses, their source colors/feathered edges,
source-image transitions, compact/loading/voice presentation and state cleanup.
This is not certification of an original motion timeline: the supplied PNG has
no timing, easing, in-between frames or vector animation. The implementation uses
cross-dissolves between original images, not a claimed reconstruction of those
missing frames. Ambient opacity indicates actual busy/audio state without
inventing a replacement waveform.

## Visual truth and evidence

- Source: `/Users/stanislavmosin/Downloads/may ani.png` (1672 × 941), byte-identical
  versioned copy `сайт и приложение/maya-motion-reference.png`.
- Screenshot: `docs/product/maya-identity/evidence/reference-v3-comparison.jpg`.
- Browser proof: `docs/product/maya-identity/evidence/reference-v3-proof.txt`.
- Browser: Codex in-app Chromium, normal 319 CSS px panel. The responsive 390 CSS
  px check confirmed a 342 × 76 voice container, no horizontal overflow. Temporary
  viewport override reset. Native-style surfaces also checked at 48 × 48 and
  340 × 76; retina renderer caps density at 3.
- Density normalization: source crops and rendered canvases compared at identical
  native bitmap dimensions, including the 1672 × 286 full wave. Screenshot is a
  visual review, not the lossless pixel proof. All seven recomposed key poses had
  maximum pixel difference **0/255 over white**. The preview puts source and
  implementation regions at the same CSS scale in the same browser view.
- States: idle, launch, thinking, recording, response, done, reduced motion,
  hidden document, destruction. Buttons exercised; console errors/warnings: 0.

## Findings and correction history

1. P1: the prior mathematical waveform was a new interpretation. Removed it from
   the motion renderer; source image crops now supply the actual outline, fold,
   colors and feathering. No generated curve or palette remains in motion.
2. P2 during this iteration: pixel-column warping stretched faint edge pixels into
   vertical streaks and introduced intermediate facets. Removed warping entirely.
   Actual source images cross-dissolve without geometric deformation. Enlarged
   25/50/75% transition states were reviewed before the final capture.
3. P2: the full horizontal reference became too thin in the old square voice box.
   Voice presentation is now up to 340 × 76; small indicators use the supplied
   compact poses. No chat controls or business behavior changed.

## Five fidelity surfaces

- Typography: no product fonts, weights, line heights, hierarchy or copy changed.
  Captions/arrows from the reference are outside motion crops; they are storyboard
  annotations rather than application text.
- Spacing: each crop is contained with preserved aspect ratio, centered. Voice
  width is bounded by viewport minus 32 px, without pushing out controls.
- Colors: original blue/cyan folds and diffuse ends; no newly chosen palette.
  White matte removal recomposes exactly on white. Only animation opacity varies.
- Image quality: unmodified 1 MB source file; no generative redraw, vector tracing,
  sharpened ends, invented glow, video/GIF dependency or lossy source conversion.
  The small storyboard poses retain their original raster resolution. Upscaling
  cannot add detail; the source contains no high-resolution animated master.
- Copy/content: consent and mode-selection wording/authority unchanged. The
  synthetic chooser still opens Client preview and returns to owner mode.

## Checks

16 browser reference/lifecycle checks PASS; source/bundle hash guards PASS.
Launch and completion are finite; reduced motion/hidden/unmount cancel effects.
Busy opacity uses the compositor; recording consumes existing amplitude only.
No new microphone, provider request, consent write or fabricated business state.

Remaining limitation: exact original timing/continuous morph cannot be compared
without an animated source. Do not describe this PNG-based transition as a
frame-by-frame copy of an unavailable original animation.
