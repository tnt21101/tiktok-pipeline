const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const express = require("express");
const multer = require("multer");
const { AppError, asyncRoute, serializeError } = require("./utils/errors");
const { safeJsonParse } = require("./utils/json");
const {
  listGenerationProfiles,
  normalizeGenerationConfig
} = require("./generation/modelProfiles");

function createUploadMiddleware(config) {
  const storage = multer.diskStorage({
    destination: config.uploadsDir,
    filename: (req, file, callback) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      callback(null, `${Date.now()}-${randomUUID()}${ext || ".png"}`);
    }
  });

  return multer({
    storage,
    limits: { fileSize: config.maxUploadBytes },
    fileFilter(req, file, callback) {
      if (!file.mimetype || !file.mimetype.startsWith("image/")) {
        callback(new AppError(400, "Only image uploads are allowed.", {
          code: "invalid_upload_type"
        }));
        return;
      }

      callback(null, true);
    }
  });
}

function createApp(dependencies) {
  const {
    config,
    validation,
    logger,
    brandRepository,
    settingsRepository,
    jobManager,
    anthropicService,
    kieService,
    falService,
    distributionService
  } = dependencies;

  const app = express();
  const upload = createUploadMiddleware(config);

  fs.mkdirSync(config.uploadsDir, { recursive: true });

  app.use(express.json({ limit: "2mb" }));
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-internal-api-token,x-kie-api-key");

    if (req.method === "OPTIONS") {
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

  if (config.internalApiToken) {
    app.use("/api", (req, res, next) => {
      if (req.path === "/health") {
        next();
        return;
      }

      if (req.get("x-internal-api-token") !== config.internalApiToken) {
        next(new AppError(401, "Missing or invalid internal API token.", {
          code: "invalid_internal_api_token"
        }));
        return;
      }

      next();
    });
  }

  app.use("/uploads", express.static(config.uploadsDir));
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

  function resolveKieOverride(req) {
    return req.body?.kieApiKey || req.get("x-kie-api-key") || req.query.kieApiKey || "";
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
    res.json({
      ok: true,
      app: "tiktok-pipeline",
      database: {
        configured: Boolean(config.databasePath),
        path: config.databasePath
      },
      providers: {
        anthropic: { configured: Boolean(config.anthropicApiKey) },
        kie: { configured: Boolean(config.kieApiKey) },
        fal: { configured: Boolean(config.falApiKey) },
        ayrshare: { configured: Boolean(config.ayrshareApiKey) }
      },
      checks: {
        baseUrl: config.baseUrl,
        baseUrlIsPublic: validation.baseUrlIsPublic
      },
      warnings: validation.warnings,
      agentCommandRoles: settingsRepository.get("agent_command_roles")?.value || null
    });
  });

  app.get("/api/brands", (_req, res) => {
    res.json(brandRepository.getAll());
  });

  app.post("/api/brands", asyncRoute(async (req, res) => {
    const brand = brandRepository.create(req.body || {});
    res.status(201).json(brand);
  }));

  app.put("/api/brands/:brandId", asyncRoute(async (req, res) => {
    const brand = brandRepository.update(req.params.brandId, req.body || {});
    res.json(brand);
  }));

  app.get("/api/generation/profiles", (_req, res) => {
    res.json({ profiles: listGenerationProfiles() });
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
    if (!req.file) {
      throw new AppError(400, "No file uploaded.", {
        code: "missing_upload"
      });
    }

    const imageUrl = `${config.baseUrl}/uploads/${req.file.filename}`;
    res.json({ imageUrl });
  });

  app.post("/api/analyze", asyncRoute(async (req, res) => {
    const { imageUrl, pipeline } = req.body || {};
    if (!imageUrl || !pipeline) {
      throw new AppError(400, "imageUrl and pipeline are required.", {
        code: "missing_analysis_inputs"
      });
    }

    const analysis = await anthropicService.analyzeImage(imageUrl, pipeline);
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
    const suggestions = await anthropicService.suggestIdeas(
      analysis,
      pipeline,
      brand,
      req.body?.fields || {},
      count,
      req.body?.sequenceOptions || {}
    );

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
    const enrichedFields = anthropicService.autofillMissingIdeaFields
      ? await anthropicService.autofillMissingIdeaFields(analysis, pipeline, brand, fields || {})
      : (fields || {});
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
    const videoPrompt = await anthropicService.generateVideoPrompt(analysis, script, pipeline, brand, fields || {});
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
    const captions = await anthropicService.generateCaptionAndHashtags(script, pipeline, brand);
    res.json({ captions });
  }));

  app.post("/api/generate", asyncRoute(async (req, res) => {
    const { videoPrompt, imageUrl } = req.body || {};
    const generationConfig = normalizeGenerationConfig({
      ...(req.body?.generationConfig || {}),
      imageUrls: req.body?.imageUrls || [imageUrl]
    });
    const response = await kieService.generateVideo({
      videoPrompt,
      imageUrl,
      imageUrls: generationConfig.imageUrls,
      generationConfig,
      kieApiKey: resolveKieOverride(req)
    });

    res.json({
      taskId: response.taskId,
      status: response.status
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
    const generationConfig = normalizeGenerationConfig({
      ...(req.body?.generationConfig || {}),
      imageUrls: req.body?.imageUrls || [req.body?.imageUrl || req.body?.sourceImageUrl]
    });

    const job = jobManager.createJob({
      brandId: req.body?.brandId,
      pipeline: req.body?.pipeline,
      fields: req.body?.fields || {},
      sourceImageUrl: req.body?.imageUrl || req.body?.sourceImageUrl,
      kieApiKey: req.body?.kieApiKey || ""
      ,
      generationConfig,
      estimatedCostUsd: generationConfig.estimatedCostUsd
    });

    res.status(201).json({ job });
  }));

  app.get("/api/jobs/:jobId", asyncRoute(async (req, res) => {
    const job = jobManager.getJob(req.params.jobId);
    if (!job) {
      throw new AppError(404, "Job not found.", {
        code: "job_not_found"
      });
    }

    res.json({ job });
  }));

  app.post("/api/jobs/:jobId/retry", asyncRoute(async (req, res) => {
    const job = jobManager.retryJob(req.params.jobId);
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
