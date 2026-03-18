# Status

This is the TikTok Pipeline project in this workspace.

Use this directory for active development, testing, and deployment.

# TikTok Pipeline

TikTok Pipeline is a Node/Express app for turning one image into a short-form video workflow:

1. Analyze the image with Anthropic
2. Generate a script
3. Generate narrated voice-over with ElevenLabs when needed
4. Generate captions and hashtags
5. Build a Kie-ready video prompt
6. Submit video generation
7. Review and distribute to TikTok, Instagram Reels, and YouTube Shorts

The app now uses a SQLite-backed jobs store, background processing, normalized provider adapters, and a vanilla frontend that talks to job APIs instead of juggling the pipeline client-side.

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Required for full functionality:

- `ANTHROPIC_API_KEY`
- `KIEAI_API_KEY`
- `ELEVENLABS_API_KEY`
- `AYRSHARE_API_KEY`
- `FAL_KEY` for batch category compilation

Important runtime settings:

- `BASE_URL=http://localhost:3000`
- `DATABASE_PATH=./data/tiktok-pipeline.sqlite`
- `UPLOADS_DIR=./public/uploads`
- `OUTPUTS_DIR=./output`
- `JOB_POLL_INTERVAL_MS=5000`
- `GENERATION_TIMEOUT_MS=900000`
- `BASIC_AUTH_USER=` optional if you put the deployed service behind HTTP basic auth
- `BASIC_AUTH_PASSWORD=` optional companion password for that auth gate

## API highlights

- `POST /api/jobs`
- `GET /api/jobs/:jobId`
- `POST /api/jobs/:jobId/retry`
- `POST /api/jobs/:jobId/distribute`
- `POST /api/batch/compile` stitches finished batch clips into one final video per category
- `POST /api/generate` accepts `{ videoPrompt, imageUrl, kieApiKey? }`
- `GET /api/poll/:taskId` returns normalized `{ status, videoUrl?, error? }`

Legacy step routes (`/api/analyze`, `/api/script`, `/api/videoprompt`, `/api/captions`, `/api/distribute`) remain available for debugging and incremental integrations.

## Test commands

```bash
npm test
npm run test:unit
npm run test:api
npm run test:smoke
```

`test:smoke` uses Playwright and expects dependencies to be installed.

## Agent Command roles

When using the sibling `Agent Command` project as the implementation harness, use these fixed roles:

- `agent/1`: Pipeline Core
- `agent/2`: Frontend Workflow
- `agent/3`: Distribution
- `agent/4`: QA / Ops

The role handoff guide lives in [docs/agent-command.md](./docs/agent-command.md).

## Render deploy

A starter Render Blueprint is included in [render.yaml](./render.yaml).
The step-by-step deployment walkthrough lives in [docs/render-deploy.md](./docs/render-deploy.md).

Before promoting the service, set:

- `BASE_URL` to the actual public Render URL
- `DATABASE_PATH` to the mounted disk path
- `UPLOADS_DIR` to the mounted disk path
- `OUTPUTS_DIR` to the mounted disk path, for example `/var/data/output`
- optionally `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` if you are protecting the service with HTTP basic auth
- the five provider API keys

The app rejects localhost `BASE_URL` values in production to avoid broken upload URLs and provider callbacks.
