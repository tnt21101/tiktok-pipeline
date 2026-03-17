const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { createDatabase } = require("../../src/db/database");
const { createBrandRepository } = require("../../src/repositories/brandRepository");
const { createJobRepository } = require("../../src/repositories/jobRepository");
const { createJobManager } = require("../../src/jobs/jobManager");
const { waitFor } = require("../support/runtime-fixtures");

const silentLogger = {
  info() {},
  warn() {},
  error() {}
};

function createTempConfig(root) {
  return {
    databasePath: path.join(root, "data.sqlite"),
    uploadsDir: path.join(root, "uploads"),
    outputDir: path.join(root, "output")
  };
}

function createGenerationConfig() {
  return {
    profileId: "seedance15pro",
    label: "ByteDance Seedance 1.5 Pro"
  };
}

test("carryover queued generation jobs expire during runtime and stop blocking fresh work", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tiktok-pipeline-job-manager-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const db = createDatabase(createTempConfig(root), silentLogger);
  t.after(() => db.close());

  const brandRepository = createBrandRepository(db);
  const jobRepository = createJobRepository(db);

  const generatedPrompts = [];
  const kieService = {
    async generateVideo({ videoPrompt }) {
      generatedPrompts.push(videoPrompt);
      return {
        taskId: `task-${generatedPrompts.length}`,
        status: "success",
        videoUrl: `https://example.com/${generatedPrompts.length}.mp4`
      };
    },
    async pollStatus() {
      return {
        status: "generating",
        videoUrl: null,
        error: null
      };
    }
  };

  const manager = createJobManager({
    jobRepository,
    brandRepository,
    anthropicService: {},
    kieService,
    distributionService: {},
    logger: silentLogger,
    pollIntervalMs: 20,
    generationTimeoutMs: 120
  });
  t.after(() => manager.shutdown());

  const carryoverTimestamp = new Date(Date.now() - 80).toISOString();

  const carryoverQueued = jobRepository.create({
    brandId: "tnt",
    pipeline: "comedy",
    fields: { scenario: "Old queued clip" },
    sourceImageUrl: "https://example.com/queued.jpg",
    status: "awaiting_generation",
    analysis: "Old analysis",
    script: "Old script",
    videoPrompt: "carryover queued prompt",
    providerConfig: {
      generationConfig: createGenerationConfig()
    },
    startedAt: carryoverTimestamp
  });

  const activePolling = jobRepository.create({
    brandId: "tnt",
    pipeline: "comedy",
    fields: { scenario: "Old active clip" },
    sourceImageUrl: "https://example.com/polling.jpg",
    status: "polling",
    analysis: "Old analysis",
    script: "Old script",
    videoPrompt: "carryover polling prompt",
    providerTaskId: "task-stuck",
    providerConfig: {
      generationConfig: createGenerationConfig(),
      generationAttemptStartedAt: carryoverTimestamp
    },
    startedAt: carryoverTimestamp
  });

  db.prepare(`
    UPDATE jobs
    SET created_at = ?, updated_at = ?, started_at = ?
    WHERE id IN (?, ?)
  `).run(
    carryoverTimestamp,
    carryoverTimestamp,
    carryoverTimestamp,
    carryoverQueued.id,
    activePolling.id
  );

  manager.bootstrap();

  await new Promise((resolve) => setTimeout(resolve, 10));

  const freshJob = jobRepository.create({
    brandId: "tnt",
    pipeline: "comedy",
    fields: { scenario: "Fresh clip" },
    sourceImageUrl: "https://example.com/fresh.jpg",
    status: "awaiting_generation",
    analysis: "Fresh analysis",
    script: "Fresh script",
    videoPrompt: "fresh prompt",
    providerConfig: {
      generationConfig: createGenerationConfig()
    }
  });

  const failedQueued = await waitFor(() => {
    const job = jobRepository.getById(carryoverQueued.id);
    return job?.status === "failed" ? job : null;
  }, {
    timeoutMs: 1500,
    message: "Carryover queued job never expired."
  });

  const failedActive = await waitFor(() => {
    const job = jobRepository.getById(activePolling.id);
    return job?.status === "failed" ? job : null;
  }, {
    timeoutMs: 1500,
    message: "Carryover polling job never expired."
  });

  const readyFresh = await waitFor(() => {
    const job = jobRepository.getById(freshJob.id);
    return job?.status === "ready" ? job : null;
  }, {
    timeoutMs: 1500,
    message: "Fresh queued job never reached ready state."
  });

  assert.match(failedQueued.error, /timeout/i);
  assert.match(failedActive.error, /timeout/i);
  assert.deepEqual(generatedPrompts, ["fresh prompt"]);
  assert.equal(readyFresh.videoUrl, "https://example.com/1.mp4");
});
