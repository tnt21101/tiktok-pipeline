const Anthropic = require("@anthropic-ai/sdk");
const { AppError } = require("../utils/errors");
const { parseLooseJsonObject } = require("../utils/json");
const { KIE_PROMPT_LIMIT, KIE_PROMPT_TARGET, getPromptMetrics } = require("../utils/prompt");
const {
  buildBrandDirection,
  buildBrandDirectionBlock,
  buildCaptionPlatformGuidance,
  buildModelPromptGuidance,
  buildVideoNegativeConstraints,
  assembleVideoPromptParts
} = require("../prompts/framework");
const {
  buildNarratedFallbackPlan,
  buildNarratedTemplatePromptContext,
  getNarratedTemplate,
  normalizeNarratedTemplateFields
} = require("../narrated/templates");
const {
  normalizeSlideCount
} = require("../slides/normalization");

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

function extractText(response) {
  return (response?.content || [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function createEmptyCaptions() {
  return {
    tiktok: { caption: "", hashtags: [] },
    instagram: { caption: "", hashtags: [] },
    youtube: { caption: "", hashtags: [] }
  };
}

function normalizeCaptionPayload(payload) {
  const empty = createEmptyCaptions();
  const source = payload && typeof payload === "object" ? payload : {};

  function normalizeEntry(entry, captionKey = "caption") {
    return {
      caption: String(entry?.[captionKey] || "").trim(),
      hashtags: Array.isArray(entry?.hashtags)
        ? entry.hashtags.map((tag) => String(tag).trim().replace(/^#/, "")).filter(Boolean)
        : []
    };
  }

  return {
    tiktok: normalizeEntry(source.tiktok || empty.tiktok),
    instagram: normalizeEntry(source.instagram || empty.instagram),
    youtube: normalizeEntry(source.youtube || empty.youtube)
  };
}

function createFallbackNarratedPlan(pipeline, brand, fields = {}) {
  return buildNarratedFallbackPlan({
    pipeline,
    brand,
    fields
  });
}

function createFallbackSlidesPlan(pipeline, brand, fields = {}) {
  const slideCount = normalizeSlideCount(fields.slideCount);
  const brandName = brand?.name || "Brand";
  const anchor = pipeline === "edu"
    ? cleanString(fields.topic) || `${brandName} insight`
    : pipeline === "comedy"
      ? cleanString(fields.scenario) || `${brandName} moment`
      : cleanString(fields.productName) || getPrimaryBrandProduct(brand) || `${brandName} product`;
  const support = pipeline === "product"
    ? cleanString(fields.benefit) || "Why this payoff matters"
    : pipeline === "edu"
      ? `What people should know about ${anchor.toLowerCase()}`
      : `The punchline hiding inside ${anchor.toLowerCase()}`;
  const steps = [
    {
      headline: "Start with the hook",
      body: `Open with the strongest one-line angle around ${anchor}.`
    },
    {
      headline: "Name the problem",
      body: support
    },
    {
      headline: "Show the shift",
      body: `Move the story toward the clearest benefit or reveal for ${brandName}.`
    },
    {
      headline: "Land the payoff",
      body: `End on the result, takeaway, or reaction people should remember.`
    },
    {
      headline: "Close with action",
      body: `Give viewers a simple next step that keeps ${brandName} top of mind.`
    },
    {
      headline: "Bonus proof",
      body: `Add one extra proof point, stat, or scene that strengthens the swipe sequence.`
    }
  ];

  return {
    title: `${anchor} slides`,
    slides: steps.slice(0, slideCount).map((slide, index) => ({
      ...slide,
      durationSeconds: index === 0 ? 3.8 : 3.4
    }))
  };
}

function buildFallbackNarratedBrollPrompt({ segment, pipeline, brand, fields = {}, generationConfig = {} }) {
  const normalizedTemplateFields = normalizeNarratedTemplateFields(fields);
  const template = getNarratedTemplate(normalizedTemplateFields.templateId);
  const platformPreset = String(fields.platformPreset || "tiktok").trim().toLowerCase() || "tiktok";
  const hasReferenceImage = Boolean(fields.hasReferenceImage);
  const subject = pipeline === "product"
    ? (fields.productName || getPrimaryBrandProduct(brand))
    : pipeline === "edu"
      ? (fields.topic || `${brand.name} explanation`)
      : (fields.scenario || `${brand.name} scenario`);
  const story = `${segment.visualIntent}. This visual supports the narration beat: "${segment.text}"`;
  const camera = platformPreset === "instagram"
    ? "Use polished, controlled framing with smooth motion and one clean reveal."
    : "Use a faster, more attention-grabbing camera beat with a strong first frame and quick reveal.";
  const look = [
    template.visualPromptFramework.mood,
    template.visualPromptFramework.composition,
    template.visualPromptFramework.motion
  ].join(" ");
  const continuity = hasReferenceImage
    ? `Keep the same brand world, reference image logic, and template feel across segments. Selected template: ${template.label}.`
    : `Keep the same brand world, audience situation, and template feel across segments. No reference image is provided, so favor category-consistent lifestyle continuity over exact product matching. Selected template: ${template.label}.`;
  const negative = buildVideoNegativeConstraints(pipeline, brand, generationConfig);

  return assembleVideoPromptParts({
    format: `Vertical 9:16 cinematic B-roll for a narrated ${platformPreset === "instagram" ? "Instagram Reels" : "TikTok"} video`,
    subject,
    setting: segment.visualIntent,
    story,
    camera,
    look,
    motion: buildModelPromptGuidance(generationConfig),
    continuity,
    negative
  });
}

function isBlank(value) {
  return !String(value || "").trim();
}

function parsePositiveInteger(value, fallback = null) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cleanString(value) {
  const normalized = String(value || "").trim();
  return normalized || "";
}

function compactObjectEntries(input = {}) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => {
    if (typeof value === "number") {
      return Number.isFinite(value);
    }

    return !isBlank(value);
  }));
}

function buildSequenceFields(input = {}, fallback = {}) {
  const sequenceCount = parsePositiveInteger(input.sequenceCount, parsePositiveInteger(fallback.sequenceCount, null));
  if (!sequenceCount || sequenceCount <= 1) {
    return {};
  }

  return compactObjectEntries({
    sequenceTheme: cleanString(input.sequenceTheme || fallback.sequenceTheme),
    sequenceRole: cleanString(input.sequenceRole || fallback.sequenceRole),
    sequenceLeadIn: cleanString(input.sequenceLeadIn || fallback.sequenceLeadIn),
    sequenceHandOff: cleanString(input.sequenceHandOff || fallback.sequenceHandOff),
    sequenceIndex: parsePositiveInteger(input.sequenceIndex, parsePositiveInteger(fallback.sequenceIndex, 1)),
    sequenceCount
  });
}

function getSequenceFields(fields = {}) {
  return buildSequenceFields(fields, fields);
}

function getPrimaryBrandProduct(brand) {
  return String(brand?.products || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)[0] || `${brand?.name || "Brand"} hero product`;
}

function getProductBenefits(fields = {}) {
  if (Array.isArray(fields.productBenefits)) {
    return fields.productBenefits.map((value) => String(value || "").trim()).filter(Boolean);
  }

  return [];
}

function getPrimaryBenefit(fields = {}) {
  return String(fields.benefit || getProductBenefits(fields)[0] || "").trim();
}

function buildProductKnowledgeBlock(fields = {}) {
  if (!fields || (!fields.productId && !fields.productAsin && !fields.productDescription && getProductBenefits(fields).length === 0)) {
    return "";
  }

  const lines = [
    fields.productId ? `Selected catalog product id: ${fields.productId}` : "",
    fields.productAsin ? `Selected product ASIN: ${fields.productAsin}` : "",
    fields.productUrl ? `Selected product URL: ${fields.productUrl}` : "",
    fields.productDescription ? `Selected product description: ${fields.productDescription}` : "",
    getProductBenefits(fields).length > 0 ? `Selected product benefits: ${getProductBenefits(fields).join(" | ")}` : ""
  ].filter(Boolean);

  return lines.join("\n");
}

function getGenerationDurationSeconds(fields = {}, fallback = 15) {
  const generationDuration = parsePositiveInteger(fields?.generationConfig?.duration, null);
  const explicitLength = parsePositiveInteger(String(fields?.length || "").replace(/[^0-9]/g, ""), null);
  return generationDuration || explicitLength || fallback;
}

function getShortFormDurationLabel(fields = {}, fallback = 15) {
  return `${getGenerationDurationSeconds(fields, fallback)}s`;
}

function getApproxSpokenWordBudget(fields = {}, fallback = 15) {
  const seconds = getGenerationDurationSeconds(fields, fallback);
  return Math.max(18, Math.round(seconds * 2.2));
}

function getAudienceCastingNote(brand) {
  const audience = cleanString(brand?.targetAudience || "the brand's likely customer");
  const category = cleanString(brand?.category || "the product category");
  return `Cast a relatable on-camera demo person who feels natural for ${audience} and the ${category} category.`;
}

function getBrandScenarioContext(brand) {
  const context = `${brand?.id || ""} ${brand?.name || ""} ${brand?.category || ""} ${brand?.products || ""} ${brand?.targetAudience || ""}`.toLowerCase();
  const notes = [];

  if (context.includes("baby") || context.includes("infant") || context.includes("new parent") || context.includes("expecting")) {
    notes.push("Scenarios should naturally include a baby, toddler, nursery, stroller, diaper bag, bath time, bedtime, feeding, or a parent-to-baby moment.");
  }

  if (context.includes("fitness") || context.includes("gym") || context.includes("sweat") || context.includes("bodybuilder") || context.includes("workout")) {
    notes.push("Scenarios should feel grounded in training contexts like the gym floor, treadmill, elliptical, weights, locker room, warm-up, cardio, post-workout recovery, or mirror-check moments.");
  }

  if (context.includes("hair")) {
    notes.push("Scenarios can naturally happen during wash day, in the shower, at the bathroom mirror, or around hair buildup and clean-hair moments.");
  }

  if (context.includes("beauty") || context.includes("personal care") || context.includes("lotion") || context.includes("mask")) {
    notes.push("Scenarios should fit self-care contexts like a bathroom vanity, morning routine, night routine, shower, or affordable beauty ritual.");
  }

  return notes.join("\n");
}

function buildBrandContextBlock(brand, pipeline) {
  return `Brand: ${brand.name}
Category: ${brand.category}
Voice: ${brand.voice}
Products: ${brand.products}
Target audience: ${brand.targetAudience}
${buildBrandDirectionBlock(brand, pipeline)}`;
}

function uniquePromptItems(values = []) {
  return Array.from(new Set(values
    .map((value) => cleanString(value))
    .filter(Boolean)));
}

function hasMissingIdeaFields(pipeline, fields = {}) {
  if (pipeline === "edu") {
    return isBlank(fields.topic);
  }

  if (pipeline === "comedy") {
    return isBlank(fields.scenario);
  }

  return isBlank(fields.productName) || isBlank(fields.benefit);
}

function mergeMissingIdeaFields(pipeline, fields = {}, suggestedFields = {}) {
  if (pipeline === "edu") {
    return {
      ...fields,
      topic: isBlank(fields.topic) ? String(suggestedFields.topic || "").trim() : String(fields.topic || "").trim(),
      ...getSequenceFields(suggestedFields)
    };
  }

  if (pipeline === "comedy") {
    return {
      ...fields,
      scenario: isBlank(fields.scenario) ? String(suggestedFields.scenario || "").trim() : String(fields.scenario || "").trim(),
      ...getSequenceFields(suggestedFields)
    };
  }

  return {
    ...fields,
    productName: isBlank(fields.productName) ? String(suggestedFields.productName || "").trim() : String(fields.productName || "").trim(),
    benefit: isBlank(fields.benefit) ? String(suggestedFields.benefit || "").trim() : String(fields.benefit || "").trim(),
    ...getSequenceFields(suggestedFields)
  };
}

function buildFallbackIdeaSuggestions(pipeline, brand, fields = {}, count = 3, options = {}) {
  const baseProduct = getPrimaryBrandProduct(brand);
  const targetAudience = String(brand?.targetAudience || "social shoppers").trim();
  const scenarioContext = getBrandScenarioContext(brand);
  const isBabyBrand = scenarioContext.includes("baby");
  const isFitnessBrand = scenarioContext.includes("training contexts");
  const isHairBrand = scenarioContext.includes("wash day");
  const isBeautyBrand = scenarioContext.includes("self-care");
  const sequenceEnabled = Boolean(options.sequence) && (parsePositiveInteger(options.totalCount, count) || count) > 1;
  const sequenceCount = parsePositiveInteger(options.totalCount, count) || count;
  const existingCount = Array.isArray(options.existingItems) ? options.existingItems.length : 0;
  const sequenceTheme = sequenceEnabled
    ? cleanString(fields.topic || fields.scenario || fields.productName || `${brand?.name || "Brand"} stitched video sequence`)
    : "";
  const sequenceRoleCatalog = {
    edu: ["hook", "setup", "proof", "deeper explanation", "takeaway", "cta"],
    comedy: ["hook", "setup", "escalation", "twist", "payoff", "tag"],
    product: ["hook", "problem", "demo", "proof", "payoff", "cta"]
  };

  const catalog = {
    edu: isBabyBrand
      ? [
        "Why your baby's skin gets so dry after baths",
        "The bath-time habit that strips baby skin faster",
        "What to do in the first minute after bath time",
        "Why rubbing the towel makes dryness worse for babies",
        "The fastest way to lock moisture back into baby's skin"
      ]
      : isFitnessBrand
        ? [
          "3 mistakes that make your sweat session less effective",
          "Why your cardio results stall when you miss this habit",
          `What ${targetAudience} get wrong about sweating harder`,
          "The fastest way to make your training feel more effective",
          "How to tell if your current sweat routine is actually working"
        ]
        : isHairBrand
          ? [
            "Why your hair still feels dirty right after wash day",
            "The scalp mistake that makes buildup come back faster",
            "What to fix before you blame your shampoo",
            "Why clarifying works better when you change this one habit",
            "The quickest way to get that actually clean-hair feeling back"
          ]
          : isBeautyBrand
            ? [
              "Why your skin still feels dry after your routine",
              "The self-care step people rush and regret later",
              `What ${targetAudience} get wrong about affordable skincare that works`,
              "The one texture cue that tells you your routine is actually helping",
              "How to make your everyday beauty ritual feel more effective fast"
            ]
            : [
              "3 mistakes that make your routine feel less effective",
              "Why this one habit changes how your routine works",
              `What ${targetAudience} get wrong about consistency`,
              "The fastest way to make your current plan feel more effective",
              "How to tell if your routine is actually working"
            ],
    comedy: isBabyBrand
      ? [
        "The new mom who finally sits down and the baby instantly needs something",
        "When you pack the diaper bag perfectly and still forget the one thing that matters",
        "Bath time goes smoothly for eight seconds and then chaos starts",
        "The parent who whispers so the baby sleeps and then steps on the loudest toy alive",
        "When you finally get the baby down and every notification in the house goes off"
      ]
      : isFitnessBrand
        ? [
          "The person who turns one treadmill session into a full motivational speech",
          "When someone spends more time posing between sets than actually training",
          "The elliptical user who acts like they just survived a championship fight",
          "The overconfident gym friend who gives expert advice mid-warm-up",
          "When the pre-workout confidence disappears halfway through cardio"
        ]
        : isHairBrand
          ? [
            "When wash day was supposed to be quick and somehow became your entire evening",
            "The moment you realize the buildup was winning all week",
            "When your hair finally feels clean and everyone suddenly wants plans",
            "The person who treats clarifying shampoo like a life reset",
            "When you fix the hair problem and instantly become a different person"
          ]
          : isBeautyBrand
            ? [
              "The self-care routine that starts calming and turns unexpectedly dramatic",
              "When the affordable beauty find works better than the expensive one",
              "The person who says they are doing a five-minute routine and disappears for forty-five",
              "When you do one mask and suddenly start giving advice like a guru",
              "The reaction when a simple routine change actually works"
            ]
            : [
              "The person who turns every routine into a dramatic life lesson",
              "When someone acts like one good session changed their entire identity",
              "The overconfident friend who gives advice nobody asked for",
              "When the group chat hype is louder than the actual effort",
              "The reaction when the shortcut does not magically work"
            ],
    product: [
      { productName: baseProduct, benefit: "the easy upgrade that makes the routine feel more effective" },
      { productName: baseProduct, benefit: "the go-to add-on for a faster, more satisfying session" },
      { productName: baseProduct, benefit: "the simple fix when your routine feels flat" },
      { productName: baseProduct, benefit: "the hero product for more visible before-and-after momentum" },
      { productName: baseProduct, benefit: "the low-effort boost for better-looking content results" }
    ]
  };

  const suggestions = [];
  for (let index = 0; index < count; index += 1) {
    const sequenceFields = sequenceEnabled
      ? buildSequenceFields({}, {
        sequenceTheme,
        sequenceRole: sequenceRoleCatalog[pipeline][Math.min(existingCount + index, sequenceRoleCatalog[pipeline].length - 1)],
        sequenceIndex: existingCount + index + 1,
        sequenceCount,
        sequenceLeadIn: existingCount + index > 0 ? "Continue directly from the previous segment without resetting the premise." : "Open the stitched reel with the strongest scroll-stopping first beat.",
        sequenceHandOff: existingCount + index + 1 < sequenceCount
          ? "Keep the story momentum moving so the next segment can cut in cleanly without being mentioned out loud."
          : "Land the final payoff cleanly and close the stitched reel."
      })
      : {};

    if (pipeline === "product") {
      const template = catalog.product[index % catalog.product.length];
      const productName = String(fields.productName || template.productName).trim();
      const benefit = String(fields.benefit || template.benefit).trim();
      suggestions.push({
        label: `${productName} — ${benefit}`,
        fields: {
          productName,
          benefit,
          ...sequenceFields
        }
      });
      continue;
    }

    const label = catalog[pipeline][index % catalog[pipeline].length];
    suggestions.push({
      label,
      fields: pipeline === "edu"
        ? { topic: label, ...sequenceFields }
        : { scenario: label, ...sequenceFields }
    });
  }

  return suggestions;
}

function normalizeIdeaSuggestion(pipeline, entry, brand, fields = {}, options = {}) {
  const source = entry && typeof entry === "object" ? entry : {};
  const sequenceFallback = buildSequenceFields(source?.fields || source, {
    sequenceIndex: options.sequence ? (options.existingCount || 0) + (options.suggestionIndex || 0) + 1 : undefined,
    sequenceCount: options.sequence ? parsePositiveInteger(options.totalCount, null) : undefined
  });

  if (pipeline === "edu") {
    const topic = String(source?.fields?.topic || source.topic || source.label || "").trim();
    if (!topic) {
      return null;
    }

    return {
      label: String(source.label || topic).trim(),
      fields: {
        topic,
        ...sequenceFallback
      }
    };
  }

  if (pipeline === "comedy") {
    const scenario = String(source?.fields?.scenario || source.scenario || source.label || "").trim();
    if (!scenario) {
      return null;
    }

    return {
      label: String(source.label || scenario).trim(),
      fields: {
        scenario,
        ...sequenceFallback
      }
    };
  }

  const fallbackLabel = String(source.label || "").trim();
  let productName = String(source?.fields?.productName || source.productName || fields.productName || "").trim();
  let benefit = String(source?.fields?.benefit || source.benefit || fields.benefit || "").trim();

  if ((!productName || !benefit) && fallbackLabel) {
    const [namePart = "", benefitPart = ""] = fallbackLabel.includes("—")
      ? fallbackLabel.split("—")
      : fallbackLabel.split("-");
    productName = productName || namePart.trim();
    benefit = benefit || benefitPart.trim();
  }

  productName = productName || getPrimaryBrandProduct(brand);
  if (!benefit) {
    return null;
  }

  return {
    label: fallbackLabel || `${productName} — ${benefit}`,
    fields: {
      productName,
      benefit,
      ...sequenceFallback
    }
  };
}

function formatSequenceList(existingItems = []) {
  return existingItems
    .map((value, index) => `${index + 1}. ${cleanString(value)}`)
    .filter(Boolean)
    .join("\n");
}

function buildIdeaSpecificityGuardrails(brand, pipeline) {
  const scenarioContext = getBrandScenarioContext(brand);
  const guardrails = [
    `Every ${pipeline === "product" ? "angle" : "idea"} must feel unmistakably native to ${brand.name}'s category, customer, and visual world.`,
    "A viewer should understand the category and customer problem from the outline alone.",
    "Do not write generic cross-category ideas that would still fit a different brand."
  ];

  if (scenarioContext) {
    guardrails.push(`Category reality cues: ${scenarioContext}`);
  }

  return guardrails.join("\n");
}

function compactPromptSegment(value, maxLength) {
  const normalized = cleanString(value).replace(/\s+/g, " ");
  if (!normalized || !Number.isFinite(maxLength) || maxLength <= 0 || normalized.length <= maxLength) {
    return normalized;
  }

  const sentenceChunks = normalized.split(/(?<=[.!?;:])\s+/).map((chunk) => chunk.trim()).filter(Boolean);
  let compacted = "";

  for (const chunk of sentenceChunks) {
    const nextValue = compacted ? `${compacted} ${chunk}` : chunk;
    if (nextValue.length > maxLength) {
      break;
    }
    compacted = nextValue;
  }

  if (compacted.length >= Math.min(maxLength - 12, Math.round(maxLength * 0.6))) {
    return compacted;
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  compacted = "";
  for (const word of words) {
    const nextValue = compacted ? `${compacted} ${word}` : word;
    if (nextValue.length > maxLength) {
      break;
    }
    compacted = nextValue;
  }

  return compacted || normalized.slice(0, maxLength).trim();
}

function compactNegativeItems(items = [], options = {}) {
  const maxItems = options.maxItems || items.length || 0;
  const itemLimit = options.itemLimit || 64;
  const totalLimit = options.totalLimit || 240;
  const uniqueItems = uniquePromptItems(items)
    .map((item) => compactPromptSegment(item, itemLimit))
    .filter(Boolean);
  const selected = [];

  for (const item of uniqueItems) {
    if (selected.length >= maxItems) {
      break;
    }

    const nextSelected = [...selected, item];
    if (nextSelected.join(", ").length > totalLimit && selected.length > 0) {
      break;
    }

    selected.push(item);
  }

  return selected;
}

function buildPromptFromPartsWithBudget(parts = {}, budget = {}) {
  return assembleVideoPromptParts({
    format: compactPromptSegment(parts.format, budget.format ?? 120),
    subject: compactPromptSegment(parts.subject, budget.subject ?? 240),
    setting: compactPromptSegment(parts.setting, budget.setting ?? 180),
    story: compactPromptSegment(parts.story, budget.story ?? 320),
    camera: compactPromptSegment(parts.camera, budget.camera ?? 180),
    look: compactPromptSegment(parts.look, budget.look ?? 150),
    motion: compactPromptSegment(parts.motion, budget.motion ?? 180),
    continuity: compactPromptSegment(parts.continuity, budget.continuity ?? 240),
    negative: compactNegativeItems(parts.negative, {
      maxItems: budget.negativeItems ?? 8,
      itemLimit: budget.negativeItemLimit ?? 60,
      totalLimit: budget.negativeTotal ?? 240
    })
  });
}

function compactFreeformPrompt(prompt, targetLength = KIE_PROMPT_TARGET) {
  const normalized = cleanString(prompt).replace(/\s+/g, " ");
  if (!normalized || normalized.length <= targetLength) {
    return normalized;
  }

  const avoidIndex = normalized.indexOf("Avoid:");
  if (avoidIndex === -1) {
    return compactPromptSegment(normalized, targetLength);
  }

  const intro = normalized.slice(0, avoidIndex).trim();
  const avoid = normalized.slice(avoidIndex).trim();
  const reservedAvoidLength = Math.min(Math.max(avoid.length, 120), 260);
  const introBudget = Math.max(260, targetLength - reservedAvoidLength - 1);
  const compactedIntro = compactPromptSegment(intro, introBudget);
  const remainingBudget = Math.max(80, targetLength - compactedIntro.length - 1);
  const compactedAvoid = compactPromptSegment(avoid, remainingBudget);
  return `${compactedIntro} ${compactedAvoid}`.trim();
}

function fitVideoPromptToLimit(parts = {}, rawPrompt = "") {
  const normalizedRawPrompt = cleanString(rawPrompt).replace(/\s+/g, " ");
  if (normalizedRawPrompt && normalizedRawPrompt.length <= KIE_PROMPT_LIMIT) {
    return normalizedRawPrompt;
  }

  const budgets = [
    null,
    {
      format: 110,
      subject: 220,
      setting: 170,
      story: 280,
      camera: 170,
      look: 130,
      motion: 150,
      continuity: 200,
      negativeItems: 8,
      negativeItemLimit: 56,
      negativeTotal: 220
    },
    {
      format: 90,
      subject: 180,
      setting: 145,
      story: 220,
      camera: 135,
      look: 100,
      motion: 120,
      continuity: 150,
      negativeItems: 6,
      negativeItemLimit: 44,
      negativeTotal: 170
    }
  ];

  for (const budget of budgets) {
    const candidate = budget
      ? buildPromptFromPartsWithBudget(parts, budget)
      : assembleVideoPromptParts(parts);
    if (candidate && candidate.length <= KIE_PROMPT_TARGET) {
      return candidate;
    }
    if (candidate && candidate.length <= KIE_PROMPT_LIMIT) {
      return candidate;
    }
  }

  const fallbackCandidate = budgets[budgets.length - 1]
    ? buildPromptFromPartsWithBudget(parts, budgets[budgets.length - 1])
    : normalizedRawPrompt;
  const compacted = compactFreeformPrompt(fallbackCandidate || normalizedRawPrompt, KIE_PROMPT_TARGET);
  if (compacted.length <= KIE_PROMPT_LIMIT) {
    return compacted;
  }

  return compactPromptSegment(compacted || normalizedRawPrompt, KIE_PROMPT_LIMIT);
}

function buildIdeaPrompt(analysis, pipeline, brand, fields = {}, count = 3, options = {}) {
  const brandContext = buildBrandContextBlock(brand, pipeline);
  const subjectContext = analysis ? `On-screen subject context: ${analysis}` : "No image analysis yet. Generate concepts from brand context alone.";
  const scenarioContext = getBrandScenarioContext(brand);
  const brandDirection = buildBrandDirection(brand, pipeline);
  const specificityGuardrails = buildIdeaSpecificityGuardrails(brand, pipeline);
  const sequenceEnabled = Boolean(options.sequence) && (parsePositiveInteger(options.totalCount, count) || count) > 1;
  const totalCount = parsePositiveInteger(options.totalCount, count) || count;
  const existingItems = Array.isArray(options.existingItems) ? options.existingItems.map((value) => cleanString(value)).filter(Boolean) : [];
  const existingSequenceText = existingItems.length > 0
    ? `Existing locked sequence beats:\n${formatSequenceList(existingItems)}`
    : "No previous sequence beats are locked yet.";

  if (pipeline === "edu") {
    const { format, length, topic } = fields;
    return {
      system: sequenceEnabled
        ? `You are a short-form education strategist protecting brand voice, retention, and visual clarity.
Generate ordered segment ideas that all belong to one stitched final reel with one shared throughline, escalating logic, and no reset between parts.
Favor concrete myths, mistakes, mechanisms, proof points, or demonstrations over generic advice.
Return valid JSON only.`
        : `You are a short-form education strategist.
Generate sharp, filmable education topics that feel specific, visually grounded, and native to TikTok, Reels, and Shorts.
Return valid JSON only.`,
      user: `${brandContext}
${subjectContext}
Current format: ${format || "talking head"}
Current length target: ${length || "60s"}
Existing topic, if any: ${topic || "none"}
Story rule: ${brandDirection.pipelineProfile.ideaRule}
Memorability note: ${brandDirection.whimsy}
Brand fit guardrails:
${specificityGuardrails}
${sequenceEnabled ? `${existingSequenceText}

Generate the next ${count} beat${count === 1 ? "" : "s"} for a single ${totalCount}-segment stitched education reel.
Requirements:
- one shared theme across all segments
- same presenter world and same overall premise
- each segment should progress the argument instead of restarting it
- each beat must still match the selected brand's category and audience exactly
- if a segment is not the last one, it should end on a clean continuation beat instead of verbally previewing what comes next
- the last segment should feel like the payoff, takeaway, or CTA
- every beat should imply a concrete visual or proof moment, not just a talking point
` : ""}

Generate ${count} ${sequenceEnabled ? "ordered education sequence beats" : "distinct education content ideas"} for this brand.
Each one should be concise, specific, visually imaginable, and strong enough to become a script immediately.
Avoid generic filler like "tips and tricks", vague motivation, or copy that could belong to any fitness creator.
Do not output education topics that could fit a different category.

Return valid JSON only:
{
  "suggestions": [
    {
      "label": "scroll-stopping topic text",
      "fields": {
        "topic": "same topic text"${sequenceEnabled ? `,
        "sequenceTheme": "shared throughline",
        "sequenceRole": "segment role",
        "sequenceIndex": 1,
        "sequenceCount": ${totalCount},
        "sequenceLeadIn": "continuity note",
        "sequenceHandOff": "next-beat planning note only, never spoken aloud"` : ""}
      }
    }
  ]
}`
    };
  }

  if (pipeline === "comedy") {
    const { format, energy, scenario } = fields;
    return {
      system: sequenceEnabled
        ? `You are a short-form comedy concept writer protecting brand fit, scene logic, and comedic escalation.
Generate ordered beats that belong to the same scenario, same character world, and same escalating joke.
Do not reset the premise between segments, and keep the humor visually readable.
Return valid JSON only.`
        : `You are a short-form comedy concept writer.
Generate relatable, visual, creator-friendly scenarios that can be turned into quick TikTok skits with a clear trigger and payoff.
Return valid JSON only.`,
      user: `${brandContext}
${subjectContext}
Current format: ${format || "POV skit"}
Character energy: ${energy || "overconfident"}
Existing scenario, if any: ${scenario || "none"}
Brand-specific setting guidance:
${scenarioContext || "Use settings, props, and situations that naturally fit this brand and audience."}
Story rule: ${brandDirection.pipelineProfile.ideaRule}
Memorability note: ${brandDirection.whimsy}
Brand fit guardrails:
${specificityGuardrails}
${sequenceEnabled ? `
${existingSequenceText}

Generate the next ${count} beat${count === 1 ? "" : "s"} for a single ${totalCount}-segment stitched comedy reel.
Requirements:
- one shared scenario and one consistent comedic premise
- same setting, props, and character world across all beats
- each beat should escalate or pay off the previous one
- do not write disconnected scenario options
- each beat must stay in the exact brand category and customer reality above
- the final segment should feel like the punchline or tag
- every beat should be easy to picture in one location with one main gag driver
` : ""}

Generate ${count} ${sequenceEnabled ? "ordered comedy sequence beats" : "distinct comedy scenarios"} for this brand and audience.
Keep them relatable, visual, and immediately understandable in one line.
Bake the brand setting guidance into the scenario itself instead of keeping it abstract.
Do not write the full script. Just write the core scenario concept with enough specificity to feel shootable.

Return valid JSON only:
{
  "suggestions": [
    {
      "label": "relatable skit scenario",
      "fields": {
        "scenario": "same skit scenario"${sequenceEnabled ? `,
        "sequenceTheme": "shared throughline",
        "sequenceRole": "segment role",
        "sequenceIndex": 1,
        "sequenceCount": ${totalCount},
        "sequenceLeadIn": "continuity note",
        "sequenceHandOff": "next-beat planning note only, never spoken aloud"` : ""}
      }
    }
  ]
}`
    };
  }

  const { productName, format, cta } = fields;
  const benefit = getPrimaryBenefit(fields);
  const productKnowledge = buildProductKnowledgeBlock(fields);
  return {
    system: sequenceEnabled
      ? `You are a direct-response UGC concept strategist protecting brand trust, product clarity, and sequence continuity.
Generate ordered product beats that work as one continuous problem-to-payoff sequence instead of disconnected angles.
Return valid JSON only.`
      : `You are a direct-response UGC concept strategist.
Generate product video angles that pair a concrete product, a concrete use case, and a concrete benefit.
Return valid JSON only.`,
    user: `${brandContext}
${subjectContext}
Current UGC format: ${format || "demo"}
Current CTA: ${cta || "Link in bio"}
Existing product name, if any: ${productName || "none"}
Existing key benefit, if any: ${benefit || "none"}
${productKnowledge ? `${productKnowledge}\n` : ""}
Story rule: ${brandDirection.pipelineProfile.ideaRule}
Memorability note: ${brandDirection.whimsy}
Brand fit guardrails:
${specificityGuardrails}
${sequenceEnabled ? `
${existingSequenceText}

Generate the next ${count} beat${count === 1 ? "" : "s"} for a single ${totalCount}-segment stitched product reel.
Requirements:
- same core product and same overall demo world
- sequence should usually move through hook/problem, demo, proof, payoff, and CTA
- each segment should progress into the next without verbally previewing it
- avoid three unrelated benefits that feel like separate ads
- make the use case and tactile action obvious enough to film
` : ""}

Generate ${count} ${sequenceEnabled ? "ordered product sequence beats" : "distinct product content angles"} for this brand.
Each suggestion must include both a productName and a specific benefit angle.
Use products that plausibly fit the brand catalog and benefits that feel specific, tangible, and believable.

Return valid JSON only:
{
  "suggestions": [
    {
      "label": "Product Name — specific benefit angle",
      "fields": {
        "productName": "Product Name",
        "benefit": "specific benefit angle"${sequenceEnabled ? `,
        "sequenceTheme": "shared throughline",
        "sequenceRole": "segment role",
        "sequenceIndex": 1,
        "sequenceCount": ${totalCount},
        "sequenceLeadIn": "continuity note",
        "sequenceHandOff": "next-beat planning note only, never spoken aloud"` : ""}
      }
    }
  ]
}`
  };
}

function buildSequencePromptNotes(fields = {}) {
  const sequence = getSequenceFields(fields);
  if (!sequence.sequenceCount || sequence.sequenceCount <= 1) {
    return "";
  }

  const index = parsePositiveInteger(sequence.sequenceIndex, 1) || 1;
  const count = parsePositiveInteger(sequence.sequenceCount, 1) || 1;
  const isFirst = index === 1;
  const isLast = index >= count;

  return `This clip is segment ${index} of ${count} in one stitched final video.
Shared sequence theme: ${sequence.sequenceTheme || "Keep one clear shared throughline across all segments."}
Segment role in the sequence: ${sequence.sequenceRole || "progress the same overall arc"}
Lead-in from the previous segment: ${sequence.sequenceLeadIn || (isFirst ? "Open the sequence strongly." : "Continue directly from the previous segment.")}
What the next segment will cover for planning purposes: ${sequence.sequenceHandOff || (isLast ? "This is the final payoff." : "Keep the momentum moving into the next beat.")}

Continuity rules:
- keep the same presenter, setting, world, and premise
- do not reset or re-explain the whole idea from scratch unless this is segment 1
- if this is not the last segment, end on a clean continuation beat instead of previewing the next segment out loud
- do not literally say "next", "part 2", "coming up", "in the next clip", or any other teaser line about another segment
- only the last segment should feel like the true wrap-up or CTA`;
}

function buildAnalysisPrompt(pipeline, brand) {
  const isProduct = pipeline === "product";
  const brandContext = brand ? `Brand context:
${buildBrandDirectionBlock(brand, pipeline)}` : "No brand context provided.";
  return isProduct
    ? `You are a product-image analyst for short-form UGC generation.
${brandContext}
Describe only the details that matter for consistent visual generation:
- likely product type and likely name
- packaging shape, finish, color palette, and label hierarchy
- size or form factor
- continuity-critical visual cues
- how it would naturally be held, opened, applied, or used
- any visible text
- the kind of environment or prop world that fits it best
Be specific, concrete, and mostly visual. Output one tight paragraph with no preamble.`
    : `You are a casting and continuity analyst for short-form video generation.
${brandContext}
Describe only the details that matter for keeping the on-screen lead consistent:
- apparent age range
- gender presentation
- build, posture, and height impression
- hair, face, wardrobe, and accessories
- continuity-critical details that should not drift
- overall energy and the kind of brand world or setting they naturally fit
Be specific, concrete, and factual. Output one tight paragraph with no preamble.`;
}

function createAnthropicService(options = {}) {
  const model = options.model || DEFAULT_MODEL;
  const staticClient = options.client || (options.apiKey ? new Anthropic({ apiKey: options.apiKey }) : null);
  const logger = options.logger || { info() {}, warn() {}, error() {} };

  function getClient() {
    if (staticClient) {
      return staticClient;
    }

    throw new AppError(503, "ANTHROPIC_API_KEY is not configured.", {
      code: "anthropic_not_configured"
    });
  }

  async function runTextPrompt(system, messages, maxTokens = 800) {
    const response = await getClient().messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages
    });

    const text = extractText(response);
    if (!text) {
      throw new AppError(502, "Anthropic returned an empty response.", {
        code: "anthropic_empty_response"
      });
    }

    return text;
  }

  async function analyzeImage(imageUrl, pipeline, brand) {
    return runTextPrompt(
      buildAnalysisPrompt(pipeline, brand),
      [{
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: imageUrl } },
          {
            type: "text",
            text: pipeline === "product"
              ? "Analyze this product image for TikTok UGC video generation."
              : "Analyze this person for TikTok video character casting."
          }
        ]
      }],
      500
    );
  }

  async function suggestIdeas(analysis, pipeline, brand, fields = {}, count = 3, options = {}) {
    const ideaCount = Math.min(Math.max(Number.parseInt(count, 10) || 3, 1), 20);
    const prompt = buildIdeaPrompt(analysis, pipeline, brand, fields, ideaCount, options);
    const fallback = buildFallbackIdeaSuggestions(pipeline, brand, fields, ideaCount, options);
    const text = await runTextPrompt(prompt.system, [{ role: "user", content: prompt.user }], Math.min(1400, 180 * ideaCount));
    const parsed = parseLooseJsonObject(text);

    if (!parsed || !Array.isArray(parsed.suggestions)) {
      logger.warn("anthropic_idea_json_invalid", {
        pipeline,
        preview: text.slice(0, 240)
      });
      return fallback;
    }

    const seen = new Set();
    const normalized = parsed.suggestions
      .map((entry, index) => normalizeIdeaSuggestion(pipeline, entry, brand, fields, {
        sequence: Boolean(options.sequence),
        totalCount: options.totalCount,
        existingCount: Array.isArray(options.existingItems) ? options.existingItems.length : 0,
        suggestionIndex: index
      }))
      .filter((entry) => entry && !seen.has(entry.label.toLowerCase()) && seen.add(entry.label.toLowerCase()));

    return normalized.length > 0
      ? normalized.slice(0, ideaCount).concat(fallback.slice(normalized.length, ideaCount))
      : fallback;
  }

  async function autofillMissingIdeaFields(analysis, pipeline, brand, fields = {}) {
    if (!hasMissingIdeaFields(pipeline, fields)) {
      return fields;
    }

    const sequence = getSequenceFields(fields);
    const suggestionOptions = sequence.sequenceCount > 1
      ? {
        sequence: true,
        totalCount: sequence.sequenceCount,
        existingItems: []
      }
      : {};

    try {
      const suggestions = await suggestIdeas(analysis, pipeline, brand, fields, 1, suggestionOptions);
      return mergeMissingIdeaFields(pipeline, fields, suggestions[0]?.fields || {});
    } catch (error) {
      logger.warn("anthropic_idea_generation_failed", {
        pipeline,
        message: error.message
      });

      const fallback = buildFallbackIdeaSuggestions(pipeline, brand, fields, 1, suggestionOptions)[0];
      return mergeMissingIdeaFields(pipeline, fields, fallback?.fields || {});
    }
  }

  async function generateScript(analysis, pipeline, brand, fields = {}) {
    let systemPrompt = "";
    let userPrompt = "";
    const brandDirection = buildBrandDirection(brand, pipeline);
    const brandContext = buildBrandContextBlock(brand, pipeline);
    const sequencePromptNotes = buildSequencePromptNotes(fields);
    const sequence = getSequenceFields(fields);
    const isSequence = Boolean(sequence.sequenceCount) && sequence.sequenceCount > 1;
    const sequenceIndex = Number(sequence.sequenceIndex || 1);
    const isFinalSequenceClip = isSequence && sequenceIndex >= Number(sequence.sequenceCount);

    if (pipeline === "edu") {
      const { topic, format, length } = fields;
      const targetLength = length || getShortFormDurationLabel(fields, 15);
      const wordBudget = getApproxSpokenWordBudget(fields, 15);
      systemPrompt = "You write short-form education scripts that protect brand voice, visual clarity, and retention. Every line must feel shootable, specific, and concise.";

      userPrompt = `${brandContext}
Character on screen: ${analysis}

Write a ${targetLength} TikTok education script in ${format || "talking head"} format.
Topic: ${topic || "sweat science and workout optimization"}
Approx spoken copy budget: about ${wordBudget} words max.
Creative rule: ${brandDirection.pipelineProfile.scriptRule}
Memorability note: ${brandDirection.whimsy}

The character above is the on-screen presenter. Write to match their energy and vibe.
${sequencePromptNotes ? `\n${sequencePromptNotes}` : ""}

Structure:
HOOK (0-3s): Bold claim or surprising fact that stops the scroll
BODY: ${isSequence ? "one clean beat in the larger stitched sequence, with zero filler, one visible proof cue, and no reset" : "one sharp explanation or proof-driven breakdown with zero filler"}
CTA: ${isSequence
    ? (isFinalSequenceClip
      ? `Natural final payoff and close for the full sequence. Brand ${brand.name} mention is optional and natural only.`
      : "Close this beat cleanly with a complete thought, but do not tease or preview another segment.")
    : `Save this or follow for more. Brand ${brand.name} mention is optional and natural only.`}

Rules:
- Stay locked to the exact topic or beat above. Do not swap in a different mistake, mechanism, or takeaway.
- Do not sound like a generic creator giving broad advice.
- Do not overload the clip with three unrelated mini-lessons.
- Make at least one line feel vividly visual or demonstrative, not purely abstract.
- Do not say "next", "part 2", "coming up", or verbally mention another segment unless this is the final stitched clip.

Format output exactly as:
HOOK: ...
BODY: ...
CTA: ...`;
    } else if (pipeline === "comedy") {
      const { scenario, format, energy } = fields;
      const targetLength = getShortFormDurationLabel(fields, 12);
      const wordBudget = getApproxSpokenWordBudget(fields, 12);
      systemPrompt = "You write short-form comedy scripts with strong scene logic, clear escalation, and brand-fit humor. The joke should feel filmable, fast, and not mean-spirited.";

      userPrompt = `${brandContext}
Character: ${analysis}

Write a ${targetLength} TikTok ${format || "POV skit"}.
Scenario: ${scenario || "relatable gym humor around sweating and working out"}
Character energy: ${energy || "overconfident"}
Approx spoken copy budget: about ${wordBudget} words max.
Creative rule: ${brandDirection.pipelineProfile.scriptRule}
Memorability note: ${brandDirection.whimsy}
Brand-specific setting guidance:
${getBrandScenarioContext(brand) || "Use settings and props that naturally fit the brand category and audience."}
${sequencePromptNotes ? `\n${sequencePromptNotes}` : ""}

The character above plays the lead. Match their look and vibe in the action directions.
Keep the setting grounded in the brand-specific guidance above instead of using a generic blank-room scenario.

HOOK (0-2s): ${isSequence && sequenceIndex > 1 ? "Continue the running bit immediately." : "Visual or audio gag that stops the scroll"}
SETUP (2-15s): ${isSequence ? "advance the same comedic situation instead of restarting it" : "Establish the relatable situation fast"}
PUNCHLINE: ${isFinalSequenceClip ? "Land the payoff for the stitched sequence." : "Subvert the expectation and end on a reaction that can cut cleanly into the next segment without being mentioned."}
TAG: ${isSequence && !isFinalSequenceClip ? "Optional reaction button only. Do not mention a next part." : "Optional second beat or reaction"}

Brand rule: Background placement only. Never the punchline. Never forced.

Rules:
- Stay locked to the exact scenario above instead of inventing a new premise.
- Make the trigger specific and instantly readable.
- Let one prop, behavior, or reaction carry the comedic escalation.
- Keep it grounded enough that a creator could shoot it quickly in one world.
- Do not say "next", "part 2", "coming up", or verbally preview the following segment unless this is the final stitched clip.

Format exactly as:
HOOK: ...
SETUP: ...
PUNCHLINE: ...
TAG: ...`;
    } else {
      const { productName, format, cta } = fields;
      const benefit = getPrimaryBenefit(fields);
      const productKnowledge = buildProductKnowledgeBlock(fields);
      const targetLength = getShortFormDurationLabel(fields, 12);
      const wordBudget = getApproxSpokenWordBudget(fields, 12);
      systemPrompt = "You write direct-response UGC scripts that stay authentic, product-clear, and visually demonstrative. Keep the product benefit believable and tactile.";

      userPrompt = `${brandContext}
Product analysis: ${analysis}
Product name: ${productName || brand.products.split(",")[0].trim()}
Key benefit: ${benefit || "maximum results"}
${productKnowledge ? `${productKnowledge}\n` : ""}

Write a ${targetLength} TikTok UGC ${format || "demo"} script.
${getAudienceCastingNote(brand)}
Approx spoken copy budget: about ${wordBudget} words max.
Creative rule: ${brandDirection.pipelineProfile.scriptRule}
Memorability note: ${brandDirection.whimsy}
${sequencePromptNotes ? `\n${sequencePromptNotes}` : ""}

HOOK (0-3s): ${isSequence && Number(sequence.sequenceIndex || 1) > 1 ? "Continue from the previous beat without restarting the ad." : "Lead with the problem, not the product"}
DEMO: ${isSequence ? "Show this segment's part of the same larger demo sequence and keep the continuity tight." : "Show the product working and describe the visual action"}
CTA: ${isSequence
    ? (isFinalSequenceClip ? (cta || "Link in bio") : "Close this demo beat cleanly with no teaser language and no final CTA.")
    : (cta || "Link in bio")}

Rules:
- Stay locked to the exact product and benefit angle above instead of switching to another claim.
- Keep the product visible, used, and easy to picture.
- Describe a specific use-case or sensory payoff, not a vague promise.
- Do not sound like a polished commercial.
- Do not say "next", "part 2", "coming up", or verbally mention another segment unless this is the final stitched clip.

Format exactly as:
HOOK: ...
DEMO: ...
CTA: ...`;
    }

    return runTextPrompt(systemPrompt, [{ role: "user", content: userPrompt }], 800);
  }

  async function generateVideoPrompt(analysis, script, pipeline, brand, fields = {}) {
    const descriptions = {
      edu: "vertical short-form education clip with strong authority and visible proof",
      comedy: "vertical creator-style comedy skit with readable reactions and clear escalation",
      product: "vertical authentic UGC product demo with the product as the visual hero"
    };
    const brandDirection = buildBrandDirection(brand, pipeline);
    const brandContext = buildBrandContextBlock(brand, pipeline);
    const sequencePromptNotes = buildSequencePromptNotes(fields);
    const productKnowledge = buildProductKnowledgeBlock(fields);
    const targetLength = getShortFormDurationLabel(fields, 15);
    const modelGuidance = buildModelPromptGuidance(fields.generationConfig || {});
    const negativeConstraints = buildVideoNegativeConstraints(pipeline, brand, fields.generationConfig || {});

    const systemPrompt = `You are an image-to-video prompt engineer for short-form vertical video.
Return valid JSON only with this exact shape:
{
  "subject": "who or what is on screen and continuity-critical details",
  "setting": "where it happens and the key props or environment",
  "story": "the visual beat-by-beat action progression from opening image to ending payoff",
  "camera": "framing, camera movement, edit rhythm, and lens feel",
  "look": "lighting, texture, color, and mood",
  "motion": "performance, timing, and physical behavior",
  "continuity": "how this should stay consistent with the brand, reference image, and any surrounding sequence clips",
  "negative": ["specific visual failure modes to avoid"]
}
Make every field specific, visual, and physically plausible.`;

    const userPrompt = pipeline === "product"
      ? `${brandContext}
Product analysis: ${analysis}
Script: ${script}
Style target: ${descriptions.product}
Target duration: ${targetLength}
${productKnowledge ? `${productKnowledge}\n` : ""}Story rule: ${brandDirection.pipelineProfile.visualRule}
Signature charm: ${brandDirection.whimsy}
${sequencePromptNotes ? `Sequence continuity notes:\n${sequencePromptNotes}\n` : ""}Model guidance:
${modelGuidance}

Write the JSON prompt plan for this video.
The product must stay clearly visible, legible, and actively used.
${getAudienceCastingNote(brand)}
Authentic UGC feel, vertical 9:16, shot on phone, not a polished commercial.
Include negative constraints that prevent common model drift.`
      : `${brandContext}
Reference character: ${analysis}
Script: ${script}
Style target: ${descriptions[pipeline]}
Target duration: ${targetLength}
Story rule: ${brandDirection.pipelineProfile.visualRule}
Signature charm: ${brandDirection.whimsy}
${sequencePromptNotes ? `Sequence continuity notes:\n${sequencePromptNotes}\n` : ""}Model guidance:
${modelGuidance}

Write the JSON prompt plan for this video.
The reference person is the lead and must match the analyzed appearance.
Vertical 9:16, authentic creator style, not a polished commercial.
Include negative constraints that prevent common model drift.`;

    const promptResponse = await runTextPrompt(systemPrompt, [{ role: "user", content: userPrompt }], 700);
    const parsedPrompt = parseLooseJsonObject(promptResponse, null);
    const promptParts = parsedPrompt && typeof parsedPrompt === "object"
      ? {
        format: `${descriptions[pipeline]} for ${brand.name}`,
        subject: parsedPrompt.subject || (pipeline === "product" ? analysis : `Match the uploaded reference person: ${analysis}`),
        setting: parsedPrompt.setting,
        story: parsedPrompt.story,
        camera: parsedPrompt.camera,
        look: parsedPrompt.look,
        motion: parsedPrompt.motion,
        continuity: uniquePromptItems([
          parsedPrompt.continuity,
          sequencePromptNotes,
          modelGuidance
        ]).join(" "),
        negative: uniquePromptItems([
          ...(Array.isArray(parsedPrompt.negative) ? parsedPrompt.negative : []),
          ...negativeConstraints
        ])
      }
      : null;

    let prompt = promptParts
      ? fitVideoPromptToLimit(promptParts)
      : compactFreeformPrompt(promptResponse, KIE_PROMPT_TARGET);
    let metrics = getPromptMetrics(prompt);

    if (metrics.exceedsLimit) {
      prompt = await runTextPrompt(
        "You shorten image-to-video prompts without losing continuity-critical casting, product, story, or shot details.",
        [{
          role: "user",
          content: `Rewrite this video prompt under ${KIE_PROMPT_LIMIT} characters. Preserve the core subject, setting, action, camera, continuity, and negative constraints.\n\n${prompt}`
        }],
        500
      );
      prompt = compactFreeformPrompt(prompt, KIE_PROMPT_LIMIT);
      metrics = getPromptMetrics(prompt);
    }

    if (metrics.exceedsLimit) {
      prompt = compactPromptSegment(prompt, KIE_PROMPT_LIMIT);
      metrics = getPromptMetrics(prompt);
    }

    if (metrics.exceedsLimit) {
      logger.warn("anthropic_video_prompt_clamped", {
        pipeline,
        brandId: brand?.id,
        length: metrics.length
      });
      prompt = cleanString(prompt).slice(0, KIE_PROMPT_LIMIT).trim();
    }

    return prompt;
  }

  async function generateCaptionAndHashtags(script, pipeline, brand, fields = {}) {
    const pipelineContext = {
      edu: "educational fitness content",
      comedy: "comedy or entertainment fitness content",
      product: "product UGC or demo content"
    };
    const brandContext = buildBrandContextBlock(brand, pipeline);
    const brandDirection = buildBrandDirection(brand, pipeline);
    const productKnowledge = pipeline === "product" ? buildProductKnowledgeBlock(fields) : "";
    const sequencePromptNotes = buildSequencePromptNotes(fields);

    const text = await runTextPrompt(
      `You are a social media caption and hashtag writer specializing in TikTok, Instagram Reels, and YouTube Shorts.
Write native, punchy copy that feels platform-native instead of corporate.
Return valid JSON only.`,
      [{
        role: "user",
        content: `${brandContext}
Pipeline type: ${pipelineContext[pipeline]}
Creative rule: ${brandDirection.pipelineProfile.scriptRule}
Signature charm: ${brandDirection.whimsy}
${productKnowledge ? `${productKnowledge}\n` : ""}${sequencePromptNotes ? `${sequencePromptNotes}\n` : ""}Platform rules:
${buildCaptionPlatformGuidance()}

Script:
${script}

Requirements:
- Make each platform version feel native to that platform instead of lightly rewritten clones.
- Keep the copy concise, human, and in the brand voice.
- Favor 3-6 hashtags for TikTok, 4-8 for Instagram, and 1-3 for YouTube unless fewer are stronger.
- Do not exceed the platform hashtag caps.

Return valid JSON only:
{
  "tiktok": {
    "caption": "short punchy caption",
    "hashtags": ["up to 8 tags without #"]
  },
  "instagram": {
    "caption": "slightly more polished reels caption",
    "hashtags": ["up to 10 tags without #"]
  },
  "youtube": {
    "caption": "tight searchable shorts title under 100 chars",
    "hashtags": ["up to 3 tags without #"]
  }
}`
      }],
      600
    );

    const parsed = parseLooseJsonObject(text);
    if (!parsed) {
      logger.warn("anthropic_caption_json_invalid", { preview: text.slice(0, 240) });
      throw new AppError(502, "Claude returned invalid caption JSON.", {
        code: "invalid_caption_json"
      });
    }

    return normalizeCaptionPayload(parsed);
  }

  async function generateNarratedPlan(analysis, pipeline, brand, fields = {}) {
    const brandContext = buildBrandContextBlock(brand, pipeline);
    const brandDirection = buildBrandDirection(brand, pipeline);
    const productKnowledge = buildProductKnowledgeBlock(fields);
    const targetLengthSeconds = Number.parseInt(fields.targetLengthSeconds, 10) || 15;
    const normalizedTemplateFields = normalizeNarratedTemplateFields(fields);
    const template = getNarratedTemplate(normalizedTemplateFields.templateId);
    const templatePromptContext = buildNarratedTemplatePromptContext({
      brand,
      pipeline,
      fields: {
        ...fields,
        ...normalizedTemplateFields
      }
    });
    const systemPrompt = `You write narrated short-form video plans for vertical social video.
Return valid JSON only with this exact shape:
{
  "title": "short internal title",
  "totalDurationSeconds": 15,
  "segments": [
    {
      "text": "what the narrator says",
      "visualIntent": "what should be shown",
      "estimatedSeconds": 4,
      "shotType": "template-specific beat label like hook, problem, myth, proof, before, after, cta",
      "sourceStrategy": "image|text|hybrid"
    }
  ]
}`;

    const userPrompt = `${brandContext}
Analysis: ${analysis}
Target length: ${targetLengthSeconds}s
Platform preset: ${fields.platformPreset || "tiktok"}
Voice id: ${fields.voiceId || "rachel"}
Reference image provided: ${fields.hasReferenceImage ? "yes" : "no"}
Selected template id: ${template.id}
Creative rule: ${brandDirection.pipelineProfile.scriptRule}
Visual rule: ${brandDirection.pipelineProfile.visualRule}
${productKnowledge ? `${productKnowledge}\n` : ""}Narrated mode rules:
- narrator is not on screen
- write for spoken delivery, not direct-to-camera creator lines
- every segment needs one dominant visual beat
- keep the total segment timing close to the target length
- do not create more than ${targetLengthSeconds <= 15 ? 4 : 6} segments
- follow the selected template structure explicitly instead of drifting into a generic explainer
- map every narration segment to one B-roll scene with a clear beat label
- if no reference image is provided, prioritize category-led visuals around the audience problem, routine, environment, and payoff instead of exact product continuity

${templatePromptContext}

Return the final plan as JSON only.`;

    try {
      const response = await runTextPrompt(systemPrompt, [{ role: "user", content: userPrompt }], 1200);
      const parsed = parseLooseJsonObject(response, null);
      if (parsed && Array.isArray(parsed.segments) && parsed.segments.length > 0) {
        return parsed;
      }
    } catch (error) {
      logger.warn("anthropic_narrated_plan_failed", {
        pipeline,
        message: error.message
      });
    }

    return createFallbackNarratedPlan(pipeline, brand, fields);
  }

  async function generateSlidesPlan(analysis, pipeline, brand, fields = {}) {
    const brandContext = buildBrandContextBlock(brand, pipeline);
    const brandDirection = buildBrandDirection(brand, pipeline);
    const productKnowledge = buildProductKnowledgeBlock(fields);
    const slideCount = normalizeSlideCount(fields.slideCount);
    const systemPrompt = `You write vertical short-form slide deck drafts for TikTok-style slideshow videos.
Return valid JSON only with this exact shape:
{
  "title": "short internal deck title",
  "slides": [
    {
      "headline": "short hook or slide title",
      "body": "1-2 sentence supporting copy",
      "imageUrl": "",
      "durationSeconds": 3.5
    }
  ]
}`;

    const userPrompt = `${brandContext}
Analysis: ${analysis}
Creative rule: ${brandDirection.pipelineProfile.scriptRule}
Visual rule: ${brandDirection.pipelineProfile.visualRule}
Requested slide count: ${slideCount}
Reference image provided: ${fields.hasReferenceImage ? "yes" : "no"}
${productKnowledge ? `${productKnowledge}\n` : ""}Rules:
- build exactly ${slideCount} slides
- each slide needs a sharp headline and a fuller supporting body
- optimize for vertical slideshow pacing, not spoken narration
- keep headlines brief, punchy, and swipe-friendly
- bodies should be clear enough to read in about 3 to 4 seconds
- sequence the slides into a strong hook, development, and payoff
- if no reference image is provided, leave imageUrl blank unless a source image is already supplied in context
- do not include markdown, numbering, or extra commentary

Return the final plan as JSON only.`;

    try {
      const response = await runTextPrompt(systemPrompt, [{ role: "user", content: userPrompt }], 1400);
      const parsed = parseLooseJsonObject(response, null);
      if (parsed && Array.isArray(parsed.slides) && parsed.slides.length > 0) {
        return parsed;
      }
    } catch (error) {
      logger.warn("anthropic_slides_plan_failed", {
        pipeline,
        message: error.message
      });
    }

    return createFallbackSlidesPlan(pipeline, brand, fields);
  }

  async function generateNarratedBrollPlan(analysis, pipeline, brand, fields = {}, segments = [], generationConfig = {}) {
    const brandContext = buildBrandContextBlock(brand, pipeline);
    const brandDirection = buildBrandDirection(brand, pipeline);
    const productKnowledge = buildProductKnowledgeBlock(fields);
    const normalizedTemplateFields = normalizeNarratedTemplateFields(fields);
    const template = getNarratedTemplate(normalizedTemplateFields.templateId);
    const templatePromptContext = buildNarratedTemplatePromptContext({
      brand,
      pipeline,
      fields: {
        ...fields,
        ...normalizedTemplateFields
      }
    });
    const systemPrompt = `You write B-roll prompts for narrated short-form vertical video.
Return valid JSON only with this exact shape:
{
  "segments": [
    {
      "segmentIndex": 1,
      "prompt": "full visual generation prompt",
      "sourceStrategy": "image|text|hybrid"
    }
  ]
}`;

    const segmentSummary = (segments || []).map((segment) => ({
      segmentIndex: segment.segmentIndex,
      text: segment.text,
      visualIntent: segment.visualIntent,
      actualDurationSeconds: segment.actualDurationSeconds || null,
      estimatedSeconds: segment.estimatedSeconds || null,
      shotType: segment.shotType || "",
      sourceStrategy: segment.sourceStrategy || "hybrid"
    }));

    const userPrompt = `${brandContext}
Analysis: ${analysis}
Platform preset: ${fields.platformPreset || "tiktok"}
Reference image provided: ${fields.hasReferenceImage ? "yes" : "no"}
Creative rule: ${brandDirection.pipelineProfile.visualRule}
${productKnowledge ? `${productKnowledge}\n` : ""}${templatePromptContext}
Generation model guidance: ${buildModelPromptGuidance(generationConfig)}
Negative constraints: ${buildVideoNegativeConstraints(pipeline, brand, generationConfig).join(" | ")}

Narrated segment plan:
${JSON.stringify(segmentSummary, null, 2)}

Rules:
- create exactly one visual prompt per segment
- each prompt must keep continuity with the same brand world
- one dominant visual beat per segment
- do not put a narrator on screen speaking to camera
- no burned-in text overlays
- keep prompts platform-aware for ${fields.platformPreset || "tiktok"}
- preserve the selected template structure: ${template.label}
- if no reference image is provided, favor category and customer-lifestyle continuity over exact product matching

Return the final plan as JSON only.`;

    try {
      const response = await runTextPrompt(systemPrompt, [{ role: "user", content: userPrompt }], 1800);
      const parsed = parseLooseJsonObject(response, null);
      if (parsed && Array.isArray(parsed.segments) && parsed.segments.length > 0) {
        return parsed.segments
          .map((entry) => ({
            segmentIndex: Number(entry.segmentIndex || entry.segment_index || 0),
            prompt: cleanString(entry.prompt || entry.videoPrompt || entry.video_prompt),
            sourceStrategy: cleanString(entry.sourceStrategy || entry.source_strategy) || "hybrid"
          }))
          .filter((entry) => entry.segmentIndex > 0 && entry.prompt);
      }
    } catch (error) {
      logger.warn("anthropic_narrated_broll_plan_failed", {
        pipeline,
        message: error.message
      });
    }

    return (segments || []).map((segment) => ({
      segmentIndex: segment.segmentIndex,
      prompt: buildFallbackNarratedBrollPrompt({
        segment,
        pipeline,
        brand,
        fields,
        generationConfig
      }),
      sourceStrategy: segment.sourceStrategy || "hybrid"
    }));
  }

  return {
    analyzeImage,
    suggestIdeas,
    autofillMissingIdeaFields,
    generateScript,
    generateVideoPrompt,
    generateCaptionAndHashtags,
    generateSlidesPlan,
    generateNarratedPlan,
    generateNarratedBrollPlan,
    createEmptyCaptions,
    normalizeCaptionPayload
  };
}

module.exports = {
  createAnthropicService,
  createEmptyCaptions,
  normalizeCaptionPayload,
  __testables: {
    buildFallbackIdeaSuggestions,
    buildIdeaPrompt,
    buildSequencePromptNotes,
    compactPromptSegment,
    fitVideoPromptToLimit
  }
};
