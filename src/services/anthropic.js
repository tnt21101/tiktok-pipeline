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

  async function generateScript(analysis, pipeline, brand, fields = {}) {
    let systemPrompt = "";
    let userPrompt = "";

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

Structure:
HOOK (0-3s): Bold claim or surprising fact that stops the scroll
BODY: 3 punchy tips or one deep explanation with zero filler
CTA: Save this or follow for more. Brand ${brand.name} mention is optional and natural only.

Format output exactly as:
HOOK: ...
BODY: ...
CTA: ...`;
    } else if (pipeline === "comedy") {
      const { scenario, format, energy } = fields;
      systemPrompt = `You are a TikTok comedy script writer. Relatable, self-aware gym humor. Not mean-spirited.
Brand: ${brand.name}. Voice: ${brand.voice}.`;

      userPrompt = `Character: ${analysis}

Write a 30s TikTok ${format || "POV skit"}.
Scenario: ${scenario || "relatable gym humor around sweating and working out"}
Character energy: ${energy || "overconfident"}

The character above plays the lead. Match their look and vibe in the action directions.

HOOK (0-2s): Visual or audio gag that stops the scroll
SETUP (2-15s): Establish the relatable situation fast
PUNCHLINE: Subvert the expectation
TAG: Optional second beat or reaction

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

HOOK (0-3s): Lead with the problem, not the product
DEMO: Show the product working and describe the visual action
CTA: ${cta || "Link in bio"}

Format exactly as:
HOOK: ...
DEMO: ...
CTA: ...`;
    }

    return runTextPrompt(systemPrompt, [{ role: "user", content: userPrompt }], 800);
  }

  async function generateVideoPrompt(analysis, script, pipeline, brand) {
    const descriptions = {
      edu: "educational talking head with a direct-to-camera presenter and strong authority",
      comedy: "comedy skit with expressive reactions, fast cuts, and relatable gym humor",
      product: "authentic UGC product demo with the product as the visual hero"
    };

    const systemPrompt = `You are a video generation prompt engineer for kie.ai (Runway model).
Write precise prompts for vertical TikTok video generation.
Always include: character or subject description, setting, action sequence, camera movement, lighting, editing pace, and mood.
Output only the prompt. No labels. No preamble. Stay under 1800 characters.`;

    const userPrompt = pipeline === "product"
      ? `Product: ${analysis}
Script: ${script}
Brand: ${brand.name} — ${brand.tone}
Style: ${descriptions.product}

Write a kie.ai video generation prompt. The product must stay clearly visible and in use.
Generate a relatable 25-35 year old fitness enthusiast character to demo it.
Authentic UGC feel, vertical 9:16, shot on phone, not a polished commercial.`
      : `Reference character: ${analysis}
Script: ${script}
Brand: ${brand.name} — ${brand.tone}
Style: ${descriptions[pipeline]}

Write a kie.ai video generation prompt. The character in the reference image is the lead and must match the analyzed appearance.
Vertical 9:16, authentic TikTok style, not a polished commercial.`;

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
