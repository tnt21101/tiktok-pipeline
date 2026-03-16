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

test("normalizeGenerateResponse supports market task payloads", () => {
  const result = normalizeGenerateResponse({
    code: 200,
    msg: "success",
    data: {
      taskId: "market-task-1"
    }
  });

  assert.equal(result.taskId, "market-task-1");
  assert.equal(result.status, "queueing");
});

test("normalizeGenerateResponse surfaces provider-level api errors", () => {
  assert.throws(() => normalizeGenerateResponse({
    code: 422,
    msg: "n_frames is invalid",
    data: null
  }), /n_frames is invalid/);
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

test("normalizePollResponse supports videoInfo payloads", () => {
  const result = normalizePollResponse({
    code: 200,
    msg: "success",
    data: {
      state: "success",
      videoInfo: {
        videoUrl: "https://cdn.example.com/video-info.mp4"
      }
    }
  });

  assert.equal(result.status, "success");
  assert.equal(result.videoUrl, "https://cdn.example.com/video-info.mp4");
});

test("normalizePollResponse supports market resultJson payloads", () => {
  const result = normalizePollResponse({
    code: 200,
    msg: "success",
    data: {
      state: "success",
      resultJson: "{\"resultUrls\":[\"https://cdn.example.com/sora-market.mp4\"]}"
    }
  });

  assert.equal(result.status, "success");
  assert.equal(result.videoUrl, "https://cdn.example.com/sora-market.mp4");
});

test("prompt utilities flag near-limit and reject over-limit prompts", () => {
  const nearLimit = "x".repeat(1650);
  const metrics = getPromptMetrics(nearLimit);
  assert.equal(metrics.nearLimit, true);
  assert.equal(metrics.exceedsLimit, false);

  assert.throws(() => assertPromptWithinLimit("x".repeat(1900)), /1800 character limit/);
});
