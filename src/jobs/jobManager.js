const { AppError } = require("../utils/errors");
const { createEmptyCaptions } = require("../services/anthropic");
const { decorateJob } = require("./jobPresenter");
const { normalizeGenerationConfig } = require("../generation/modelProfiles");

function createJobManager(options) {
  const jobRepository = options.jobRepository;
  const brandRepository = options.brandRepository;
  const anthropicService = options.anthropicService;
  const kieService = options.kieService;
  const distributionService = options.distributionService;
  const logger = options.logger || { info() {}, warn() {}, error() {} };
  const pollIntervalMs = options.pollIntervalMs || 5000;
  const generationTimeoutMs = options.generationTimeoutMs || 30 * 60 * 1000;
  const bootStartedAtMs = Date.now();

  let processingQueuedJobs = false;
  let activeGenerationJobId = null;
  let pollTimer = null;

  function toPublic(job) {
    return decorateJob(job);
  }

  function setImmediateSafe(task) {
    setImmediate(() => {
      Promise.resolve(task()).catch((error) => {
        logger.error("job_manager_async_error", { message: error.message });
      });
    });
  }

  function failJob(jobId, error) {
    const current = jobRepository.getById(jobId);
    if (!current) {
      return null;
    }

    if (activeGenerationJobId === jobId) {
      activeGenerationJobId = null;
    }

    logger.error("job_failed", {
      jobId,
      status: current.status,
      message: error.message
    });

    return toPublic(jobRepository.update(jobId, {
      status: "failed",
      error: error.message
    }));
  }

  function sumEstimatedCosts(...values) {
    const numeric = values.filter((value) => typeof value === "number" && Number.isFinite(value));
    if (numeric.length === 0) {
      return null;
    }

    return Number(numeric.reduce((total, value) => total + value, 0).toFixed(3));
  }

  function parseTimestamp(value) {
    if (!value) {
      return null;
    }

    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function getGenerationAttemptStartedAt(job) {
    return parseTimestamp(job.providerConfig?.generationAttemptStartedAt)
      || parseTimestamp(job.startedAt)
      || parseTimestamp(job.createdAt);
  }

  function getGenerationAttemptAgeMs(job, now = Date.now()) {
    const startedAt = getGenerationAttemptStartedAt(job);
    if (!startedAt) {
      return 0;
    }

    return Math.max(0, now - startedAt);
  }

  function isCarryoverGenerationJob(job) {
    const lastTouchedAt = parseTimestamp(job?.updatedAt)
      || parseTimestamp(job?.createdAt)
      || 0;
    return lastTouchedAt > 0 && lastTouchedAt < bootStartedAtMs;
  }

  function isGenerationStale(job, options = {}) {
    const now = options.now || Date.now();
    const includeQueued = Boolean(options.includeQueued);
    const allowedStatuses = includeQueued
      ? ["awaiting_generation", "submitting", "polling"]
      : ["submitting", "polling"];
    if (!job || !allowedStatuses.includes(job.status)) {
      return false;
    }

    return getGenerationAttemptAgeMs(job, now) >= generationTimeoutMs;
  }

  function buildGenerationTimeoutError(job) {
    const ageMinutes = Math.max(1, Math.round(getGenerationAttemptAgeMs(job) / 60000));
    const profileLabel = job.providerConfig?.generationConfig?.label || "generation model";
    const phase = job.status === "polling" ? "provider polling" : job.status === "submitting" ? "submission" : "queue wait";
    return new AppError(504, `${profileLabel} exceeded the ${ageMinutes}-minute ${phase} timeout. Retry to resubmit this video.`, {
      code: "generation_timeout"
    });
  }

  function clearGenerationAttemptState(providerConfig = {}) {
    const nextProviderConfig = { ...(providerConfig || {}) };
    delete nextProviderConfig.generationAttemptStartedAt;
    return nextProviderConfig;
  }

  function expireStaleGenerationJob(job, options = {}) {
    if (!isGenerationStale(job, options)) {
      return null;
    }

    const timeoutError = buildGenerationTimeoutError(job);
    logger.warn("job_generation_timed_out", {
      jobId: job.id,
      status: job.status,
      ageMs: getGenerationAttemptAgeMs(job),
      message: timeoutError.message
    });

    if (job.status === "submitting" || job.status === "polling") {
      if (failoverGenerationModel(job.id, timeoutError, `${job.status}_timeout`)) {
        return true;
      }
    }

    failJob(job.id, timeoutError);
    return true;
  }

  function expireStaleCarryoverGenerationJobs() {
    let expiredAny = false;
    const candidates = jobRepository.list({
      statuses: ["awaiting_generation", "submitting", "polling"],
      limit: 500
    });

    for (const job of candidates) {
      if (!isCarryoverGenerationJob(job)) {
        continue;
      }

      if (expireStaleGenerationJob(job, { includeQueued: true })) {
        expiredAny = true;
        if (activeGenerationJobId === job.id) {
          activeGenerationJobId = null;
        }
      }
    }

    return expiredAny;
  }

  function withGenerationContext(fields, generationConfig) {
    return {
      ...(fields || {}),
      generationConfig: generationConfig && typeof generationConfig === "object"
        ? generationConfig
        : {}
    };
  }

  function getEnabledPlatforms(platformConfigs = {}) {
    return Object.entries(platformConfigs)
      .filter(([, config]) => config && config.enabled)
      .map(([platform]) => platform);
  }

  function getRetryPlatformConfigs(platformConfigs = {}, distribution, requestHash) {
    const enabledEntries = Object.entries(platformConfigs)
      .filter(([, config]) => config && config.enabled);

    if (enabledEntries.length === 0) {
      return {};
    }

    if (distribution?.requestHash !== requestHash) {
      return Object.fromEntries(enabledEntries);
    }

    const failedPlatforms = new Set((distribution.results || [])
      .filter((result) => result.status === "failed")
      .map((result) => result.platform));

    if (failedPlatforms.size === 0) {
      return {};
    }

    return Object.fromEntries(enabledEntries.filter(([platform]) => failedPlatforms.has(platform)));
  }

  function mergeDistributionResults(previousDistribution, nextDistribution, requestedPlatformConfigs) {
    const requestedPlatforms = getEnabledPlatforms(requestedPlatformConfigs);
    const mergedByPlatform = new Map((previousDistribution?.results || []).map((result) => [result.platform, result]));

    for (const result of nextDistribution.results || []) {
      mergedByPlatform.set(result.platform, result);
    }

    return {
      requestHash: nextDistribution.requestHash,
      attemptedAt: new Date().toISOString(),
      attemptCount: previousDistribution?.requestHash === nextDistribution.requestHash
        ? (Number.parseInt(previousDistribution?.attemptCount, 10) || 1) + 1
        : 1,
      results: requestedPlatforms
        .map((platform) => mergedByPlatform.get(platform))
        .filter(Boolean)
    };
  }

  function failoverGenerationModel(jobId, error, phase) {
    const job = jobRepository.getById(jobId);
    if (!job) {
      return null;
    }

    const currentConfig = job.providerConfig?.generationConfig || {};
    const fallbackProfileId = String(currentConfig.fallbackProfileId || "").trim();
    if (!fallbackProfileId || fallbackProfileId === currentConfig.profileId) {
      return null;
    }

    const nextConfig = normalizeGenerationConfig({
      ...currentConfig,
      profileId: fallbackProfileId,
      requestedProfileId: currentConfig.requestedProfileId || currentConfig.profileId,
      fallbackProfileId: ""
    });

    const fallbackHistory = Array.isArray(job.providerConfig?.fallbackHistory)
      ? job.providerConfig.fallbackHistory
      : [];
    const updatedProviderConfig = {
      ...clearGenerationAttemptState(job.providerConfig),
      generationConfig: nextConfig,
      estimatedCostUsd: sumEstimatedCosts(job.providerConfig?.estimatedCostUsd, nextConfig.estimatedCostUsd),
      fallbackHistory: [
        ...fallbackHistory,
        {
          failedProfileId: currentConfig.profileId,
          failedLabel: currentConfig.label || currentConfig.profileId,
          fallbackProfileId: nextConfig.profileId,
          fallbackLabel: nextConfig.label || nextConfig.profileId,
          phase,
          error: error.message,
          at: new Date().toISOString()
        }
      ]
    };

    logger.warn("job_generation_model_fallback", {
      jobId,
      fromProfileId: currentConfig.profileId,
      toProfileId: nextConfig.profileId,
      phase,
      message: error.message
    });

    return toPublic(jobRepository.update(jobId, {
      status: "awaiting_generation",
      providerTaskId: null,
      error: null,
      providerConfig: updatedProviderConfig
    }));
  }

  function enqueueBackgroundWork() {
    setImmediateSafe(processQueuedJobs);
    setImmediateSafe(processGenerationQueue);
  }

  async function processQueuedJobs() {
    if (processingQueuedJobs) {
      return;
    }

    processingQueuedJobs = true;
    try {
      let job = jobRepository.getNextQueuedJob();
      while (job) {
        try {
          await prepareJob(job.id);
        } catch (error) {
          failJob(job.id, error);
        }

        job = jobRepository.getNextQueuedJob();
      }
    } finally {
      processingQueuedJobs = false;
    }
  }

  async function prepareJob(jobId) {
    let job = jobRepository.getById(jobId);
    if (!job) {
      return null;
    }

    const brand = brandRepository.getById(job.brandId);
    if (!brand) {
      throw new AppError(400, `Unknown brand "${job.brandId}".`, {
        code: "unknown_brand"
      });
    }

    if (!job.startedAt) {
      job = jobRepository.update(job.id, {
        startedAt: new Date().toISOString()
      });
    }

    if (!job.analysis) {
      job = jobRepository.update(job.id, { status: "analyzing", error: null });
      const cached = jobRepository.findLatestAnalysis(job.sourceImageUrl, job.pipeline);
      const analysis = cached?.analysis || await anthropicService.analyzeImage(job.sourceImageUrl, job.pipeline, brand);
      job = jobRepository.update(job.id, {
        analysis,
        status: "scripting"
      });
    } else {
      job = jobRepository.update(job.id, { status: "scripting" });
    }

    const filledFields = anthropicService.autofillMissingIdeaFields
      ? await anthropicService.autofillMissingIdeaFields(job.analysis, job.pipeline, brand, job.fields || {})
      : job.fields;
    if (JSON.stringify(filledFields || {}) !== JSON.stringify(job.fields || {})) {
      job = jobRepository.update(job.id, {
        fields: filledFields,
        status: "scripting"
      });
    }

    if (!job.script) {
      const script = await anthropicService.generateScript(
        job.analysis,
        job.pipeline,
        brand,
        withGenerationContext(job.fields, job.providerConfig?.generationConfig)
      );
      job = jobRepository.update(job.id, {
        script,
        status: "captioning"
      });
    } else {
      job = jobRepository.update(job.id, { status: "captioning" });
    }

    if (!job.captions) {
      try {
        const captions = await anthropicService.generateCaptionAndHashtags(job.script, job.pipeline, brand);
        job = jobRepository.update(job.id, {
          captions,
          status: "prompting"
        });
      } catch (error) {
        logger.warn("caption_generation_failed", {
          jobId: job.id,
          message: error.message
        });

        const fallback = {
          ...createEmptyCaptions(),
          error: error.message
        };

        job = jobRepository.update(job.id, {
          captions: fallback,
          status: "prompting"
        });
      }
    } else {
      job = jobRepository.update(job.id, { status: "prompting" });
    }

    if (!job.videoPrompt) {
      const videoPrompt = await anthropicService.generateVideoPrompt(
        job.analysis,
        job.script,
        job.pipeline,
        brand,
        withGenerationContext(job.fields || {}, job.providerConfig?.generationConfig)
      );
      job = jobRepository.update(job.id, {
        videoPrompt,
        status: "awaiting_generation"
      });
    } else {
      job = jobRepository.update(job.id, { status: "awaiting_generation" });
    }

    setImmediateSafe(processGenerationQueue);
    return toPublic(job);
  }

  async function processGenerationQueue() {
    expireStaleCarryoverGenerationJobs();

    if (activeGenerationJobId) {
      return;
    }

    const job = jobRepository.getNextAwaitingGenerationJob();
    if (!job) {
      return;
    }

    activeGenerationJobId = job.id;
    try {
      const providerConfig = {
        ...(job.providerConfig || {}),
        generationAttemptStartedAt: new Date().toISOString()
      };
      jobRepository.update(job.id, {
        status: "submitting",
        error: null,
        providerConfig
      });

      const response = await kieService.generateVideo({
        videoPrompt: job.videoPrompt,
        imageUrl: job.sourceImageUrl,
        imageUrls: job.providerConfig?.generationConfig?.imageUrls,
        generationConfig: job.providerConfig?.generationConfig
      });

      if (response.videoUrl) {
        jobRepository.update(job.id, {
          providerTaskId: response.taskId,
          videoUrl: response.videoUrl,
          status: "ready",
          completedAt: new Date().toISOString()
        });
        activeGenerationJobId = null;
        setImmediateSafe(processGenerationQueue);
        return;
      }

      jobRepository.update(job.id, {
        providerTaskId: response.taskId,
        status: "polling"
      });
    } catch (error) {
      activeGenerationJobId = null;
      if (!failoverGenerationModel(job.id, error, "submit")) {
        failJob(job.id, error);
      }
      setImmediateSafe(processGenerationQueue);
    }
  }

  async function pollGenerationJob() {
    const expiredCarryovers = expireStaleCarryoverGenerationJobs();
    if (!activeGenerationJobId) {
      if (expiredCarryovers) {
        setImmediateSafe(processGenerationQueue);
      }
      return;
    }

    const job = jobRepository.getById(activeGenerationJobId);
    if (!job || !job.providerTaskId) {
      activeGenerationJobId = null;
      setImmediateSafe(processGenerationQueue);
      return;
    }

    if (expireStaleGenerationJob(job)) {
      activeGenerationJobId = null;
      setImmediateSafe(processGenerationQueue);
      return;
    }

    try {
      const response = await kieService.pollStatus(job.providerTaskId, {
        generationConfig: job.providerConfig?.generationConfig
      });

      if (response.status === "success" && response.videoUrl) {
        jobRepository.update(job.id, {
          status: "ready",
          videoUrl: response.videoUrl,
          completedAt: new Date().toISOString()
        });
        activeGenerationJobId = null;
        setImmediateSafe(processGenerationQueue);
        return;
      }

      if (response.status === "fail") {
        throw new AppError(502, response.error || "Video generation failed.", {
          code: "generation_failed"
        });
      }

      jobRepository.update(job.id, {
        status: "polling"
      });
    } catch (error) {
      activeGenerationJobId = null;
      if (!failoverGenerationModel(job.id, error, "poll")) {
        failJob(job.id, error);
      }
      setImmediateSafe(processGenerationQueue);
    }
  }

  function normalizeResumableJobs() {
    const stuckJobs = jobRepository.list({
      statuses: ["analyzing", "scripting", "captioning", "prompting", "submitting", "retry_queued"],
      limit: 500
    });

    for (const job of stuckJobs) {
      const nextStatus = job.videoPrompt ? "awaiting_generation" : "queued";
      jobRepository.update(job.id, {
        status: nextStatus,
        providerTaskId: nextStatus === "awaiting_generation" ? null : job.providerTaskId
      });
    }

    const pollingJobs = jobRepository.getPollingJobs();
    if (pollingJobs.length > 0) {
      activeGenerationJobId = pollingJobs[0].id;
      for (const stale of pollingJobs.slice(1)) {
        jobRepository.update(stale.id, {
          status: "awaiting_generation",
          providerTaskId: null
        });
      }
    }

    const staleGenerationJobs = jobRepository.list({
      statuses: ["awaiting_generation", "submitting", "polling"],
      limit: 500
    });
    for (const job of staleGenerationJobs) {
      if (expireStaleGenerationJob(job, { includeQueued: true }) && activeGenerationJobId === job.id) {
        activeGenerationJobId = null;
      }
    }
  }

  function bootstrap() {
    normalizeResumableJobs();
    pollTimer = setInterval(() => {
      Promise.resolve(pollGenerationJob()).catch((error) => {
        logger.error("job_poll_error", { message: error.message });
      });
    }, pollIntervalMs);
    enqueueBackgroundWork();
  }

  function shutdown() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function getJob(jobId) {
    return toPublic(jobRepository.getById(jobId));
  }

  function listJobs(filters = {}) {
    return jobRepository.list(filters).map(toPublic);
  }

  function createJob(input) {
    const brand = brandRepository.getById(input.brandId);
    if (!brand) {
      throw new AppError(400, `Unknown brand "${input.brandId}".`, {
        code: "unknown_brand"
      });
    }

    if (!input.sourceImageUrl) {
      throw new AppError(400, "imageUrl is required.", {
        code: "missing_image_url"
      });
    }

    if (!["edu", "comedy", "product"].includes(input.pipeline)) {
      throw new AppError(400, "pipeline must be edu, comedy, or product.", {
        code: "invalid_pipeline"
      });
    }

    const job = jobRepository.create({
      brandId: input.brandId,
      pipeline: input.pipeline,
      fields: input.fields || {},
      sourceImageUrl: input.sourceImageUrl,
      status: "queued",
      providerConfig: {
        ...(input.generationConfig ? { generationConfig: input.generationConfig } : {}),
        ...(typeof input.estimatedCostUsd === "number" ? { estimatedCostUsd: input.estimatedCostUsd } : {})
      }
    });

    enqueueBackgroundWork();
    return toPublic(job);
  }

  function retryJob(jobId) {
    const job = jobRepository.getById(jobId);
    if (!job) {
      throw new AppError(404, "Job not found.", {
        code: "job_not_found"
      });
    }

    let status = "queued";
    let providerTaskId = null;

    if (job.videoUrl) {
      status = "ready";
      providerTaskId = job.providerTaskId;
    } else if (job.videoPrompt) {
      status = "awaiting_generation";
    }

    const updated = jobRepository.update(job.id, {
      status,
      error: null,
      providerTaskId,
      completedAt: job.videoUrl ? job.completedAt : null,
      providerConfig: clearGenerationAttemptState(job.providerConfig)
    });

    enqueueBackgroundWork();
    return toPublic(updated);
  }

  async function distributeJob(jobId, platformConfigs) {
    const job = jobRepository.getById(jobId);
    if (!job) {
      throw new AppError(404, "Job not found.", {
        code: "job_not_found"
      });
    }

    if (!job.videoUrl) {
      throw new AppError(409, "Video is not ready for distribution yet.", {
        code: "video_not_ready"
      });
    }

    const brand = brandRepository.getById(job.brandId);

    const requestHash = distributionService.getRequestHash(job.videoUrl, platformConfigs);
    const retryPlatformConfigs = getRetryPlatformConfigs(platformConfigs, job.distribution, requestHash);
    if (Object.keys(retryPlatformConfigs).length === 0) {
      return toPublic(job);
    }

    const next = jobRepository.update(job.id, {
      status: "distributing",
      error: null
    });

    const distributionAttempt = await distributionService.distributeVideo(next.videoUrl, retryPlatformConfigs, {
      socialAccounts: brand?.socialAccounts || {}
    });
    const distribution = mergeDistributionResults(job.distribution || null, {
      ...distributionAttempt,
      requestHash
    }, platformConfigs);

    const hasFailure = distribution.results.some((result) => result.status === "failed");
    const updated = jobRepository.update(job.id, {
      status: hasFailure ? "ready" : "distributed",
      distribution,
      error: hasFailure ? "Some platform deliveries failed." : null
    });

    return toPublic(updated);
  }

  function handleProviderCallback({ taskId, videoUrl }) {
    const job = jobRepository.getByProviderTaskId(taskId);
    if (!job) {
      return null;
    }

    const updated = jobRepository.update(job.id, {
      status: "ready",
      videoUrl,
      completedAt: new Date().toISOString()
    });

    if (activeGenerationJobId === job.id) {
      activeGenerationJobId = null;
      setImmediateSafe(processGenerationQueue);
    }

    return toPublic(updated);
  }

  return {
    bootstrap,
    shutdown,
    getJob,
    listJobs,
    createJob,
    retryJob,
    distributeJob,
    handleProviderCallback
  };
}

module.exports = {
  createJobManager
};
