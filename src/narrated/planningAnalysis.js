const {
  getNarratedTemplate,
  normalizeNarratedTemplateFields
} = require("./templates");

function cleanString(value) {
  return String(value || "").trim();
}

function getPrimaryIdeaLabel(pipeline, fields = {}, brand = {}) {
  if (pipeline === "edu") {
    return cleanString(fields.topic) || `${brand.name || "Brand"} category explainer`;
  }

  if (pipeline === "comedy") {
    return cleanString(fields.scenario) || `${brand.name || "Brand"} relatable scenario`;
  }

  return cleanString(fields.productName)
    || cleanString(fields.benefit)
    || `${brand.name || "Brand"} category story`;
}

function buildNarratedPlanningAnalysis({ pipeline, brand = {}, fields = {} }) {
  const normalizedTemplateFields = normalizeNarratedTemplateFields(fields);
  const template = getNarratedTemplate(normalizedTemplateFields.templateId);
  const hasReferenceImage = Boolean(fields.hasReferenceImage);
  const ideaLabel = getPrimaryIdeaLabel(pipeline, fields, brand);
  const hookAngle = cleanString(fields.hookAngle);
  const narratorTone = cleanString(fields.narratorTone).replaceAll("_", " ");
  const ctaStyle = cleanString(fields.ctaStyle).replaceAll("_", " ");
  const visualIntensity = cleanString(fields.visualIntensity).replaceAll("_", " ");
  const platformPreset = cleanString(fields.platformPreset || "tiktok");

  const lines = [
    `Narrated planning brief for ${brand.name || "this brand"}.`,
    `Category: ${cleanString(brand.category) || "consumer product"}.`,
    `Target audience: ${cleanString(brand.targetAudience) || "the brand's likely customer"}.`,
    `Pipeline: ${pipeline}.`,
    `Platform preset: ${platformPreset}.`,
    `Template: ${template.label}.`,
    `Core idea: ${ideaLabel}.`,
    hookAngle ? `Hook angle: ${hookAngle}.` : "",
    narratorTone ? `Narrator tone: ${narratorTone}.` : "",
    ctaStyle ? `CTA style: ${ctaStyle}.` : "",
    visualIntensity ? `Visual intensity: ${visualIntensity}.` : "",
    hasReferenceImage
      ? "A reference image is available and can be used for tighter visual continuity."
      : "No reference image is available. Treat this as a category-led narrated brief: anchor visuals in the customer problem, routine, environment, and payoff instead of exact product matching.",
    "Keep the video grounded in the buyer's situation first. Product moments can stay optional until the solution, payoff, or CTA."
  ].filter(Boolean);

  return lines.join("\n");
}

module.exports = {
  buildNarratedPlanningAnalysis
};
