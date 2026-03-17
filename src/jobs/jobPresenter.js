const { getPromptMetrics } = require("../utils/prompt");

function sanitizeProviderConfig(providerConfig = {}) {
  if (!providerConfig || typeof providerConfig !== "object") {
    return {};
  }

  const { kieApiKey, ...rest } = providerConfig;
  return rest;
}

function sanitizeDistribution(distribution) {
  if (!distribution || typeof distribution !== "object") {
    return distribution;
  }

  return {
    requestHash: distribution.requestHash || null,
    attemptedAt: distribution.attemptedAt || null,
    attemptCount: Number.parseInt(distribution.attemptCount, 10) || 1,
    results: Array.isArray(distribution.results)
      ? distribution.results.map((result) => ({
        platform: result.platform,
        mode: result.mode,
        status: result.status,
        externalId: result.externalId || null,
        error: result.error || null
      }))
      : []
  };
}

function getFailedStep(job) {
  if (job.status !== "failed") {
    return null;
  }

  if (!job.analysis) return "analysis";
  if (!job.script) return "script";
  if (!job.videoPrompt) return "prompt";
  if (!job.videoUrl) return "video";
  return "distribution";
}

function getDistributionState(job) {
  const results = job.distribution?.results || [];
  if (job.status === "distributing") return "running";
  if (results.length === 0) return job.videoUrl ? "waiting" : "waiting";
  if (results.every((result) => result.status === "success")) return "done";
  if (results.some((result) => result.status === "failed")) return "error";
  return "waiting";
}

function buildStepState(job) {
  const failedStep = getFailedStep(job);
  const narratedSegments = Array.isArray(job.segments) ? job.segments : [];
  const slides = Array.isArray(job.slides) ? job.slides : [];
  const hasNarratedPrompts = narratedSegments.some((segment) => String(segment.brollPrompt || "").trim());
  const hasNarratedVideos = narratedSegments.some((segment) => Boolean(segment.videoUrl));
  const allNarratedVideosReady = narratedSegments.length > 0 && narratedSegments.every((segment) => Boolean(segment.videoUrl));

  if (job.mode === "narrated") {
    return {
      analysis: job.analysis ? "done" : failedStep === "analysis" ? "error" : job.status === "analyzing" ? "running" : "waiting",
      script: job.script ? "done" : failedStep === "script" ? "error" : ["planning_narration", "generating_voice"].includes(job.status) ? "running" : "waiting",
      captions: job.captions ? "done" : job.status === "captioning" ? "running" : "waiting",
      prompt: hasNarratedPrompts ? "done" : failedStep === "prompt" ? "error" : job.status === "planning_broll" ? "running" : "waiting",
      video: job.videoUrl
        ? "done"
        : failedStep === "video"
          ? "error"
          : ["rendering_broll", "composing"].includes(job.status) || (hasNarratedVideos && !allNarratedVideosReady)
            ? "running"
            : allNarratedVideosReady
              ? "done"
              : "waiting",
      distribution: getDistributionState(job)
    };
  }

  if (job.mode === "slides") {
    const hasSlides = slides.length > 0;
    return {
      analysis: job.analysis ? "done" : failedStep === "analysis" ? "error" : job.status === "planning_slides" ? "running" : "waiting",
      script: hasSlides ? "done" : failedStep === "script" ? "error" : job.status === "planning_slides" ? "running" : "waiting",
      captions: job.captions ? "done" : "waiting",
      prompt: job.videoPrompt ? "done" : failedStep === "prompt" ? "error" : hasSlides ? "done" : "waiting",
      video: job.videoUrl
        ? "done"
        : failedStep === "video"
          ? "error"
          : job.status === "rendering_slides"
            ? "running"
            : hasSlides
              ? "waiting"
              : "waiting",
      distribution: getDistributionState(job)
    };
  }

  return {
    analysis: job.analysis ? "done" : failedStep === "analysis" ? "error" : job.status === "analyzing" ? "running" : "waiting",
    script: job.script ? "done" : failedStep === "script" ? "error" : job.status === "scripting" ? "running" : "waiting",
    captions: job.captions ? "done" : job.status === "captioning" ? "running" : "waiting",
    prompt: job.videoPrompt ? "done" : failedStep === "prompt" ? "error" : job.status === "prompting" ? "running" : "waiting",
    video: job.videoUrl ? "done" : failedStep === "video" ? "error" : ["awaiting_generation", "submitting", "polling"].includes(job.status) ? "running" : "waiting",
    distribution: getDistributionState(job)
  };
}

function decorateJob(job) {
  if (!job) {
    return null;
  }

  const {
    providerTaskId,
    providerConfig,
    distribution,
    ...publicJob
  } = job;

  return {
    ...publicJob,
    providerConfig: sanitizeProviderConfig(providerConfig),
    distribution: sanitizeDistribution(distribution),
    promptMetrics: getPromptMetrics(job.videoPrompt || ""),
    stepState: buildStepState(job),
    isTerminal: ["ready", "distributed", "failed"].includes(job.status),
    canRetry: job.mode === "single" && job.status === "failed"
  };
}

module.exports = {
  decorateJob
};
