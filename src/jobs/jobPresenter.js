const { getPromptMetrics } = require("../utils/prompt");

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

  return {
    ...job,
    promptMetrics: getPromptMetrics(job.videoPrompt || ""),
    stepState: buildStepState(job),
    isTerminal: ["ready", "distributed", "failed"].includes(job.status),
    canRetry: job.status === "failed"
  };
}

module.exports = {
  decorateJob
};
