const { AppError } = require("../utils/errors");
const { createEmptyCaptions } = require("../services/anthropic");
const { decorateJob } = require("./jobPresenter");

function createJobManager(options) {
  const jobRepository = options.jobRepository;
  const brandRepository = options.brandRepository;
  const anthropicService = options.anthropicService;
  const kieService = options.kieService;
  const distributionService = options.distributionService;
  const logger = options.logger || { info() {}, warn() {}, error() {} };
  const pollIntervalMs = options.pollIntervalMs || 5000;

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

    if (!job.script) {
      const script = await anthropicService.generateScript(job.analysis, job.pipeline, brand, job.fields);
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
      const videoPrompt = await anthropicService.generateVideoPrompt(job.analysis, job.script, job.pipeline, brand);
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
    if (activeGenerationJobId) {
      return;
    }

    const job = jobRepository.getNextAwaitingGenerationJob();
    if (!job) {
      return;
    }

    activeGenerationJobId = job.id;
    try {
      jobRepository.update(job.id, {
        status: "submitting",
        error: null
      });

      const response = await kieService.generateVideo({
        videoPrompt: job.videoPrompt,
        imageUrl: job.sourceImageUrl,
        imageUrls: job.providerConfig?.generationConfig?.imageUrls,
        generationConfig: job.providerConfig?.generationConfig,
        kieApiKey: job.providerConfig?.kieApiKey
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
      failJob(job.id, error);
      setImmediateSafe(processGenerationQueue);
    }
  }

  async function pollGenerationJob() {
    if (!activeGenerationJobId) {
      return;
    }

    const job = jobRepository.getById(activeGenerationJobId);
    if (!job || !job.providerTaskId) {
      activeGenerationJobId = null;
      setImmediateSafe(processGenerationQueue);
      return;
    }

    try {
      const response = await kieService.pollStatus(job.providerTaskId, {
        kieApiKey: job.providerConfig?.kieApiKey,
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
      failJob(job.id, error);
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
        ...(input.kieApiKey ? { kieApiKey: input.kieApiKey } : {}),
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
      completedAt: job.videoUrl ? job.completedAt : null
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
    if (job.distribution?.requestHash === requestHash) {
      return toPublic(job);
    }

    const next = jobRepository.update(job.id, {
      status: "distributing",
      error: null
    });

    const distribution = await distributionService.distributeVideo(next.videoUrl, platformConfigs, {
      socialAccounts: brand?.socialAccounts || {}
    });

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
