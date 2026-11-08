# ClawMuse App Store panels

Run `node assets/store-screenshots/clawmuse/render.mjs` from the repository root.
Open `output/preview.html` to review both languages. The ZIP contains the 14 final
panels in locale/device folders and an export manifest.

These panels use ClawMuse's CM lockup, mint accent, layered backdrop, device
frames, shadows and enlarged native details. Source captures come exclusively
from this directory's `raw/<locale>/<device>/`; there is no fallback to Paseo or
review-account screenshots.

## Content and provenance

The same development request runs through both languages: add packing progress,
an unpacked-only filter and offline persistence to a packing list, cover edge
cases with tests, and leave changes uncommitted. Chinese panels use Chinese
conversation text, project names, comments and test names; English panels use
the corresponding English content. Application language is switched before
capturing, rather than repainting screenshot text. A few built-in labels and
the iPad system date retain their original language.

The 2026-11-06 captures show the installed **ClawMuse 1.3.1** native app connected
to an isolated **1.5.5** demo daemon. The conversation is scripted demo content,
not evidence that a live model completed the task. The implementation, git diff
and six Node tests are real. `evidence/` preserves the implementation and passing
test receipts. `raw/capture-manifest.json` records capture provenance.

## Layout and exports

Campaign copy and crops live in `render.mjs`. Each headline occupies two lines,
each supporting sentence one line. SF Pro loads from macOS or from
`SF_FONT_DIR/SFNS.ttf`; Chinese glyphs use macOS PingFang SC.

- iPhone: four opaque RGB PNGs at 1320 × 2868 per language.
- iPad: three opaque RGB PNGs at 2064 × 2752 per language. Native 2420 × 1668
  landscape captures keep their proportions inside a portrait campaign canvas.
- Detail panels enlarge a crop from the same native screen. They are editorial
  callouts, not extra application windows. No screenshot text is repainted.
- `output/manifest.json` maps each export to its localized capture.
- Preview sheets and HTML are review artifacts, not store uploads.

## Recapture

1. Run `npx tsx assets/store-screenshots/clawmuse/stage-zh.mts > /tmp/clawmuse-store-zh-stage.log`.
   Wait for `READY`. This creates a temporary git project and a scripted daemon
   on **7793**. It never restarts the main daemon on 6767.
2. Connect installed `com.clawmuse` simulators to `127.0.0.1:7793`. Set dark mode,
   9:41 status bar, and app language to Simplified Chinese. Select the Chinese
   task, and filter the iPad sidebar to the demo host to exclude other projects.
3. Capture `01-chat`, `02-tests` (phone only), `03-files`, and `04-diff` into
   `raw/zh-CN/iphone/` and `raw/zh-CN/ipad/`. Use the real Files/Changes panes;
   opening a phone source file displays its native sheet.
4. Run `npx tsx assets/store-screenshots/clawmuse/localize-demo.mts /tmp/clawmuse-store-zh-stage.log`.
   This translates only the temporary demo project, including the baseline diff.
   Switch app language to English and select **Packing progress and offline storage**.
   Capture the same scenes into `raw/en-US/<device>/`. The English verification
   scene shows the six-test summary; the Chinese scene includes the test log.
5. Use `xcrun simctl io <UDID> screenshot <path>` for native pixel density. The
   phone is portrait; the iPad is landscape. Wait for navigation and scrolls to
   finish before capture. AX `scroll top` can report success without moving the
   chat; inspect the image and use a physical downward swipe if needed.
6. Update capture provenance, render, and inspect both preview sheets plus a
   full-size image per device. The renderer checks headline/subline overflow.

Only stop the isolated process you launched after capturing. Do not stop other
simulators or daemons. Rendering does not upload to App Store Connect or submit
a release.
