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
