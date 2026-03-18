# Render Deploy Guide

## Before you push

Make sure the repo does not include local-only files:

- `.env`
- `node_modules/`
- `data/`
- `output/`
- `.agent-worktrees/`

This project is already configured to ignore those paths.

## Push to GitHub

1. Create a new GitHub repository.
2. In the project folder, add the remote:

```bash
git remote add origin <your-github-repo-url>
```

3. Push the branch:

```bash
git push -u origin main
```

## Create the Render service

1. In Render, choose `New +`.
2. Select `Blueprint`.
3. Connect the GitHub repository.
4. Choose the repo and deploy from `render.yaml`.

## Required environment variables

Set these in Render before promoting the service:

- `BASE_URL=https://<your-render-service>.onrender.com`
- `DATABASE_PATH=/var/data/tiktok-pipeline.sqlite`
- `UPLOADS_DIR=/var/data/uploads`
- `OUTPUTS_DIR=/var/data/output`
- `JOB_POLL_INTERVAL_MS=5000`
- `GENERATION_TIMEOUT_MS=900000`
- `ANTHROPIC_API_KEY=<set in dashboard>`
- `KIEAI_API_KEY=<set in dashboard>`
- `ELEVENLABS_API_KEY=<set in dashboard>`
- `AYRSHARE_API_KEY=<set in dashboard>`
- `FAL_KEY=<set in dashboard>`

Optional:

- `BASIC_AUTH_USER=<set if you want HTTP basic auth in front of the public service>`
- `BASIC_AUTH_PASSWORD=<set if you want HTTP basic auth in front of the public service>`

## Verify after deploy

1. Open `/api/health`.
2. Confirm `baseUrlIsPublic` is `true`.
3. Confirm Anthropic, Kie, ElevenLabs, Ayrshare, and FAL report configured.
4. Upload an image in the UI and run one job.
5. Confirm the job reaches `ready`.
6. Test distribution in draft/private mode before live posting.

## Important note

Localhost uploads work only on your machine. In production, the app must use the public Render URL in `BASE_URL` so Kie can fetch uploaded images and provider callbacks can reach the app.
