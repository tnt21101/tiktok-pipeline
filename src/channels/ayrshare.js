const { requestJson } = require("../utils/http");
const { AppError } = require("../utils/errors");

const DEFAULT_BASE_URL = "https://app.ayrshare.com/api";

function normalizeHashtags(hashtags) {
  if (!Array.isArray(hashtags)) {
    return [];
  }

  return hashtags
    .map((tag) => String(tag || "").trim().replace(/^#/, ""))
    .filter(Boolean);
}

function normalizePlatformConfigs(platformConfigs = {}) {
  return Object.entries(platformConfigs)
    .filter(([, config]) => config && config.enabled)
    .map(([platform, config]) => ({
      platform,
      mode: config.mode === "live" ? "live" : "draft",
      caption: String(config.caption || "").trim(),
      hashtags: normalizeHashtags(config.hashtags)
    }))
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
  const apiKey = options.apiKey || "";
  const request = options.request || requestJson;

  function ensureApiKey() {
    if (!apiKey) {
      throw new AppError(503, "AYRSHARE_API_KEY is not configured.", {
        code: "ayrshare_not_configured"
      });
    }
  }

  async function publishOne(videoUrl, config, options = {}) {
    ensureApiKey();

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
      body = {
        post: config.hashtags.map((tag) => `#${tag}`).join(" "),
        mediaUrls: [videoUrl],
        platforms: ["youtube"],
        youTubeOptions: {
          title: config.caption.slice(0, 70),
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
  normalizePlatformConfigs
};
