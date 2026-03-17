const test = require("node:test");
const assert = require("node:assert/strict");
const {
  listTrendingHookPatterns,
  buildTrendingHookAngle,
  decorateIdeaSuggestionWithHookAngle
} = require("../../src/narrated/trendingHooks");

test("trending hook library exposes ten current TikTok-style hook patterns", () => {
  const hooks = listTrendingHookPatterns();
  assert.equal(hooks.length, 10);
  assert.deepEqual(hooks[0], {
    id: "what_people_get_wrong",
    label: "What people get wrong",
    category: "correction",
    example: "What most people get wrong about your topic."
  });
});

test("buildTrendingHookAngle selects a deterministic hook angle from the topic", () => {
  const fields = {
    topic: "the biggest mistake people make before cardio"
  };
  const first = buildTrendingHookAngle(fields, "edu");
  const second = buildTrendingHookAngle(fields, "edu");

  assert.equal(first, second);
  assert.match(first, /(What most people get wrong|Stop doing this|3 mistakes|I wish I knew)/);
});

test("decorateIdeaSuggestionWithHookAngle adds a hook angle to idea suggestions", () => {
  const suggestion = decorateIdeaSuggestionWithHookAngle({
    label: "Why baby skin gets dry after baths",
    fields: {
      topic: "why baby skin gets dry after baths"
    }
  }, "edu");

  assert.equal(typeof suggestion.fields.hookAngle, "string");
  assert.equal(suggestion.fields.hookAngle.length > 0, true);
});
