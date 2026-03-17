const test = require("node:test");
const assert = require("node:assert/strict");

const brands = require("../../src/brands");
const {
  buildBrandDirectionBlock,
  buildCaptionPlatformGuidance,
  buildModelPromptGuidance,
  buildVideoNegativeConstraints,
  assembleVideoPromptParts
} = require("../../src/prompts/framework");

function getBrand(id) {
  return brands.find((brand) => brand.id === id);
}

test("brand direction block reflects TNT training-world guardrails", () => {
  const block = buildBrandDirectionBlock(getBrand("tnt"), "edu");

  assert.match(block, /Earned intensity/i);
  assert.match(block, /gym/i);
  assert.match(block, /Avoid: .*spa/i);
  assert.match(block, /Signature charm: .*timer/i);
});

test("brand direction block reflects L.A. Baby safety and tenderness guardrails", () => {
  const block = buildBrandDirectionBlock(getBrand("la_baby"), "comedy");

  assert.match(block, /parent-to-parent|everyday parent moments/i);
  assert.match(block, /Avoid: .*unsafe/i);
  assert.match(block, /bath splash|blanket tuck|tiny yawn/i);
});

test("model prompt guidance includes profile-specific notes", () => {
  assert.match(buildModelPromptGuidance({ profileId: "sora2_image" }), /first-frame fidelity/i);
  assert.match(buildModelPromptGuidance({ profileId: "veo31_reference" }), /reference subject/i);
  assert.match(buildModelPromptGuidance({ profileId: "seedance15pro", generateAudio: true }), /sound is implied/i);
  assert.match(buildModelPromptGuidance({ profileId: "kling30", useElements: true, multiShots: true }), /locked visual anchors|connected shots/i);
});

test("caption platform guidance reflects real platform caps", () => {
  const guidance = buildCaptionPlatformGuidance();

  assert.match(guidance, /TikTok: .*at most 8 strong hashtags/i);
  assert.match(guidance, /Instagram Reels: .*at most 10 hashtags/i);
  assert.match(guidance, /YouTube Shorts: .*under 100 characters/i);
});

test("video negative constraints include pipeline and brand-specific safeguards", () => {
  const productNegatives = buildVideoNegativeConstraints("product", getBrand("la_baby"), { profileId: "sora2_image" });

  assert.ok(productNegatives.includes("do not hide the product for most of the clip"));
  assert.ok(productNegatives.includes("no unsafe baby handling or careless physical comedy around the baby"));
  assert.ok(productNegatives.includes("do not drift away from the uploaded reference identity or product silhouette"));

  const klingNegatives = buildVideoNegativeConstraints("edu", getBrand("tnt"), {
    profileId: "kling30",
    useElements: true,
    multiShots: true
  });
  assert.ok(klingNegatives.includes("do not let the anchored element drift, morph, duplicate, or disappear"));
  assert.ok(klingNegatives.includes("do not reset the subject, setting, or lighting between the connected shot beats"));
});

test("video prompt assembler creates one compact directive", () => {
  const prompt = assembleVideoPromptParts({
    format: "Vertical 9:16 creator-style comedy skit for TNT Pro Series",
    subject: "Athletic presenter in a charcoal gym top",
    setting: "Busy treadmill lane with gym mirrors",
    story: "He starts overconfident, then loses composure halfway through cardio, then side-eyes the camera",
    camera: "Medium handheld opener, quick punch-in on the reaction, fast cut to the side-eye",
    look: "Bright gym fluorescents with sweat texture and reflective mirrors",
    motion: "Natural cardio movement with readable comedic reactions",
    continuity: "Keep the same presenter, wardrobe, and cardio station across the whole clip",
    negative: ["no random scene resets", "no extra fingers"]
  });

  assert.match(prompt, /^Vertical 9:16/);
  assert.match(prompt, /Subject:/);
  assert.match(prompt, /Avoid: no random scene resets, no extra fingers\./);
});
