const test = require("node:test");
const assert = require("node:assert/strict");

const brands = require("../../src/brands");
const { createAnthropicService, __testables } = require("../../src/services/anthropic");

function getBrand(id) {
  return brands.find((brand) => brand.id === id);
}

function createMockClient(handler) {
  return {
    messages: {
      create: handler
    }
  };
}

test("fallback education ideas stay inside the selected brand category", () => {
  const suggestions = __testables.buildFallbackIdeaSuggestions("edu", getBrand("la_baby"), {}, 4, {
    sequence: true,
    totalCount: 4,
    existingItems: []
  });

  assert.equal(suggestions.length, 4);
  for (const suggestion of suggestions) {
    assert.match(suggestion.label, /baby|babies|bath|parent|skin/i);
  }
});

test("sequence prompt notes enforce cut continuity without spoken teasers", () => {
  const notes = __testables.buildSequencePromptNotes({
    sequenceTheme: "Why your baby's skin gets dry after every bath",
    sequenceRole: "hook",
    sequenceLeadIn: "Open the stitched reel with the strongest first beat.",
    sequenceHandOff: "Keep the momentum moving into the after-bath fix.",
    sequenceIndex: 1,
    sequenceCount: 2
  });

  assert.match(notes, /do not literally say "next", "part 2", "coming up"/i);
  assert.doesNotMatch(notes, /hand off to next/i);
  assert.match(notes, /clean continuation beat/i);
});

test("education script prompt stays anchored to the exact selected beat", async () => {
  const calls = [];
  const service = createAnthropicService({
    client: createMockClient(async (payload) => {
      calls.push(payload);
      return {
        content: [{ type: "text", text: "HOOK: A\nBODY: B\nCTA: C" }]
      };
    })
  });

  await service.generateScript(
    "Friendly mom presenter in a cozy family room.",
    "edu",
    getBrand("la_baby"),
    {
      topic: "Why your baby's skin gets dry after every bath",
      format: "Talking head",
      length: "15s",
      sequenceTheme: "Why your baby's skin gets dry after every bath",
      sequenceRole: "hook",
      sequenceLeadIn: "Open the stitched reel strongly.",
      sequenceHandOff: "Keep the momentum moving into the fix.",
      sequenceIndex: 1,
      sequenceCount: 2
    }
  );

  const prompt = calls[0]?.messages?.[0]?.content || "";
  assert.match(prompt, /Stay locked to the exact topic or beat above/i);
  assert.match(prompt, /Do not say "next", "part 2", "coming up"/i);
  assert.doesNotMatch(prompt, /handoff line that flows into the next segment/i);
});

test("video prompt generation compacts oversized structured prompts under the KIE limit", async () => {
  const service = createAnthropicService({
    client: createMockClient(async () => ({
      content: [{
        type: "text",
        text: JSON.stringify({
          subject: "Warm, relatable mom presenter with exact glasses, hair, hoodie, and living-room continuity. ".repeat(8),
          setting: "Cozy family-room-to-bathroom environment with baby bath props, towels, lotion, soft daylight, and specific continuity anchors. ".repeat(7),
          story: "Open with a scroll-stopping claim, demonstrate hot water, show towel friction, shift to damp-skin lotion timing, then land the clearest payoff beat. ".repeat(10),
          camera: "Creator-style vertical framing with smooth push-ins, close detail inserts, medium shots, and clear action readability. ".repeat(7),
          look: "Soft natural light, warm lived-in textures, calm trustworthy palette, matte skin texture, no commercial gloss. ".repeat(6),
          motion: "Natural parenting gestures, precise towel handling, believable product motion, grounded pacing, and readable facial reactions. ".repeat(7),
          continuity: "Maintain the same presenter, glasses, hoodie, room logic, and category-specific bath-time education world across stitched clips. ".repeat(8),
          negative: Array.from({ length: 12 }, (_, index) => `avoid failure mode number ${index + 1} with extra detail to force compaction`)
        })
      }]
    }))
  });

  const prompt = await service.generateVideoPrompt(
    "Friendly mom presenter in a cozy family room.",
    "HOOK: Why baby's skin gets dry after baths\nBODY: Show the bath-time cause\nCTA: Fix it after bath time",
    "edu",
    getBrand("la_baby"),
    {
      generationConfig: {
        profileId: "veo31_image"
      }
    }
  );

  assert.ok(prompt.length <= 1800, `Prompt length was ${prompt.length}`);
  assert.match(prompt, /^vertical|^Vertical/);
  assert.match(prompt, /Avoid:/);
});
