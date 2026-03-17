const DEFAULT_SLIDE_COUNT = 5;
const MIN_SLIDE_COUNT = 3;
const MAX_SLIDE_COUNT = 6;
const DEFAULT_SLIDE_DURATION_SECONDS = 3.5;
const MIN_SLIDE_DURATION_SECONDS = 1.5;
const MAX_SLIDE_DURATION_SECONDS = 8;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cleanString(value) {
  return String(value || "").trim();
}

function normalizeSlideCount(value, fallback = DEFAULT_SLIDE_COUNT) {
  const parsed = Number.parseInt(value, 10);
  const safeValue = Number.isFinite(parsed) ? parsed : fallback;
  return clamp(safeValue, MIN_SLIDE_COUNT, MAX_SLIDE_COUNT);
}

function normalizeDurationSeconds(value, fallback = DEFAULT_SLIDE_DURATION_SECONDS) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Number(clamp(numeric, MIN_SLIDE_DURATION_SECONDS, MAX_SLIDE_DURATION_SECONDS).toFixed(1));
}

function normalizeSlidesModeFields(fields = {}) {
  return {
    ...fields,
    slideCount: normalizeSlideCount(fields.slideCount)
  };
}

function normalizeSlidesDraft(slides = [], options = {}) {
  const fallbackImageUrl = cleanString(options.fallbackImageUrl);
  const normalized = (Array.isArray(slides) ? slides : [])
    .map((slide, index) => ({
      id: cleanString(slide.id),
      slideIndex: index + 1,
      headline: cleanString(slide.headline || slide.title),
      body: cleanString(slide.body || slide.copy),
      imageUrl: cleanString(slide.imageUrl || slide.image_url) || fallbackImageUrl || null,
      durationSeconds: normalizeDurationSeconds(slide.durationSeconds || slide.duration_seconds)
    }))
    .filter((slide) => slide.headline || slide.body || slide.imageUrl);

  return normalized.map((slide, index) => ({
    ...slide,
    slideIndex: index + 1
  }));
}

function buildSlidesScript(title, slides = []) {
  const lines = [];
  const normalizedTitle = cleanString(title);
  if (normalizedTitle) {
    lines.push(normalizedTitle);
  }

  for (const slide of slides) {
    lines.push(
      `Slide ${slide.slideIndex}: ${slide.headline}`,
      slide.body,
      `Duration: ${slide.durationSeconds}s`
    );
  }

  return lines.join("\n\n").trim();
}

function buildSlidesPromptSummary(title, slides = []) {
  const lines = [];
  const normalizedTitle = cleanString(title);
  if (normalizedTitle) {
    lines.push(`Deck: ${normalizedTitle}`);
  }

  for (const slide of slides) {
    lines.push(
      `Slide ${slide.slideIndex}: ${slide.headline}`,
      slide.body,
      slide.imageUrl
        ? `Visual anchor: ${slide.imageUrl}`
        : "Visual anchor: branded gradient background"
    );
  }

  return lines.join("\n\n").trim();
}

function getSlideDeckTitle(fields = {}, fallback = "") {
  return cleanString(fields.slideDeckTitle || fields.title || fields.narrationTitle || fallback);
}

module.exports = {
  DEFAULT_SLIDE_COUNT,
  DEFAULT_SLIDE_DURATION_SECONDS,
  MAX_SLIDE_COUNT,
  MIN_SLIDE_COUNT,
  normalizeSlideCount,
  normalizeSlidesModeFields,
  normalizeSlidesDraft,
  buildSlidesScript,
  buildSlidesPromptSummary,
  getSlideDeckTitle
};
