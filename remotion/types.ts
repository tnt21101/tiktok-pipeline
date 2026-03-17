import type {CalculateMetadataFunction} from "remotion";
import {staticFile} from "remotion";
import {z} from "zod";

const CaptionSchema = z.object({
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  timestampMs: z.number().nullable(),
  confidence: z.number().nullable(),
});

const BrandSchema = z.object({
  id: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  productImageUrl: z.string().nullable(),
  primaryColor: z.string(),
  secondaryColor: z.string(),
  accentColor: z.string(),
  fontFamily: z.string(),
});

const ClipSchema = z.object({
  segmentNumber: z.number(),
  videoUrl: z.string(),
  startFrame: z.number(),
  durationFrames: z.number(),
  transition: z.enum(["cut", "fade", "slide-left", "slide-right", "wipe-left", "wipe-right"]),
  transitionDurationFrames: z.number(),
});

const AudioSegmentSchema = z.object({
  segmentNumber: z.number(),
  audioUrl: z.string(),
  startFrame: z.number(),
  startTimeSeconds: z.number(),
  durationFrames: z.number(),
  durationSeconds: z.number(),
  text: z.string(),
  captions: z.array(CaptionSchema),
});

const LabelSchema = z.object({
  text: z.string(),
  showAtFrame: z.number(),
  hideAtFrame: z.number(),
});

const SlidesVideoSlideSchema = z.object({
  id: z.string(),
  slideNumber: z.number(),
  headline: z.string(),
  body: z.string(),
  imageUrl: z.string().nullable(),
  startFrame: z.number(),
  durationFrames: z.number(),
  durationSeconds: z.number(),
});

export const NarratedVideoConfigSchema = z.object({
  version: z.number(),
  jobId: z.string(),
  title: z.string(),
  format: z.enum([
    "problem_solution",
    "listicle",
    "myth_vs_fact",
    "brand_story",
    "before_after",
    "quick_explainer",
    "ingredient_spotlight",
  ]),
  templateId: z.enum([
    "problem_solution_result",
    "listicle_countdown",
    "myth_fact_stop_doing_this",
    "storytelling_brand_origin",
    "before_after_transformation",
    "did_you_know_quick_explainer",
    "ingredient_spotlight",
  ]),
  platformPreset: z.enum(["tiktok", "instagram"]),
  visualIntensity: z.enum(["clean", "balanced", "bold"]),
  fps: z.number(),
  width: z.number(),
  height: z.number(),
  totalDurationFrames: z.number(),
  brand: BrandSchema,
  clips: z.array(ClipSchema),
  audio: z.object({
    segments: z.array(AudioSegmentSchema),
  }),
  captions: z.object({
    enabled: z.boolean(),
    style: z.enum(["word_by_word"]),
    position: z.enum(["bottom_center", "center", "top_center"]),
    fontSize: z.number(),
    fontWeight: z.enum(["bold", "extrabold"]),
    textColor: z.string(),
    highlightColor: z.string(),
    backgroundColor: z.string(),
    maxWordsPerLine: z.number(),
    combineTokensWithinMilliseconds: z.number(),
  }),
  overlays: z.object({
    lowerThird: z.object({
      enabled: z.boolean(),
      showAtFrame: z.number(),
      hideAtFrame: z.number(),
      text: z.string(),
    }),
    endCard: z.object({
      enabled: z.boolean(),
      startFrame: z.number(),
      durationFrames: z.number(),
      transition: z.enum(["fade"]),
      transitionDurationFrames: z.number(),
      productImageUrl: z.string().nullable(),
      ctaText: z.string(),
      backgroundGradient: z.tuple([z.string(), z.string()]),
    }),
    formatLabels: z.object({
      labels: z.array(LabelSchema),
    }),
  }),
});

export const NarratedVideoCompositionPropsSchema = z.object({
  config: NarratedVideoConfigSchema,
});

export type NarratedVideoConfig = z.infer<typeof NarratedVideoConfigSchema>;
export type NarratedVideoCompositionProps = z.infer<
  typeof NarratedVideoCompositionPropsSchema
>;
export type NarratedClip = z.infer<typeof ClipSchema>;
export type NarratedAudioSegment = z.infer<typeof AudioSegmentSchema>;
export type NarratedBrand = z.infer<typeof BrandSchema>;
export type NarratedLabel = z.infer<typeof LabelSchema>;
export type SlidesVideoSlide = z.infer<typeof SlidesVideoSlideSchema>;

export const defaultNarratedVideoProps: NarratedVideoCompositionProps = {
  config: {
    version: 1,
    jobId: "preview",
    title: "Narrated preview",
    format: "problem_solution",
    templateId: "problem_solution_result",
    platformPreset: "tiktok",
    visualIntensity: "balanced",
    fps: 30,
    width: 1080,
    height: 1920,
    totalDurationFrames: 180,
    brand: {
      id: "preview",
      name: "Preview Brand",
      logoUrl: null,
      productImageUrl: null,
      primaryColor: "#101010",
      secondaryColor: "#303030",
      accentColor: "#ff6b00",
      fontFamily: "\"Arial Black\", Impact, sans-serif",
    },
    clips: [
      {
        segmentNumber: 1,
        videoUrl: staticFile("fixtures/remotion-preview.mp4"),
        startFrame: 0,
        durationFrames: 90,
        transition: "fade",
        transitionDurationFrames: 10,
      },
    ],
    audio: {
      segments: [
        {
          segmentNumber: 1,
          audioUrl: staticFile("fixtures/remotion-preview.wav"),
          startFrame: 0,
          startTimeSeconds: 0,
          durationFrames: 90,
          durationSeconds: 3,
          text: "Preview narration goes here",
          captions: [
            {
              text: "Preview",
              startMs: 0,
              endMs: 700,
              timestampMs: 0,
              confidence: 1,
            },
            {
              text: " narration",
              startMs: 700,
              endMs: 1600,
              timestampMs: 700,
              confidence: 1,
            },
            {
              text: " goes",
              startMs: 1600,
              endMs: 2200,
              timestampMs: 1600,
              confidence: 1,
            },
            {
              text: " here",
              startMs: 2200,
              endMs: 3000,
              timestampMs: 2200,
              confidence: 1,
            },
          ],
        },
      ],
    },
    captions: {
      enabled: true,
      style: "word_by_word",
      position: "bottom_center",
      fontSize: 54,
      fontWeight: "extrabold",
      textColor: "#ffffff",
      highlightColor: "#ff6b00",
      backgroundColor: "rgba(0,0,0,0.62)",
      maxWordsPerLine: 4,
      combineTokensWithinMilliseconds: 900,
    },
    overlays: {
      lowerThird: {
        enabled: true,
        showAtFrame: 8,
        hideAtFrame: 70,
        text: "Preview Brand",
      },
      endCard: {
        enabled: true,
        startFrame: 90,
        durationFrames: 90,
        transition: "fade",
        transitionDurationFrames: 12,
        productImageUrl: null,
        ctaText: "Keep this in your rotation",
        backgroundGradient: ["#101010", "#303030"],
      },
      formatLabels: {
        labels: [
          {
            text: "Problem",
            showAtFrame: 6,
            hideAtFrame: 42,
          },
        ],
      },
    },
  },
};

export const calculateNarratedVideoMetadata: CalculateMetadataFunction<
  NarratedVideoCompositionProps
> = async ({props}) => {
  const config = props.config;

  return {
    durationInFrames: config.totalDurationFrames,
    width: config.width,
    height: config.height,
    fps: config.fps,
    defaultOutName: `narrated-${config.jobId}.mp4`,
  };
};

export const SlidesVideoConfigSchema = z.object({
  version: z.number(),
  jobId: z.string(),
  title: z.string(),
  fps: z.number(),
  width: z.number(),
  height: z.number(),
  totalDurationFrames: z.number(),
  coverFrame: z.number(),
  brand: BrandSchema,
  backgroundGradient: z.tuple([z.string(), z.string()]),
  slides: z.array(SlidesVideoSlideSchema),
});

export const SlidesVideoCompositionPropsSchema = z.object({
  config: SlidesVideoConfigSchema,
});

export type SlidesVideoConfig = z.infer<typeof SlidesVideoConfigSchema>;
export type SlidesVideoCompositionProps = z.infer<typeof SlidesVideoCompositionPropsSchema>;

export const defaultSlidesVideoProps: SlidesVideoCompositionProps = {
  config: {
    version: 1,
    jobId: "slides-preview",
    title: "Slide preview",
    fps: 30,
    width: 1080,
    height: 1920,
    totalDurationFrames: 210,
    coverFrame: 18,
    brand: {
      id: "preview",
      name: "Preview Brand",
      logoUrl: null,
      productImageUrl: null,
      primaryColor: "#101010",
      secondaryColor: "#303030",
      accentColor: "#ff6b00",
      fontFamily: "\"Arial Black\", Impact, sans-serif",
    },
    backgroundGradient: ["#101010", "#303030"],
    slides: [
      {
        id: "slide-1",
        slideNumber: 1,
        headline: "3 ways to reset your routine",
        body: "Use a bold opening slide that reads fast and immediately frames the payoff.",
        imageUrl: null,
        startFrame: 0,
        durationFrames: 105,
        durationSeconds: 3.5,
      },
      {
        id: "slide-2",
        slideNumber: 2,
        headline: "Keep every slide focused",
        body: "One sharp idea per frame usually feels cleaner and more premium than crowded copy.",
        imageUrl: null,
        startFrame: 105,
        durationFrames: 105,
        durationSeconds: 3.5,
      },
    ],
  },
};

export const calculateSlidesVideoMetadata: CalculateMetadataFunction<
  SlidesVideoCompositionProps
> = async ({props}) => {
  const config = props.config;

  return {
    durationInFrames: config.totalDurationFrames,
    width: config.width,
    height: config.height,
    fps: config.fps,
    defaultOutName: `slides-${config.jobId}.mp4`,
  };
};
