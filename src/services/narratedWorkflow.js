const { AppError } = require("../utils/errors");
const { decorateJob } = require("../jobs/jobPresenter");
const { normalizeGenerationConfig } = require("../generation/modelProfiles");
const {
  DEFAULT_CTA_STYLE_ID,
  DEFAULT_NARRATED_TEMPLATE_ID,
  DEFAULT_NARRATOR_TONE_ID,
  DEFAULT_VISUAL_INTENSITY_ID,
  normalizeNarratedTemplateFields
} = require("../narrated/templates");

const DEFAULT_VOICE_ID = "rachel";
const DEFAULT_TARGET_LENGTH_SECONDS = 15;

function normalizeModeFields(fields = {}) {
  const voiceId = String(fields.voiceId || DEFAULT_VOICE_ID).trim().toLowerCase() || DEFAULT_VOICE_ID;
  const platformPreset = String(fields.platformPreset || "tiktok").trim().toLowerCase() || "tiktok";
  const targetLengthSeconds = Number.parseInt(fields.targetLengthSeconds, 10) || DEFAULT_TARGET_LENGTH_SECONDS;
  const normalizedTemplateFields = normalizeNarratedTemplateFields(fields);

  return {
    ...fields,
    voiceId,
    platformPreset,
    targetLengthSeconds,
    templateId: normalizedTemplateFields.templateId || DEFAULT_NARRATED_TEMPLATE_ID,
    hookAngle: normalizedTemplateFields.hookAngle,
    narratorTone: normalizedTemplateFields.narratorTone || DEFAULT_NARRATOR_TONE_ID,
    ctaStyle: normalizedTemplateFields.ctaStyle || DEFAULT_CTA_STYLE_ID,
    visualIntensity: normalizedTemplateFields.visualIntensity || DEFAULT_VISUAL_INTENSITY_ID,
    narrationTitle: String(fields.narrationTitle || "").trim()
  };
}

function formatNarrationScript(title, segments = []) {
  const lines = [];
  if (title) {
    lines.push(title);
  }

  for (const segment of segments) {
    lines.push(
      `Part ${segment.segmentIndex} (${segment.estimatedSeconds}s)`,
      segment.text,
      `Visual: ${segment.visualIntent}`
    );
  }

  return lines.join("\n\n").trim();
}

function buildCombinedBrollPrompt(segments = []) {
  return segments
    .filter((segment) => String(segment.brollPrompt || "").trim())
    .map((segment) => `Part ${segment.segmentIndex}: ${segment.brollPrompt}`)
    .join("\n\n")
    .trim();
}

function createNarratedWorkflowService(options) {
  const brandRepository = options.brandRepository;
  const jobRepository = options.jobRepository;
  const jobSegmentRepository = options.jobSegmentRepository;
  const anthropicService = options.anthropicService;
  const kieService = options.kieService;
  const narratedComposeService = options.narratedComposeService;
  const jobManager = options.jobManager || null;
  const pollIntervalMs = options.pollIntervalMs || 5000;

  let brollPollTimer = null;
  let activeBrollSegmentId = null;

  function decorateNarratedJob(job) {
    if (!job || job.mode !== "narrated") {
      return job;
    }

    const segments = jobSegmentRepository.listByJobId(job.id);
    return {
      ...decorateJob({
        ...job,
        segments
      }),
      segments,
      canRetry: false
    };
  }

  function setImmediateSafe(task) {
    setImmediate(() => {
      Promise.resolve(task()).catch(() => {});
    });
  }

  function getNarratedJobOrThrow(jobId) {
    const job = jobRepository.getById(jobId);
    if (!job) {
      throw new AppError(404, "Job not found.", {
        code: "job_not_found"
      });
    }

    if (job.mode !== "narrated") {
      throw new AppError(409, "This job does not use narrated mode.", {
        code: "invalid_job_mode"
      });
    }

    return job;
  }

  function buildNarratedProviderConfig(input = {}) {
    if (!input.generationConfig) {
      return {};
    }

    const generationConfig = normalizeGenerationConfig(input.generationConfig);
    return {
      generationConfig,
      ...(typeof generationConfig.estimatedCostUsd === "number"
        ? { estimatedCostUsd: generationConfig.estimatedCostUsd }
        : {})
    };
  }

  function clearRenderedNarratedArtifacts(jobId, segments = null) {
    const targetSegments = Array.isArray(segments) ? segments : jobSegmentRepository.listByJobId(jobId);
    for (const segment of targetSegments) {
      jobSegmentRepository.update(segment.id, {
        brollPrompt: null,
        brollStatus: "waiting",
        brollTaskId: null,
        videoUrl: null,
        error: null
      });
    }

    return jobRepository.update(jobId, {
      videoPrompt: null,
      videoUrl: null,
      distribution: null,
      completedAt: null
    });
  }

  function clearFinalNarratedOutput(jobId) {
    return jobRepository.update(jobId, {
      videoUrl: null,
      distribution: null,
      completedAt: null
    });
  }

  function deriveNarratedJobStatus(job, segments = []) {
    if (!job) {
      return null;
    }

    if (job.status === "distributed") {
      return "distributed";
    }

    if (job.videoUrl) {
      return "ready";
    }

    if (job.status === "planning_broll" || job.status === "composing") {
      return job.status;
    }

    if (segments.some((segment) => segment.voiceStatus === "failed" || segment.brollStatus === "failed")) {
      return "failed";
    }

    if (segments.some((segment) => segment.voiceStatus === "generating")) {
      return "generating_voice";
    }

    const allVoiceComplete = segments.length > 0 && segments.every((segment) => segment.voiceStatus === "complete");
    const allBrollPrompted = segments.length > 0 && segments.every((segment) => String(segment.brollPrompt || "").trim());
    const allBrollComplete = segments.length > 0 && segments.every((segment) => segment.brollStatus === "complete" && segment.videoUrl);
    const anyBrollActive = segments.some((segment) => ["queued", "generating"].includes(segment.brollStatus));

    if (allBrollComplete) {
      return "ready_to_compose";
    }

    if (anyBrollActive) {
      return "rendering_broll";
    }

    if (allVoiceComplete && allBrollPrompted) {
      return "broll_ready";
    }

    if (allVoiceComplete) {
      return "voice_ready";
    }

    return "script_ready";
  }

  function syncNarratedJobStatus(jobId) {
    const job = jobRepository.getById(jobId);
    if (!job || job.mode !== "narrated") {
      return job;
    }

    const segments = jobSegmentRepository.listByJobId(job.id);
    const nextStatus = deriveNarratedJobStatus(job, segments);
    const nextError = nextStatus === "failed"
      ? (segments.find((segment) => segment.error)?.error || job.error || "One or more narrated segments failed.")
      : null;

    if (job.status === nextStatus && job.error === nextError) {
      return job;
    }

    return jobRepository.update(job.id, {
      status: nextStatus,
      error: nextError
    });
  }

  function buildSegmentGenerationConfig(job, segment) {
    const baseConfig = normalizeGenerationConfig({
      ...(job.providerConfig?.generationConfig || {}),
      imageUrls: job.providerConfig?.generationConfig?.imageUrls || [job.sourceImageUrl]
    });
    const desiredDuration = Math.max(
      4,
      Math.round(Number(segment.actualDurationSeconds || segment.estimatedSeconds || 6))
    );

    if (baseConfig.profileId === "sora2_image") {
      return normalizeGenerationConfig({
        ...baseConfig,
        duration: desiredDuration <= 10 ? "10" : "15",
        imageUrls: baseConfig.imageUrls
      });
    }

    if (baseConfig.profileId === "seedance15pro") {
      return normalizeGenerationConfig({
        ...baseConfig,
        duration: "12",
        imageUrls: baseConfig.imageUrls
      });
    }

    return normalizeGenerationConfig({
      ...baseConfig,
      imageUrls: baseConfig.imageUrls
    });
  }

  async function refreshVoiceStatus(job, segments = []) {
    if (!job || job.mode !== "narrated") {
      return null;
    }

    const activeSegments = segments.filter((segment) => segment.voiceStatus === "generating" && segment.voiceTaskId);
    if (activeSegments.length === 0) {
      return job;
    }

    for (const segment of activeSegments) {
      try {
        const result = await kieService.pollSpeechStatus(segment.voiceTaskId);
        if (result.status === "success" && result.audioUrl) {
          jobSegmentRepository.update(segment.id, {
            voiceStatus: "complete",
            audioUrl: result.audioUrl,
            actualDurationSeconds: result.durationSeconds,
            error: null
          });
        } else if (result.status === "fail") {
          jobSegmentRepository.update(segment.id, {
            voiceStatus: "failed",
            error: result.error || "Speech generation failed."
          });
        }
      } catch (error) {
        jobSegmentRepository.update(segment.id, {
          voiceStatus: "failed",
          error: error.message
        });
      }
    }

    return syncNarratedJobStatus(job.id);
  }

  async function processBrollQueue() {
    if (activeBrollSegmentId) {
      return;
    }

    if (typeof jobManager?.isGenerationBusy === "function" && jobManager.isGenerationBusy()) {
      return;
    }

    const nextSegment = jobSegmentRepository.listByBrollStatuses(["queued"])
      .find((segment) => {
        const job = jobRepository.getById(segment.jobId);
        return job?.mode === "narrated" && job.status === "rendering_broll" && String(segment.brollPrompt || "").trim();
      });

    if (!nextSegment) {
      return;
    }

    const job = jobRepository.getById(nextSegment.jobId);
    if (!job) {
      return;
    }

    activeBrollSegmentId = nextSegment.id;
    try {
      const generationConfig = buildSegmentGenerationConfig(job, nextSegment);
      const response = await kieService.generateVideo({
        videoPrompt: nextSegment.brollPrompt,
        imageUrl: job.sourceImageUrl,
        imageUrls: generationConfig.imageUrls,
        generationConfig
      });

      if (response.videoUrl) {
        jobSegmentRepository.update(nextSegment.id, {
          brollStatus: "complete",
          brollTaskId: response.taskId,
          videoUrl: response.videoUrl,
          error: null
        });
        activeBrollSegmentId = null;
        syncNarratedJobStatus(job.id);
        setImmediateSafe(processBrollQueue);
        return;
      }

      jobSegmentRepository.update(nextSegment.id, {
        brollStatus: "generating",
        brollTaskId: response.taskId,
        videoUrl: null,
        error: null
      });
    } catch (error) {
      activeBrollSegmentId = null;
      jobSegmentRepository.update(nextSegment.id, {
        brollStatus: "failed",
        error: error.message
      });
      jobRepository.update(job.id, {
        status: "failed",
        error: error.message
      });
    }
  }

  async function pollBrollGeneration() {
    if (!activeBrollSegmentId) {
      await processBrollQueue();
      return;
    }

    const segment = jobSegmentRepository.getById(activeBrollSegmentId);
    if (!segment || !segment.brollTaskId) {
      activeBrollSegmentId = null;
      await processBrollQueue();
      return;
    }

    const job = jobRepository.getById(segment.jobId);
    if (!job) {
      activeBrollSegmentId = null;
      return;
    }

    try {
      const response = await kieService.pollStatus(segment.brollTaskId, {
        generationConfig: buildSegmentGenerationConfig(job, segment)
      });

      if (response.status === "success" && response.videoUrl) {
        jobSegmentRepository.update(segment.id, {
          brollStatus: "complete",
          videoUrl: response.videoUrl,
          error: null
        });
        activeBrollSegmentId = null;
        syncNarratedJobStatus(job.id);
        await processBrollQueue();
        return;
      }

      if (response.status === "fail") {
        throw new AppError(502, response.error || "B-roll generation failed.", {
          code: "narrated_broll_failed"
        });
      }

      jobSegmentRepository.update(segment.id, {
        brollStatus: "generating",
        error: null
      });
    } catch (error) {
      activeBrollSegmentId = null;
      jobSegmentRepository.update(segment.id, {
        brollStatus: "failed",
        error: error.message
      });
      jobRepository.update(job.id, {
        status: "failed",
        error: error.message
      });
    }
  }

  async function createDraft(input) {
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

    const fields = normalizeModeFields(input.fields || {});
    const analysis = await anthropicService.analyzeImage(input.sourceImageUrl, input.pipeline, brand);
    const narrationPlan = await anthropicService.generateNarratedPlan(
      analysis,
      input.pipeline,
      brand,
      fields
    );

    const title = String(narrationPlan.title || fields.narrationTitle || "").trim();
    const segments = Array.isArray(narrationPlan.segments) ? narrationPlan.segments : [];
    if (segments.length === 0) {
      throw new AppError(502, "Narrated planning did not return any segments.", {
        code: "missing_narrated_segments"
      });
    }

    const normalizedSegments = segments.map((segment, index) => ({
      segmentIndex: index + 1,
      text: String(segment.text || "").trim(),
      visualIntent: String(segment.visualIntent || segment.visual_intent || "").trim(),
      estimatedSeconds: Number(segment.estimatedSeconds || segment.estimated_seconds || 0),
      shotType: String(segment.shotType || segment.shot_type || "").trim(),
      sourceStrategy: String(segment.sourceStrategy || segment.source_strategy || "").trim() || "hybrid",
      voiceStatus: "waiting",
      brollStatus: "waiting"
    })).filter((segment) => segment.text);

    if (normalizedSegments.length === 0) {
      throw new AppError(502, "Narrated planning returned only blank segments.", {
        code: "blank_narrated_segments"
      });
    }

    const nextFields = {
      ...fields,
      narrationTitle: title
    };

    const job = jobRepository.create({
      brandId: input.brandId,
      pipeline: input.pipeline,
      mode: "narrated",
      fields: nextFields,
      sourceImageUrl: input.sourceImageUrl,
      status: "script_ready",
      analysis,
      script: formatNarrationScript(title, normalizedSegments),
      providerConfig: buildNarratedProviderConfig(input)
    });

    jobSegmentRepository.createMany(job.id, normalizedSegments);
    return decorateNarratedJob(jobRepository.getById(job.id));
  }

  async function getJob(jobId) {
    let job = jobRepository.getById(jobId);
    if (job?.mode === "narrated") {
      const segments = jobSegmentRepository.listByJobId(job.id);
      job = await refreshVoiceStatus(job, segments) || job;
      await pollBrollGeneration();
      job = syncNarratedJobStatus(job.id) || job;
    }
    return decorateNarratedJob(job);
  }

  async function updateNarration(jobId, payload = {}) {
    const job = getNarratedJobOrThrow(jobId);

    if (!["script_ready", "failed"].includes(job.status)) {
      throw new AppError(409, "Narration can only be edited before downstream generation starts.", {
        code: "narration_locked"
      });
    }

    const title = String(payload.title || payload.narrationTitle || "").trim();
    const sourceSegments = Array.isArray(payload.segments) ? payload.segments : [];
    if (sourceSegments.length === 0) {
      throw new AppError(400, "At least one narration segment is required.", {
        code: "missing_narration_segments"
      });
    }

    const normalizedSegments = sourceSegments.map((segment, index) => ({
      segmentIndex: index + 1,
      text: String(segment.text || "").trim(),
      visualIntent: String(segment.visualIntent || "").trim(),
      estimatedSeconds: Number(segment.estimatedSeconds || 0),
      actualDurationSeconds: segment.actualDurationSeconds ?? null,
      shotType: String(segment.shotType || "").trim(),
      sourceStrategy: String(segment.sourceStrategy || "").trim() || "hybrid",
      voiceStatus: String(segment.voiceStatus || "waiting").trim(),
      voiceTaskId: segment.voiceTaskId || null,
      audioUrl: segment.audioUrl || null,
      brollPrompt: segment.brollPrompt || null,
      brollStatus: String(segment.brollStatus || "waiting").trim(),
      brollTaskId: segment.brollTaskId || null,
      videoUrl: segment.videoUrl || null,
      error: segment.error || null
    })).filter((segment) => segment.text);

    if (normalizedSegments.length === 0) {
      throw new AppError(400, "Narration segments cannot be blank.", {
        code: "blank_narration_segments"
      });
    }

    jobRepository.update(job.id, {
      fields: {
        ...(job.fields || {}),
        narrationTitle: title
      },
      script: formatNarrationScript(title, normalizedSegments),
      error: null
    });
    jobSegmentRepository.replaceForJob(job.id, normalizedSegments);

    return this.getJob(job.id);
  }

  async function generateVoice(jobId, options = {}) {
    const job = getNarratedJobOrThrow(jobId);

    if (!["script_ready", "failed", "voice_ready", "generating_voice"].includes(job.status)) {
      throw new AppError(409, "Voice generation is not available in the current job state.", {
        code: "voice_generation_locked"
      });
    }

    const segmentId = String(options.segmentId || "").trim();
    const segments = jobSegmentRepository.listByJobId(job.id);
    const targetSegments = segmentId
      ? segments.filter((segment) => segment.id === segmentId)
      : segments;

    if (targetSegments.length === 0) {
      throw new AppError(404, "Narration segment not found.", {
        code: "narration_segment_not_found"
      });
    }

    const voiceId = String(job.fields?.voiceId || DEFAULT_VOICE_ID).trim().toLowerCase() || DEFAULT_VOICE_ID;

    clearRenderedNarratedArtifacts(job.id, targetSegments);

    for (const segment of targetSegments) {
      const response = await kieService.generateSpeech({
        text: segment.text,
        voiceId
      });

      jobSegmentRepository.update(segment.id, {
        voiceStatus: "generating",
        voiceTaskId: response.taskId,
        audioUrl: null,
        actualDurationSeconds: null,
        error: null
      });
    }

    jobRepository.update(job.id, {
      status: "generating_voice",
      error: null
    });

    return decorateNarratedJob(jobRepository.getById(job.id));
  }

  async function generateBrollPrompts(jobId) {
    const job = getNarratedJobOrThrow(jobId);
    const segments = jobSegmentRepository.listByJobId(job.id);
    if (segments.length === 0) {
      throw new AppError(409, "This narrated job has no segments to plan.", {
        code: "missing_narrated_segments"
      });
    }

    if (!segments.every((segment) => segment.voiceStatus === "complete")) {
      throw new AppError(409, "Finish voice generation for all segments before planning B-roll.", {
        code: "voice_not_ready_for_broll"
      });
    }

    const brand = brandRepository.getById(job.brandId);
    jobRepository.update(job.id, {
      status: "planning_broll",
      error: null
    });

    const plan = await anthropicService.generateNarratedBrollPlan(
      job.analysis,
      job.pipeline,
      brand,
      job.fields || {},
      segments,
      job.providerConfig?.generationConfig || {}
    );

    const promptsByIndex = new Map((plan || []).map((entry) => [Number(entry.segmentIndex), entry]));
    const updatedSegments = segments.map((segment) => {
      const promptEntry = promptsByIndex.get(Number(segment.segmentIndex));
      const prompt = String(promptEntry?.prompt || "").trim();
      if (!prompt) {
        throw new AppError(502, `Missing B-roll prompt for segment ${segment.segmentIndex}.`, {
          code: "missing_broll_prompt"
        });
      }

      return jobSegmentRepository.update(segment.id, {
        brollPrompt: prompt,
        sourceStrategy: String(promptEntry?.sourceStrategy || segment.sourceStrategy || "hybrid").trim() || "hybrid",
        brollStatus: "ready",
        brollTaskId: null,
        videoUrl: null,
        error: null
      });
    });

    clearFinalNarratedOutput(job.id);
    jobRepository.update(job.id, {
      videoPrompt: buildCombinedBrollPrompt(updatedSegments),
      status: "broll_ready",
      error: null
    });

    return decorateNarratedJob(jobRepository.getById(job.id));
  }

  async function renderBroll(jobId, options = {}) {
    const job = getNarratedJobOrThrow(jobId);
    if (!["broll_ready", "rendering_broll", "ready_to_compose", "failed"].includes(job.status)) {
      throw new AppError(409, "B-roll rendering is not available in the current job state.", {
        code: "broll_render_locked"
      });
    }

    const segmentId = String(options.segmentId || "").trim();
    const segments = jobSegmentRepository.listByJobId(job.id);
    const targetSegments = segmentId
      ? segments.filter((segment) => segment.id === segmentId)
      : segments;

    if (targetSegments.length === 0) {
      throw new AppError(404, "Narration segment not found.", {
        code: "narration_segment_not_found"
      });
    }

    if (targetSegments.some((segment) => !String(segment.brollPrompt || "").trim())) {
      throw new AppError(409, "Generate B-roll prompts before rendering segments.", {
        code: "missing_broll_prompts"
      });
    }

    clearFinalNarratedOutput(job.id);
    for (const segment of targetSegments) {
      jobSegmentRepository.update(segment.id, {
        brollStatus: "queued",
        brollTaskId: null,
        videoUrl: null,
        error: null
      });
    }

    jobRepository.update(job.id, {
      status: "rendering_broll",
      error: null
    });

    await processBrollQueue();
    return decorateNarratedJob(jobRepository.getById(job.id));
  }

  async function compose(jobId) {
    const job = getNarratedJobOrThrow(jobId);
    const segments = jobSegmentRepository.listByJobId(job.id);
    const brand = brandRepository.getById(job.brandId);
    if (!segments.length || !segments.every((segment) => segment.brollStatus === "complete" && segment.videoUrl && segment.audioUrl)) {
      throw new AppError(409, "All narrated segments need audio and B-roll before composing the final video.", {
        code: "compose_missing_segment_media"
      });
    }

    jobRepository.update(job.id, {
      status: "composing",
      error: null
    });

    try {
      const result = await narratedComposeService.compose(job, segments, brand);
      const updated = jobRepository.update(job.id, {
        status: "ready",
        videoUrl: result.videoUrl,
        completedAt: new Date().toISOString(),
        error: null
      });
      return decorateNarratedJob(updated);
    } catch (error) {
      jobRepository.update(job.id, {
        status: "failed",
        error: error.message
      });
      throw error;
    }
  }

  function bootstrap() {
    if (brollPollTimer) {
      return;
    }

    brollPollTimer = setInterval(() => {
      Promise.resolve(pollBrollGeneration()).catch(() => {});
    }, pollIntervalMs);

    setImmediateSafe(processBrollQueue);
  }

  function shutdown() {
    if (brollPollTimer) {
      clearInterval(brollPollTimer);
      brollPollTimer = null;
    }
  }

  return {
    bootstrap,
    shutdown,
    createDraft,
    getJob,
    updateNarration,
    generateVoice,
    generateBrollPrompts,
    renderBroll,
    compose
  };
}

module.exports = {
  createNarratedWorkflowService,
  DEFAULT_VOICE_ID,
  DEFAULT_TARGET_LENGTH_SECONDS
};
