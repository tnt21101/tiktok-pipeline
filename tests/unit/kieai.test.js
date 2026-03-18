const test = require("node:test");
const assert = require("node:assert/strict");
const { createKieService, normalizeGenerateResponse, normalizePollResponse } = require("../../src/services/kieai");
const {
  listGenerationProfiles,
  normalizeGenerationConfig,
  getGenerationProfile,
  buildGenerateRequest
} = require("../../src/generation/modelProfiles");
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

test("seedance duration falls back to the supported provider default", () => {
  const config = normalizeGenerationConfig({
    profileId: "seedance15pro",
    duration: "15"
  });

  assert.equal(config.duration, "8");
});

test("model profiles expose only the currently supported duration options in this app", () => {
  const profiles = listGenerationProfiles();
  const sora = profiles.find((profile) => profile.id === "sora2_image");
  const kling = profiles.find((profile) => profile.id === "kling30");
  const veoImage = profiles.find((profile) => profile.id === "veo31_image");
  const veoReference = profiles.find((profile) => profile.id === "veo31_reference");
  const seedance = profiles.find((profile) => profile.id === "seedance15pro");

  assert.deepEqual(sora.controls.duration.options, [
    { value: "10", label: "10 sec" },
    { value: "15", label: "15 sec" }
  ]);
  assert.deepEqual(kling.controls.duration.options, [
    { value: "10", label: "10 sec" },
    { value: "15", label: "15 sec" }
  ]);
  assert.deepEqual(veoImage.controls.duration.options, [{ value: "8", label: "8 sec" }]);
  assert.deepEqual(veoReference.controls.duration.options, [{ value: "8", label: "8 sec" }]);
  assert.deepEqual(seedance.controls.duration.options, [
    { value: "4", label: "4 sec" },
    { value: "8", label: "8 sec" },
    { value: "12", label: "12 sec" }
  ]);
  assert.equal(normalizeGenerationConfig({ profileId: "sora2_image", duration: "15" }).duration, "15");
  assert.equal(normalizeGenerationConfig({ profileId: "kling30", duration: "10", multiShots: true }).duration, "10");
  assert.equal(normalizeGenerationConfig({ profileId: "veo31_image", duration: "15" }).duration, "8");
  assert.equal(normalizeGenerationConfig({ profileId: "veo31_reference", duration: "10" }).duration, "8");
  assert.equal(normalizeGenerationConfig({ profileId: "seedance15pro", duration: "12" }).duration, "12");
});

test("kling 3 request enables std mode and sound while exposing multi-shot and elements features", () => {
  const profile = getGenerationProfile("kling30");
  const generationConfig = normalizeGenerationConfig({
    profileId: "kling30",
    duration: "15",
    multiShots: true,
    useElements: true,
    imageUrls: [
      "https://example.com/one.png",
      "https://example.com/two.png"
    ]
  });

  const requestSpec = buildGenerateRequest({
    profile,
    videoPrompt: "A baby-safe skincare routine in a warm bathroom setting.",
    generationConfig,
    imageUrls: generationConfig.imageUrls,
    baseCallbackUrl: "https://app.example.com"
  });

  assert.equal(requestSpec.payload.model, "kling-3.0/video");
  assert.equal(requestSpec.payload.input.mode, "std");
  assert.equal(requestSpec.payload.input.sound, true);
  assert.equal(requestSpec.payload.input.multi_shots, true);
  assert.equal(requestSpec.payload.input.duration, "15");
  assert.equal(Array.isArray(requestSpec.payload.input.multi_prompt), true);
  assert.equal(requestSpec.payload.input.multi_prompt.length, 2);
  assert.equal(Array.isArray(requestSpec.payload.input.kling_elements), true);
  assert.equal(requestSpec.payload.input.kling_elements[0].name, "element_subject");
});

test("kling elements require two reference images", () => {
  const profile = getGenerationProfile("kling30");
  const generationConfig = normalizeGenerationConfig({
    profileId: "kling30",
    duration: "10",
    useElements: true,
    imageUrls: ["https://example.com/one.png"]
  });

  assert.throws(() => buildGenerateRequest({
    profile,
    videoPrompt: "A cinematic skincare hero moment.",
    generationConfig,
    imageUrls: generationConfig.imageUrls,
    baseCallbackUrl: "https://app.example.com"
  }), /Kling elements need two uploaded JPG or PNG reference images/);
});

test("generateSpeech maps stored narrated voice ids to provider voice values", async () => {
  const requests = [];
  const kieService = createKieService({
    apiKey: "kie-test-key",
    baseCallbackUrl: "https://app.example.com",
    async request(url, options) {
      requests.push({
        url,
        payload: JSON.parse(options.body)
      });

      return {
        code: 200,
        msg: "success",
        data: {
          taskId: "speech-1"
        }
      };
    }
  });

  const result = await kieService.generateSpeech({
    text: "A short narration line.",
    voiceId: "rachel"
  });

  assert.equal(result.taskId, "speech-1");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].payload.input.voice, "Rachel");
});

test("generateVideo resolves the latest api key from a function", async () => {
  let currentApiKey = "kie-first";
  const requests = [];
  const kieService = createKieService({
    apiKey: () => currentApiKey,
    baseCallbackUrl: "https://app.example.com",
    async request(url, options) {
      requests.push({
        url,
        headers: options.headers
      });

      return {
        code: 200,
        msg: "success",
        data: {
          taskId: `task-${requests.length}`
        }
      };
    }
  });

  await kieService.generateVideo({
    videoPrompt: "A scroll-stopping skincare demo in warm window light.",
    imageUrl: "https://example.com/image.png",
    generationConfig: {
      profileId: "veo31_image"
    }
  });

  currentApiKey = "kie-second";

  await kieService.generateVideo({
    videoPrompt: "A second demo with a stronger transformation payoff.",
    imageUrl: "https://example.com/image.png",
    generationConfig: {
      profileId: "veo31_image"
    }
  });

  assert.equal(requests[0].headers.Authorization, "Bearer kie-first");
  assert.equal(requests[1].headers.Authorization, "Bearer kie-second");
});
