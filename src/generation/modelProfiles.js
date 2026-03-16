const PROFILES = {
  sora2_image: {
    id: "sora2_image",
    label: "Sora 2 Image to Video",
    providerFamily: "market",
    model: "sora-2-image-to-video",
    description: "Single-image Sora 2 generation with watermark removal and S3 upload output.",
    imageMode: "single",
    minImages: 1,
    maxImages: 1,
    supportsReferenceImages: false,
    defaults: {
      duration: "15",
      aspectRatio: "portrait",
      removeWatermark: true,
      uploadMethod: "s3"
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
      }
    },
    pricing: {
      type: "per_second",
      rateUsd: 0.015
    },
    estimateCostUsd(config = {}) {
      const duration = Number.parseInt(config.duration || "15", 10);
      return Number.isFinite(duration) ? Number((duration * 0.015).toFixed(3)) : null;
    }
  },
  veo31_image: {
    id: "veo31_image",
    label: "Veo 3.1 Image to Video",
    providerFamily: "veo",
    model: "veo3_fast",
    description: "Veo 3.1 first-frame or first-and-last-frame image generation in vertical format.",
    imageMode: "first_last",
    minImages: 1,
    maxImages: 2,
    supportsReferenceImages: true,
    defaults: {
      generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO",
      aspectRatio: "9:16",
      enableTranslation: true,
      enableFallback: false
    },
    controls: {},
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
    description: "Reference-driven Veo 3.1 generation using one or two source images.",
    imageMode: "reference",
    minImages: 1,
    maxImages: 2,
    supportsReferenceImages: true,
    defaults: {
      generationType: "REFERENCE_2_VIDEO",
      aspectRatio: "9:16",
      enableTranslation: true,
      enableFallback: false
    },
    controls: {},
    pricing: {
      type: "fixed",
      amountUsd: 0.4
    },
    estimateCostUsd() {
      return 0.4;
    }
  },
  seedance15pro: {
    id: "seedance15pro",
    label: "ByteDance Seedance 1.5 Pro",
    providerFamily: "market",
    model: "bytedance/seedance-1.5-pro",
    description: "High-quality ByteDance video generation with optional audio and up to two images.",
    imageMode: "first_last",
    minImages: 1,
    maxImages: 2,
    supportsReferenceImages: true,
    defaults: {
      duration: "12",
      resolution: "720p",
      aspectRatio: "9:16",
      fixedLens: false,
      generateAudio: true
    },
    controls: {
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

function normalizeGenerationConfig(input = {}) {
  const profile = getGenerationProfile(input.profileId || input.id);
  const imageUrls = normalizeImageUrls(input.imageUrls, profile.maxImages);

  const config = {
    profileId: profile.id,
    label: profile.label,
    providerFamily: profile.providerFamily,
    model: profile.model,
    imageMode: profile.imageMode,
    imageUrls,
    duration: String(input.duration || profile.defaults.duration || ""),
    aspectRatio: String(input.aspectRatio || profile.defaults.aspectRatio || ""),
    removeWatermark: input.removeWatermark ?? profile.defaults.removeWatermark ?? false,
    uploadMethod: String(input.uploadMethod || profile.defaults.uploadMethod || ""),
    generationType: String(input.generationType || profile.defaults.generationType || ""),
    enableTranslation: input.enableTranslation ?? profile.defaults.enableTranslation ?? false,
    enableFallback: input.enableFallback ?? profile.defaults.enableFallback ?? false,
    resolution: String(input.resolution || profile.defaults.resolution || ""),
    fixedLens: input.fixedLens ?? profile.defaults.fixedLens ?? false,
    generateAudio: input.generateAudio ?? profile.defaults.generateAudio ?? false
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
          duration: String(generationConfig.duration || "12"),
          fixed_lens: Boolean(generationConfig.fixedLens),
          generate_audio: generationConfig.generateAudio !== false
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
        n_frames: String(generationConfig.duration || "15"),
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
