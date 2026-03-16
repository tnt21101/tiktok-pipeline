const Anthropic = require("@anthropic-ai/sdk");
const { AppError } = require("../utils/errors");
const { parseLooseJsonObject } = require("../utils/json");
const { getPromptMetrics } = require("../utils/prompt");

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
    edu: [
      "3 mistakes that make your results feel slower",
      "Why your routine works harder when you fix this one habit",
      `What ${targetAudience} get wrong about consistency`,
      "The fastest way to make your routine feel more effective",
      "How to tell if your current plan is actually working"
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
        sequenceHandOff: existingCount + index + 1 < sequenceCount ? "End by naturally teeing up the next segment." : "Land the final payoff cleanly and close the stitched reel."
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

function buildIdeaPrompt(analysis, pipeline, brand, fields = {}, count = 3, options = {}) {
  const brandContext = `Brand: ${brand.name}
Category: ${brand.category}
Voice: ${brand.voice}
Products: ${brand.products}
Target audience: ${brand.targetAudience}`;
  const subjectContext = analysis ? `On-screen subject context: ${analysis}` : "No image analysis yet. Generate concepts from brand context alone.";
  const scenarioContext = getBrandScenarioContext(brand);
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
        ? `You are a short-form content strategist building one stitched multi-clip education video.
Generate ordered segment ideas that all belong to the same final reel, with one shared throughline, escalating logic, and no reset between parts.
Every idea must feel like the next beat of the same video, not a separate topic.
Return valid JSON only.`
        : `You are a short-form content strategist.
Generate sharp, specific education-video topics that feel natively clickable on TikTok, Reels, and Shorts.
Return valid JSON only.`,
      user: `${brandContext}
${subjectContext}
Current format: ${format || "talking head"}
Current length target: ${length || "60s"}
Existing topic, if any: ${topic || "none"}
${sequenceEnabled ? `${existingSequenceText}

Generate the next ${count} beat${count === 1 ? "" : "s"} for a single ${totalCount}-segment stitched education reel.
Requirements:
- one shared theme across all segments
- same presenter world and same overall premise
- each segment should progress the argument instead of restarting it
- if a segment is not the last one, it should naturally tee up the next beat
- the last segment should feel like the payoff, takeaway, or CTA
` : ""}

Generate ${count} ${sequenceEnabled ? "ordered education sequence beats" : "distinct education content ideas"} for this brand.
Each one should be concise, specific, and strong enough to become a script immediately.
Avoid generic filler like "tips and tricks" unless the angle is specific.

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
        "sequenceHandOff": "next-beat note"` : ""}
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
        ? `You are a short-form comedy concept writer building one stitched multi-clip skit sequence.
Generate ordered beats that belong to the same scenario, same character world, and same escalating joke.
Do not reset the premise between segments.
Return valid JSON only.`
        : `You are a short-form comedy concept writer.
Generate relatable, visual, creator-friendly scenarios that can be turned into quick TikTok skits.
Return valid JSON only.`,
      user: `${brandContext}
${subjectContext}
Current format: ${format || "POV skit"}
Character energy: ${energy || "overconfident"}
Existing scenario, if any: ${scenario || "none"}
Brand-specific setting guidance:
${scenarioContext || "Use settings, props, and situations that naturally fit this brand and audience."}
${sequenceEnabled ? `
${existingSequenceText}

Generate the next ${count} beat${count === 1 ? "" : "s"} for a single ${totalCount}-segment stitched comedy reel.
Requirements:
- one shared scenario and one consistent comedic premise
- same setting, props, and character world across all beats
- each beat should escalate or pay off the previous one
- do not write disconnected scenario options
- the final segment should feel like the punchline or tag
` : ""}

Generate ${count} ${sequenceEnabled ? "ordered comedy sequence beats" : "distinct comedy scenarios"} for this brand and audience.
Keep them relatable, visual, and immediately understandable in one line.
Bake the brand setting guidance into the scenario itself instead of keeping it abstract.
Do not write the full script. Just write the core scenario concept.

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
        "sequenceHandOff": "next-beat note"` : ""}
      }
    }
  ]
}`
    };
  }

  const { productName, benefit, format, cta } = fields;
  return {
    system: sequenceEnabled
      ? `You are a direct-response UGC concept strategist building one stitched multi-clip product reel.
Generate ordered product beats that work as one continuous problem-to-payoff sequence instead of disconnected angles.
Return valid JSON only.`
      : `You are a direct-response UGC concept strategist.
Generate product video angles that pair a concrete product with a concrete benefit.
Return valid JSON only.`,
    user: `${brandContext}
${subjectContext}
Current UGC format: ${format || "demo"}
Current CTA: ${cta || "Link in bio"}
Existing product name, if any: ${productName || "none"}
Existing key benefit, if any: ${benefit || "none"}
${sequenceEnabled ? `
${existingSequenceText}

Generate the next ${count} beat${count === 1 ? "" : "s"} for a single ${totalCount}-segment stitched product reel.
Requirements:
- same core product and same overall demo world
- sequence should usually move through hook/problem, demo, proof, payoff, and CTA
- each segment should hand off naturally to the next
- avoid three unrelated benefits that feel like separate ads
` : ""}

Generate ${count} ${sequenceEnabled ? "ordered product sequence beats" : "distinct product content angles"} for this brand.
Each suggestion must include both a productName and a specific benefit angle.
Use products that plausibly fit the brand catalog.

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
        "sequenceHandOff": "next-beat note"` : ""}
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
What this segment should hand off to next: ${sequence.sequenceHandOff || (isLast ? "This is the final payoff." : "Naturally tee up the next segment.")}

Continuity rules:
- keep the same presenter, setting, world, and premise
- do not reset or re-explain the whole idea from scratch unless this is segment 1
- make the ending feel like a handoff if this is not the last segment
- only the last segment should feel like the true wrap-up or CTA`;
}

function buildAnalysisPrompt(pipeline) {
  const isProduct = pipeline === "product";
  return isProduct
    ? `You are a product analyst for TikTok UGC video creation. Analyze this product image and return:
- Product type and likely name
- Colors and packaging description
- Size/form factor
- Key visual features
- Any text visible on packaging
- Overall aesthetic (premium, drugstore, clinical, etc.)
Be specific and factual. Output only the description, no preamble.`
    : `You are a character analyst for TikTok video casting. Analyze the person in this image and return a concise, specific character description covering:
- Apparent age range
- Gender presentation
- Physical build and height impression
- Hair (color, length, style)
- Clothing and style
- Overall vibe and energy (for example "gym bro confidence" or "approachable fitness coach")
Be specific and factual. This is used to cast them as the lead in a TikTok video. Output only the description, no preamble.`;
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

  async function analyzeImage(imageUrl, pipeline) {
    return runTextPrompt(
      buildAnalysisPrompt(pipeline),
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

    try {
      const suggestions = await suggestIdeas(analysis, pipeline, brand, fields, 1);
      return mergeMissingIdeaFields(pipeline, fields, suggestions[0]?.fields || {});
    } catch (error) {
      logger.warn("anthropic_idea_generation_failed", {
        pipeline,
        message: error.message
      });

      const fallback = buildFallbackIdeaSuggestions(pipeline, brand, fields, 1)[0];
      return mergeMissingIdeaFields(pipeline, fields, fallback?.fields || {});
    }
  }

  async function generateScript(analysis, pipeline, brand, fields = {}) {
    let systemPrompt = "";
    let userPrompt = "";
    const sequencePromptNotes = buildSequencePromptNotes(fields);
    const sequence = getSequenceFields(fields);
    const isSequence = Boolean(sequence.sequenceCount) && sequence.sequenceCount > 1;
    const sequenceIndex = Number(sequence.sequenceIndex || 1);
    const isFinalSequenceClip = isSequence && sequenceIndex >= Number(sequence.sequenceCount);

    if (pipeline === "edu") {
      const { topic, format, length } = fields;
      systemPrompt = `You are a TikTok script writer for ${brand.name} (${brand.category}).
Brand voice: ${brand.voice}
Target audience: ${brand.targetAudience}
Write punchy, direct scripts. Every word earns its place. No filler. No corporate language.`;

      userPrompt = `Character on screen: ${analysis}

Write a ${length || "60s"} TikTok education script in ${format || "talking head"} format.
Topic: ${topic || "sweat science and workout optimization"}

The character above is the on-screen presenter. Write to match their energy and vibe.
${sequencePromptNotes ? `\n${sequencePromptNotes}` : ""}

Structure:
HOOK (0-3s): Bold claim or surprising fact that stops the scroll
BODY: ${isSequence ? "one clean beat in the larger stitched sequence, with zero filler" : "3 punchy tips or one deep explanation with zero filler"}
CTA: ${isSequence
    ? (isFinalSequenceClip
      ? `Natural final payoff and close for the full sequence. Brand ${brand.name} mention is optional and natural only.`
      : "A handoff line that flows into the next segment instead of a hard stop.")
    : `Save this or follow for more. Brand ${brand.name} mention is optional and natural only.`}

Format output exactly as:
HOOK: ...
BODY: ...
CTA: ...`;
    } else if (pipeline === "comedy") {
      const { scenario, format, energy } = fields;
      systemPrompt = `You are a TikTok comedy script writer. Relatable, self-aware short-form humor grounded in the brand's real world. Not mean-spirited.
Brand: ${brand.name}. Voice: ${brand.voice}.`;

      userPrompt = `Character: ${analysis}

Write a 30s TikTok ${format || "POV skit"}.
Scenario: ${scenario || "relatable gym humor around sweating and working out"}
Character energy: ${energy || "overconfident"}
Brand-specific setting guidance:
${getBrandScenarioContext(brand) || "Use settings and props that naturally fit the brand category and audience."}
${sequencePromptNotes ? `\n${sequencePromptNotes}` : ""}

The character above plays the lead. Match their look and vibe in the action directions.
Keep the setting grounded in the brand-specific guidance above instead of using a generic blank-room scenario.

HOOK (0-2s): ${isSequence && sequenceIndex > 1 ? "Continue the running bit immediately." : "Visual or audio gag that stops the scroll"}
SETUP (2-15s): ${isSequence ? "advance the same comedic situation instead of restarting it" : "Establish the relatable situation fast"}
PUNCHLINE: ${isFinalSequenceClip ? "Land the payoff for the stitched sequence." : "Subvert the expectation while teeing up what happens next."}
TAG: ${isSequence && !isFinalSequenceClip ? "A handoff reaction into the next segment." : "Optional second beat or reaction"}

Brand rule: Background placement only. Never the punchline. Never forced.

Format exactly as:
HOOK: ...
SETUP: ...
PUNCHLINE: ...
TAG: ...`;
    } else {
      const { productName, benefit, format, cta } = fields;
      systemPrompt = `You are a UGC TikTok script writer for ${brand.name}. Voice: ${brand.voice}.
Lead with the problem. Results do the talking. Authentic, not commercial.`;

      userPrompt = `Product analysis: ${analysis}
Product name: ${productName || brand.products.split(",")[0].trim()}
Key benefit: ${benefit || "maximum results"}

Write a TikTok UGC ${format || "demo"} script.
Generate a relatable 25-35 year old fitness enthusiast character to demo this product.
${sequencePromptNotes ? `\n${sequencePromptNotes}` : ""}

HOOK (0-3s): ${isSequence && Number(sequence.sequenceIndex || 1) > 1 ? "Continue from the previous beat without restarting the ad." : "Lead with the problem, not the product"}
DEMO: ${isSequence ? "Show this segment's part of the same larger demo sequence and keep the continuity tight." : "Show the product working and describe the visual action"}
CTA: ${isSequence
    ? (isFinalSequenceClip ? (cta || "Link in bio") : "A handoff into the next demo beat, not a final CTA.")
    : (cta || "Link in bio")}

Format exactly as:
HOOK: ...
DEMO: ...
CTA: ...`;
    }

    return runTextPrompt(systemPrompt, [{ role: "user", content: userPrompt }], 800);
  }

  async function generateVideoPrompt(analysis, script, pipeline, brand, fields = {}) {
    const descriptions = {
      edu: "educational talking head with a direct-to-camera presenter and strong authority",
      comedy: "comedy skit with expressive reactions, fast cuts, and relatable gym humor",
      product: "authentic UGC product demo with the product as the visual hero"
    };
    const sequencePromptNotes = buildSequencePromptNotes(fields);

    const systemPrompt = `You are a video generation prompt engineer for kie.ai (Runway model).
Write precise prompts for vertical TikTok video generation.
Always include: character or subject description, setting, action sequence, camera movement, lighting, editing pace, and mood.
Output only the prompt. No labels. No preamble. Stay under 1800 characters.`;

    const userPrompt = pipeline === "product"
      ? `Product: ${analysis}
Script: ${script}
Brand: ${brand.name} — ${brand.tone}
Style: ${descriptions.product}
${sequencePromptNotes ? `Sequence continuity notes: ${sequencePromptNotes}` : ""}

Write a kie.ai video generation prompt. The product must stay clearly visible and in use.
Generate a relatable 25-35 year old fitness enthusiast character to demo it.
Authentic UGC feel, vertical 9:16, shot on phone, not a polished commercial.
If this is part of a stitched sequence, keep wardrobe, setting, camera language, and subject continuity consistent with the prior and next clips.`
      : `Reference character: ${analysis}
Script: ${script}
Brand: ${brand.name} — ${brand.tone}
Style: ${descriptions[pipeline]}
${sequencePromptNotes ? `Sequence continuity notes: ${sequencePromptNotes}` : ""}

Write a kie.ai video generation prompt. The character in the reference image is the lead and must match the analyzed appearance.
Vertical 9:16, authentic TikTok style, not a polished commercial.
If this is part of a stitched sequence, keep the same world, presenter continuity, and visual handoff into the surrounding clips.`;

    let prompt = await runTextPrompt(systemPrompt, [{ role: "user", content: userPrompt }], 600);
    let metrics = getPromptMetrics(prompt);

    if (metrics.exceedsLimit) {
      prompt = await runTextPrompt(
        "You shorten video generation prompts without losing important casting, product, or shot details.",
        [{
          role: "user",
          content: `Rewrite this video prompt under 1800 characters. Preserve the core subject, setting, action, and camera details.\n\n${prompt}`
        }],
        500
      );
      metrics = getPromptMetrics(prompt);
    }

    if (metrics.exceedsLimit) {
      throw new AppError(422, "Claude returned a video prompt that still exceeds the 1800 character limit.", {
        code: "video_prompt_too_long",
        details: metrics
      });
    }

    return prompt;
  }

  async function generateCaptionAndHashtags(script, pipeline, brand) {
    const pipelineContext = {
      edu: "educational fitness content",
      comedy: "comedy or entertainment fitness content",
      product: "product UGC or demo content"
    };

    const text = await runTextPrompt(
      `You are a social media caption and hashtag writer specializing in TikTok, Instagram Reels, and YouTube Shorts.
Write native, punchy copy that feels platform-native instead of corporate.`,
      [{
        role: "user",
        content: `Brand: ${brand.name} (${brand.category})
Brand voice: ${brand.voice}
Target audience: ${brand.targetAudience}
Pipeline type: ${pipelineContext[pipeline]}

Script:
${script}

Return valid JSON only:
{
  "tiktok": {
    "caption": "150 chars max",
    "hashtags": ["10-15 tags without #"]
  },
  "instagram": {
    "caption": "200 chars max",
    "hashtags": ["15-20 tags without #"]
  },
  "youtube": {
    "caption": "70 chars max",
    "hashtags": ["3-5 tags without #"]
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

  return {
    analyzeImage,
    suggestIdeas,
    autofillMissingIdeaFields,
    generateScript,
    generateVideoPrompt,
    generateCaptionAndHashtags,
    createEmptyCaptions,
    normalizeCaptionPayload
  };
}

module.exports = {
  createAnthropicService,
  createEmptyCaptions,
  normalizeCaptionPayload
};
