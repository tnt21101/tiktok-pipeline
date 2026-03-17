function cleanString(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return cleanString(value).toLowerCase();
}

function containsAny(text, values = []) {
  return values.some((value) => text.includes(value));
}

function hashString(value) {
  let hash = 0;
  for (const char of String(value || "")) {
    hash = ((hash << 5) - hash) + char.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash);
}

const TRENDING_HOOK_PATTERNS = [
  {
    id: "what_people_get_wrong",
    label: "What people get wrong",
    category: "correction",
    example: "What most people get wrong about your topic.",
    triggers: ["wrong", "mistake", "myth", "myths", "confused", "confusing", "truth", "fix"],
    pipelines: ["edu", "product"],
    build: ({ subject }) => `What most people get wrong about ${subject}.`
  },
  {
    id: "nobody_talks_about",
    label: "Nobody talks about this",
    category: "curiosity",
    example: "Nobody talks about this part of your topic.",
    triggers: ["science", "reason", "actually", "really", "behind", "hidden", "secret", "why"],
    pipelines: ["edu", "product"],
    build: ({ subject }) => `Nobody talks about this part of ${subject}.`
  },
  {
    id: "stop_doing_this",
    label: "Stop doing this",
    category: "warning",
    example: "Stop doing this if you want a better result.",
    triggers: ["mistake", "mistakes", "bad", "avoid", "holding you back", "ruining", "problem", "fix"],
    pipelines: ["edu", "product"],
    build: ({ subject }) => `Stop doing this if you want better ${subject}.`
  },
  {
    id: "truth_about",
    label: "The truth about",
    category: "myth-busting",
    example: "The truth about your topic.",
    triggers: ["truth", "myth", "actually", "really", "vs", "versus"],
    pipelines: ["edu", "product"],
    build: ({ subject }) => `The truth about ${subject}.`
  },
  {
    id: "if_you_struggle",
    label: "If this keeps happening",
    category: "pain-point",
    example: "If this keeps happening, start here.",
    triggers: ["dry", "breakout", "breakouts", "itch", "pain", "tired", "struggle", "stuck", "hard", "difficult", "problem"],
    pipelines: ["edu", "product"],
    build: ({ subject }) => `If ${subject} keeps happening, start here.`
  },
  {
    id: "three_mistakes",
    label: "Three mistakes",
    category: "listicle",
    example: "3 mistakes people make with your topic.",
    triggers: ["tips", "mistake", "mistakes", "habits", "routine", "guide", "beginner"],
    pipelines: ["edu", "product"],
    build: ({ subject }) => `3 mistakes people make with ${subject}.`
  },
  {
    id: "wish_i_knew",
    label: "I wish I knew this sooner",
    category: "personal",
    example: "I wish I knew this about your topic sooner.",
    triggers: ["beginner", "before", "first", "start", "sooner", "new", "early"],
    pipelines: ["edu", "product"],
    build: ({ subject }) => `I wish I knew this about ${subject} sooner.`
  },
  {
    id: "unpopular_opinion",
    label: "Unpopular opinion",
    category: "contrarian",
    example: "Unpopular opinion: this gets easier when you do this.",
    triggers: ["best", "better", "easier", "simple", "simple fix", "overrated", "underrated"],
    pipelines: ["edu", "product"],
    build: ({ subject }) => `Unpopular opinion: ${subject} gets easier when you do this.`
  },
  {
    id: "wait_until",
    label: "Wait until you see this",
    category: "reveal",
    example: "Wait until you see what changes when you fix this.",
    triggers: ["before and after", "after", "result", "results", "change", "glow", "visible", "difference"],
    pipelines: ["edu", "product"],
    build: ({ subject }) => `Wait until you see what changes when you fix ${subject}.`
  },
  {
    id: "pov",
    label: "POV",
    category: "relatable",
    example: "POV: you're dealing with your topic the hard way.",
    triggers: ["when", "pov", "trying to", "awkward", "deal with", "reaction", "friend", "group chat"],
    pipelines: ["comedy", "edu", "product"],
    build: ({ subject }) => `POV: you're dealing with ${subject} the hard way.`
  }
];

function listTrendingHookPatterns() {
  return TRENDING_HOOK_PATTERNS.map(({ id, label, category, example }) => ({
    id,
    label,
    category,
    example
  }));
}

function getHookSubject(fields = {}, pipeline = "edu") {
  if (pipeline === "comedy") {
    return cleanString(fields.scenario);
  }

  if (pipeline === "product") {
    const benefit = cleanString(fields.benefit);
    if (benefit) {
      return benefit;
    }
    return cleanString(fields.productName);
  }

  return cleanString(fields.topic);
}

function scoreHookPattern(pattern, { pipeline, normalizedSubject }) {
  let score = Array.isArray(pattern.pipelines) && pattern.pipelines.includes(pipeline) ? 2 : 0;

  if (containsAny(normalizedSubject, pattern.triggers)) {
    score += 6;
  }

  if (pipeline === "comedy" && pattern.id === "pov") {
    score += 4;
  }

  if (pipeline === "edu" && ["what_people_get_wrong", "truth_about", "nobody_talks_about"].includes(pattern.id)) {
    score += 2;
  }

  if (pipeline === "product" && ["if_you_struggle", "wait_until", "three_mistakes"].includes(pattern.id)) {
    score += 2;
  }

  return score;
}

function selectTrendingHookPattern(fields = {}, pipeline = "edu") {
  const subject = getHookSubject(fields, pipeline);
  if (!subject) {
    return null;
  }

  const normalizedSubject = normalizeText(subject);
  const scoredPatterns = TRENDING_HOOK_PATTERNS.map((pattern) => ({
    pattern,
    score: scoreHookPattern(pattern, {
      pipeline,
      normalizedSubject
    })
  }));
  const topScore = Math.max(...scoredPatterns.map((entry) => entry.score));
  const candidates = scoredPatterns
    .filter((entry) => entry.score === topScore)
    .map((entry) => entry.pattern);

  return candidates[hashString(`${pipeline}:${normalizedSubject}`) % candidates.length] || candidates[0] || null;
}

function buildTrendingHookAngle(fields = {}, pipeline = "edu") {
  const subject = getHookSubject(fields, pipeline);
  const pattern = selectTrendingHookPattern(fields, pipeline);
  if (!subject || !pattern) {
    return "";
  }

  return cleanString(pattern.build({ subject, fields, pipeline }));
}

function decorateIdeaSuggestionWithHookAngle(suggestion, pipeline = "edu") {
  if (!suggestion || typeof suggestion !== "object") {
    return null;
  }

  const fields = suggestion.fields && typeof suggestion.fields === "object"
    ? { ...suggestion.fields }
    : {};
  const hookAngle = buildTrendingHookAngle(fields, pipeline);

  return {
    ...suggestion,
    fields: {
      ...fields,
      ...(hookAngle ? { hookAngle } : {})
    }
  };
}

function decorateIdeaSuggestionsWithHookAngles(suggestions = [], pipeline = "edu") {
  return suggestions
    .map((suggestion) => decorateIdeaSuggestionWithHookAngle(suggestion, pipeline))
    .filter(Boolean);
}

module.exports = {
  TRENDING_HOOK_PATTERNS,
  listTrendingHookPatterns,
  buildTrendingHookAngle,
  decorateIdeaSuggestionWithHookAngle,
  decorateIdeaSuggestionsWithHookAngles
};
