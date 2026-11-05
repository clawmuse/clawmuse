# Paseo website

## ClawMuse edition

`clawmuse/` builds the independent ClawMuse site. Its ten locales, routes and
prerendered output are separate from the Paseo site described in
[website translations](../../docs/website-i18n.md). Run
`npm run dev:clawmuse --workspace=@getpaseo/website` for local development and
`npm run build:clawmuse --workspace=@getpaseo/website` for the static artifact.

Keep the product tour local: preset conversations, terminal output, page previews,
diffs and quota data. Do not connect a host or request microphone access. The hero
and full walkthrough share the same device UI. Check the current compact header,
composer and theme tokens before changing it. The model flow is owned by
[`CompactModelSheet`](../app/src/composer/agent-controls/model-sheet.tsx), row geometry
by [`AgentControlTrigger`](../app/src/composer/agent-controls/control.tsx), transcript
by [`message.tsx`](../app/src/components/message.tsx), and the voice surface by
[`RealtimeVoiceOverlay`](../app/src/components/realtime-voice-overlay.tsx). Capture
these components with the isolated app browser fixtures when checking visual changes.
`npm run demo:sync --workspace=@getpaseo/website` extracts the app's UI labels; the
ClawMuse build runs it automatically. Keep the checked-in subset current. Model
catalogues remain example data, while permission modes come from the protocol manifest.
Native glass, audio quality and connection timing cannot be established by this web demo.

The phone uses a fixed 440 × 956 logical canvas, derived from the iPhone 18 Pro Max
[1320 × 2868 display](https://www.apple.com.cn/iphone-18-pro/specs/) at 3×. Scale the
whole frame on narrower pages; do not independently shrink fonts or reflow its UI.
The embedded browser is a desktop feature, so that chapter changes device views.

One clock advances the walkthrough and simulated work while the device is visible
and the document is foregrounded. Feature tabs jump to the selected chapter without
clearing work or leaving playback. Device tabs preserve playback and the chosen
desktop view; the Linux setup view waits until the visitor returns to a device.
Ordinary controls remain interactive. Give their results time to show before the
next scripted step, and keep a model sheet open while the visitor uses it. Only
editing a task or starting dictation gives the visitor ownership of its draft.
Pause freezes progress; replay starts fresh. Reset clears work and stays manual.
Respect reduced-motion preferences by waiting for explicit play.

Verify product claims against their owning source. Regional selection follows
[account connections](../../docs/clawmuse-accounts.md#regional-relays), streaming
follows [agent stream performance](../../docs/agent-stream-performance.md), and
[Status](../../docs/clawmuse-status.md) and [Goals](../../docs/clawmuse-goals.md)
retain their setup requirements. Never turn illustrative usage or animation
timing into performance measurements. Update all ten translation files together.

The learning hub and six editorial guides are published in English and Simplified
Chinese. Keep `editorial-en.ts` and `editorial-zh.ts` paired, including section
anchors and source links. These routes deliberately have only two language
alternates; do not publish untranslated copies under the other locale URLs.
`prerender.tsx` owns their metadata, visible-content structured data, sitemap and
RSS feeds. Public citations must be accessible without repository access; keep
private implementation evidence in this repository, not in reader-facing links.
Change the editorial date when the facts or article content change,
not on every build. Compare current official provider documentation before
updating comparison claims. Local agent execution is not local model inference.

Browser coverage lives in `e2e/clawmuse-i18n.spec.ts`: the complete automatic tour,
pause/replay, takeover, visibility, device continuity, dictation, permissions,
model selection, terminal commands, browser navigation, Goals, Status, keyboard
controls, compact layouts and localized prerendering. Run this spec through `test:e2e`,
using `WEBSITE_TEST_URL` and `CLAWMUSE_TEST_URL` to reuse a local **built preview**.

## Plugin install counts

Clients report an install by resolving a plugin with `X-Paseo-Install: 1` or
`?intent=install`, using `/api/plugins/resolve/<owner>/<slug>` or
`/plugins/<owner>/<slug>.json`. Ordinary resolves do not count. These numbers
measure install intent, not successful artifact installation or npm downloads.

The worker requires Cloudflare's `CF-Connecting-IP` header to count a report.
It stores the plugin ID plus a SHA-256 hash of the IP in a `WEBSITE_CACHE` KV key
with a one hour TTL, never the raw IP. An existing key skips the count; repeats
do not extend the hour. Missing or empty IP headers do not count.

Accepted reports increment the existing all-time total and UTC daily buckets in
`WEBSITE_CACHE`. Daily buckets retain 60 days and supply the website's seven-day
and thirty-day rankings. `/api/plugins/installs` still returns plugin IDs mapped
to all-time totals. The [registry build](https://github.com/getpaseo/plugins/blob/main/scripts/build.ts)
reads that endpoint into the published plugin details and index; the website
reads windowed counts from KV through its five-minute cache. Existing counts
remain intact. The KV guard is advisory: concurrent requests and KV propagation
are not serialized.
