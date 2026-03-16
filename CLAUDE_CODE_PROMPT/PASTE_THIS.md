# CLAUDE CODE — PASTE THIS AS YOUR FIRST MESSAGE

I've built a full TikTok video pipeline app. The entire codebase is in this folder.
Read every file before touching anything. Here's what exists:

## Files already built:
- server.js — Express server with all API routes
- src/services/anthropic.js — All Claude prompts (analyze, script, video prompt)
- src/services/kieai.js — kie.ai generate + poll
- src/brands.js — Brand registry (TNT Pro Series, Queen Helene, Prell)
- public/index.html — Full frontend (dark theme, sidebar nav, 4-step output panel)
- package.json — All dependencies listed
- .env.example — Env vars needed

## Your job:
1. Run `npm install`
2. Copy .env.example to .env and fill in:
   - ANTHROPIC_API_KEY=sk-ant-...
   - KIEAI_API_KEY=... (get new one from kie.ai dashboard — old one was compromised)
   - PORT=3000
   - BASE_URL=http://localhost:3000
3. Run `node server.js` and test it
4. Fix any bugs you find — especially:
   - The kie.ai response shape (taskId field name may differ — check their actual API response and adapt server.js)
   - The poll endpoint response shape (status field name, videoUrl field name)
   - CORS or multer issues
   - Any route that returns unexpected data

## How the app works:
1. User picks brand (TNT, Queen Helene, Prell, or adds new one)
2. User picks pipeline (Education / Comedy / Product)
3. User uploads image (person for edu/comedy, product for product pipeline)
4. Image uploads immediately to /public/uploads/ and returns a public URL
5. User fills optional fields (topic, format, etc.) and clicks "Run pipeline"
6. Step 1: POST /api/analyze — Claude analyzes the image via vision API
7. Step 2: POST /api/script — Claude writes the TikTok script
8. Step 3: POST /api/videoprompt — Claude writes the kie.ai video prompt
9. User clicks "Send to kie.ai" — POST /api/generate — submits to kie.ai
10. Frontend polls GET /api/poll/:taskId every 5 seconds until video is ready
11. Video preview shown inline

## Key things to verify:
- kie.ai endpoint: POST https://api.kie.ai/api/v1/runway/generate
- kie.ai poll: GET https://api.kie.ai/api/v1/runway/record-detail?taskId=xxx
- kie.ai auth: Authorization: Bearer {key}
- kie.ai requires a public imageUrl (not base64) — already handled
- kie.ai response is async — taskId comes back immediately, poll for status
- Poll statuses: wait, queueing, generating, success, fail

## After it works, add these improvements:
1. Loading spinner on the upload zone while image is uploading
2. Retry button on each failed step (re-run just that step forward)
3. Character count warning when video prompt > 1600 chars (approaching 1800 limit)
4. Toast notification when video is ready
5. Persist added brands to a local JSON file so they survive server restarts

Do not rewrite the whole app. Fix and extend what's there.
