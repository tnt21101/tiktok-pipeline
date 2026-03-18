const { AppError } = require("../utils/errors");

const FIELD_KEYS = [
  "brandSummary",
  "productDescription",
  "targetAudience",
  "constraints"
];

const FORMAT_TYPES = [
  "Problem-Solution-Result",
  "Myth vs Fact",
  "Stop Doing This",
  "List / Tips",
  "Before / After or Transformation",
  "Tutorial / How-to"
];

const UNIVERSAL_ANGLES = [
  {
    key: "time",
    angleName: "Time-saving routines",
    description: "Makes the routine feel faster, lighter, and easier to maintain."
  },
  {
    key: "simple",
    angleName: "Simpler everyday wins",
    description: "Cuts through overwhelm with easy steps and lower-friction habits."
  },
  {
    key: "confidence",
    angleName: "Confidence without guesswork",
    description: "Helps people feel more in control and more sure of what to do next."
  },
  {
    key: "consistency",
    angleName: "Consistency that sticks",
    description: "Focuses on realistic repeatability instead of one-time motivation."
  },
  {
    key: "value",
    angleName: "Value-driven upgrades",
    description: "Frames the offer as a smarter, more practical everyday choice."
  },
  {
    key: "clarity",
    angleName: "Myth-busting clarity",
    description: "Replaces confusion and outdated advice with useful, grounded guidance."
  }
];

const HOOK_LIBRARY = {
  "Problem-Solution-Result": [
    { templateId: "HT_relief_01", emotionalTag: "relief" },
    { templateId: "HT_curiosity_01", emotionalTag: "curiosity" },
    { templateId: "HT_urgency_01", emotionalTag: "urgency" }
  ],
  "Myth vs Fact": [
    { templateId: "HT_curiosity_02", emotionalTag: "curiosity" },
    { templateId: "HT_novelty_01", emotionalTag: "novelty" },
    { templateId: "HT_relief_02", emotionalTag: "relief" }
  ],
  "Stop Doing This": [
    { templateId: "HT_fear_01", emotionalTag: "fear" },
    { templateId: "HT_urgency_02", emotionalTag: "urgency" },
    { templateId: "HT_status_01", emotionalTag: "status" }
  ],
  "List / Tips": [
    { templateId: "HT_curiosity_03", emotionalTag: "curiosity" },
    { templateId: "HT_belonging_01", emotionalTag: "belonging" },
    { templateId: "HT_aspiration_01", emotionalTag: "aspiration" }
  ],
  "Before / After or Transformation": [
    { templateId: "HT_aspiration_02", emotionalTag: "aspiration" },
    { templateId: "HT_relief_03", emotionalTag: "relief" },
    { templateId: "HT_status_02", emotionalTag: "status" }
  ],
  "Tutorial / How-to": [
    { templateId: "HT_curiosity_04", emotionalTag: "curiosity" },
    { templateId: "HT_relief_04", emotionalTag: "relief" },
    { templateId: "HT_belonging_02", emotionalTag: "belonging" }
  ]
};

const BASE_PAINS = {
  time: [
    "No time for a long routine",
    "Daily tasks feel more complicated than they should",
    "The routine keeps slipping when the day gets busy"
  ],
  simple: [
    "Too many steps and too much conflicting advice",
    "Hard to know what actually matters",
    "The setup feels more stressful than helpful"
  ],
  confidence: [
    "Unclear whether the routine is actually working",
    "Second-guessing every choice",
    "Results feel inconsistent from day to day"
  ],
  consistency: [
    "Motivation disappears after a few days",
    "Habits break as soon as life gets hectic",
    "The routine feels hard to repeat"
  ],
  value: [
    "Does not want to waste time or money on the wrong option",
    "Needs something practical enough to keep using",
    "Wants an upgrade that feels worth the effort"
  ],
  clarity: [
    "Popular advice keeps making the process more confusing",
    "Old myths keep getting repeated as facts",
    "People are following habits that create more friction"
  ]
};

const BASE_DESIRES = {
  time: [
    "Quicker wins",
    "A routine that fits into real life",
    "Less friction during the busiest parts of the day"
  ],
  simple: [
    "Clear next steps",
    "Easy habits that do not feel overwhelming",
    "Less mental load"
  ],
  confidence: [
    "More control",
    "A clearer sense of progress",
    "Less guesswork"
  ],
  consistency: [
    "Something easy to repeat",
    "Steady momentum",
    "Results that feel sustainable"
  ],
  value: [
    "Smarter choices",
    "Better payoff from the same effort",
    "An option that feels worth keeping"
  ],
  clarity: [
    "Straight answers",
    "Helpful context",
    "Advice that feels practical and believable"
  ]
};

const BASE_OBJECTIONS = {
  time: [
    "This will probably take too long",
    "I do not have the energy to add another step"
  ],
  simple: [
    "It seems too complicated",
    "There are too many choices to sort through"
  ],
  confidence: [
    "I am not sure this will make a noticeable difference",
    "I have tried other options already"
  ],
  consistency: [
    "I will probably stop after a week",
    "This only works if everything goes perfectly"
  ],
  value: [
    "It might not feel worth it",
    "I do not want to overinvest in something unproven"
  ],
  clarity: [
    "I have heard too many conflicting opinions",
    "This sounds like recycled advice"
  ]
};

const RESTRICTED_TERMS = [
  "cure",
  "cures",
  "treat",
  "treats",
  "diagnose",
  "diagnoses",
  "heal",
  "heals",
  "miracle",
  "guaranteed",
  "guarantee",
  "overnight",
  "melt fat",
  "erase wrinkles",
  "reverse aging",
  "income",
  "earnings",
  "make money",
  "get rich",
  "risk-free"
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "with"
]);

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceCase(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function compactArray(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => normalizeText(value))
    .filter(Boolean)));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function emptyDraft() {
  return {
    brandSummary: "",
    productDescription: "",
    targetAudience: "",
    constraints: ""
  };
}

function toSourceKey(value) {
  return value === "amazon" ? "amazon" : value === "manual" ? "manual" : "empty";
}

function sanitizeDisplayText(value) {
  return normalizeText(String(value || "").replace(/[<>]/g, ""));
}

function tokenize(value) {
  return compactArray(String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}

function buildSourceFromInput(input = {}, fieldSources = {}) {
  const asin = normalizeText(input.asin || "");
  const productUrl = normalizeText(input.productUrl || "");
  const fromManual = FIELD_KEYS.some((field) => toSourceKey(fieldSources[field]) === "manual");
  return {
    from_amazon: Boolean(asin || productUrl),
    from_manual: fromManual,
    asin: asin || null,
    product_url: productUrl || null
  };
}

function collectManualInputs(input = {}, fieldSources = null) {
  return FIELD_KEYS.reduce((result, field) => {
    const value = sanitizeDisplayText(input[field]);
    const hasExplicitSource = fieldSources && Object.prototype.hasOwnProperty.call(fieldSources, field);
    const explicitSource = hasExplicitSource ? toSourceKey(fieldSources[field]) : "";
    const shouldUseManual = explicitSource
      ? explicitSource === "manual"
      : Boolean(value);
    result[field] = shouldUseManual ? value : "";
    return result;
  }, emptyDraft());
}

function buildFieldSources(autoDraft, manualInputs, mergedDraft) {
  return FIELD_KEYS.reduce((result, field) => {
    if (manualInputs[field]) {
      result[field] = "manual";
      return result;
    }

    if (autoDraft[field]) {
      result[field] = "amazon";
      return result;
    }

    result[field] = mergedDraft[field] ? "manual" : "empty";
    return result;
  }, {});
}

function mergeDrafts(autoDraft, manualInputs) {
  return FIELD_KEYS.reduce((result, field) => {
    result[field] = manualInputs[field] || autoDraft[field] || "";
    return result;
  }, emptyDraft());
}

function collectBannedPhrases({ input = {}, listing = null, normalizedInputs = null }) {
  const sourceTexts = compactArray([
    listing?.brandName,
    listing?.title,
    input.brandSummary,
    input.productDescription,
    normalizedInputs?.brandSummary,
    normalizedInputs?.productDescription
  ]);
  const phrases = new Set();

  sourceTexts.forEach((text) => {
    const normalized = normalizeText(text);
    if (!normalized) {
      return;
    }

    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && /[A-Z]/.test(normalized)) {
      phrases.add(normalized);
    }

    words.forEach((word) => {
      if (/^[A-Z0-9][A-Za-z0-9-]{3,}$/.test(word) && !STOP_WORDS.has(word.toLowerCase())) {
        phrases.add(word);
      }
    });
  });

  return Array.from(phrases).sort((left, right) => right.length - left.length);
}

function scrubBannedPhrases(value, bannedPhrases = []) {
  let output = String(value || "");
  for (const phrase of bannedPhrases) {
    if (!phrase) {
      continue;
    }

    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(escaped, "gi"), "");
  }

  return normalizeText(output
    .replace(/\s+,/g, ",")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " "));
}

function scrubValue(value, bannedPhrases = []) {
  return sentenceCase(scrubBannedPhrases(sanitizeDisplayText(value), bannedPhrases));
}

function inferAudienceSegments(targetAudience = "", productDescription = "") {
  const raw = compactArray([
    ...String(targetAudience || "").split(/[.;\n]/),
    ...String(productDescription || "").split(/[.;\n]/)
  ]);

  const matches = [];
  raw.forEach((entry) => {
    const lower = entry.toLowerCase();
    if (/parents|moms|dads/.test(lower)) {
      matches.push("Busy parents");
    }
    if (/student/.test(lower)) {
      matches.push("Students");
    }
    if (/beginner|new to/.test(lower)) {
      matches.push("Beginners");
    }
    if (/athlete|fitness|workout|gym/.test(lower)) {
      matches.push("Active adults");
    }
    if (/commute|travel|portable|on the go/.test(lower)) {
      matches.push("People on the go");
    }
    if (/work|office|desk|career/.test(lower)) {
      matches.push("Busy professionals");
    }
    if (/home|household|family/.test(lower)) {
      matches.push("Home-focused adults");
    }
    if (/beauty|skin|hair|groom/.test(lower)) {
      matches.push("Appearance-conscious adults");
    }
  });

  return compactArray(matches).slice(0, 4).concat(matches.length > 0 ? [] : ["Busy adults"]);
}

function inferRoutineLabel(productDescription = "", targetAudience = "") {
  const source = `${productDescription} ${targetAudience}`.toLowerCase();
  if (/skin|serum|moistur|cleanser|beauty/.test(source)) {
    return "care routine";
  }
  if (/hair|shampoo|conditioner|scalp/.test(source)) {
    return "hair routine";
  }
  if (/workout|gym|recovery|fitness|training/.test(source)) {
    return "workout routine";
  }
  if (/clean|laundry|kitchen|household|organize/.test(source)) {
    return "cleanup routine";
  }
  if (/sleep|relax|calm|wind down/.test(source)) {
    return "wind-down routine";
  }
  if (/travel|portable|commute/.test(source)) {
    return "on-the-go routine";
  }
  return "daily routine";
}

function inferOutcomeLabel(productDescription = "", brandSummary = "") {
  const source = `${productDescription} ${brandSummary}`.toLowerCase();
  if (/fast|quick|minutes|speed|streamline/.test(source)) {
    return "faster follow-through";
  }
  if (/comfort|calm|soothe|relief/.test(source)) {
    return "more comfort";
  }
  if (/confidence|visible|appearance|polish/.test(source)) {
    return "more confidence";
  }
  if (/focus|energy|performance/.test(source)) {
    return "better daily performance";
  }
  return "less friction and better consistency";
}

function inferEverydayAction(routineLabel = "daily routine") {
  if (routineLabel === "care routine") {
    return "stacking too many steps into your care routine";
  }
  if (routineLabel === "hair routine") {
    return "treating your hair routine like it needs ten products";
  }
  if (routineLabel === "workout routine") {
    return "making your workout routine harder than it needs to be";
  }
  if (routineLabel === "cleanup routine") {
    return "turning simple cleanup into a bigger job";
  }
  if (routineLabel === "wind-down routine") {
    return "overcomplicating your wind-down routine";
  }
  if (routineLabel === "on-the-go routine") {
    return "packing your on-the-go routine with too much friction";
  }
  return "making your daily routine harder than it needs to be";
}

function inferUsageMoment(productDescription = "", targetAudience = "") {
  const source = `${productDescription} ${targetAudience}`.toLowerCase();
  if (/morning|before work|rush/.test(source)) {
    return "before work";
  }
  if (/night|sleep|wind down/.test(source)) {
    return "before bed";
  }
  if (/gym|workout|training/.test(source)) {
    return "before or after a workout";
  }
  if (/travel|commute/.test(source)) {
    return "when you are on the move";
  }
  return "during the busiest part of the day";
}

function inferAwarenessLevel(formatType) {
  if (formatType === "Myth vs Fact") {
    return "Problem-aware";
  }
  if (formatType === "Tutorial / How-to") {
    return "Solution-aware";
  }
  if (formatType === "Before / After or Transformation") {
    return "Product-aware";
  }
  return "Problem-aware";
}

function inferConstraintsList(constraintsText = "") {
  const lower = String(constraintsText || "").toLowerCase();
  const rules = [];
  if (/medical|supplement|health|disease|diagnos|treat|skin condition|hair loss/.test(lower)) {
    rules.push("Avoid medical or disease-treatment claims.");
  }
  if (/income|financial|earnings|money|roi/.test(lower)) {
    rules.push("Avoid income, earnings, or guaranteed financial outcomes.");
  }
  if (/weight loss|fat|fitness|body/.test(lower)) {
    rules.push("Avoid guaranteed body transformation promises.");
  }
  if (/children|kids|baby|pet|safety/.test(lower)) {
    rules.push("Avoid absolute safety claims or anything that sounds like professional advice.");
  }

  return compactArray(rules.concat([
    "Keep language practical, believable, and free of guaranteed outcomes.",
    "Do not use medical, financial, or other restricted claims."
  ]));
}

function inferListingCategory(listing = {}) {
  const category = normalizeText(listing.category);
  if (category) {
    return category;
  }

  const combined = `${listing.title || ""} ${(listing.bullets || []).join(" ")}`.toLowerCase();
  if (/skin|serum|beauty|cleanser|moistur/.test(combined)) {
    return "Beauty and personal care";
  }
  if (/hair|shampoo|conditioner|scalp/.test(combined)) {
    return "Hair care";
  }
  if (/workout|fitness|recovery|gym/.test(combined)) {
    return "Fitness and wellness";
  }
  if (/clean|laundry|kitchen|household/.test(combined)) {
    return "Home care";
  }
  if (/tech|device|charger|portable/.test(combined)) {
    return "Everyday tech";
  }
  return "Everyday lifestyle";
}

function inferImageryHints(listing = {}) {
  const source = `${listing.title || ""} ${(listing.bullets || []).join(" ")} ${listing.description || ""}`.toLowerCase();
  const hints = [];
  if (/gym|fitness|workout|recovery/.test(source)) {
    hints.push("Active lifestyle setting");
    hints.push("Close-up routine demo");
  }
  if (/skin|beauty|hair|cleanser|serum/.test(source)) {
    hints.push("Mirror-side routine moment");
    hints.push("Texture close-up");
  }
  if (/kitchen|home|clean|laundry|household/.test(source)) {
    hints.push("Everyday home setting");
    hints.push("Before-and-after cleanup scene");
  }
  if (/travel|portable|commute/.test(source)) {
    hints.push("On-the-go use case");
    hints.push("Bag or desk setup shot");
  }
  if (Array.isArray(listing.galleryImages) && listing.galleryImages.length > 1) {
    hints.push("Multiple angle product stills");
  }
  return compactArray(hints).slice(0, 4).concat(hints.length > 0 ? [] : [
    "Clean close-up product framing",
    "Everyday use-case setting"
  ]);
}

function buildAmazonDraft(listing = {}) {
  const category = inferListingCategory(listing);
  const routineLabel = inferRoutineLabel(
    `${listing.title || ""} ${listing.description || ""} ${(listing.bullets || []).join(" ")}`,
    category
  );
  const audience = inferAudienceSegments(
    `${listing.title || ""}. ${(listing.reviewThemes || []).join(". ")}`,
    `${(listing.bullets || []).join(". ")} ${listing.description || ""}`
  );
  const outcome = inferOutcomeLabel(
    `${listing.description || ""} ${(listing.bullets || []).join(". ")}`,
    category
  );
  const imageryHints = inferImageryHints(listing).join(", ");
  const constraints = inferConstraintsList(category).join(" ");

  return {
    brandSummary: `A ${category.toLowerCase()} brand positioned around practical daily use, simple routines, and believable everyday outcomes.`,
    productDescription: `A ${category.toLowerCase()} offer designed to improve the ${routineLabel} with a focus on ${outcome}. Visual cues suggest ${imageryHints.toLowerCase()}.`,
    targetAudience: audience.join(", "),
    constraints
  };
}

function sanitizeNormalizedInputs(mergedDraft, options = {}) {
  const bannedPhrases = collectBannedPhrases({
    input: mergedDraft,
    listing: options.listing
  });
  const brandSummary = scrubValue(mergedDraft.brandSummary, bannedPhrases)
    || "A consumer brand focused on practical everyday results.";
  const productDescription = scrubValue(mergedDraft.productDescription, bannedPhrases)
    || "An everyday offer designed to make a routine feel simpler, clearer, or easier to stick with.";
  const targetAudience = scrubValue(mergedDraft.targetAudience, bannedPhrases)
    || "Busy adults who want practical improvements without extra friction.";
  const constraints = scrubValue(mergedDraft.constraints, bannedPhrases)
    || "Keep messaging practical and avoid restricted claims.";

  return {
    brand_summary: brandSummary,
    product_description: productDescription,
    target_audience: targetAudience,
    constraints,
    source: buildSourceFromInput(options.input || {}, options.fieldSources || {})
  };
}

function buildAngleBank(normalizedInputs) {
  const routineLabel = inferRoutineLabel(
    normalizedInputs.product_description,
    normalizedInputs.target_audience
  );
  const outcome = inferOutcomeLabel(
    normalizedInputs.product_description,
    normalizedInputs.brand_summary
  );

  return UNIVERSAL_ANGLES.map((entry) => ({
    angle_name: entry.angleName,
    description: `${entry.description} Built around a ${routineLabel} that leads to ${outcome}.`,
    pains: BASE_PAINS[entry.key].map((pain) => sentenceCase(pain)),
    desires: BASE_DESIRES[entry.key].map((desire) => sentenceCase(desire)),
    objections: BASE_OBJECTIONS[entry.key].map((objection) => sentenceCase(objection))
  }));
}

function buildTopicTemplates(context, angle, formatType, audienceLabel) {
  const routineLabel = context.routineLabel;
  const outcome = context.outcomeLabel;
  const everydayAction = context.everydayAction;
  const usageMoment = context.usageMoment;

  const templates = {
    "Problem-Solution-Result": [
      `Why your ${routineLabel} still feels harder than it should`,
      `The easiest way to make your ${routineLabel} feel lighter ${usageMoment}`
    ],
    "Myth vs Fact": [
      `The myth that makes ${audienceLabel.toLowerCase()} overcomplicate a ${routineLabel}`,
      `What actually matters when you want ${outcome}`
    ],
    "Stop Doing This": [
      `Stop ${everydayAction} if you want ${outcome}`,
      `You are making your ${routineLabel} harder than it needs to be`
    ],
    "List / Tips": [
      `3 things anyone building a better ${routineLabel} should focus on`,
      `4 small upgrades that make a ${routineLabel} easier to keep`
    ],
    "Before / After or Transformation": [
      `From rushed and inconsistent to calm and repeatable`,
      `The before-and-after difference of a smoother ${routineLabel}`
    ],
    "Tutorial / How-to": [
      `How to build a ${routineLabel} you can actually keep`,
      `How to get ${outcome} without adding more friction`
    ]
  };

  return (templates[formatType] || []).map((topic) => {
    if (angle.angle_name === "Time-saving routines" && formatType === "Problem-Solution-Result") {
      return topic.replace("harder than it should", "like it steals more time than it should");
    }

    if (angle.angle_name === "Confidence without guesswork" && formatType === "Myth vs Fact") {
      return topic.replace("What actually matters", "What actually makes people feel more in control");
    }

    if (angle.angle_name === "Consistency that sticks" && formatType === "Tutorial / How-to") {
      return topic.replace("build", "repeat");
    }

    if (angle.angle_name === "Value-driven upgrades" && formatType === "List / Tips") {
      return topic.replace("4 small upgrades", "3 practical swaps");
    }

    if (angle.angle_name === "Myth-busting clarity" && formatType === "Stop Doing This") {
      return topic.replace("Stop", "Stop believing you need to");
    }

    return topic;
  });
}

function buildTopicGrid(angleBank, normalizedInputs) {
  const audiences = inferAudienceSegments(
    normalizedInputs.target_audience,
    normalizedInputs.product_description
  );
  const context = {
    routineLabel: inferRoutineLabel(
      normalizedInputs.product_description,
      normalizedInputs.target_audience
    ),
    outcomeLabel: inferOutcomeLabel(
      normalizedInputs.product_description,
      normalizedInputs.brand_summary
    ),
    everydayAction: inferEverydayAction(
      inferRoutineLabel(normalizedInputs.product_description, normalizedInputs.target_audience)
    ),
    usageMoment: inferUsageMoment(
      normalizedInputs.product_description,
      normalizedInputs.target_audience
    )
  };

  let topicCounter = 1;
  const topics = [];
  angleBank.forEach((angle, angleIndex) => {
    FORMAT_TYPES.forEach((formatType) => {
      const audienceLabel = audiences[(angleIndex + topics.length) % audiences.length] || "Busy adults";
      buildTopicTemplates(context, angle, formatType, audienceLabel).forEach((topic) => {
        topics.push({
          topic_id: `T${topicCounter}`,
          angle_name: angle.angle_name,
          format_type: formatType,
          topic,
          audience: audienceLabel,
          awareness_level: inferAwarenessLevel(formatType)
        });
        topicCounter += 1;
      });
    });
  });

  return topics;
}

function buildHookText(topicEntry, hookTemplate, context) {
  const topicText = normalizeText(topicEntry.topic);
  const lowerTopic = topicText.toLowerCase();
  const routineLabel = context.routineLabel;
  const outcome = context.outcomeLabel;
  const usageMoment = context.usageMoment;

  switch (hookTemplate.templateId) {
    case "HT_relief_01":
      return `If your ${routineLabel} keeps feeling too heavy ${usageMoment}, watch this.`;
    case "HT_curiosity_01":
      return `This is why ${lowerTopic.replace(/\?$/, "")}.`;
    case "HT_urgency_01":
      return `Stop scrolling if your ${routineLabel} still feels harder than it should.`;
    case "HT_curiosity_02":
      return `Nobody talks about the part of ${lowerTopic} that actually matters.`;
    case "HT_novelty_01":
      return `Most people repeat the wrong advice about ${lowerTopic}.`;
    case "HT_relief_02":
      return `The good news: getting ${outcome} is usually simpler than people think.`;
    case "HT_fear_01":
      return `This habit is quietly making your ${routineLabel} worse.`;
    case "HT_urgency_02":
      return `Stop doing this if you want ${outcome}.`;
    case "HT_status_01":
      return `People who feel more in control usually stop doing this first.`;
    case "HT_curiosity_03":
      return `3 things people with a better ${routineLabel} do differently.`;
    case "HT_belonging_01":
      return `If you are trying to keep a ${routineLabel} on track, start here.`;
    case "HT_aspiration_01":
      return `The easiest upgrades behind a smoother ${routineLabel}.`;
    case "HT_aspiration_02":
      return `The before-and-after difference of a routine that finally clicks.`;
    case "HT_relief_03":
      return `From chaotic to repeatable: the shift most people want but rarely plan for.`;
    case "HT_status_02":
      return `This is what a more dialed-in ${routineLabel} actually looks like.`;
    case "HT_curiosity_04":
      return `Here is how to get ${outcome} without making your day harder.`;
    case "HT_relief_04":
      return `How to make a ${routineLabel} feel easier starting today.`;
    case "HT_belonging_02":
      return `If you want a routine you can actually keep, try this framework.`;
    default:
      return `If ${lowerTopic} sounds familiar, watch this.`;
  }
}

function buildHookBank(topicGrid, normalizedInputs) {
  const context = {
    routineLabel: inferRoutineLabel(
      normalizedInputs.product_description,
      normalizedInputs.target_audience
    ),
    outcomeLabel: inferOutcomeLabel(
      normalizedInputs.product_description,
      normalizedInputs.brand_summary
    ),
    usageMoment: inferUsageMoment(
      normalizedInputs.product_description,
      normalizedInputs.target_audience
    )
  };

  let hookCounter = 1;
  const hooks = [];
  topicGrid.forEach((topicEntry) => {
    const templates = HOOK_LIBRARY[topicEntry.format_type] || HOOK_LIBRARY["Problem-Solution-Result"];
    templates.forEach((hookTemplate) => {
      hooks.push({
        topic_id: topicEntry.topic_id,
        hook_id: `H${hookCounter}`,
        template_id: hookTemplate.templateId,
        hook_text: buildHookText(topicEntry, hookTemplate, context),
        pattern_type: topicEntry.format_type,
        emotional_tag: hookTemplate.emotionalTag
      });
      hookCounter += 1;
    });
  });
  return hooks;
}

function violatesConstraints(text, normalizedInputs) {
  const lower = String(text || "").toLowerCase();
  if (RESTRICTED_TERMS.some((term) => lower.includes(term))) {
    return true;
  }

  const constraints = String(normalizedInputs.constraints || "").toLowerCase();
  if (constraints.includes("medical") && /\bcure|treat|diagnose|heals?\b/.test(lower)) {
    return true;
  }
  if (constraints.includes("income") && /\bincome|earn|money|rich\b/.test(lower)) {
    return true;
  }
  if (constraints.includes("guaranteed") && /\bguaranteed|guarantee|always|never fail\b/.test(lower)) {
    return true;
  }

  return false;
}

function scoreHook(topicEntry, hookEntry, normalizedInputs) {
  let thumbstop = 6;
  let clarity = 7;
  let safety = 9;
  const text = String(hookEntry.hook_text || "");
  const lower = text.toLowerCase();

  if (/stop scrolling|watch this|nobody talks|you are|you're|3 things|before-and-after|before and after|how to/.test(lower)) {
    thumbstop += 2;
  }
  if (/[0-9]/.test(text) || /\bwhy\b|\bwrong\b|\bmyth\b|\bactually\b/.test(lower)) {
    thumbstop += 1;
  }
  if (text.length <= 95) {
    thumbstop += 1;
  }

  if (text.length > 120) {
    clarity -= 1;
  }
  if (!topicEntry?.audience || !topicEntry?.topic) {
    clarity -= 1;
  }
  if (/\bthis\b/.test(lower) && !/\bwhy\b|\bhow\b|\bif\b/.test(lower)) {
    clarity -= 1;
  }

  if (violatesConstraints(text, normalizedInputs) || violatesConstraints(topicEntry?.topic || "", normalizedInputs)) {
    safety = 0;
  }

  return {
    thumbstop: clamp(thumbstop, 1, 10),
    clarity: clamp(clarity, 1, 10),
    safety: clamp(safety, 0, 10)
  };
}

function improveBorderlineHook(topicEntry, hookEntry) {
  const text = normalizeText(hookEntry.hook_text);
  if (!text) {
    return hookEntry;
  }

  if (!/^stop scrolling/i.test(text) && !/^if /i.test(text)) {
    return {
      ...hookEntry,
      hook_text: `Stop scrolling if ${text.charAt(0).toLowerCase()}${text.slice(1)}`
    };
  }

  if (!/\bwatch this\b/i.test(text)) {
    return {
      ...hookEntry,
      hook_text: `${text.replace(/\.$/, "")}. Watch this.`
    };
  }

  return hookEntry;
}

function selectApprovedConcepts(topicGrid, hookBank, normalizedInputs) {
  const topicById = new Map(topicGrid.map((topic) => [topic.topic_id, topic]));
  const evaluated = [];

  hookBank.forEach((hookEntry) => {
    const topicEntry = topicById.get(hookEntry.topic_id);
    if (!topicEntry) {
      return;
    }

    let scores = scoreHook(topicEntry, hookEntry, normalizedInputs);
    let improvedHook = hookEntry;

    if (scores.thumbstop >= 6 && scores.thumbstop <= 7) {
      improvedHook = improveBorderlineHook(topicEntry, hookEntry);
      scores = scoreHook(topicEntry, improvedHook, normalizedInputs);
    }

    if (scores.thumbstop >= 8 && scores.clarity >= 7 && scores.safety >= 7) {
      evaluated.push({
        topicEntry,
        hookEntry: improvedHook,
        scores
      });
    }
  });

  const ranked = evaluated.sort((left, right) => {
    const leftTotal = left.scores.thumbstop + left.scores.clarity + left.scores.safety;
    const rightTotal = right.scores.thumbstop + right.scores.clarity + right.scores.safety;
    return rightTotal - leftTotal;
  });

  const selectedTopicIds = new Set();
  const selectedAngleNames = new Set();
  const approved = [];

  ranked.forEach((entry) => {
    if (approved.length >= 12) {
      return;
    }

    const duplicateTopic = selectedTopicIds.has(entry.topicEntry.topic_id);
    const angleOverloaded = selectedAngleNames.has(entry.topicEntry.angle_name) && approved.length >= 6;
    if (duplicateTopic || angleOverloaded) {
      return;
    }

    approved.push({
      concept_id: `C${approved.length + 1}`,
      topic_id: entry.topicEntry.topic_id,
      hook_id: entry.hookEntry.hook_id,
      format_type: entry.topicEntry.format_type,
      hook_text: entry.hookEntry.hook_text,
      emotional_tag: entry.hookEntry.emotional_tag,
      scores: entry.scores
    });
    selectedTopicIds.add(entry.topicEntry.topic_id);
    selectedAngleNames.add(entry.topicEntry.angle_name);
  });

  return approved;
}

function inferPipelineType(formatType) {
  if (formatType === "Before / After or Transformation" || formatType === "Problem-Solution-Result") {
    return "Product";
  }
  return "Education";
}

function inferCtaStyle(emotionalTag) {
  if (emotionalTag === "urgency") {
    return "Direct";
  }
  if (emotionalTag === "curiosity" || emotionalTag === "novelty") {
    return "Curiosity";
  }
  if (emotionalTag === "belonging" || emotionalTag === "relief") {
    return "Save/Share";
  }
  if (emotionalTag === "status" || emotionalTag === "aspiration") {
    return "Soft";
  }
  return "Curiosity";
}

function buildScriptNotes(topicEntry, approvedEntry) {
  if (topicEntry.format_type === "List / Tips") {
    return `Open with the hook, move through two or three sharp points tied to "${topicEntry.topic}", and close with a save-worthy takeaway.`;
  }
  if (topicEntry.format_type === "Tutorial / How-to") {
    return `Lead with the friction in "${topicEntry.topic}", show a practical step-by-step reset, and finish with the easier outcome viewers want.`;
  }
  if (topicEntry.format_type === "Before / After or Transformation") {
    return `Start on the messy before-state, reveal the shift, and land on the calmer after-state implied by "${approvedEntry.hook_text}".`;
  }

  return `Open on the pain inside "${topicEntry.topic}", sharpen the insight quickly, and resolve with a believable next step.`;
}

function buildVideoNotes(topicEntry) {
  if (topicEntry.format_type === "Before / After or Transformation") {
    return "Use contrast-driven B-roll with a clear before-state and after-state; keep frames brand-neutral with no logos or packaging lockups.";
  }
  if (topicEntry.format_type === "Tutorial / How-to") {
    return "Use step-by-step B-roll with hands, routine moments, and clean environment shifts; avoid logos and brand marks.";
  }
  if (topicEntry.format_type === "List / Tips") {
    return "Use quick visual beats with text-led overlays for each point; keep props and settings generic.";
  }
  return "Use native-looking routine footage, close-up detail shots, and everyday lifestyle context; no brand logos yet.";
}

function buildConceptPayloads(approvedConcepts, topicGrid, normalizedInputs) {
  const topicById = new Map(topicGrid.map((topic) => [topic.topic_id, topic]));

  return approvedConcepts.map((approvedEntry) => {
    const topicEntry = topicById.get(approvedEntry.topic_id);
    return {
      concept_id: approvedEntry.concept_id,
      brand_name: "<TO_BE_FILLED_LATER>",
      product_name: "<TO_BE_FILLED_LATER>",
      pipeline_type: inferPipelineType(topicEntry?.format_type),
      format_type: topicEntry?.format_type || approvedEntry.format_type,
      topic: topicEntry?.topic || "",
      hook_angle: topicEntry?.angle_name || "",
      hook_text: approvedEntry.hook_text,
      emotional_tag: approvedEntry.emotional_tag,
      target_audience: topicEntry?.audience || normalizedInputs.target_audience,
      cta_style: inferCtaStyle(approvedEntry.emotional_tag),
      recommended_parts: 1,
      notes_for_script_agent: buildScriptNotes(topicEntry, approvedEntry),
      notes_for_video_prompt_agent: buildVideoNotes(topicEntry),
      source: {
        from_amazon: Boolean(normalizedInputs.source?.from_amazon),
        asin: normalizedInputs.source?.asin || null
      }
    };
  });
}

function scrubStageStructure(value, bannedPhrases = []) {
  if (Array.isArray(value)) {
    return value.map((entry) => scrubStageStructure(entry, bannedPhrases));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      scrubStageStructure(entry, bannedPhrases)
    ]));
  }

  if (typeof value === "string") {
    return scrubBannedPhrases(value, bannedPhrases);
  }

  return value;
}

function createTopicStrategyService(options = {}) {
  const amazonCatalogService = options.amazonCatalogService;
  const logger = options.logger || { warn() {}, info() {} };

  async function buildReviewDraft(input = {}) {
    const providedFieldSources = input.fieldSources && typeof input.fieldSources === "object"
      ? input.fieldSources
      : {};
    const manualInputs = collectManualInputs(input, providedFieldSources);
    const source = buildSourceFromInput(input, providedFieldSources);
    let listing = null;
    let autoDraft = emptyDraft();

    if (source.from_amazon) {
      if (!amazonCatalogService || typeof amazonCatalogService.fetchListingData !== "function") {
        throw new AppError(503, "Amazon listing fetch is not available.", {
          code: "amazon_fetch_unavailable"
        });
      }

      listing = await amazonCatalogService.fetchListingData({
        asin: source.asin || "",
        productUrl: source.product_url || "",
        input: source.product_url || source.asin || ""
      });
      autoDraft = buildAmazonDraft(listing);
      source.asin = source.asin || listing.asin || null;
      source.product_url = source.product_url || listing.productUrl || null;
    }

    const mergedDraft = mergeDrafts(autoDraft, manualInputs);
    const fieldSources = buildFieldSources(autoDraft, manualInputs, mergedDraft);
    const normalizedInputs = sanitizeNormalizedInputs(mergedDraft, {
      input: {
        ...input,
        asin: source.asin,
        productUrl: source.product_url
      },
      listing,
      fieldSources
    });

    return {
      normalizedInputs,
      review: {
        autoDraft,
        mergedDraft,
        fieldSources,
        listing: listing
          ? {
            asin: listing.asin || null,
            productUrl: listing.productUrl || null,
            title: listing.title || "",
            category: inferListingCategory(listing),
            brandName: listing.brandName || "",
            imageryHints: inferImageryHints(listing),
            reviewThemes: compactArray(listing.reviewThemes || [])
          }
          : null
      }
    };
  }

  async function generateStrategy(input = {}) {
    const stageZero = await buildReviewDraft(input);
    const normalizedInputs = stageZero.normalizedInputs;

    const hasUsableInput = FIELD_KEYS.some((field) => {
      const normalizedKey = field
        .replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)
        .toLowerCase();
      return normalizeText(normalizedInputs[normalizedKey]);
    });
    if (!hasUsableInput) {
      throw new AppError(400, "Provide Amazon input or fill in the review fields before generating.", {
        code: "missing_strategy_inputs"
      });
    }

    const angleBank = buildAngleBank(normalizedInputs);
    const topicGrid = buildTopicGrid(angleBank, normalizedInputs);
    const hookBank = buildHookBank(topicGrid, normalizedInputs);
    const approvedConcepts = selectApprovedConcepts(topicGrid, hookBank, normalizedInputs);
    const conceptPayloads = buildConceptPayloads(approvedConcepts, topicGrid, normalizedInputs);
    const bannedPhrases = collectBannedPhrases({
      input,
      listing: stageZero.review.listing,
      normalizedInputs
    });

    const result = {
      normalized_inputs: normalizedInputs,
      angle_bank: angleBank,
      topic_grid: topicGrid,
      hook_bank: hookBank,
      approved_concepts: approvedConcepts,
      concept_payloads: conceptPayloads
    };

    const scrubbed = scrubStageStructure(result, bannedPhrases);
    scrubbed.normalized_inputs = normalizedInputs;
    return scrubbed;
  }

  return {
    buildReviewDraft,
    generateStrategy
  };
}

module.exports = {
  createTopicStrategyService,
  __testables: {
    buildAmazonDraft,
    sanitizeNormalizedInputs,
    buildAngleBank,
    buildTopicGrid,
    buildHookBank,
    selectApprovedConcepts,
    collectBannedPhrases,
    scrubBannedPhrases
  }
};
