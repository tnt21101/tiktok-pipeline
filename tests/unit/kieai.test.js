const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeGenerateResponse, normalizePollResponse } = require("../../src/services/kieai");
const { assertPromptWithinLimit, getPromptMetrics } = require("../../src/utils/prompt");

test("normalizeGenerateResponse supports nested provider payloads", () => {
  const result = normalizeGenerateResponse({
    data: {
      taskId: "task-123",
      status: "WAIT"
    }
  });

  assert.equal(result.taskId, "task-123");
  assert.equal(result.status, "queueing");
  assert.equal(result.videoUrl, null);
});

test("normalizePollResponse returns success when video url exists", () => {
  const result = normalizePollResponse({
    data: {
      status: "generating",
      video_url: "https://cdn.example.com/video.mp4"
    }
  });

  assert.equal(result.status, "success");
  assert.equal(result.videoUrl, "https://cdn.example.com/video.mp4");
});

test("prompt utilities flag near-limit and reject over-limit prompts", () => {
  const nearLimit = "x".repeat(1650);
  const metrics = getPromptMetrics(nearLimit);
  assert.equal(metrics.nearLimit, true);
  assert.equal(metrics.exceedsLimit, false);

  assert.throws(() => assertPromptWithinLimit("x".repeat(1900)), /1800 character limit/);
});
