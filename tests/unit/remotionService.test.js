const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCompositionConfig, END_CARD_DURATION_FRAMES } = require("../../src/services/remotion");

test("buildCompositionConfig creates a Remotion-ready narrated timeline", () => {
  const job = {
    id: "job-1",
    brandId: "tnt",
    sourceImageUrl: "https://example.com/product.png",
    fields: {
      templateId: "listicle_countdown",
      platformPreset: "tiktok",
      visualIntensity: "bold",
      ctaStyle: "save_share",
      narrationTitle: "3 sweat routine fixes"
    }
  };

  const brand = {
    id: "tnt",
    name: "TNT Pro Series"
  };

  const segments = [
    {
      segmentIndex: 1,
      text: "First fix your prep.",
      visualIntent: "Show the routine setup clearly.",
      estimatedSeconds: 4,
      actualDurationSeconds: 4.2,
      shotType: "hook",
      sourceStrategy: "hybrid",
      audioUrl: "https://example.com/a1.mp3",
      videoUrl: "https://example.com/v1.mp4"
    },
    {
      segmentIndex: 2,
      text: "Second apply with purpose.",
      visualIntent: "Show the product use beat.",
      estimatedSeconds: 4,
      actualDurationSeconds: 4.1,
      shotType: "body",
      sourceStrategy: "image",
      audioUrl: "https://example.com/a2.mp3",
      videoUrl: "https://example.com/v2.mp4"
    },
    {
      segmentIndex: 3,
      text: "Third stay consistent for the payoff.",
      visualIntent: "Land on the result image.",
      estimatedSeconds: 5,
      actualDurationSeconds: 4.8,
      shotType: "payoff",
      sourceStrategy: "hybrid",
      audioUrl: "https://example.com/a3.mp3",
      videoUrl: "https://example.com/v3.mp4"
    }
  ];

  const config = buildCompositionConfig(job, brand, segments);

  assert.equal(config.templateId, "listicle_countdown");
  assert.equal(config.format, "listicle");
  assert.equal(config.platformPreset, "tiktok");
  assert.equal(config.clips.length, 3);
  assert.equal(config.audio.segments.length, 3);
  assert.equal(config.clips[0].startFrame, 0);
  assert.equal(config.audio.segments[0].captions.length > 0, true);
  assert.equal(config.captions.combineTokensWithinMilliseconds, 900);
  assert.equal(config.overlays.endCard.durationFrames, END_CARD_DURATION_FRAMES);
  assert.equal(config.overlays.formatLabels.labels[0].text, "Tip #1");
  assert.equal(
    config.totalDurationFrames,
    config.overlays.endCard.startFrame + END_CARD_DURATION_FRAMES
  );
});

test("buildCompositionConfig applies Instagram pacing and template labels", () => {
  const job = {
    id: "job-2",
    brandId: "queen_helene",
    sourceImageUrl: "https://example.com/product.png",
    fields: {
      templateId: "myth_fact_stop_doing_this",
      platformPreset: "instagram",
      visualIntensity: "clean",
      ctaStyle: "soft"
    }
  };

  const brand = {
    id: "queen_helene",
    name: "Queen Helene"
  };

  const segments = [
    {
      segmentIndex: 1,
      text: "Stop scrubbing dry skin like this.",
      visualIntent: "Open on the wrong way.",
      estimatedSeconds: 4,
      actualDurationSeconds: 4,
      shotType: "myth",
      sourceStrategy: "hybrid",
      audioUrl: "https://example.com/a1.mp3",
      videoUrl: "https://example.com/v1.mp4"
    },
    {
      segmentIndex: 2,
      text: "Use a calmer reset with hydration built in.",
      visualIntent: "Correct the method.",
      estimatedSeconds: 5,
      actualDurationSeconds: 5,
      shotType: "fact",
      sourceStrategy: "image",
      audioUrl: "https://example.com/a2.mp3",
      videoUrl: "https://example.com/v2.mp4"
    }
  ];

  const config = buildCompositionConfig(job, brand, segments);

  assert.equal(config.captions.combineTokensWithinMilliseconds, 1200);
  assert.equal(config.overlays.formatLabels.labels[0].text, "Stop doing this");
  assert.equal(config.overlays.endCard.ctaText, "Keep Queen Helene in your rotation");
  assert.equal(config.clips[0].transitionDurationFrames, 14);
});
