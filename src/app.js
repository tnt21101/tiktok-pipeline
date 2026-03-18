const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const express = require("express");
const multer = require("multer");
const { AppError, asyncRoute, serializeError } = require("./utils/errors");
const { safeJsonParse } = require("./utils/json");
const { parseBasicAuthHeader, isValidBasicAuth } = require("./utils/httpAuth");
const { storeUploadedImage } = require("./utils/imageUpload");
const { findApiKeyProviderDefinition } = require("./settings/apiKeys");
const {
  listGenerationProfiles,
  normalizeGenerationConfig
} = require("./generation/modelProfiles");
const { getNarratedOptionsPayload } = require("./narrated/templates");
const { listNarratedVoices, normalizeNarratedVoiceId } = require("./narrated/voices");
const { listTrendingHookPatterns, decorateIdeaSuggestionsWithHookAngles } = require("./narrated/trendingHooks");
const { buildNarratedPlanningAnalysis } = require("./narrated/planningAnalysis");

function createUploadMiddleware(config) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes },
    fileFilter(req, file, callback) {
      if (file.mimetype && !file.mimetype.startsWith("image/")) {
        callback(new AppError(400, "Only image uploads are allowed.", {
          code: "invalid_upload_type"
        }));
        return;
      }

      callback(null, true);
    }
  });
}

function getAllowedOrigin(baseUrl) {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return "";
  }
}

function isPublicRoute(pathname = "") {
  return pathname === "/api/health"
    || pathname === "/api/callback"
    || pathname === "/uploads"
    || pathname.startsWith("/uploads/")
    || pathname === "/output"
    || pathname.startsWith("/output/");
}

function isCorsEnabledRoute(pathname = "") {
  return pathname === "/api/health"
    || pathname === "/uploads"
    || pathname.startsWith("/uploads/")
    || pathname === "/output"
    || pathname.startsWith("/output/");
}

function createApp(dependencies) {
  const {
    config,
    validation,
    logger,
    brandRepository,
    productRepository,
    settingsRepository,
    apiKeyStore,
    jobManager,
    narratedWorkflowService,
    slideWorkflowService,
    anthropicService,
    amazonCatalogService,
    kieService,
    elevenLabsService,
    narratedComposeService,
    slideComposeService,
    falService,
    distributionService
  } = dependencies;

  const app = express();
  const upload = createUploadMiddleware(config);
  const allowedOrigin = getAllowedOrigin(config.baseUrl);

  fs.mkdirSync(config.uploadsDir, { recursive: true });

  app.use(express.json({ limit: "2mb" }));
  app.use((req, res, next) => {
    const requestOrigin = req.get("origin");
    if (
      allowedOrigin
      && requestOrigin === allowedOrigin
      && isCorsEnabledRoute(req.path)
    ) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
    }

    if (
      req.method === "OPTIONS"
      && allowedOrigin
      && requestOrigin === allowedOrigin
      && isCorsEnabledRoute(req.path)
    ) {
      res.status(204).end();
      return;
    }

    next();
  });

  app.use((req, res, next) => {
    const requestId = randomUUID();
    res.locals.requestId = requestId;

    const started = Date.now();
    res.on("finish", () => {
      logger.info("http_request", {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - started
      });
    });

    next();
  });

  const staticHeaderSetter = (res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
  };
  app.use("/uploads", express.static(config.uploadsDir, { setHeaders: staticHeaderSetter }));
  app.use("/output", express.static(config.outputDir, { setHeaders: staticHeaderSetter }));

  app.use((req, res, next) => {
    if (!config.basicAuthUser || !config.basicAuthPassword || isPublicRoute(req.path)) {
      next();
      return;
    }

    const credentials = parseBasicAuthHeader(req.get("authorization"));
    if (isValidBasicAuth(credentials, config.basicAuthUser, config.basicAuthPassword)) {
      next();
      return;
    }

    res.setHeader("WWW-Authenticate", 'Basic realm="SocialShorts"');
    next(new AppError(401, "Authentication required.", {
      code: "basic_auth_required"
    }));
  });

  app.use(express.static(config.publicDir));

  function resolveBrand(payload) {
    if (payload?.brandId) {
      const brand = brandRepository.getById(payload.brandId);
      if (!brand) {
        throw new AppError(400, `Unknown brand "${payload.brandId}".`, {
          code: "unknown_brand"
        });
      }
      return brand;
    }

    if (payload?.brand?.id) {
      const persistedBrand = brandRepository.getById(payload.brand.id);
      return persistedBrand || payload.brand;
    }

    if (payload?.brand && payload.brand.name) {
      return payload.brand;
    }

    throw new AppError(400, "brand or brandId is required.", {
      code: "missing_brand"
    });
  }

  function decorateBrand(brand) {
    return {
      ...brand,
      productCatalog: productRepository.listByBrandId(brand.id)
    };
  }

  function resolveKieOverride(req) {
    return req.body?.kieApiKey || req.get("x-kie-api-key") || req.query.kieApiKey || "";
  }

  function resolveElevenLabsOverride(req) {
    return req.body?.elevenLabsApiKey || req.get("x-elevenlabs-api-key") || req.query.elevenLabsApiKey || "";
  }

  function withGenerationContext(fields, generationConfig) {
    const config = generationConfig && typeof generationConfig === "object"
      ? generationConfig
      : {};

    return {
      ...(fields || {}),
      generationConfig: config
    };
  }

  function buildGenerationConfigFromRequest(body = {}, fallbackImageUrl = "") {
    return normalizeGenerationConfig({
      ...(body?.modelDefaults || {}),
      ...(body?.generationConfig || {}),
      ...(body?.model ? { profileId: body.model } : {}),
      imageUrls: Array.isArray(body?.imageUrls) && body.imageUrls.length > 0
        ? body.imageUrls
        : fallbackImageUrl
          ? [fallbackImageUrl]
          : []
    });
  }

  async function resolveAnalysisForRequest(body, pipeline, brand) {
    const providedAnalysis = String(body?.analysis || "").trim();
    if (providedAnalysis) {
      return providedAnalysis;
    }

    const imageUrl = String(body?.imageUrl || body?.sourceImageUrl || "").trim();
    if (imageUrl) {
      return anthropicService.analyzeImage(imageUrl, pipeline, brand);
    }

    // Narrated planning can start from topic/category context alone before any optional reference image is attached.
    return buildNarratedPlanningAnalysis({
      pipeline,
      brand,
      fields: {
        ...withGenerationContext(
          body?.fields || {},
          buildGenerationConfigFromRequest(body, imageUrl)
        ),
        hasReferenceImage: false
      }
    });
  }

  function normalizeCompatSegments(segments = []) {
    return (Array.isArray(segments) ? segments : []).map((segment, index) => ({
      segmentIndex: Number(segment.segmentIndex || index + 1),
      text: String(segment.text || "").trim(),
      visualIntent: String(segment.visualIntent || segment.visual_intent || "").trim(),
      estimatedSeconds: Number(segment.estimatedSeconds || segment.estimated_seconds || 0) || 0,
      actualDurationSeconds: segment.actualDurationSeconds ?? segment.actual_duration_seconds ?? null,
      shotType: String(segment.shotType || segment.shot_type || "").trim(),
      sourceStrategy: String(segment.sourceStrategy || segment.source_strategy || "hybrid").trim() || "hybrid",
      audioUrl: segment.audioUrl || segment.audio_url || null,
      videoUrl: segment.videoUrl || segment.video_url || null,
      brollStatus: segment.brollStatus || segment.broll_status || "complete"
    })).filter((segment) => segment.text);
  }

  function buildModelsPayload() {
    const models = listGenerationProfiles();
    return {
      models,
      profiles: models,
      canonicalRoute: "/api/models"
    };
  }

  function parseMediaUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return null;
    }

    try {
      return new URL(raw, config.baseUrl);
    } catch {
      return null;
    }
  }

  function getMediaExtension(value) {
    const parsed = parseMediaUrl(value);
    if (!parsed) {
      return "";
    }

    return path.extname(parsed.pathname || "").toLowerCase();
  }

  function isSupportedMediaUrl(value, allowedExtensions) {
    const parsed = parseMediaUrl(value);
    if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    const extension = getMediaExtension(value);
    return !extension || allowedExtensions.has(extension);
  }

  function validateDirectNarratedRenderMedia(sourceImageUrl, segments = []) {
    const allowedImageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
    const allowedAudioExtensions = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg"]);
    const allowedVideoExtensions = new Set([".mp4", ".mov", ".webm", ".m4v"]);

    // Fail fast on obviously wrong media types so Remotion does not crash deep in render.
    if (sourceImageUrl && !isSupportedMediaUrl(sourceImageUrl, allowedImageExtensions)) {
      throw new AppError(400, "imageUrl must point to an HTTP(S) image asset for direct narrated renders.", {
        code: "invalid_direct_source_image_url"
      });
    }

    const invalidAudioSegment = segments.find((segment) => !isSupportedMediaUrl(segment.audioUrl, allowedAudioExtensions));
    if (invalidAudioSegment) {
      throw new AppError(400, `Segment ${invalidAudioSegment.segmentIndex} needs an HTTP(S) audioUrl for direct narrated renders.`, {
        code: "invalid_direct_segment_audio_url"
      });
    }

    const invalidVideoSegment = segments.find((segment) => !isSupportedMediaUrl(segment.videoUrl, allowedVideoExtensions));
    if (invalidVideoSegment) {
      throw new AppError(400, `Segment ${invalidVideoSegment.segmentIndex} needs an HTTP(S) videoUrl for direct narrated renders.`, {
        code: "invalid_direct_segment_video_url"
      });
    }
  }

  function buildCompatSceneBreakdown(segments = []) {
    return segments.map((segment) => ({
      sceneNumber: segment.segmentIndex,
      text: segment.text,
      visualIntent: segment.visualIntent,
      estimatedSeconds: segment.estimatedSeconds,
      shotType: segment.shotType,
      sourceStrategy: segment.sourceStrategy
    }));
  }

  function getMonthRange(monthValue) {
    const now = new Date();
    const [year, month] = String(monthValue || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`)
      .split("-")
      .map((part) => Number.parseInt(part, 10));

    const start = new Date(Date.UTC(year, (month || 1) - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month || 1, 1, 0, 0, 0, 0));
    return {
      month: `${year}-${String((month || 1)).padStart(2, "0")}`,
      start: start.toISOString(),
      end: end.toISOString()
    };
  }

  function buildSpendSummary(jobs, month) {
    const totals = {
      month,
      estimatedTotalUsd: 0,
      estimatedKnownJobs: 0,
      estimatedUnknownJobs: 0,
      generatedJobs: 0,
      byProfile: {}
    };

    for (const job of jobs) {
      if (!["ready", "distributed", "polling", "submitting", "awaiting_generation", "failed"].includes(job.status)) {
        continue;
      }

      if (!job.providerConfig?.generationConfig?.profileId) {
        continue;
      }

      totals.generatedJobs += 1;

      const profileId = job.providerConfig.generationConfig.profileId;
      if (!totals.byProfile[profileId]) {
        totals.byProfile[profileId] = {
          profileId,
          estimatedTotalUsd: 0,
          jobs: 0,
          unknownJobs: 0
        };
      }

      totals.byProfile[profileId].jobs += 1;
      const cost = job.providerConfig?.estimatedCostUsd;
      if (typeof cost === "number") {
        totals.estimatedTotalUsd = Number((totals.estimatedTotalUsd + cost).toFixed(3));
        totals.estimatedKnownJobs += 1;
        totals.byProfile[profileId].estimatedTotalUsd = Number((totals.byProfile[profileId].estimatedTotalUsd + cost).toFixed(3));
      } else {
        totals.estimatedUnknownJobs += 1;
        totals.byProfile[profileId].unknownJobs += 1;
      }
    }

    totals.byProfile = Object.values(totals.byProfile).sort((left, right) => left.profileId.localeCompare(right.profileId));
    return totals;
  }

  function resolveCallbackVideoUrl(body) {
    const resultPayload = (() => {
      if (body?.data?.resultJson && typeof body.data.resultJson === "string") {
        return safeJsonParse(body.data.resultJson, null);
      }

      if (body?.data?.resultJson && typeof body.data.resultJson === "object") {
        return body.data.resultJson;
      }

      return null;
    })();

    const resultUrls = Array.isArray(body?.data?.resultUrls)
      ? body.data.resultUrls
      : Array.isArray(resultPayload?.resultUrls)
        ? resultPayload.resultUrls
        : [];

    return body?.videoUrl
      || body?.video_url
      || body?.data?.videoUrl
      || body?.data?.video_url
      || resultUrls[0]
      || null;
  }

  app.get("/api/health", (_req, res) => {
    const providerStates = apiKeyStore.buildPayload().providers;
    res.json({
      ok: true,
      app: "tiktok-pipeline",
      auth: {
        enabled: Boolean(config.basicAuthUser && config.basicAuthPassword)
      },
      database: {
        configured: Boolean(config.databasePath)
      },
      providers: Object.fromEntries(providerStates.map((provider) => [provider.id, {
        configured: provider.configured,
        source: provider.source,
        hasSavedValue: provider.hasSavedValue,
        maskedValue: provider.maskedValue,
        label: provider.label
      }])),
      checks: {
        baseUrlConfigured: Boolean(config.baseUrl),
        baseUrlIsPublic: validation.baseUrlIsPublic,
        narratedRenderAvailable: typeof narratedComposeService?.isAvailable === "function"
          ? narratedComposeService.isAvailable()
          : false,
        slidesRenderAvailable: typeof slideComposeService?.isAvailable === "function"
          ? slideComposeService.isAvailable()
          : false
      }
    });
  });

  app.get("/api/settings/api-keys", (_req, res) => {
    res.json(apiKeyStore.buildPayload());
  });

  app.put("/api/settings/api-keys", asyncRoute(async (req, res) => {
    const providerValues = req.body?.providers;
    if (!providerValues || typeof providerValues !== "object" || Array.isArray(providerValues)) {
      throw new AppError(400, "providers must be an object keyed by provider id.", {
        code: "invalid_api_key_settings_payload"
      });
    }

    const updates = {};
    for (const [providerId, value] of Object.entries(providerValues)) {
      const definition = findApiKeyProviderDefinition(providerId);
      if (!definition) {
        throw new AppError(400, `Unknown API key provider "${providerId}".`, {
          code: "unknown_api_key_provider"
        });
      }

      if (value !== undefined && value !== null && typeof value !== "string") {
        throw new AppError(400, `${definition.label} API key must be a string.`, {
          code: "invalid_api_key_value",
          details: {
            providerId
          }
        });
      }

      updates[providerId] = String(value || "").trim();
    }

    res.json(apiKeyStore.setProviderValues(updates));
  }));

  app.get("/api/narrated/options", (_req, res) => {
    const narratedOptions = getNarratedOptionsPayload();
    res.json({
      voices: listNarratedVoices(),
      platformPresets: [
        { id: "tiktok", label: "TikTok" },
        { id: "instagram", label: "Instagram Reels" }
      ],
      trendingHooks: listTrendingHookPatterns(),
      templates: narratedOptions.templates,
      narratorTones: narratedOptions.narratorTones,
      ctaStyles: narratedOptions.ctaStyles,
      visualIntensityLevels: narratedOptions.visualIntensityLevels
    });
  });

  app.get("/api/models", (_req, res) => {
    res.json(buildModelsPayload());
  });

  app.get("/api/brands", (_req, res) => {
    res.json(brandRepository.getAll().map(decorateBrand));
  });

  app.post("/api/brands", asyncRoute(async (req, res) => {
    const brand = brandRepository.create(req.body || {});
    res.status(201).json(decorateBrand(brand));
  }));

  app.put("/api/brands/:brandId", asyncRoute(async (req, res) => {
    const brand = brandRepository.update(req.params.brandId, req.body || {});
    res.json(decorateBrand(brand));
  }));

  app.get("/api/brands/:brandId/products", asyncRoute(async (req, res) => {
    const brand = brandRepository.getById(req.params.brandId);
    if (!brand) {
      throw new AppError(404, "Brand not found.", {
        code: "brand_not_found"
      });
    }

    res.json({
      products: productRepository.listByBrandId(brand.id)
    });
  }));

  app.post("/api/brands/:brandId/products/import", asyncRoute(async (req, res) => {
    const brand = brandRepository.getById(req.params.brandId);
    if (!brand) {
      throw new AppError(404, "Brand not found.", {
        code: "brand_not_found"
      });
    }

    const inputs = amazonCatalogService.splitImportInputs(req.body?.items || req.body?.rawText || "");
    if (inputs.length === 0) {
      throw new AppError(400, "Paste at least one ASIN or Amazon product URL to import.", {
        code: "missing_product_inputs"
      });
    }

    const imported = [];
    const failures = [];

    for (const input of inputs.slice(0, 25)) {
      try {
        const details = await amazonCatalogService.importProduct({ brand, input });
        imported.push(productRepository.upsertImported({
          brandId: brand.id,
          ...details
        }));
      } catch (error) {
        failures.push({
          input,
          message: error.message
        });
      }
    }

    res.json({
      products: productRepository.listByBrandId(brand.id),
      importedCount: imported.length,
      failureCount: failures.length,
      failures
    });
  }));

  app.delete("/api/brands/:brandId/products/:productId", asyncRoute(async (req, res) => {
    const brand = brandRepository.getById(req.params.brandId);
    if (!brand) {
      throw new AppError(404, "Brand not found.", {
        code: "brand_not_found"
      });
    }

    productRepository.deleteById(brand.id, req.params.productId);
    res.json({
      products: productRepository.listByBrandId(brand.id)
    });
  }));

  app.get("/api/generation/profiles", (_req, res) => {
    res.json({
      ...buildModelsPayload(),
      deprecated: true
    });
  });

  app.get("/api/costs/summary", asyncRoute(async (req, res) => {
    const range = getMonthRange(req.query.month);
    const jobs = jobManager.listJobs({
      createdAfter: range.start,
      createdBefore: range.end,
      limit: 2000
    });

    res.json({
      summary: buildSpendSummary(jobs, range.month)
    });
  }));

  app.post("/api/upload", upload.single("image"), (req, res) => {
    const uploadedImage = storeUploadedImage(req.file, config.uploadsDir);
    const imageUrl = new URL(`/uploads/${uploadedImage.filename}`, config.baseUrl).toString();
    res.json({ imageUrl });
  });

  app.post("/api/analyze", asyncRoute(async (req, res) => {
    const { imageUrl, pipeline } = req.body || {};
    if (!imageUrl || !pipeline) {
      throw new AppError(400, "imageUrl and pipeline are required.", {
        code: "missing_analysis_inputs"
      });
    }

    const brand = (req.body?.brandId || req.body?.brand?.id || req.body?.brand?.name)
      ? resolveBrand(req.body)
      : null;
    const analysis = await anthropicService.analyzeImage(imageUrl, pipeline, brand);
    res.json({ analysis });
  }));

  app.post("/api/ideas", asyncRoute(async (req, res) => {
    const { pipeline, imageUrl } = req.body || {};
    if (!["edu", "comedy", "product"].includes(pipeline)) {
      throw new AppError(400, "pipeline must be edu, comedy, or product.", {
        code: "invalid_pipeline"
      });
    }

    const brand = resolveBrand(req.body);
    const count = Math.min(Math.max(Number.parseInt(req.body?.count, 10) || 3, 1), 20);
    const providedAnalysis = String(req.body?.analysis || "").trim();
    const analysis = providedAnalysis || (imageUrl
      ? await anthropicService.analyzeImage(imageUrl, pipeline, brand)
      : "");
    const suggestions = decorateIdeaSuggestionsWithHookAngles(await anthropicService.suggestIdeas(
      analysis,
      pipeline,
      brand,
      req.body?.fields || {},
      count,
      req.body?.sequenceOptions || {}
    ), pipeline);

    res.json({
      suggestions,
      analysis: analysis || undefined
    });
  }));

  app.post("/api/script", asyncRoute(async (req, res) => {
    const { analysis, pipeline, fields } = req.body || {};
    if (!analysis || !pipeline) {
      throw new AppError(400, "analysis and pipeline are required.", {
        code: "missing_script_inputs"
      });
    }

    const brand = resolveBrand(req.body);
    const fieldsWithGenerationContext = withGenerationContext(fields || {}, req.body?.generationConfig);
    const enrichedFields = anthropicService.autofillMissingIdeaFields
      ? await anthropicService.autofillMissingIdeaFields(analysis, pipeline, brand, fieldsWithGenerationContext)
      : fieldsWithGenerationContext;
    const script = await anthropicService.generateScript(analysis, pipeline, brand, enrichedFields);
    res.json({ script, fields: enrichedFields });
  }));

  app.post("/api/videoprompt", asyncRoute(async (req, res) => {
    const { analysis, script, pipeline, fields } = req.body || {};
    if (!analysis || !script || !pipeline) {
      throw new AppError(400, "analysis, script, and pipeline are required.", {
        code: "missing_video_prompt_inputs"
      });
    }

    const brand = resolveBrand(req.body);
    const videoPrompt = await anthropicService.generateVideoPrompt(
      analysis,
      script,
      pipeline,
      brand,
      withGenerationContext(fields || {}, req.body?.generationConfig)
    );
    res.json({ videoPrompt });
  }));

  app.post("/api/captions", asyncRoute(async (req, res) => {
    const { script, pipeline } = req.body || {};
    if (!script || !pipeline) {
      throw new AppError(400, "script and pipeline are required.", {
        code: "missing_caption_inputs"
      });
    }

    const brand = resolveBrand(req.body);
    const captions = await anthropicService.generateCaptionAndHashtags(
      script,
      pipeline,
      brand,
      withGenerationContext(req.body?.fields || {}, req.body?.generationConfig)
    );
    res.json({ captions });
  }));

  app.post("/api/narration/script", asyncRoute(async (req, res) => {
    const pipeline = String(req.body?.pipeline || "").trim();
    if (!["edu", "comedy", "product"].includes(pipeline)) {
      throw new AppError(400, "pipeline must be edu, comedy, or product.", {
        code: "invalid_pipeline"
      });
    }

    const brand = resolveBrand(req.body);
    const analysis = await resolveAnalysisForRequest(req.body, pipeline, brand);
    const sourceImageUrl = String(req.body?.imageUrl || req.body?.sourceImageUrl || "").trim();
    const generationConfig = buildGenerationConfigFromRequest(req.body, sourceImageUrl);
    const plan = await anthropicService.generateNarratedPlan(
      analysis,
      pipeline,
      brand,
      {
        ...withGenerationContext(req.body?.fields || {}, generationConfig),
        hasReferenceImage: Boolean(sourceImageUrl)
      }
    );

    res.json({
      analysis,
      narrationTitle: String(plan.title || "").trim(),
      totalDurationSeconds: Number(plan.totalDurationSeconds || 0) || undefined,
      segments: normalizeCompatSegments(plan.segments || [])
    });
  }));

  app.post("/api/narration/voice", asyncRoute(async (req, res) => {
    const voiceId = normalizeNarratedVoiceId(req.body?.voiceId);
    const segments = normalizeCompatSegments(req.body?.segments || []);

    if (segments.length > 0) {
      const tasks = [];
      for (const segment of segments) {
        const response = await elevenLabsService.generateVoiceover({
          text: segment.text,
          voiceId,
          apiKey: resolveElevenLabsOverride(req),
          fileNamePrefix: `compat-${segment.segmentIndex}`
        });
        tasks.push({
          segmentIndex: segment.segmentIndex,
          taskId: response.taskId,
          status: response.status || "success",
          audioUrl: response.audioUrl || undefined
        });
      }

      res.json({ tasks });
      return;
    }

    const text = String(req.body?.text || "").trim();
    if (!text) {
      throw new AppError(400, "text or segments is required.", {
        code: "missing_narration_text"
      });
    }

    const response = await elevenLabsService.generateVoiceover({
      text,
      voiceId,
      apiKey: resolveElevenLabsOverride(req),
      fileNamePrefix: "compat"
    });

    res.json({
      taskId: response.taskId,
      status: response.status || "success",
      audioUrl: response.audioUrl || undefined
    });
  }));

  app.post("/api/narration/broll-prompts", asyncRoute(async (req, res) => {
    const pipeline = String(req.body?.pipeline || "").trim();
    if (!["edu", "comedy", "product"].includes(pipeline)) {
      throw new AppError(400, "pipeline must be edu, comedy, or product.", {
        code: "invalid_pipeline"
      });
    }

    const brand = resolveBrand(req.body);
    const analysis = await resolveAnalysisForRequest(req.body, pipeline, brand);
    const segments = normalizeCompatSegments(req.body?.segments || []);
    if (segments.length === 0) {
      throw new AppError(400, "segments are required.", {
        code: "missing_narration_segments"
      });
    }
    const sourceImageUrl = String(req.body?.imageUrl || req.body?.sourceImageUrl || "").trim();
    const generationConfig = buildGenerationConfigFromRequest(req.body, sourceImageUrl);

    const prompts = await anthropicService.generateNarratedBrollPlan(
      analysis,
      pipeline,
      brand,
      {
        ...withGenerationContext(req.body?.fields || {}, generationConfig),
        hasReferenceImage: Boolean(sourceImageUrl)
      },
      segments,
      generationConfig
    );

    res.json({
      analysis,
      prompts,
      segments: prompts
    });
  }));

  app.post("/api/scenes/generate", asyncRoute(async (req, res) => {
    const pipeline = String(req.body?.pipeline || "").trim();
    if (!["edu", "comedy", "product"].includes(pipeline)) {
      throw new AppError(400, "pipeline must be edu, comedy, or product.", {
        code: "invalid_pipeline"
      });
    }

    const brand = resolveBrand(req.body);
    const analysis = await resolveAnalysisForRequest(req.body, pipeline, brand);
    const sourceImageUrl = String(req.body?.imageUrl || req.body?.sourceImageUrl || "").trim();
    const generationConfig = buildGenerationConfigFromRequest(req.body, sourceImageUrl);
    const plan = await anthropicService.generateNarratedPlan(
      analysis,
      pipeline,
      brand,
      {
        ...withGenerationContext(req.body?.fields || {}, generationConfig),
        hasReferenceImage: Boolean(sourceImageUrl)
      }
    );

    res.json({
      analysis,
      title: String(plan.title || "").trim(),
      scenes: buildCompatSceneBreakdown(normalizeCompatSegments(plan.segments || []))
    });
  }));

  app.post("/api/generate", asyncRoute(async (req, res) => {
    const { videoPrompt, imageUrl } = req.body || {};
    const generationConfig = buildGenerationConfigFromRequest(req.body, imageUrl);
    const response = await kieService.generateVideo({
      videoPrompt,
      imageUrl,
      imageUrls: generationConfig.imageUrls,
      generationConfig,
      kieApiKey: resolveKieOverride(req)
    });

    res.json({
      taskId: response.taskId,
      status: response.status,
      videoUrl: response.videoUrl || undefined
    });
  }));

  app.get("/api/poll/:taskId", asyncRoute(async (req, res) => {
    const result = await kieService.pollStatus(req.params.taskId, {
      kieApiKey: resolveKieOverride(req)
    });

    res.json({
      status: result.status,
      videoUrl: result.videoUrl || undefined,
      error: result.error || undefined
    });
  }));

  app.post("/api/callback", asyncRoute(async (req, res) => {
    const taskId = req.body?.taskId || req.body?.id || req.body?.data?.taskId;
    const videoUrl = resolveCallbackVideoUrl(req.body || {});

    if (taskId && videoUrl) {
      jobManager.handleProviderCallback({ taskId, videoUrl });
    }

    res.json({ ok: true });
  }));

  app.get("/api/jobs", asyncRoute(async (req, res) => {
    const ids = req.query.ids
      ? String(req.query.ids).split(",").map((id) => id.trim()).filter(Boolean)
      : [];
    const statuses = req.query.statuses
      ? String(req.query.statuses).split(",").map((status) => status.trim()).filter(Boolean)
      : [];
    const limit = req.query.limit ? Number.parseInt(req.query.limit, 10) : 100;

    res.json({
      jobs: jobManager.listJobs({ ids, statuses, limit })
    });
  }));

  app.post("/api/jobs", asyncRoute(async (req, res) => {
    const mode = String(req.body?.mode || "single").trim();
    if (mode === "slides") {
      const job = await slideWorkflowService.createDraft({
        brandId: req.body?.brandId,
        pipeline: req.body?.pipeline,
        fields: req.body?.fields || {},
        sourceImageUrl: req.body?.imageUrl || req.body?.sourceImageUrl,
        generationConfig: req.body?.generationConfig
      });

      res.status(201).json({ job });
      return;
    }

    if (mode === "narrated") {
      const job = await narratedWorkflowService.createDraft({
        brandId: req.body?.brandId,
        pipeline: req.body?.pipeline,
        fields: req.body?.fields || {},
        sourceImageUrl: req.body?.imageUrl || req.body?.sourceImageUrl,
        generationConfig: req.body?.generationConfig
      });

      res.status(201).json({ job });
      return;
    }

    const generationConfig = normalizeGenerationConfig({
      ...(req.body?.generationConfig || {}),
      imageUrls: req.body?.imageUrls || [req.body?.imageUrl || req.body?.sourceImageUrl]
    });

    const job = jobManager.createJob({
      brandId: req.body?.brandId,
      pipeline: req.body?.pipeline,
      fields: req.body?.fields || {},
      sourceImageUrl: req.body?.imageUrl || req.body?.sourceImageUrl,
      generationConfig,
      estimatedCostUsd: generationConfig.estimatedCostUsd
    });

    res.status(201).json({ job });
  }));

  app.get("/api/jobs/:jobId", asyncRoute(async (req, res) => {
    let job = jobManager.getJob(req.params.jobId);
    if (job?.mode === "narrated") {
      job = await narratedWorkflowService.getJob(req.params.jobId);
    } else if (job?.mode === "slides") {
      job = await slideWorkflowService.getJob(req.params.jobId);
    } else if (!job) {
      job = await narratedWorkflowService.getJob(req.params.jobId);
      if (!job) {
        job = await slideWorkflowService.getJob(req.params.jobId);
      }
    }
    if (!job) {
      throw new AppError(404, "Job not found.", {
        code: "job_not_found"
      });
    }

    res.json({ job });
  }));

  app.patch("/api/jobs/:jobId/narration", asyncRoute(async (req, res) => {
    const job = await narratedWorkflowService.updateNarration(req.params.jobId, req.body || {});
    res.json({ job });
  }));

  app.patch("/api/jobs/:jobId/reference-image", asyncRoute(async (req, res) => {
    const job = await narratedWorkflowService.updateReferenceImage(req.params.jobId, req.body || {});
    res.json({ job });
  }));

  app.patch("/api/jobs/:jobId/slides", asyncRoute(async (req, res) => {
    const job = await slideWorkflowService.updateSlides(req.params.jobId, req.body || {});
    res.json({ job });
  }));

  app.post("/api/jobs/:jobId/slides/render", asyncRoute(async (req, res) => {
    const job = await slideWorkflowService.render(req.params.jobId);
    res.json({ job });
  }));

  app.post("/api/jobs/:jobId/voice", asyncRoute(async (req, res) => {
    const job = await narratedWorkflowService.generateVoice(req.params.jobId, {});
    res.json({ job });
  }));

  app.post("/api/jobs/:jobId/segments/:segmentId/voice", asyncRoute(async (req, res) => {
    const job = await narratedWorkflowService.generateVoice(req.params.jobId, {
      segmentId: req.params.segmentId
    });
    res.json({ job });
  }));

  app.post("/api/jobs/:jobId/broll/prompts", asyncRoute(async (req, res) => {
    const job = await narratedWorkflowService.generateBrollPrompts(req.params.jobId);
    res.json({ job });
  }));

  app.post("/api/jobs/:jobId/broll/render", asyncRoute(async (req, res) => {
    const job = await narratedWorkflowService.renderBroll(req.params.jobId, {});
    res.json({ job });
  }));

  app.post("/api/jobs/:jobId/broll", asyncRoute(async (req, res) => {
    const job = await narratedWorkflowService.generateBroll(req.params.jobId);
    res.json({ job });
  }));

  app.post("/api/jobs/:jobId/segments/:segmentId/broll", asyncRoute(async (req, res) => {
    const job = await narratedWorkflowService.renderBroll(req.params.jobId, {
      segmentId: req.params.segmentId
    });
    res.json({ job });
  }));

  app.post("/api/jobs/:jobId/compose", asyncRoute(async (req, res) => {
    const job = await narratedWorkflowService.compose(req.params.jobId);
    res.json({ job });
  }));

  app.post("/api/jobs/:jobId/retry", asyncRoute(async (req, res) => {
    const job = jobManager.retryJob(req.params.jobId);
    res.json({ job });
  }));

  app.delete("/api/jobs/:jobId", asyncRoute(async (req, res) => {
    const payload = jobManager.deleteJob(req.params.jobId);
    res.json(payload);
  }));

  app.post("/api/jobs/sequence/finalize", asyncRoute(async (req, res) => {
    const job = jobManager.upsertSequenceFinalJob({
      jobIds: req.body?.jobIds || [],
      videoUrl: req.body?.videoUrl,
      thumbnailUrl: req.body?.thumbnailUrl,
      requestedSegments: req.body?.requestedSegments,
      sourceSegments: req.body?.sourceSegments,
      merged: req.body?.merged
    });

    res.json({ job });
  }));

  app.post("/api/jobs/:jobId/distribute", asyncRoute(async (req, res) => {
    const job = await jobManager.distributeJob(req.params.jobId, req.body?.platformConfigs || {});
    res.json({
      job,
      results: job.distribution?.results || []
    });
  }));

  app.post("/api/batch/compile", asyncRoute(async (req, res) => {
    const groups = Array.isArray(req.body?.groups) ? req.body.groups : [];
    if (groups.length === 0) {
      throw new AppError(400, "At least one batch compilation group is required.", {
        code: "missing_batch_compile_groups"
      });
    }

    const results = [];
    for (const group of groups) {
      const pipeline = String(group?.pipeline || "").trim() || "batch";
      const label = String(group?.label || pipeline).trim();
      const videoUrls = Array.isArray(group?.videoUrls)
        ? group.videoUrls.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
      const requestedSegments = Number.parseInt(group?.requestedSegments, 10) || videoUrls.length;

      if (videoUrls.length === 0) {
        results.push({
          pipeline,
          label,
          requestedSegments,
          sourceSegments: 0,
          merged: false,
          status: "failed",
          videoUrl: null,
          error: "No ready clips were available to compile for this category."
        });
        continue;
      }

      if (videoUrls.length === 1) {
        results.push({
          pipeline,
          label,
          requestedSegments,
          sourceSegments: 1,
          merged: false,
          status: "ready",
          videoUrl: videoUrls[0],
          error: null
        });
        continue;
      }

      try {
        const merged = await falService.mergeVideos({
          videoUrls,
          resolution: group?.resolution || "portrait_16_9",
          targetFps: group?.targetFps || 30
        });

        results.push({
          pipeline,
          label,
          requestedSegments,
          sourceSegments: videoUrls.length,
          merged: true,
          status: "ready",
          videoUrl: merged.videoUrl,
          error: null
        });
      } catch (error) {
        results.push({
          pipeline,
          label,
          requestedSegments,
          sourceSegments: videoUrls.length,
          merged: false,
          status: "failed",
          videoUrl: null,
          error: error.message
        });
      }
    }

    res.json({ results });
  }));

  app.post("/api/stitch", asyncRoute(async (req, res) => {
    const videoUrls = Array.isArray(req.body?.videoUrls)
      ? req.body.videoUrls.map((value) => String(value || "").trim()).filter(Boolean)
      : [];

    if (videoUrls.length === 0) {
      throw new AppError(400, "videoUrls is required.", {
        code: "missing_video_urls"
      });
    }

    if (videoUrls.length === 1) {
      res.json({
        merged: false,
        videoUrl: videoUrls[0],
        sourceSegments: 1
      });
      return;
    }

    const merged = await falService.mergeVideos({
      videoUrls,
      resolution: req.body?.resolution || "portrait_16_9",
      targetFps: req.body?.targetFps || 30
    });

    res.json({
      merged: true,
      videoUrl: merged.videoUrl,
      sourceSegments: videoUrls.length
    });
  }));

  app.post("/api/render-narrated", asyncRoute(async (req, res) => {
    const jobId = String(req.body?.jobId || "").trim();
    if (jobId) {
      const job = await narratedWorkflowService.compose(jobId);
      res.json({ job });
      return;
    }

    const pipeline = String(req.body?.pipeline || "").trim();
    if (!["edu", "comedy", "product"].includes(pipeline)) {
      throw new AppError(400, "pipeline must be edu, comedy, or product.", {
        code: "invalid_pipeline"
      });
    }

    const brand = resolveBrand(req.body);
    const sourceImageUrl = String(req.body?.imageUrl || req.body?.sourceImageUrl || "").trim();
    const segments = normalizeCompatSegments(req.body?.segments || []);
    if (segments.length === 0) {
      throw new AppError(400, "Rendered segments are required.", {
        code: "missing_direct_narrated_inputs"
      });
    }

    if (segments.some((segment) => !segment.audioUrl || !segment.videoUrl)) {
      throw new AppError(400, "Each direct narrated segment needs both audioUrl and videoUrl.", {
        code: "missing_direct_segment_media"
      });
    }

    validateDirectNarratedRenderMedia(sourceImageUrl, segments);

    const tempJob = {
      id: randomUUID(),
      brandId: brand.id,
      pipeline,
      mode: "narrated",
      fields: {
        ...(req.body?.fields || {}),
        platformPreset: req.body?.fields?.platformPreset || "tiktok",
        templateId: req.body?.fields?.templateId || "problem_solution_result",
        visualIntensity: req.body?.fields?.visualIntensity || "balanced",
        ctaStyle: req.body?.fields?.ctaStyle || "soft",
        narrationTitle: req.body?.fields?.narrationTitle || "Direct narrated render"
      },
      sourceImageUrl: sourceImageUrl || ""
    };

    const result = await narratedComposeService.compose(tempJob, segments, brand);
    res.json(result);
  }));

  app.post("/api/distribute", asyncRoute(async (req, res) => {
    const { videoUrl, platformConfigs } = req.body || {};
    if (!videoUrl) {
      throw new AppError(400, "videoUrl is required.", {
        code: "missing_video_url"
      });
    }

    const distribution = await distributionService.distributeVideo(videoUrl, platformConfigs || {});
    res.json({ results: distribution.results });
  }));

  app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
      const payload = serializeError(new AppError(400, error.message, {
        code: "upload_error"
      }));
      res.status(payload.statusCode).json(payload);
      return;
    }

    next(error);
  });

  app.use((error, req, res, next) => {
    const payload = serializeError(error);
    logger.error("http_error", {
      requestId: res.locals.requestId,
      path: req.path,
      statusCode: payload.statusCode,
      code: payload.code,
      message: payload.message
    });
    res.status(payload.statusCode).json(payload);
  });

  return { app };
}

module.exports = {
  createApp
};
