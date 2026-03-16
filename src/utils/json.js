function stripCodeFences(value) {
  return String(value || "")
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function removeTrailingCommas(text) {
  return text.replace(/,\s*([}\]])/g, "$1");
}

function extractFirstJsonObject(text) {
  const source = stripCodeFences(text);
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return source.slice(start, end + 1);
}

function parseLooseJsonObject(text, fallback = null) {
  const stripped = stripCodeFences(text);
  const direct = safeJsonParse(stripped);
  if (direct) {
    return direct;
  }

  const embedded = extractFirstJsonObject(stripped);
  if (!embedded) {
    return fallback;
  }

  return safeJsonParse(removeTrailingCommas(embedded), fallback);
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

module.exports = {
  stripCodeFences,
  safeJsonParse,
  parseLooseJsonObject,
  stableStringify
};
