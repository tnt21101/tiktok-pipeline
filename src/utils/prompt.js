const KIE_PROMPT_LIMIT = 1800;
const KIE_PROMPT_WARNING_LIMIT = 1600;

function normalizePrompt(value) {
  return String(value || "").trim();
}

function getPromptMetrics(value) {
  const prompt = normalizePrompt(value);
  const length = prompt.length;

  return {
    length,
    limit: KIE_PROMPT_LIMIT,
    warningLimit: KIE_PROMPT_WARNING_LIMIT,
    exceedsLimit: length > KIE_PROMPT_LIMIT,
    nearLimit: length >= KIE_PROMPT_WARNING_LIMIT
  };
}

function assertPromptWithinLimit(value) {
  const metrics = getPromptMetrics(value);
  if (metrics.exceedsLimit) {
    const error = new Error(`Video prompt exceeds the ${KIE_PROMPT_LIMIT} character limit.`);
    error.code = "prompt_too_long";
    error.metrics = metrics;
    throw error;
  }

  return metrics;
}

module.exports = {
  KIE_PROMPT_LIMIT,
  KIE_PROMPT_WARNING_LIMIT,
  normalizePrompt,
  getPromptMetrics,
  assertPromptWithinLimit
};
