const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");

const { bundle } = require("@remotion/bundler");
const { renderMedia, selectComposition } = require("@remotion/renderer");

const { getNarratedTemplate } = require("../narrated/templates");
const { AppError } = require("../utils/errors");

const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;
const END_CARD_DURATION_FRAMES = 90;

const BRAND_STYLE_MAP = {
  tnt: {
    primaryColor: "#101010",
    secondaryColor: "#2a2a2a",
    accentColor: "#ff6b00",
    fontFamily: "\"Arial Black\", Impact, sans-serif"
  },
  queen_helene: {
    primaryColor: "#5b3d1f",
    secondaryColor: "#d9b26f",
    accentColor: "#f7d07a",
    fontFamily: "\"Trebuchet MS\", \"Gill Sans\", sans-serif"
  },
  prell: {
    primaryColor: "#0f3b2f",
    secondaryColor: "#2f8f63",
    accentColor: "#d5ff67",
    fontFamily: "\"Helvetica Neue\", Helvetica, Arial, sans-serif"
  },
  la_baby: {
    primaryColor: "#8ab6d6",
    secondaryColor: "#dceef9",
    accentColor: "#ffffff",
    fontFamily: "\"Avenir Next\", \"Trebuchet MS\", sans-serif"
  }
};

const TEMPLATE_FORMAT_MAP = {
  problem_solution_result: "problem_solution",
  listicle_countdown: "listicle",
  myth_fact_stop_doing_this: "myth_vs_fact",
  storytelling_brand_origin: "brand_story",
  before_after_transformation: "before_after",
  did_you_know_quick_explainer: "quick_explainer",
  ingredient_spotlight: "ingredient_spotlight"
};

function buildPublicOutputUrl(baseUrl, fileName) {
  return `${String(baseUrl || "").replace(/\/$/, "")}/output/${fileName}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundFrames(seconds) {
  return Math.max(24, Math.round(Number(seconds || 0) * FPS));
}

function normalizeSegmentDuration(segment) {
  const raw = Number(segment.actualDurationSeconds || segment.estimatedSeconds || 4);
  return Number.isFinite(raw) ? clamp(raw, 1.2, 12) : 4;
}

function getBrandStyle(brand = {}, sourceImageUrl = null) {
  const preset = BRAND_STYLE_MAP[brand.id] || {
    primaryColor: "#18181b",
    secondaryColor: "#3f3f46",
    accentColor: "#f4f4f5",
    fontFamily: "\"Helvetica Neue\", Helvetica, Arial, sans-serif"
  };

  return {
    id: brand.id || "brand",
    name: brand.name || "Brand",
    logoUrl: brand.logoUrl || null,
    productImageUrl: sourceImageUrl || null,
    ...preset
  };
}

function createCaptionTokens(text, startTimeSeconds, durationSeconds) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return [];
  }

  const startMs = Math.round(startTimeSeconds * 1000);
  const totalDurationMs = Math.max(400, Math.round(durationSeconds * 1000));
  const weightedTotal = words.reduce((sum, word) => sum + Math.max(2, word.length), 0);

  let cursor = startMs;
  return words.map((word, index) => {
    const remainingWords = words.length - index;
    const remainingBudget = startMs + totalDurationMs - cursor;
    const proportional = Math.round((Math.max(2, word.length) / weightedTotal) * totalDurationMs);
    const minSlice = 140;
    const maxSlice = Math.max(minSlice, remainingBudget - (remainingWords - 1) * minSlice);
    const slice = index === words.length - 1
      ? remainingBudget
      : clamp(proportional, minSlice, maxSlice);
    const endMs = index === words.length - 1 ? startMs + totalDurationMs : cursor + slice;
    const caption = {
      text: index === 0 ? word : ` ${word}`,
      startMs: cursor,
      endMs,
      timestampMs: cursor,
      confidence: 1
    };
    cursor = endMs;
    return caption;
  });
}

function getTransitionType(templateId, platformPreset, index) {
  const isEven = index % 2 === 0;

  switch (templateId) {
    case "listicle_countdown":
      return isEven ? "slide-left" : "slide-right";
    case "myth_fact_stop_doing_this":
      return isEven ? "wipe-left" : "wipe-right";
    case "storytelling_brand_origin":
      return "fade";
    case "before_after_transformation":
      return isEven ? "wipe-right" : "fade";
    case "ingredient_spotlight":
      return platformPreset === "instagram" ? "fade" : "wipe-left";
    case "did_you_know_quick_explainer":
      return platformPreset === "tiktok" ? "slide-left" : "fade";
    default:
      return platformPreset === "instagram" ? "fade" : "wipe-left";
  }
}

function getTransitionDurationFrames(platformPreset) {
  return platformPreset === "instagram" ? 14 : 10;
}

function buildLabelText(templateId, segment, index, totalSegments) {
  switch (templateId) {
    case "problem_solution_result":
      return ["Problem", "Solution", "Result", "Act now"][index] || `Step ${index + 1}`;
    case "listicle_countdown":
      return index === totalSegments - 1 ? "Final tip" : `Tip #${index + 1}`;
    case "myth_fact_stop_doing_this":
      return ["Stop doing this", "Fact", "Do this instead", "Watch the difference"][index] || "Fact";
    case "storytelling_brand_origin":
      return ["The beginning", "The shift", "Why it mattered", "Today"][index] || "Story beat";
    case "before_after_transformation":
      return ["Before", "Turning point", "After", "Keep it going"][index] || "Transformation";
    case "did_you_know_quick_explainer":
      return ["Did you know?", "Here is why", "What to do next", "Quick takeaway"][index] || "Quick fact";
    case "ingredient_spotlight":
      return index === 0
        ? "Ingredient spotlight"
        : index === totalSegments - 1
          ? "Why it matters"
          : "What it does";
    default:
      return segment.shotType
        ? String(segment.shotType).replace(/_/g, " ")
        : `Part ${index + 1}`;
  }
}

function buildFormatLabels(templateId, timelineSegments) {
  return timelineSegments.map((segment, index) => {
    const duration = Math.min(52, Math.max(28, Math.round(segment.durationFrames * 0.4)));
    return {
      text: buildLabelText(templateId, segment, index, timelineSegments.length),
      showAtFrame: segment.startFrame + 6,
      hideAtFrame: Math.min(segment.startFrame + duration, segment.startFrame + segment.durationFrames - 6)
    };
  }).filter((label) => label.hideAtFrame > label.showAtFrame);
}

function buildCtaText(job, brand) {
  const ctaStyle = String(job?.fields?.ctaStyle || "soft");
  const brandName = brand?.name || "the brand";

  switch (ctaStyle) {
    case "shop_now":
      return `Shop ${brandName} now`;
    case "save_share":
      return "Save this for your next routine";
    case "curiosity":
      return "See what this changes next";
    case "direct":
      return "Try this in your next routine";
    default:
      return `Keep ${brandName} in your rotation`;
  }
}

function buildCompositionConfig(job, brand, segments = []) {
  const templateId = String(job?.fields?.templateId || "problem_solution_result");
  const template = getNarratedTemplate(templateId);
  const platformPreset = String(job?.fields?.platformPreset || "tiktok").toLowerCase() || "tiktok";
  const brandStyle = getBrandStyle(brand, job?.sourceImageUrl || null);
  const transitionDurationFrames = getTransitionDurationFrames(platformPreset);
  const sortedSegments = [...segments].sort((left, right) => left.segmentIndex - right.segmentIndex);

  let cursorFrame = 0;
  const timelineSegments = sortedSegments.map((segment, index) => {
    const durationSeconds = normalizeSegmentDuration(segment);
    const durationFrames = roundFrames(durationSeconds);
    const startFrame = cursorFrame;
    const startTimeSeconds = startFrame / FPS;
    const transition = index < sortedSegments.length - 1
      ? getTransitionType(templateId, platformPreset, index)
      : "cut";
    const overlapFrames = transition === "cut" ? 0 : transitionDurationFrames;
    const timelineSegment = {
      segmentNumber: index + 1,
      startFrame,
      durationFrames,
      startTimeSeconds,
      durationSeconds,
      audioUrl: segment.audioUrl,
      videoUrl: segment.videoUrl,
      text: segment.text,
      visualIntent: segment.visualIntent,
      shotType: segment.shotType,
      sourceStrategy: segment.sourceStrategy,
      transition,
      transitionDurationFrames: overlapFrames,
      captions: createCaptionTokens(segment.text, startTimeSeconds, durationSeconds)
    };

    cursorFrame += durationFrames - overlapFrames;
    return timelineSegment;
  });

  const endCardStartFrame = cursorFrame;
  const totalDurationFrames = endCardStartFrame + END_CARD_DURATION_FRAMES;
  const firstSegment = timelineSegments[0] || null;

  return {
    version: 1,
    jobId: job.id,
    title: String(job?.fields?.narrationTitle || "").trim() || `${brandStyle.name} narrated video`,
    format: TEMPLATE_FORMAT_MAP[template.id] || "problem_solution",
    templateId: template.id,
    platformPreset,
    visualIntensity: String(job?.fields?.visualIntensity || "balanced"),
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    totalDurationFrames,
    brand: brandStyle,
    clips: timelineSegments.map((segment) => ({
      segmentNumber: segment.segmentNumber,
      videoUrl: segment.videoUrl,
      startFrame: segment.startFrame,
      durationFrames: segment.durationFrames,
      transition: segment.transition,
      transitionDurationFrames: segment.transitionDurationFrames
    })),
    audio: {
      segments: timelineSegments.map((segment) => ({
        segmentNumber: segment.segmentNumber,
        audioUrl: segment.audioUrl,
        startFrame: segment.startFrame,
        startTimeSeconds: segment.startTimeSeconds,
        durationFrames: segment.durationFrames,
        durationSeconds: segment.durationSeconds,
        text: segment.text,
        captions: segment.captions
      }))
    },
    captions: {
      enabled: true,
      style: "word_by_word",
      position: "bottom_center",
      fontSize: platformPreset === "instagram" ? 48 : 54,
      fontWeight: "extrabold",
      textColor: "#ffffff",
      highlightColor: brandStyle.accentColor,
      backgroundColor: platformPreset === "instagram" ? "rgba(15, 15, 18, 0.48)" : "rgba(0, 0, 0, 0.62)",
      maxWordsPerLine: platformPreset === "instagram" ? 5 : 4,
      combineTokensWithinMilliseconds: platformPreset === "instagram" ? 1200 : 900
    },
    overlays: {
      lowerThird: {
        enabled: Boolean(firstSegment),
        showAtFrame: 8,
        hideAtFrame: firstSegment
          ? Math.min(firstSegment.durationFrames - 10, platformPreset === "instagram" ? 92 : 76)
          : 0,
        text: brandStyle.name
      },
      endCard: {
        enabled: true,
        startFrame: endCardStartFrame,
        durationFrames: END_CARD_DURATION_FRAMES,
        transition: "fade",
        transitionDurationFrames: platformPreset === "instagram" ? 16 : 12,
        productImageUrl: brandStyle.productImageUrl,
        ctaText: buildCtaText(job, brandStyle),
        backgroundGradient: [brandStyle.primaryColor, brandStyle.secondaryColor]
      },
      formatLabels: {
        labels: buildFormatLabels(template.id, timelineSegments)
      }
    }
  };
}

function createRemotionService(options = {}) {
  const outputDir = options.outputDir;
  const baseUrl = options.baseUrl;
  const projectRoot = options.projectRoot || path.resolve(__dirname, "..", "..");
  const entryPoint = path.join(projectRoot, "remotion", "index.ts");
  let bundlePromise = null;

  function isAvailable() {
    return fs.existsSync(entryPoint);
  }

  async function getServeUrl() {
    if (!bundlePromise) {
      bundlePromise = bundle({
        entryPoint,
        onProgress: () => undefined,
        enableCaching: true,
        outDir: path.join(os.tmpdir(), "tiktok-pipeline-remotion-bundle")
      });
    }

    return bundlePromise;
  }

  async function renderNarratedVideo({ job, brand, segments }) {
    if (!outputDir || !baseUrl) {
      throw new AppError(500, "Remotion render service is missing output configuration.", {
        code: "remotion_not_configured"
      });
    }

    if (!isAvailable()) {
      throw new AppError(503, "The Remotion entry point is not available in this workspace.", {
        code: "remotion_entry_missing"
      });
    }

    const config = buildCompositionConfig(job, brand, segments);
    const inputProps = { config };
    const serveUrl = await getServeUrl();
    // Provider-hosted media often lacks permissive CORS headers, so the
    // server-side browser needs this flag to read remote audio/video assets.
    const chromiumOptions = {
      ignoreCertificateErrors: true,
      disableWebSecurity: true
    };
    const composition = await selectComposition({
      serveUrl,
      id: "NarratedVideo",
      inputProps,
      chromiumOptions
    });

    const outputFileName = `narrated-${job.id}-${randomUUID()}.mp4`;
    const outputLocation = path.join(outputDir, outputFileName);

    try {
      await renderMedia({
        serveUrl,
        composition,
        inputProps,
        codec: "h264",
        overwrite: true,
        outputLocation,
        audioBitrate: "192k",
        chromiumOptions,
        logLevel: "error"
      });
    } catch (error) {
      throw new AppError(500, "Remotion failed to render the narrated video.", {
        code: "remotion_render_failed",
        details: error instanceof Error ? error.message : String(error)
      });
    }

    return {
      videoUrl: buildPublicOutputUrl(baseUrl, outputFileName),
      config
    };
  }

  return {
    buildCompositionConfig,
    isAvailable,
    renderNarratedVideo
  };
}

module.exports = {
  FPS,
  WIDTH,
  HEIGHT,
  END_CARD_DURATION_FRAMES,
  buildCompositionConfig,
  createRemotionService
};
