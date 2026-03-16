const { AppError } = require("../utils/errors");
const { requestJson } = require("../utils/http");
const { safeJsonParse } = require("../utils/json");
const { assertPromptWithinLimit } = require("../utils/prompt");
const {
  getGenerationProfile,
  normalizeGenerationConfig,
  buildGenerateRequest,
  getPollEndpoint
} = require("../generation/modelProfiles");

function firstDefined(values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function asObject(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  if (typeof value === "string") {
    return safeJsonParse(value, null);
  }

  return null;
}

function extractResultPayload(payload) {
  return firstDefined([
    asObject(payload?.resultJson),
    asObject(payload?.data?.resultJson),
    asObject(payload?.data?.result),
    asObject(payload?.result),
    asObject(payload?.data?.output),
    asObject(payload?.output)
  ]);
}

function extractResultUrls(payload) {
  const resultPayload = extractResultPayload(payload);
  const resultUrls = firstDefined([
    payload?.resultUrls,
    payload?.data?.resultUrls,
    payload?.data?.response?.resultUrls,
    payload?.data?.output?.resultUrls,
    resultPayload?.resultUrls
  ]);

  return Array.isArray(resultUrls) ? resultUrls : [];
}

function mapStatus(value) {
  const normalized = String(value || "").toLowerCase();
  if (["wait", "queued", "queue", "queueing", "pending", "waiting"].includes(normalized)) {
    return "queueing";
  }

  if (["generating", "processing", "running", "in_progress"].includes(normalized)) {
    return "generating";
  }

  if (["success", "succeeded", "complete", "completed", "done"].includes(normalized)) {
    return "success";
  }

  if (["fail", "failed", "error", "cancelled", "canceled"].includes(normalized)) {
    return "fail";
  }

  return normalized || "queueing";
}

function unwrapApiError(payload) {
  const code = payload?.code;
  if (code === undefined || code === null || Number(code) === 200) {
    return null;
  }

  return new AppError(502, String(payload?.msg || "kie.ai rejected the request."), {
    code: "kie_api_error",
    details: payload
  });
}

function normalizeGenerateResponse(payload) {
  const apiError = unwrapApiError(payload);
  if (apiError) {
    throw apiError;
  }

  const taskId = firstDefined([
    payload?.taskId,
    payload?.id,
    payload?.data?.taskId,
    payload?.data?.id,
    payload?.data?.jobId,
    payload?.data?.recordId,
    payload?.data?.data?.taskId,
    payload?.result?.taskId
  ]);

  const resultUrls = extractResultUrls(payload);
  const videoUrl = firstDefined([
    payload?.videoUrl,
    payload?.video_url,
    payload?.data?.videoUrl,
    payload?.data?.video_url,
    payload?.data?.output?.videoUrl,
    payload?.data?.videoInfo?.videoUrl,
    payload?.data?.videoInfo?.video_url,
    resultUrls[0]
  ]);

  const status = mapStatus(firstDefined([
    payload?.status,
    payload?.data?.status,
    payload?.data?.state,
    payload?.state
  ]) || (videoUrl ? "success" : "queueing"));

  if (!taskId && !videoUrl) {
    throw new AppError(502, "kie.ai did not return a task id.", {
      code: "kie_missing_task_id",
      details: payload
    });
  }

  return {
    taskId: taskId || null,
    status,
    videoUrl: videoUrl || null,
    raw: payload
  };
}

function normalizePollResponse(payload) {
  const apiError = unwrapApiError(payload);
  if (apiError) {
    throw apiError;
  }

  const status = mapStatus(firstDefined([
    payload?.status,
    payload?.state,
    payload?.data?.status,
    payload?.data?.state,
    payload?.data?.data?.status,
    Number(payload?.successFlag) === 1 ? "success" : undefined,
    Number(payload?.data?.successFlag) === 1 ? "success" : undefined
  ]));

  const resultUrls = extractResultUrls(payload);
  const videoUrl = firstDefined([
    payload?.videoUrl,
    payload?.video_url,
    payload?.data?.videoUrl,
    payload?.data?.video_url,
    payload?.data?.output?.videoUrl,
    payload?.data?.output?.video_url,
    payload?.data?.videoInfo?.videoUrl,
    payload?.data?.videoInfo?.video_url,
    Array.isArray(payload?.data?.output) ? payload.data.output[0]?.videoUrl : undefined,
    resultUrls[0]
  ]);

  const error = firstDefined([
    payload?.error,
    payload?.message,
    payload?.msg,
    payload?.data?.error,
    payload?.data?.message,
    payload?.data?.failMsg
  ]);

  return {
    status: videoUrl ? "success" : status || "queueing",
    videoUrl: videoUrl || null,
    error: status === "fail" ? String(error || "Video generation failed.") : null,
    raw: payload
  };
}

function createKieService(options = {}) {
  const defaultApiKey = options.apiKey || "";
  const logger = options.logger || { info() {}, warn() {}, error() {} };
  const request = options.request || requestJson;

  function resolveApiKey(override) {
    const apiKey = override || defaultApiKey;
    if (!apiKey) {
      throw new AppError(503, "KIEAI_API_KEY is not configured.", {
        code: "kie_not_configured"
      });
    }

    return apiKey;
  }

  async function generateVideo({ videoPrompt, imageUrl, imageUrls, generationConfig, kieApiKey }) {
    if (!imageUrl) {
      throw new AppError(400, "imageUrl is required.", {
        code: "missing_image_url"
      });
    }

    let metrics;
    try {
      metrics = assertPromptWithinLimit(videoPrompt);
    } catch (error) {
      throw new AppError(422, error.message, {
        code: error.code || "prompt_too_long",
        details: error.metrics
      });
    }

    const normalizedConfig = normalizeGenerationConfig({
      ...(generationConfig || {}),
      imageUrls: imageUrls || generationConfig?.imageUrls || [imageUrl]
    });
    const profile = getGenerationProfile(normalizedConfig.profileId);
    const requestSpec = buildGenerateRequest({
      profile,
      videoPrompt,
      generationConfig: normalizedConfig,
      imageUrls: normalizedConfig.imageUrls.length > 0 ? normalizedConfig.imageUrls : [imageUrl],
      baseCallbackUrl: options.baseCallbackUrl
    });

    logger.info("kie_generate_requested", {
      promptLength: metrics.length,
      imageUrl,
      model: profile.model,
      profileId: normalizedConfig.profileId,
      providerFamily: profile.providerFamily
    });

    const response = await request(requestSpec.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolveApiKey(kieApiKey)}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestSpec.payload)
    });

    return normalizeGenerateResponse(response);
  }

  async function pollStatus(taskId, options = {}) {
    if (!taskId) {
      throw new AppError(400, "taskId is required.", {
        code: "missing_task_id"
      });
    }

    const profile = getGenerationProfile(options.generationConfig?.profileId);
    const url = new URL(getPollEndpoint(profile));
    url.searchParams.set("taskId", taskId);

    const response = await request(url.toString(), {
      headers: {
        Authorization: `Bearer ${resolveApiKey(options.kieApiKey)}`,
        "Content-Type": "application/json"
      }
    });

    return normalizePollResponse(response);
  }

  return {
    generateVideo,
    pollStatus,
    normalizeGenerateResponse,
    normalizePollResponse
  };
}

module.exports = {
  createKieService,
  normalizeGenerateResponse,
  normalizePollResponse
};
