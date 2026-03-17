const test = require("node:test");
const assert = require("node:assert/strict");
const { collectJobMediaUrls } = require("../../src/utils/localMedia");

test("collectJobMediaUrls includes narrated audio files alongside other persisted job media", () => {
  const urls = collectJobMediaUrls(
    {
      sourceImageUrl: "https://example.com/source.png",
      videoUrl: "https://example.com/final.mp4",
      thumbnailUrl: "https://example.com/cover.png",
      providerConfig: {
        generationConfig: {
          imageUrls: ["https://example.com/reference.png"]
        }
      }
    },
    [{
      audioUrl: "https://example.com/segment-audio.mp3",
      videoUrl: "https://example.com/segment-video.mp4"
    }],
    [{
      imageUrl: "https://example.com/slide.png"
    }]
  );

  assert.deepEqual(urls, [
    "https://example.com/source.png",
    "https://example.com/final.mp4",
    "https://example.com/cover.png",
    "https://example.com/reference.png",
    "https://example.com/segment-audio.mp3",
    "https://example.com/segment-video.mp4",
    "https://example.com/slide.png"
  ]);
});
