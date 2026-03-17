const { AppError } = require("../utils/errors");

const PROFILES = {
  sora2_image: {
    id: "sora2_image",
    label: "Sora 2 Image to Video",
    providerFamily: "market",
    model: "sora-2-image-to-video",
    description: "Single-image Sora 2 generation with watermark removal and S3 upload output, using the current app-supported 10 or 15 second clip settings.",
    imageMode: "single",
    minImages: 1,
    maxImages: 1,
    supportsReferenceImages: false,
    allowedDurations: ["10", "15"],
    defaults: {
      duration: "10",
      aspectRatio: "portrait",
      removeWatermark: true,
      uploadMethod: "s3"
    },
    controls: {
      duration: {
        label: "Duration",
        type: "select",
        defaultValue: "10",
        options: [
          { value: "10", label: "10 sec" },
          { value: "15", label: "15 sec" }
        ]
      }
    },
    pricing: {
      type: "per_second",
      rateUsd: 0.015
    },
    estimateCostUsd(config = {}) {
      const duration = Number.parseInt(config.duration || "10", 10);
      return Number.isFinite(duration) ? Number((duration * 0.015).toFixed(3)) : null;
    }
  },
  veo31_image: {
    id: "veo31_image",
    label: "Veo 3.1 Image to Video",
    providerFamily: "veo",
    model: "veo3_fast",
    description: "Veo 3.1 first-frame or first-and-last-frame image generation in vertical format with the current Kie integration fixed to 8-second clips.",
    imageMode: "first_last",
    minImages: 1,
    maxImages: 2,
    supportsReferenceImages: true,
    allowedDurations: ["8"],
    defaults: {
      duration: "8",
      generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO",
      aspectRatio: "9:16",
      enableTranslation: true,
      enableFallback: false
    },
    controls: {
      duration: {
        label: "Duration",
        type: "select",
        defaultValue: "8",
        options: [
          { value: "8", label: "8 sec" }
        ]
      }
    },
    pricing: {
      type: "fixed",
      amountUsd: 0.4
    },
    estimateCostUsd() {
      return 0.4;
    }
  },
  veo31_reference: {
    id: "veo31_reference",
    label: "Veo 3.1 Reference to Video",
    providerFamily: "veo",
    model: "veo3_fast",
    description: "Reference-driven Veo 3.1 generation using one or two source images, currently fixed to 8-second clips in this Kie workflow.",
    imageMode: "reference",
    minImages: 1,
    maxImages: 2,
    supportsReferenceImages: true,
    allowedDurations: ["8"],
    defaults: {
      duration: "8",
      generationType: "REFERENCE_2_VIDEO",
      aspectRatio: "9:16",
      enableTranslation: true,
      enableFallback: false
    },
    controls: {
      duration: {
        label: "Duration",
        type: "select",
        defaultValue: "8",
        options: [
          { value: "8", label: "8 sec" }
        ]
      }
    },
    pricing: {
      type: "fixed",
      amountUsd: 0.4
    },
    estimateCostUsd() {
      return 0.4;
    }
  },
  kling30: {
    id: "kling30",
    label: "Kling 3",
    providerFamily: "market",
    model: "kling-3.0/video",
    description: "Kling 3 with std mode and sound fixed on, plus optional multi-shot pacing and element references built from your uploaded images.",
    imageMode: "first_last",
    minImages: 1,
    maxImages: 2,
    supportsReferenceImages: true,
    allowedDurations: ["10", "15"],
    defaults: {
      duration: "15",
      aspectRatio: "9:16",
      mode: "std",
      sound: true,
      multiShots: false,
      useElements: false
    },
    controls: {
      duration: {
        label: "Duration",
        type: "select",
        defaultValue: "15",
        options: [
          { value: "10", label: "10 sec" },
          { value: "15", label: "15 sec" }
        ]
      },
      multiShots: {
        label: "Use multi-shot mode",
        type: "boolean",
        defaultValue: false
      },
      useElements: {
        label: "Use Kling elements (needs 2 images)",
        type: "boolean",
        defaultValue: false
      }
    },
    pricing: {
      type: "unknown"
    },
    estimateCostUsd() {
      return null;
    }
  },
  seedance15pro: {
    id: "seedance15pro",
    label: "ByteDance Seedance 1.5 Pro",
    providerFamily: "market",
    model: "bytedance/seedance-1.5-pro",
    description: "High-quality ByteDance video generation with optional audio, up to two images, and the current app-supported 4, 8, or 12 second settings.",
    imageMode: "first_last",
    minImages: 1,
    maxImages: 2,
    supportsReferenceImages: true,
    allowedDurations: ["4", "8", "12"],
    allowedResolutions: ["720p"],
    defaults: {
      duration: "8",
      resolution: "720p",
      aspectRatio: "9:16",
      fixedLens: false,
      generateAudio: true
    },
    controls: {
      duration: {
        label: "Duration",
        type: "select",
        defaultValue: "8",
        options: [
          { value: "4", label: "4 sec" },
          { value: "8", label: "8 sec" },
          { value: "12", label: "12 sec" }
        ]
      },
      resolution: {
        label: "Resolution",
        type: "select",
        defaultValue: "720p",
        options: [
          { value: "720p", label: "720p" }
        ]
      },
      generateAudio: {
        label: "Generate audio",
        type: "boolean",
        defaultValue: true
      }
    },
    pricing: {
      type: "unknown"
    },
    estimateCostUsd() {
      return null;
    }
  }
};

const DEFAULT_PROFILE_ID = "sora2_image";

function listGenerationProfiles() {
  return Object.values(PROFILES).map((profile) => ({
    id: profile.id,
    label: profile.label,
    providerFamily: profile.providerFamily,
    model: profile.model,
    description: profile.description,
    imageMode: profile.imageMode,
    minImages: profile.minImages,
    maxImages: profile.maxImages,
    supportsReferenceImages: profile.supportsReferenceImages,
    defaults: profile.defaults,
    controls: profile.controls,
    pricing: profile.pricing
  }));
}

function getGenerationProfile(profileId = DEFAULT_PROFILE_ID) {
  return PROFILES[profileId] || PROFILES[DEFAULT_PROFILE_ID];
}

function normalizeImageUrls(input, maxImages) {
  const values = Array.isArray(input)
    ? input
    : input
      ? [input]
      : [];

  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .slice(0, maxImages);
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return Boolean(fallback);
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
      return false;
    }
  }

  return Boolean(value);
}

function buildKlingPrompt(videoPrompt, generationConfig = {}) {
  const basePrompt = String(videoPrompt || "").trim();
  if (!generationConfig.useElements) {
    return basePrompt;
  }

  if (/@element_subject\b/.test(basePrompt)) {
    return basePrompt;
  }

  return `${basePrompt} Keep @element_subject visually consistent throughout the video.`;
}

function buildKlingMultiPrompt(videoPrompt, generationConfig = {}) {
  if (!generationConfig.multiShots) {
    return undefined;
  }

  const totalDuration = Number.parseInt(generationConfig.duration || "15", 10);
  const safeTotal = Number.isFinite(totalDuration) ? totalDuration : 15;
  const firstShotDuration = Math.max(4, Math.floor(safeTotal / 2));
  const secondShotDuration = Math.max(1, safeTotal - firstShotDuration);
  const basePrompt = buildKlingPrompt(videoPrompt, generationConfig);

  return [
    {
      prompt: `${basePrompt} Shot 1: establish the subject, environment, and opening motion with a clean lead-in.`,
      duration: firstShotDuration
    },
    {
      prompt: `${basePrompt} Shot 2: continue the exact same scene into the stronger action or payoff while preserving subject, lighting, and camera continuity from shot 1.`,
      duration: secondShotDuration
    }
  ];
}

function buildKlingElements(imageUrls = [], generationConfig = {}) {
  if (!generationConfig.useElements) {
    return undefined;
  }

  if (imageUrls.length < 2) {
    throw new AppError(400, "Kling elements need two uploaded JPG or PNG reference images.", {
      code: "kling_elements_require_two_images"
    });
  }

  return [
    {
      name: "element_subject",
      description: "Uploaded reference subject or object that should stay visually consistent throughout the generation.",
      element_input_urls: imageUrls.slice(0, 4)
    }
  ];
}

function normalizeGenerationConfig(input = {}) {
  const profile = getGenerationProfile(input.profileId || input.id);
  const imageUrls = normalizeImageUrls(input.imageUrls, profile.maxImages);
  const requestedProfileId = String(input.requestedProfileId || profile.id);
  const fallbackProfileId = String(input.fallbackProfileId || "").trim();
  const requestedDuration = String(input.duration || profile.defaults.duration || "");
  const duration = Array.isArray(profile.allowedDurations) && profile.allowedDurations.length > 0
    ? (profile.allowedDurations.includes(requestedDuration) ? requestedDuration : String(profile.defaults.duration || profile.allowedDurations[0] || ""))
    : requestedDuration;
  const requestedResolution = String(input.resolution || profile.defaults.resolution || "");
  const resolution = Array.isArray(profile.allowedResolutions) && profile.allowedResolutions.length > 0
    ? (profile.allowedResolutions.includes(requestedResolution) ? requestedResolution : String(profile.defaults.resolution || profile.allowedResolutions[0] || ""))
    : requestedResolution;

  const config = {
    profileId: profile.id,
    requestedProfileId,
    fallbackProfileId: fallbackProfileId && fallbackProfileId !== profile.id
      ? getGenerationProfile(fallbackProfileId).id
      : "",
    label: profile.label,
    providerFamily: profile.providerFamily,
    model: profile.model,
    imageMode: profile.imageMode,
    imageUrls,
    duration,
    aspectRatio: String(input.aspectRatio || profile.defaults.aspectRatio || ""),
    removeWatermark: input.removeWatermark ?? profile.defaults.removeWatermark ?? false,
    uploadMethod: String(input.uploadMethod || profile.defaults.uploadMethod || ""),
    generationType: String(input.generationType || profile.defaults.generationType || ""),
    enableTranslation: input.enableTranslation ?? profile.defaults.enableTranslation ?? false,
    enableFallback: input.enableFallback ?? profile.defaults.enableFallback ?? false,
    resolution,
    fixedLens: input.fixedLens ?? profile.defaults.fixedLens ?? false,
    generateAudio: normalizeBoolean(input.generateAudio, profile.defaults.generateAudio ?? false),
    mode: String(input.mode || profile.defaults.mode || ""),
    sound: normalizeBoolean(input.sound, profile.defaults.sound ?? false),
    multiShots: normalizeBoolean(input.multiShots, profile.defaults.multiShots ?? false),
    useElements: normalizeBoolean(input.useElements, profile.defaults.useElements ?? false)
  };

  const estimatedCostUsd = profile.estimateCostUsd(config);
  return {
    ...config,
    estimatedCostUsd: typeof estimatedCostUsd === "number" ? estimatedCostUsd : null
  };
}

function buildGenerateRequest({ profile, videoPrompt, generationConfig, imageUrls, baseCallbackUrl }) {
  if (profile.providerFamily === "veo") {
    return {
      url: "https://api.kie.ai/api/v1/veo/generate",
      payload: {
        prompt: videoPrompt.trim(),
        imageUrls,
        model: profile.model,
        callBackUrl: `${baseCallbackUrl}/api/callback`,
        aspect_ratio: generationConfig.aspectRatio || "9:16",
        enableFallback: Boolean(generationConfig.enableFallback),
        enableTranslation: generationConfig.enableTranslation !== false,
        generationType: generationConfig.generationType || "FIRST_AND_LAST_FRAMES_2_VIDEO"
      }
    };
  }

  if (profile.id === "seedance15pro") {
    return {
      url: "https://api.kie.ai/api/v1/jobs/createTask",
      payload: {
        model: profile.model,
        callBackUrl: `${baseCallbackUrl}/api/callback`,
        input: {
          prompt: videoPrompt.trim(),
          input_urls: imageUrls,
          aspect_ratio: generationConfig.aspectRatio || "9:16",
          resolution: generationConfig.resolution || "720p",
          duration: String(generationConfig.duration || "8"),
          fixed_lens: Boolean(generationConfig.fixedLens),
          generate_audio: generationConfig.generateAudio !== false
        }
      }
    };
  }

  if (profile.id === "kling30") {
    const klingPrompt = buildKlingPrompt(videoPrompt, generationConfig);
    return {
      url: "https://api.kie.ai/api/v1/jobs/createTask",
      payload: {
        model: profile.model,
        callBackUrl: `${baseCallbackUrl}/api/callback`,
        input: {
          prompt: klingPrompt,
          image_urls: generationConfig.multiShots ? imageUrls.slice(0, 1) : imageUrls,
          sound: true,
          duration: String(generationConfig.duration || "15"),
          aspect_ratio: generationConfig.aspectRatio || "9:16",
          mode: "std",
          multi_shots: Boolean(generationConfig.multiShots),
          ...(generationConfig.multiShots
            ? { multi_prompt: buildKlingMultiPrompt(videoPrompt, generationConfig) }
            : {}),
          ...(generationConfig.useElements
            ? { kling_elements: buildKlingElements(imageUrls, generationConfig) }
            : {})
        }
      }
    };
  }

  return {
    url: "https://api.kie.ai/api/v1/jobs/createTask",
    payload: {
      model: profile.model,
      callBackUrl: `${baseCallbackUrl}/api/callback`,
      input: {
        prompt: videoPrompt.trim(),
        image_urls: imageUrls,
        aspect_ratio: generationConfig.aspectRatio || "portrait",
        n_frames: String(generationConfig.duration || "10"),
        remove_watermark: generationConfig.removeWatermark !== false,
        upload_method: generationConfig.uploadMethod || "s3"
      }
    }
  };
}

function getPollEndpoint(profile) {
  if (profile.providerFamily === "veo") {
    return "https://api.kie.ai/api/v1/veo/record-info";
  }

  return "https://api.kie.ai/api/v1/jobs/recordInfo";
}

module.exports = {
  DEFAULT_PROFILE_ID,
  listGenerationProfiles,
  getGenerationProfile,
  normalizeGenerationConfig,
  buildGenerateRequest,
  getPollEndpoint
};
