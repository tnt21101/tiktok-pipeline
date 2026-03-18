const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLooseJsonObject } = require("../../src/utils/json");
const { normalizeCaptionPayload } = require("../../src/services/anthropic");
const { normalizePlatformConfigs } = require("../../src/channels/ayrshare");
const { hashDistributionRequest } = require("../../src/services/distribute");

test("parseLooseJsonObject recovers fenced caption payloads with trailing commas", () => {
  const payload = parseLooseJsonObject(`
\`\`\`json
{
  "tiktok": { "caption": "Hi", "hashtags": ["one", "two",], },
  "instagram": { "caption": "Hello", "hashtags": ["three"] },
  "youtube": { "caption": "Title", "hashtags": ["four"] }
}
\`\`\`
  `);

  const normalized = normalizeCaptionPayload(payload);
  assert.equal(normalized.tiktok.caption, "Hi");
  assert.deepEqual(normalized.tiktok.hashtags, ["one", "two"]);
});

test("normalizeCaptionPayload trims TikTok and Instagram captions to the short-form caps", () => {
  const normalized = normalizeCaptionPayload({
    tiktok: {
      caption: "This TikTok caption is definitely much longer than fifty characters total",
      hashtags: ["one", "two", "three", "four", "five", "six"]
    },
    instagram: {
      caption: "This Instagram caption also runs much longer than the new short max length",
      hashtags: ["a", "b", "c", "d", "e", "f"]
    },
    youtube: {
      caption: "A searchable YouTube Shorts title",
      hashtags: ["shorts", "fitness", "tips", "extra"]
    }
  });

  assert.ok(normalized.tiktok.caption.length <= 50);
  assert.ok(normalized.instagram.caption.length <= 50);
  assert.deepEqual(normalized.tiktok.hashtags, ["one", "two", "three", "four", "five"]);
  assert.deepEqual(normalized.instagram.hashtags, ["a", "b", "c", "d", "e"]);
  assert.deepEqual(normalized.youtube.hashtags, ["shorts", "fitness", "tips"]);
});

test("normalizePlatformConfigs removes disabled platforms and cleans hashtags", () => {
  const configs = normalizePlatformConfigs({
    instagram: { enabled: false, mode: "live", caption: "", hashtags: [] },
    tiktok: { enabled: true, mode: "draft", caption: "Post", hashtags: ["#fitness", " sweat "] }
  });

  assert.deepEqual(configs, [{
    platform: "tiktok",
    mode: "draft",
    caption: "Post",
    hashtags: ["fitness", "sweat"]
  }]);
});

test("normalizePlatformConfigs requires a YouTube title", () => {
  assert.throws(() => normalizePlatformConfigs({
    youtube: { enabled: true, mode: "draft", caption: "", hashtags: ["shorts"] }
  }), /requires a title/);
});

test("normalizePlatformConfigs blocks too many hashtags per platform", () => {
  assert.throws(() => normalizePlatformConfigs({
    youtube: { enabled: true, mode: "draft", caption: "Title", hashtags: ["one", "two", "three", "four"] }
  }), /at most 3 hashtags/);
});

test("normalizePlatformConfigs blocks TikTok and Instagram captions that exceed the new short-form limit", () => {
  assert.throws(() => normalizePlatformConfigs({
    tiktok: {
      enabled: true,
      mode: "draft",
      caption: "This TikTok caption is definitely longer than fifty characters total",
      hashtags: ["one"]
    }
  }), /length limit/);

  assert.throws(() => normalizePlatformConfigs({
    instagram: {
      enabled: true,
      mode: "draft",
      caption: "This Instagram caption is definitely longer than fifty characters total",
      hashtags: ["one"]
    }
  }), /length limit/);
});

test("hashDistributionRequest is stable for the same logical payload", () => {
  const hashA = hashDistributionRequest("https://example.com/video.mp4", {
    youtube: { enabled: true, mode: "live", caption: "Title", hashtags: ["shorts"] },
    tiktok: { enabled: true, mode: "draft", caption: "Caption", hashtags: ["fitness"] }
  });

  const hashB = hashDistributionRequest("https://example.com/video.mp4", {
    tiktok: { enabled: true, mode: "draft", caption: "Caption", hashtags: ["fitness"] },
    youtube: { enabled: true, mode: "live", caption: "Title", hashtags: ["shorts"] }
  });

  assert.equal(hashA, hashB);
});
