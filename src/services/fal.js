const { AppError } = require("../utils/errors");

function firstDefined(values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function normalizeMergeResponse(payload) {
  const videoUrl = firstDefined([
    payload?.data?.video?.url,
    payload?.video?.url,
    payload?.data?.video_url,
    payload?.video_url,
    payload?.data?.output?.url,
    payload?.output?.url
  ]);

  if (!videoUrl) {
    throw new AppError(502, "FAL did not return a merged video URL.", {
      code: "fal_missing_video_url",
      details: payload
    });
  }

  return {
    videoUrl,
    raw: payload
  };
}

function createFalService(options = {}) {
  const defaultApiKey = options.apiKey || "";
  const logger = options.logger || { info() {}, warn() {}, error() {} };
  const subscribe = options.subscribe || (async (model, input, credentials) => {
    const { fal } = await import("@fal-ai/client");
    fal.config({
      credentials
    });

    return fal.subscribe(model, {
      input,
      logs: true,
      onQueueUpdate(update) {
        if (update?.status) {
          logger.info("fal_queue_update", {
            model,
            status: update.status
          });
        }
      }
    });
  });

  function resolveApiKey(override) {
    const apiKey = override || defaultApiKey;
    if (!apiKey) {
      throw new AppError(503, "FAL_KEY is not configured.", {
        code: "fal_not_configured"
      });
    }

    return apiKey;
  }

  async function mergeVideos({ videoUrls, falApiKey, resolution = "portrait_16_9", targetFps = 30 }) {
    const normalizedUrls = Array.isArray(videoUrls)
      ? videoUrls.map((value) => String(value || "").trim()).filter(Boolean)
      : [];

    if (normalizedUrls.length < 2) {
      throw new AppError(400, "At least two videos are required to merge clips.", {
        code: "fal_missing_video_urls"
      });
    }

    logger.info("fal_merge_requested", {
      videoCount: normalizedUrls.length,
      resolution,
      targetFps
    });

    const payload = await subscribe(
      "fal-ai/ffmpeg-api/merge-videos",
      {
        video_urls: normalizedUrls,
        resolution,
        target_fps: targetFps
      },
      resolveApiKey(falApiKey)
    );

    return normalizeMergeResponse(payload);
  }

  return {
    mergeVideos
  };
}

module.exports = {
  createFalService,
  normalizeMergeResponse
};
