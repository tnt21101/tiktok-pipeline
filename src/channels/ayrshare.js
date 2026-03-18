const { requestJson } = require("../utils/http");
const { AppError } = require("../utils/errors");

const DEFAULT_BASE_URL = "https://app.ayrshare.com/api";
const PLATFORM_RULES = {
  tiktok: {
    label: "TikTok",
    captionTargetLength: 40,
    captionMaxLength: 50,
    hashtagLimit: 5
  },
  instagram: {
    label: "Instagram Reels",
    captionTargetLength: 40,
    captionMaxLength: 50,
    hashtagLimit: 5
  },
  youtube: {
    label: "YouTube Shorts",
    captionMaxLength: 100,
    hashtagLimit: 3,
    requiresCaption: true
  }
};

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeHashtags(hashtags) {
  if (!Array.isArray(hashtags)) {
    return [];
  }

  return Array.from(new Set(hashtags
    .map((tag) => String(tag || "").trim().replace(/^#/, ""))
    .filter(Boolean)));
}

function validatePlatformConfig(config) {
  const rules = PLATFORM_RULES[config.platform];
  if (!rules) {
    throw new AppError(400, `Unsupported platform "${config.platform}".`, {
      code: "unsupported_platform"
    });
  }

  if (rules.requiresCaption && !config.caption) {
    throw new AppError(400, `${rules.label} requires a title before publishing.`, {
      code: "missing_platform_caption",
      details: { platform: config.platform }
    });
  }

  if (config.mode === "live" && !config.caption && config.hashtags.length === 0) {
    throw new AppError(400, `${rules.label} live posts need a caption or hashtags before publishing.`, {
      code: "missing_live_post_text",
      details: { platform: config.platform }
    });
  }

  if (config.caption.length > rules.captionMaxLength) {
    throw new AppError(400, `${rules.label} text exceeds the supported length limit.`, {
      code: "platform_caption_too_long",
      details: {
        platform: config.platform,
        maxLength: rules.captionMaxLength
      }
    });
  }

  if (config.hashtags.length > rules.hashtagLimit) {
    throw new AppError(400, `${rules.label} supports at most ${rules.hashtagLimit} hashtags in this tool.`, {
      code: "too_many_hashtags",
      details: {
        platform: config.platform,
        hashtagLimit: rules.hashtagLimit
      }
    });
  }
}

function normalizePlatformConfigs(platformConfigs = {}) {
  return Object.entries(platformConfigs)
    .filter(([, config]) => config && config.enabled)
    .map(([platform, config]) => {
      const normalized = {
      platform,
      mode: config.mode === "live" ? "live" : "draft",
      caption: normalizeText(config.caption || ""),
      hashtags: normalizeHashtags(config.hashtags)
    };

      validatePlatformConfig(normalized);
      return normalized;
    })
    .sort((left, right) => left.platform.localeCompare(right.platform));
}

function buildPostText(caption, hashtags) {
  const tags = hashtags.map((tag) => `#${tag}`).join(" ");
  return [caption, tags].filter(Boolean).join("\n\n").trim();
}

function extractExternalId(payload) {
  return payload?.id || payload?.postId || payload?.data?.id || payload?.data?.postId || null;
}

function createAyrshareChannel(options = {}) {
  const baseUrl = options.baseUrl || DEFAULT_BASE_URL;
  const resolveConfiguredApiKey = typeof options.apiKey === "function"
    ? options.apiKey
    : () => options.apiKey || "";
  const request = options.request || requestJson;

  function ensureApiKey() {
    const apiKey = String(resolveConfiguredApiKey() || "").trim();
    if (!apiKey) {
      throw new AppError(503, "AYRSHARE_API_KEY is not configured.", {
        code: "ayrshare_not_configured"
      });
    }

    return apiKey;
  }

  async function publishOne(videoUrl, config, options = {}) {
    const apiKey = ensureApiKey();

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    };

    if (options.socialAccounts?.ayrshareProfileKey) {
      headers["Profile-Key"] = options.socialAccounts.ayrshareProfileKey;
    }

    const postText = buildPostText(config.caption, config.hashtags);
    let body;

    if (config.platform === "tiktok") {
      body = {
        post: postText,
        mediaUrls: [videoUrl],
        platforms: ["tiktok"],
        tikTokOptions: {
          draft: config.mode === "draft",
          isAIGenerated: true
        }
      };
    } else if (config.platform === "instagram") {
      body = {
        post: postText,
        mediaUrls: [videoUrl],
        platforms: ["instagram"],
        instagramOptions: {
          reels: true,
          shareToFeed: config.mode === "live"
        }
      };
    } else if (config.platform === "youtube") {
      const title = config.caption.slice(0, PLATFORM_RULES.youtube.captionMaxLength);
      body = {
        post: postText,
        mediaUrls: [videoUrl],
        platforms: ["youtube"],
        youTubeOptions: {
          title,
          privacyStatus: config.mode === "live" ? "public" : "private",
          madeForKids: false,
          shorts: true
        }
      };
    } else {
      throw new AppError(400, `Unsupported platform "${config.platform}".`, {
        code: "unsupported_platform"
      });
    }

    const payload = await request(`${baseUrl}/post`, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    return {
      platform: config.platform,
      mode: config.mode,
      status: "success",
      externalId: extractExternalId(payload),
      error: null,
      raw: payload
    };
  }

  async function publish(videoUrl, platformConfigs, options = {}) {
    const configs = Array.isArray(platformConfigs)
      ? platformConfigs
      : normalizePlatformConfigs(platformConfigs);

    if (configs.length === 0) {
      throw new AppError(400, "Select at least one destination platform.", {
        code: "missing_platforms"
      });
    }

    const results = [];
    for (const config of configs) {
      try {
        results.push(await publishOne(videoUrl, config, options));
      } catch (error) {
        results.push({
          platform: config.platform,
          mode: config.mode,
          status: "failed",
          externalId: null,
          error: error.message
        });
      }
    }

    return results;
  }

  return {
    publish
  };
}

module.exports = {
  createAyrshareChannel,
  normalizePlatformConfigs,
  PLATFORM_RULES
};
