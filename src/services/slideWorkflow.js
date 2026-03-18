const { AppError } = require("../utils/errors");
const { createEmptyCaptions } = require("./anthropic");
const { decorateJob } = require("../jobs/jobPresenter");
const { normalizeGenerationConfig } = require("../generation/modelProfiles");
const { buildSlidesPlanningAnalysis } = require("../slides/planningAnalysis");
const {
  buildSlidesPromptSummary,
  buildSlidesScript,
  getSlideDeckTitle,
  normalizeSlidesDraft,
  normalizeSlidesModeFields
} = require("../slides/normalization");

function createSlideWorkflowService(options) {
  const brandRepository = options.brandRepository;
  const jobRepository = options.jobRepository;
  const jobSlideRepository = options.jobSlideRepository;
  const anthropicService = options.anthropicService;
  const slideComposeService = options.slideComposeService;

  function decorateSlidesJob(job) {
    if (!job || job.mode !== "slides") {
      return job;
    }

    const slides = jobSlideRepository.listByJobId(job.id);
    return {
      ...decorateJob({
        ...job,
        slides
      }),
      slides,
      canRetry: false
    };
  }

  function getSlidesJobOrThrow(jobId) {
    const job = jobRepository.getById(jobId);
    if (!job) {
      throw new AppError(404, "Job not found.", {
        code: "job_not_found"
      });
    }

    if (job.mode !== "slides") {
      throw new AppError(409, "This job does not use slides mode.", {
        code: "invalid_job_mode"
      });
    }

    return job;
  }

  function buildSlideProviderConfig(input = {}) {
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

  async function generateDeckCaptions(script, pipeline, brand, fields) {
    try {
      return await anthropicService.generateCaptionAndHashtags(script, pipeline, brand, fields);
    } catch {
      return createEmptyCaptions();
    }
  }

  function validateSlidesForRender(slides = []) {
    if (slides.length < 1) {
      throw new AppError(400, "Slide mode needs at least one slide before rendering.", {
        code: "slides_require_at_least_one_slide"
      });
    }

    const blankSlide = slides.find((slide) => !slide.headline || !slide.body);
    if (blankSlide) {
      throw new AppError(400, `Slide ${blankSlide.slideIndex} needs both a headline and body before rendering.`, {
        code: "slide_content_incomplete"
      });
    }
  }

  function clearRenderedOutput(jobId) {
    return jobRepository.update(jobId, {
      videoUrl: null,
      thumbnailUrl: null,
      distribution: null,
      completedAt: null
    });
  }

  async function createDraft(input = {}) {
    const brand = brandRepository.getById(input.brandId);
    if (!brand) {
      throw new AppError(400, `Unknown brand "${input.brandId}".`, {
        code: "unknown_brand"
      });
    }

    if (!["edu", "comedy", "product"].includes(input.pipeline)) {
      throw new AppError(400, "pipeline must be edu, comedy, or product.", {
        code: "invalid_pipeline"
      });
    }

    const fields = normalizeSlidesModeFields(input.fields || {});
    const sourceImageUrl = String(input.sourceImageUrl || "").trim();
    const analysis = sourceImageUrl
      ? await anthropicService.analyzeImage(sourceImageUrl, input.pipeline, brand)
      : buildSlidesPlanningAnalysis({
        pipeline: input.pipeline,
        brand,
        fields: {
          ...fields,
          hasReferenceImage: false
        }
      });

    const plan = await anthropicService.generateSlidesPlan(
      analysis,
      input.pipeline,
      brand,
      {
        ...fields,
        hasReferenceImage: Boolean(sourceImageUrl)
      }
    );

    const slides = normalizeSlidesDraft(plan.slides, {
      fallbackImageUrl: sourceImageUrl
    });
    validateSlidesForRender(slides);

    const title = getSlideDeckTitle({
      ...fields,
      slideDeckTitle: plan.title
    }, `${brand.name} slides`);
    const nextFields = {
      ...fields,
      slideDeckTitle: title,
      slideCount: slides.length
    };
    const script = buildSlidesScript(title, slides);
    const videoPrompt = buildSlidesPromptSummary(title, slides);
    const captions = await generateDeckCaptions(script, input.pipeline, brand, nextFields);

    const job = jobRepository.create({
      brandId: input.brandId,
      pipeline: input.pipeline,
      mode: "slides",
      fields: nextFields,
      sourceImageUrl,
      status: "slides_ready",
      analysis,
      script,
      videoPrompt,
      captions,
      providerConfig: buildSlideProviderConfig(input)
    });

    jobSlideRepository.createMany(job.id, slides);
    return decorateSlidesJob(jobRepository.getById(job.id));
  }

  async function getJob(jobId) {
    return decorateSlidesJob(jobRepository.getById(jobId));
  }

  async function updateSlides(jobId, payload = {}) {
    const job = getSlidesJobOrThrow(jobId);
    if (!["slides_ready", "failed", "ready", "distributed"].includes(job.status)) {
      throw new AppError(409, "Slides can only be edited before rendering or after a completed render is reopened.", {
        code: "slides_locked"
      });
    }

    const title = getSlideDeckTitle(payload, getSlideDeckTitle(job.fields, "Slides draft"));
    const slides = normalizeSlidesDraft(payload.slides, {
      fallbackImageUrl: String(payload.imageUrl || job.sourceImageUrl || "").trim()
    });
    validateSlidesForRender(slides);

    const brand = brandRepository.getById(job.brandId);
    const nextFields = {
      ...(job.fields || {}),
      slideDeckTitle: title,
      slideCount: slides.length
    };
    const script = buildSlidesScript(title, slides);
    const videoPrompt = buildSlidesPromptSummary(title, slides);
    const captions = await generateDeckCaptions(script, job.pipeline, brand, nextFields);

    jobSlideRepository.replaceForJob(job.id, slides);
    const updated = jobRepository.update(job.id, {
      fields: nextFields,
      script,
      videoPrompt,
      captions,
      status: "slides_ready",
      distribution: null,
      videoUrl: null,
      thumbnailUrl: null,
      completedAt: null,
      error: null
    });

    return decorateSlidesJob(updated);
  }

  async function render(jobId) {
    const job = getSlidesJobOrThrow(jobId);
    if (!["slides_ready", "failed", "ready", "distributed"].includes(job.status)) {
      throw new AppError(409, "Slides are not ready to render in the current state.", {
        code: "slides_render_locked"
      });
    }

    const slides = jobSlideRepository.listByJobId(job.id);
    validateSlidesForRender(slides);
    const brand = brandRepository.getById(job.brandId);

    clearRenderedOutput(job.id);
    jobRepository.update(job.id, {
      status: "rendering_slides",
      error: null
    });

    try {
      const result = await slideComposeService.compose(job, slides, brand);
      const updated = jobRepository.update(job.id, {
        status: "ready",
        videoUrl: result.videoUrl,
        thumbnailUrl: result.thumbnailUrl || null,
        completedAt: new Date().toISOString(),
        error: null
      });
      return decorateSlidesJob(updated);
    } catch (error) {
      jobRepository.update(job.id, {
        status: "failed",
        error: error.message
      });
      throw error;
    }
  }

  return {
    createDraft,
    getJob,
    updateSlides,
    render
  };
}

module.exports = {
  createSlideWorkflowService
};
