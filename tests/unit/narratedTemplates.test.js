const test = require("node:test");
const assert = require("node:assert/strict");

const brands = require("../../src/brands");
const {
  buildNarratedFallbackPlan,
  buildNarratedTemplatePromptContext,
  getNarratedOptionsPayload,
  normalizeNarratedTemplateFields
} = require("../../src/narrated/templates");

function getBrand(id) {
  return brands.find((brand) => brand.id === id);
}

test("narrated template options expose all seven dashboard formats", () => {
  const payload = getNarratedOptionsPayload();

  assert.equal(payload.templates.length, 7);
  assert.equal(payload.templates.some((template) => template.id === "problem_solution_result"), true);
  assert.equal(payload.templates.some((template) => template.id === "ingredient_spotlight"), true);
  assert.equal(payload.narratorTones.some((option) => option.id === "storyteller"), true);
  assert.equal(payload.ctaStyles.some((option) => option.id === "save_share"), true);
  assert.equal(payload.visualIntensityLevels.some((option) => option.id === "bold"), true);
});

test("narrated template prompt context combines template, platform, and brand guidance", () => {
  const context = buildNarratedTemplatePromptContext({
    brand: getBrand("queen_helene"),
    pipeline: "product",
    fields: {
      platformPreset: "instagram",
      templateId: "ingredient_spotlight",
      hookAngle: "why cocoa butter still matters",
      narratorTone: "friendly",
      ctaStyle: "soft",
      visualIntensity: "clean"
    }
  });

  assert.match(context, /Template selected: Ingredient Spotlight/i);
  assert.match(context, /Dynamic hook angle: why cocoa butter still matters/i);
  assert.match(context, /Platform tuning \(instagram\):/i);
  assert.match(context, /Brand adaptation note:/i);
});

test("narrated template field normalization falls back to safe defaults", () => {
  const normalized = normalizeNarratedTemplateFields({
    templateId: "not-real",
    narratorTone: "nope",
    ctaStyle: "bad",
    visualIntensity: "wrong",
    segmentCount: 99
  });

  assert.equal(normalized.templateId, "problem_solution_result");
  assert.equal(normalized.narratorTone, "brand_default");
  assert.equal(normalized.ctaStyle, "soft");
  assert.equal(normalized.visualIntensity, "balanced");
  assert.equal(normalized.segmentCount, 6);
});

test("narrated template field normalization allows a single stitched part", () => {
  const normalized = normalizeNarratedTemplateFields({
    segmentCount: 1
  });

  assert.equal(normalized.segmentCount, 1);
});

test("narrated fallback plans honor the requested stitched part count", () => {
  const plan = buildNarratedFallbackPlan({
    brand: getBrand("tnt"),
    pipeline: "edu",
    fields: {
      topic: "Why steady cardio still works",
      targetLengthSeconds: 20,
      segmentCount: 5
    }
  });

  assert.equal(plan.segments.length, 5);
});
