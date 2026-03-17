# Audit Report

Date: 2026-03-16 (local) / 2026-03-17 (command logs)
Scope: Narrated Video mode, narrated template system, B-roll planning/rendering flow, Remotion composition engine, frontend/backend/API integration, and related tests.

## Executive Summary

The narrated stack is materially better than it was at the start of the audit, but it is **not production ready yet**.

What is now verified:
- Narrated draft creation, voice generation, B-roll prompt planning, B-roll rendering, and narrated compose all pass automated API coverage.
- The browser smoke path passes, including the dashboard narrated flow and batch workflow.
- Remotion now renders a real narrated MP4 end to end. A live audit render succeeded and wrote `/Users/timtierney/Desktop/Video Automation App/tiktok-pipeline/output/narrated-audit-remotion-49f4a875-5992-4351-b7f5-54aa03b4fbfc.mp4` (4.1 MB).
- The dashboard now exposes an explicit `Single clip / Storyboard / Narrated` mode selector instead of the incomplete two-mode UI.

What still keeps this out of production:
- The current runtime is still configured with a localhost `BASE_URL`, so provider callbacks and public asset URLs are local-only.
- `FAL_KEY` is not configured in the current environment, so batch compile stitching is degraded locally.
- Most provider-facing test coverage is stubbed. The app logic is verified, but live Anthropic/Kie/Ayrshare provider behavior is not fully production-proven in this audit environment.

Final verdict: **needs work before production**

## Phase Results

### Phase 1 — Inventory

Checked:
- `git status --short`
- `git status --porcelain=1 -uall`
- explicit size/existence sweep for every changed file
- syntax checks on changed JavaScript files

Broken:
- The repo root kept picking up a stray `.DS_Store` file, which polluted the inventory.

Fixes:
- Added `.DS_Store` to [`.gitignore`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/.gitignore).
- Removed the stray `.DS_Store`.

Verified:
- Every changed file exists.
- Every changed file is non-empty.
- `node --check` passed on the changed JavaScript files.
- `npx tsc --noEmit` passed.

### Phase 2 — Dependency Check

Checked:
- `npm install`
- module loading for the runtime/app services
- TypeScript/Remotion dependency surface from `package.json`

Broken:
- No install-time dependency failures were found in the final audited state.

Fixes:
- None required in this phase beyond the already-added Remotion dependency set and lockfile updates.

Verified:
- `npm install` completed without dependency errors.
- `package.json` and `package-lock.json` are consistent.
- `npx tsc --noEmit` passed.

### Phase 3 — Server Startup

Checked:
- app start command and startup logs
- Remotion studio startup
- live Remotion render path

Broken:
- A stale process on port `3002` had to be replaced with a clean server start.
- Remotion studio failed inside the sandbox with `listen EPERM` on `0.0.0.0`; this was a sandbox bind restriction, not an app defect.
- The Remotion preview defaults pointed at stale `cdn.remotion.dev` assets that now return `404`, which would break the default preview composition.
- The Remotion render service had previously needed browser web-security relaxation to handle remote media correctly.

Fixes:
- Restarted the app server cleanly on port `3002`.
- Re-ran Remotion studio outside the sandbox and confirmed it launched.
- Updated [remotion/types.ts](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/types.ts) so the default preview uses reachable sample media instead of dead CDN URLs.
- Kept the earlier Remotion Chromium fix in [src/services/remotion.js](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/src/services/remotion.js) that disables browser web security for provider-hosted remote assets.

Verified:
- `PORT=3002 BASE_URL=http://127.0.0.1:3002 npm start` started successfully.
- `npm run remotion:studio -- --port 3133` launched successfully outside the sandbox.
- A live Remotion render succeeded with remote audio and video media and produced a real MP4.

### Phase 4 — Route-by-Route Verification

Status: **verified with automated evidence**

| Route | Status | Evidence | Notes |
| --- | --- | --- | --- |
| `GET /api/brands` | Verified | API tests, smoke test | Returns brand array with product catalogs. |
| `GET /api/models` | Verified | API tests, smoke test | Returns `{models, profiles}` for compatibility, not a bare array. |
| `POST /api/upload` | Verified | API tests, smoke test | Accepts image upload and returns `imageUrl`. |
| `POST /api/analyze` | Verified | API tests | Validates `imageUrl` + `pipeline`. |
| `POST /api/script` | Verified | API tests | Accepts `analysis`, `pipeline`, `brandId`, `fields`. |
| `POST /api/videoprompt` | Verified | API tests | Accepts `analysis`, `script`, `pipeline`, `brandId`. |
| `POST /api/generate` | Verified | API tests | Supports compatibility `model` / `modelDefaults` via normalization. |
| `GET /api/poll/:taskId` | Verified | API tests | Returns `status`, `videoUrl`, `error`. |
| `POST /api/narration/script` | Verified | API tests | Returns segmented narration plan. |
| `POST /api/narration/voice` | Verified | API tests | Uses ElevenLabs-compatible wrapper over Kie speech generation. |
| `POST /api/narration/broll-prompts` | Verified | API tests | Returns prompt list aligned to narration segments. |
| `POST /api/scenes/generate` | Verified | API tests | Returns scene breakdown. |
| `POST /api/stitch` | Verified | API tests | Merges multiple clips or passes through a single clip. |
| `POST /api/render-narrated` | Verified | API tests plus live Remotion render service check | Supports direct render payload and `jobId` path. |
| `POST /api/captions` | Verified | API tests | Returns platform-specific caption payloads. |
| `POST /api/distribute` | Verified | New API test added in this audit | Direct distribution route works independently of job-based distribution. |

Broken:
- No route was missing in the final audited state.
- One route-health inconsistency existed: `/api/health` was still reporting `ffmpegAvailable` as if the narrated renderer were ffmpeg-backed.

Fixes:
- Updated [src/app.js](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/src/app.js) so health reports `narratedRenderEngine: "remotion"` honestly and sets `ffmpegAvailable: false`.
- Added direct route coverage for `/api/distribute` and health assertions in [tests/api/app.test.js](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/tests/api/app.test.js).

### Phase 5 — Frontend / Backend Alignment

Checked:
- `public/index.html`
- `public/app.js`
- frontend `fetch()` usage
- narrated/template controls
- model selector loading
- pipeline-specific field visibility
- narrated status flow

Broken:
- The dashboard still exposed a two-button `Standard / Narrated` selector even though the app behavior and audit criteria required explicit `Single clip / Storyboard / Narrated` mode handling.
- Storyboard behavior was driven implicitly by clip count instead of a first-class UI state.

Fixes:
- Updated [public/index.html](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/public/index.html) to add explicit `Single clip`, `Storyboard`, and `Narrated` buttons.
- Updated [public/app.js](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/public/app.js) so:
  - storyboard is a first-class creation mode
  - single clip mode forces `1` clip
  - storyboard mode forces `2+` clips
  - narrated mode hides storyboard controls
  - loaded jobs restore the correct mode based on `job.mode` and `sequenceCount`
  - run button labels and status copy match the selected mode
- Extended smoke coverage in [tests/smoke/browser-smoke.js](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/tests/smoke/browser-smoke.js) to exercise the storyboard toggle before continuing through the narrated flow.

Verified:
- `npm run test:smoke` passed after the UI fix.
- The smoke test now explicitly checks storyboard visibility and mode switching before running narrated generation.

### Phase 6 — Remotion Integrity

Checked:
- `remotion/` file tree
- composition root, metadata calculation, schema, and composition props
- backend `buildCompositionConfig()`
- transition and caption logic
- live Remotion render

Broken:
- Default preview media URLs in [remotion/types.ts](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/types.ts) were dead.
- Earlier in the audit, remote media rendering needed Chromium web-security relaxation.

Fixes:
- Updated default preview media URLs in [remotion/types.ts](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/types.ts).
- Kept the remote-media fix in [src/services/remotion.js](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/src/services/remotion.js).

Verified:
- `remotion/` contains all required composition files.
- Zod schema matches backend composition output shape.
- `calculateMetadata` is wired via [remotion/Root.tsx](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/Root.tsx).
- Live render succeeded and generated `/Users/timtierney/Desktop/Video Automation App/tiktok-pipeline/output/narrated-audit-remotion-49f4a875-5992-4351-b7f5-54aa03b4fbfc.mp4`.

### Phase 7 — Integration Coherence

Checked:
- shared brand context
- shared generation model loading
- shared upload flow
- Kie routing for video and speech
- brand persistence across restart

Broken:
- The audit prompt referenced `brands.json` persistence, but the real app uses SQLite repositories, not a JSON file.

Fixes:
- No architectural reversal was made. The repo’s database-backed design is the correct source of truth.
- Added restart persistence verification in [tests/api/app.test.js](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/tests/api/app.test.js) and support in [tests/support/runtime-fixtures.js](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/tests/support/runtime-fixtures.js).

Verified:
- Brand data persists across runtime restart in SQLite.
- `/api/models` drives the dashboard model selector.
- `/api/upload` is shared across single, narrated, and batch flows.
- The ElevenLabs compatibility layer in [src/services/elevenlabs.js](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/src/services/elevenlabs.js) correctly routes TTS calls into Kie’s unified speech endpoints.

### Phase 8 — Fix and Document

Completed:
- Added concise comments only where they clarify non-obvious behavior.
- Wrote this report.

## Files Created or Modified

### Root / Config
- [`.gitignore`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/.gitignore) — now ignores `.DS_Store` so Finder metadata stops polluting the repo.
- [`package.json`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/package.json) — Remotion, React, TypeScript, and script wiring.
- [`package-lock.json`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/package-lock.json) — dependency lockfile updates for the new runtime/tooling.
- [`tsconfig.json`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/tsconfig.json) — TypeScript config for the Remotion code.

### Frontend
- [`public/index.html`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/public/index.html) — dashboard controls for narrated mode, template selection, storyboard mode, and segment actions.
- [`public/app.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/public/app.js) — dashboard state, narrated workflow UI, mode handling, fetch calls, and step progression.
- [`public/styles.css`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/public/styles.css) — styling for narrated UI, segment cards, template panels, and dashboard controls.

### Backend App / Runtime
- [`src/app.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/src/app.js) — route registration, compatibility endpoints, health output, and narrated render endpoints.
- [`src/runtime.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/src/runtime.js) — service wiring for narrated workflow, Remotion, ElevenLabs compatibility, and repositories.
- [`src/db/database.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/src/db/database.js) — schema/migrations for narrated jobs and segment persistence.

### Jobs / Repositories
- [`src/jobs/jobManager.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/src/jobs/jobManager.js) — shared job pipeline behavior, retries, queue handling, and distribution integration.
- [`src/jobs/jobPresenter.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/src/jobs/jobPresenter.js) — normalized job payloads for frontend history/status rendering.
- [`src/repositories/jobRepository.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/src/repositories/jobRepository.js) — parent job persistence including narrated metadata.
- [`src/repositories/jobSegmentRepository.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/src/repositories/jobSegmentRepository.js) — per-segment narration, audio, B-roll, and error persistence.

### Narrated / Prompting / Services
- [`src/narrated/templates.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/src/narrated/templates.js) — narrated template registry, defaults, prompt context, and brand/platform adaptation.
- [`src/prompts/framework.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/src/prompts/framework.js) — prompt framework helpers and guidance blocks used across generation flows.
- [`src/services/anthropic.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/src/services/anthropic.js) — script, caption, narrated plan, and B-roll prompt generation logic.
- [`src/services/kieai.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/src/services/kieai.js) — normalized Kie video and speech request/poll handling.
- [`src/services/elevenlabs.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/src/services/elevenlabs.js) — compatibility wrapper that maps ElevenLabs-style voice generation into Kie speech tasks.
- [`src/services/narratedWorkflow.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/src/services/narratedWorkflow.js) — narrated draft, voice, B-roll, compose, and status orchestration.
- [`src/services/narratedCompose.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/src/services/narratedCompose.js) — narrated compose entry point delegating to Remotion.
- [`src/services/remotion.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/src/services/remotion.js) — bundle/select/render service and composition config builder.
- [`src/channels/ayrshare.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/src/channels/ayrshare.js) — distribution channel updates for current job output behavior.

### Remotion Project
- [`remotion/index.ts`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/index.ts) — Remotion entry point.
- [`remotion/Root.tsx`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/Root.tsx) — root composition registration with dynamic metadata.
- [`remotion/types.ts`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/types.ts) — Zod schemas, default props, and metadata calculation.
- [`remotion/styles/fonts.ts`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/styles/fonts.ts) — Remotion font/style helpers.
- [`remotion/compositions/NarratedVideo.tsx`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/compositions/NarratedVideo.tsx) — master narrated composition.
- [`remotion/compositions/elements/AnimatedCaption.tsx`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/compositions/elements/AnimatedCaption.tsx) — word-by-word captions.
- [`remotion/compositions/elements/BrandLowerThird.tsx`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/compositions/elements/BrandLowerThird.tsx) — lower-third overlay.
- [`remotion/compositions/elements/EndCard.tsx`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/compositions/elements/EndCard.tsx) — end-card CTA panel.
- [`remotion/compositions/elements/ProgressBar.tsx`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/compositions/elements/ProgressBar.tsx) — progress treatment.
- [`remotion/compositions/elements/SegmentLabel.tsx`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/compositions/elements/SegmentLabel.tsx) — segment/beat label overlay.
- [`remotion/compositions/templates/BaseTemplateScene.tsx`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/compositions/templates/BaseTemplateScene.tsx) — base visual scene wrapper.
- [`remotion/compositions/templates/ProblemSolution.tsx`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/compositions/templates/ProblemSolution.tsx) — problem/solution template scene.
- [`remotion/compositions/templates/Listicle.tsx`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/compositions/templates/Listicle.tsx) — listicle template scene.
- [`remotion/compositions/templates/MythVsFact.tsx`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/compositions/templates/MythVsFact.tsx) — myth-vs-fact template scene.
- [`remotion/compositions/templates/BrandStory.tsx`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/compositions/templates/BrandStory.tsx) — storytelling template scene.
- [`remotion/compositions/templates/BeforeAfter.tsx`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/compositions/templates/BeforeAfter.tsx) — before/after template scene.
- [`remotion/compositions/templates/QuickExplainer.tsx`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/compositions/templates/QuickExplainer.tsx) — explainer template scene.
- [`remotion/compositions/templates/IngredientSpot.tsx`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/remotion/compositions/templates/IngredientSpot.tsx) — ingredient spotlight template scene.

### Tests
- [`tests/api/app.test.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/tests/api/app.test.js) — API coverage for narrated flow, compatibility routes, direct distribute, health, and restart persistence.
- [`tests/smoke/browser-smoke.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/tests/smoke/browser-smoke.js) — browser smoke flow covering storyboard toggle, narrated generation path, and batch flow.
- [`tests/support/runtime-fixtures.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/tests/support/runtime-fixtures.js) — reusable test runtime bootstrap with restart-safe root support.
- [`tests/unit/narratedTemplates.test.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/tests/unit/narratedTemplates.test.js) — narrated template unit coverage.
- [`tests/unit/prompt-framework.test.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/tests/unit/prompt-framework.test.js) — prompt framework unit coverage.
- [`tests/unit/remotionService.test.js`](/Users/timtierney/Desktop/Video%20Automation%20App/tiktok-pipeline/tests/unit/remotionService.test.js) — Remotion composition config unit coverage.

## Bugs Found and Fix Summary

1. The dashboard only exposed `Standard / Narrated`, not the required `Single clip / Storyboard / Narrated`.
   Fix: Added a real three-mode selector and synchronized it with clip-count behavior and loaded job state.

2. Storyboard mode was implicit, fragile, and not restored when loading saved sequence jobs.
   Fix: Restored `storyboard` state from `sequenceCount`, forced clip-count rules by mode, and updated status/button copy.

3. `/api/health` still implied ffmpeg-backed narrated rendering even though the compose engine is now Remotion.
   Fix: Health now reports `narratedRenderEngine: "remotion"` and `ffmpegAvailable: false`.

4. Remotion preview default props referenced stale media URLs that now 404.
   Fix: Replaced them with reachable sample audio/video assets.

5. The repo was not ignoring `.DS_Store`, so Finder metadata kept reappearing as fake app changes.
   Fix: Added `.DS_Store` to `.gitignore` and removed the artifact.

6. Direct `/api/distribute` and restart persistence were under-verified.
   Fix: Added API tests for direct distribution and SQLite-backed brand persistence across restart.

7. Remotion studio failed under sandbox-only bind restrictions.
   Fix: Verified studio outside the sandbox; no application code change was needed for that specific error.

## Spec Items Not Yet Implemented

- There is no `brands.json` persistence layer because this repo uses SQLite repositories instead. Restart persistence is implemented and verified, but the exact `brands.json` wording in the audit prompt does not match the real architecture.
- Production deployment configuration is not complete in this local environment:
  - `BASE_URL` is local-only.
  - `FAL_KEY` is missing.

## Known Issues / Risks / TODOs

- Live provider integrations are not comprehensively validated in this audit environment. The test suite uses stubs for Anthropic, Kie, FAL, and Ayrshare.
- Remotion renders now succeed with valid remote media, but the app still depends on provider-returned media URLs being reachable and decodable at render time.
- The current environment warnings are real:
  - localhost `BASE_URL` means upload URLs and callbacks are only valid locally
  - missing `FAL_KEY` disables batch category compilation

## Exact Commands

Install:

```bash
cd "/Users/timtierney/Desktop/Video Automation App/tiktok-pipeline"
npm install
```

Start the app:

```bash
cd "/Users/timtierney/Desktop/Video Automation App/tiktok-pipeline"
PORT=3002 BASE_URL=http://127.0.0.1:3002 npm start
```

Ensure Remotion browser dependencies:

```bash
cd "/Users/timtierney/Desktop/Video Automation App/tiktok-pipeline"
npm run remotion:browser:ensure
```

Open Remotion studio:

```bash
cd "/Users/timtierney/Desktop/Video Automation App/tiktok-pipeline"
npm run remotion:studio -- --port 3133
```

Run a direct narrated render through the API:

```bash
curl -X POST http://127.0.0.1:3002/api/render-narrated \
  -H 'Content-Type: application/json' \
  -d '{
    "brandId": "tnt",
    "pipeline": "edu",
    "imageUrl": "https://download.samplelib.com/mp4/sample-5s.mp4",
    "fields": {
      "templateId": "problem_solution_result",
      "platformPreset": "tiktok"
    },
    "segments": [
      {
        "segmentIndex": 1,
        "text": "Audit render segment one",
        "visualIntent": "Open with motion",
        "estimatedSeconds": 3.2,
        "audioUrl": "https://download.samplelib.com/mp3/sample-3s.mp3",
        "videoUrl": "https://download.samplelib.com/mp4/sample-5s.mp4"
      }
    ]
  }'
```

Run automated checks:

```bash
cd "/Users/timtierney/Desktop/Video Automation App/tiktok-pipeline"
npx tsc --noEmit
npm test
npm run test:smoke
```

## Final Production-Readiness Assessment

Assessment: **needs work before production**

Reason:
- The codebase is much healthier and the narrated/Remotion stack is now coherently wired.
- The local environment is still not production-configured.
- Provider behavior is only partially validated live.
- The feature set is strong enough for continued development and internal testing, but not strong enough for a production deployment sign-off.
