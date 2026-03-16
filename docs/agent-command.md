# Agent Command Role Guide

Use the existing `Agent Command` dashboard with four fixed workstreams for this project:

## Agent 1: Pipeline Core

- Own `src/jobs`, `src/services/anthropic.js`, `src/services/kieai.js`, `src/repositories`, and `src/db`
- Focus on job orchestration, provider normalization, retries, and health

## Agent 2: Frontend Workflow

- Own `public/index.html`, `public/styles.css`, and `public/app.js`
- Focus on the single-run flow, batch queue UX, status polling, and distribution review

## Agent 3: Distribution

- Own `src/channels/ayrshare.js`, `src/services/distribute.js`, and channel-specific UX/API changes
- Focus on idempotent posting, per-platform mode mapping, and publish result normalization

## Agent 4: QA / Ops

- Own `tests/`, `README.md`, deployment config, and runtime verification
- Focus on mocks, smoke tests, health checks, logging, and deployment readiness

## Merge rules

- Run `npm test` before manual merges
- Run `npm run test:smoke` when UI or job orchestration changes
- Keep `render.yaml`, `.env.example`, and `README.md` in sync with any new runtime requirements
