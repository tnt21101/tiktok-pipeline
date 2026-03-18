const DEFAULT_NARRATED_TEMPLATE_ID = "problem_solution_result";
const DEFAULT_NARRATOR_TONE_ID = "brand_default";
const DEFAULT_CTA_STYLE_ID = "soft";
const DEFAULT_VISUAL_INTENSITY_ID = "balanced";
const DEFAULT_NARRATED_SEGMENT_COUNT = 3;
const MIN_NARRATED_SEGMENT_COUNT = 1;
const MAX_NARRATED_SEGMENT_COUNT = 6;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const NARRATOR_TONES = [
  {
    id: "brand_default",
    label: "Brand aligned",
    instruction: "Default to the brand's natural voice and level of authority."
  },
  {
    id: "direct",
    label: "Direct",
    instruction: "Keep the delivery crisp, plainspoken, and decisive."
  },
  {
    id: "expert",
    label: "Expert",
    instruction: "Sound informed, grounded, and evidence-led without becoming clinical."
  },
  {
    id: "friendly",
    label: "Friendly",
    instruction: "Sound warm, approachable, and conversational."
  },
  {
    id: "storyteller",
    label: "Storyteller",
    instruction: "Use slightly more narrative texture and connective language between beats."
  },
  {
    id: "urgent",
    label: "Urgent",
    instruction: "Create urgency through momentum and clarity, not fearmongering."
  }
];

const CTA_STYLES = [
  {
    id: "soft",
    label: "Soft CTA",
    instruction: "End with a gentle invitation or takeaway rather than a hard sell."
  },
  {
    id: "direct",
    label: "Direct CTA",
    instruction: "Use a clear, explicit action prompt near the end."
  },
  {
    id: "curiosity",
    label: "Curiosity CTA",
    instruction: "Tease the next step or reason to learn more."
  },
  {
    id: "save_share",
    label: "Save/Share CTA",
    instruction: "Prompt the viewer to save, share, or come back to the video."
  },
  {
    id: "shop_now",
    label: "Shop CTA",
    instruction: "Use a conversion-forward close that encourages product consideration."
  }
];

const VISUAL_INTENSITY_LEVELS = [
  {
    id: "clean",
    label: "Clean",
    instruction: "Favor polished, restrained visuals with fewer scene changes and calmer motion."
  },
  {
    id: "balanced",
    label: "Balanced",
    instruction: "Blend readability and energy with clear motion and controlled pacing."
  },
  {
    id: "bold",
    label: "Bold",
    instruction: "Push stronger contrast, motion, and dramatic reveals while staying coherent."
  }
];

const TEMPLATE_DEFINITIONS = [
  {
    id: "problem_solution_result",
    label: "Problem -> Solution -> Result",
    description: "Open on the friction, introduce the fix, and land on visible payoff.",
    recommendedBrandIds: ["tnt", "prell", "queen_helene"],
    recommendedPipelines: ["product", "edu"],
    dynamicHookPrompt: "Name the pain point, missed result, or annoying friction to open on.",
    scriptFramework: {
      hookPattern: "Start with the most immediate problem state or missed result in the first line.",
      pacing: "Keep 15s versions to 3-4 decisive beats and 30s versions to 5-6 beats with one proof turn before the CTA.",
      fixedRules: [
        "Problem and solution must stay in the same use-case world.",
        "Show the solution as a believable fix, not magic.",
        "End on a concrete result the viewer actually cares about."
      ]
    },
    sceneFramework: {
      flow: [
        "Problem scene: messy routine, friction, buildup, discomfort, or confusion.",
        "Solution scene: product or insight enters with one readable action.",
        "Result scene: visible relief, clarity, performance, or confidence payoff."
      ],
      continuityRules: [
        "Keep the same setting, user, and product silhouette through the transition.",
        "Make the before-state visually different from the after-state."
      ]
    },
    visualPromptFramework: {
      motion: "Use motion that clearly changes the state of the scene from problem to fix to payoff.",
      composition: "Prioritize side-by-side contrast, reveal shots, and tactile use moments.",
      mood: "Satisfying, resolving, and confident rather than abstract."
    },
    platformGuidance: {
      tiktok: "Call out the problem fast and show the solution almost immediately. Use fast reveals and a direct payoff.",
      instagram: "Lean slightly more polished and let the result shot breathe for visual satisfaction."
    },
    brandFit: {
      tnt: "Strong fit for TNT because it mirrors workout pain, product use, and earned visual payoff.",
      queen_helene: "Use this for ritual pain points like dryness, dullness, or rough skin followed by a tactile self-care solution.",
      prell: "Ideal for buildup-to-clean transformations where the clean result is visually obvious."
    },
    fallbackBeats(context) {
      return [
        {
          shotType: "problem",
          sourceStrategy: context.pipeline === "product" ? "image" : "hybrid",
          text: `If ${context.hookAngle || context.problemLabel} keeps getting in the way, this is the reset.`,
          visualIntent: "Open on the clearest frustration or low-result state before anything improves."
        },
        {
          shotType: "solution",
          sourceStrategy: "image",
          text: `Here is where ${context.subject} changes the routine.`,
          visualIntent: "Show one clean, believable solution action with the product or insight clearly legible."
        },
        {
          shotType: "result",
          sourceStrategy: "hybrid",
          text: `The difference is ${context.outcomeLabel}.`,
          visualIntent: "Land on the strongest proof or payoff image that shows the result without overexplaining."
        },
        {
          shotType: "cta",
          sourceStrategy: "hybrid",
          text: context.ctaLine,
          visualIntent: "Finish with a branded result hold or final routine detail that supports the CTA."
        }
      ];
    }
  },
  {
    id: "listicle_countdown",
    label: "Listicle / Countdown",
    description: "Break the idea into numbered, fast-moving beats with a clean payoff.",
    recommendedBrandIds: ["tnt", "queen_helene", "prell"],
    recommendedPipelines: ["edu", "product"],
    dynamicHookPrompt: "Set the list angle, such as three mistakes, three tips, or top reasons.",
    scriptFramework: {
      hookPattern: "Open with the promise of a numbered list or countdown and make the value obvious.",
      pacing: "Every segment should feel like the next item clicking into place; never let the middle flatten out.",
      fixedRules: [
        "Each item must be distinct and instantly understandable.",
        "Keep each beat short enough to feel scannable in audio and visuals.",
        "The final item should be the strongest, most useful, or most surprising."
      ]
    },
    sceneFramework: {
      flow: [
        "Hook scene that introduces the list premise.",
        "Rapid sequence of one visual beat per item.",
        "Final strongest item or summary scene with the CTA."
      ],
      continuityRules: [
        "Keep the same product world or routine across all list items.",
        "Use clear visual separators through composition or action rather than text overlays."
      ]
    },
    visualPromptFramework: {
      motion: "Use quick resets, punch-ins, or object/action swaps that make each item feel distinct.",
      composition: "Keep framing consistent enough that the list feels cohesive.",
      mood: "Useful, punchy, and high-clarity."
    },
    platformGuidance: {
      tiktok: "Use a strong first item immediately and make the list feel like it is moving fast enough to watch through.",
      instagram: "Favor a tidier visual rhythm and smoother transitions between items."
    },
    brandFit: {
      tnt: "Great for tips, mistakes, and routine upgrades aimed at gym-goers.",
      queen_helene: "Works well for affordable ritual tips, beauty shortcuts, and product-use best practices.",
      prell: "Strong for buildup mistakes, wash-day reminders, and scalp-care tips."
    },
    fallbackBeats(context) {
      return [
        {
          shotType: "hook",
          sourceStrategy: "hybrid",
          text: `Here are ${context.itemCount} quick things to know about ${context.subject}.`,
          visualIntent: "Open with the strongest list promise and a first image that instantly shows the category."
        },
        {
          shotType: "item_1",
          sourceStrategy: "hybrid",
          text: "Start with the point most people miss first.",
          visualIntent: "Show the clearest first item with one dominant action or proof detail."
        },
        {
          shotType: "item_2",
          sourceStrategy: "hybrid",
          text: "Then move to the next thing that changes the result.",
          visualIntent: "Show the second item as a distinct beat in the same world."
        },
        {
          shotType: "item_3",
          sourceStrategy: "hybrid",
          text: `Save the strongest point for last: ${context.outcomeLabel}.`,
          visualIntent: "Close on the most useful or surprising list item with the cleanest visual payoff."
        }
      ];
    }
  },
  {
    id: "myth_fact_stop_doing_this",
    label: "Myth vs. Fact / Stop Doing This",
    description: "Challenge a bad assumption, correct it fast, and show the better way.",
    recommendedBrandIds: ["tnt", "prell", "queen_helene"],
    recommendedPipelines: ["edu", "product"],
    dynamicHookPrompt: "Name the myth, bad habit, or common mistake the narrator should call out.",
    scriptFramework: {
      hookPattern: "Open by calling out the wrong behavior or myth directly.",
      pacing: "Use a fast contrast between what people do, what is actually true, and what to do instead.",
      fixedRules: [
        "The myth or mistake has to be common enough to feel instantly familiar.",
        "The fact should be simple, specific, and easy to visualize.",
        "The corrected action should look better than the original behavior."
      ]
    },
    sceneFramework: {
      flow: [
        "Wrong-way scene or myth setup.",
        "Correction or fact reveal.",
        "Better method demo and payoff."
      ],
      continuityRules: [
        "Keep the person, product, or routine consistent while the behavior changes.",
        "Make the corrected behavior visibly more satisfying or effective."
      ]
    },
    visualPromptFramework: {
      motion: "Use contrast-driven action and corrected technique cues.",
      composition: "Frame the wrong way and right way clearly enough that the difference reads instantly.",
      mood: "Confident, corrective, and helpful."
    },
    platformGuidance: {
      tiktok: "Lead with the callout line immediately and make the correction fast enough to reward attention.",
      instagram: "Let the better-method demo look cleaner and more aesthetically satisfying."
    },
    brandFit: {
      tnt: "Use this to bust workout myths, sweat misconceptions, or demo mistakes.",
      queen_helene: "Good for common beauty misconceptions and old-school products that outperform assumptions.",
      prell: "Perfect for buildup myths, over-washing myths, and clarifying misconceptions."
    },
    fallbackBeats(context) {
      return [
        {
          shotType: "myth",
          sourceStrategy: "hybrid",
          text: `Stop doing ${context.hookAngle || "the version that only looks right but does not work"}.`,
          visualIntent: "Open on the wrong move or bad assumption in a way that reads instantly."
        },
        {
          shotType: "fact",
          sourceStrategy: "hybrid",
          text: `The real fix is ${context.factLine}.`,
          visualIntent: "Show the fact or corrected technique with one clear visual demonstration."
        },
        {
          shotType: "proof",
          sourceStrategy: context.pipeline === "product" ? "image" : "hybrid",
          text: `That is what actually gets you ${context.outcomeLabel}.`,
          visualIntent: "Show the corrected method producing a better-looking, more believable result."
        },
        {
          shotType: "cta",
          sourceStrategy: "hybrid",
          text: context.ctaLine,
          visualIntent: "End with the better routine or clean result still on screen."
        }
      ];
    }
  },
  {
    id: "storytelling_brand_origin",
    label: "Storytelling / Brand Origin",
    description: "Tell a short origin-style story that leads naturally into why the product matters.",
    recommendedBrandIds: ["queen_helene", "prell", "tnt"],
    recommendedPipelines: ["product", "edu"],
    dynamicHookPrompt: "Set the story angle, such as why the routine exists or how the product became a staple.",
    scriptFramework: {
      hookPattern: "Open with a narrative setup or turning point rather than a flat claim.",
      pacing: "Move from setup to tension to resolution without feeling slow or historical.",
      fixedRules: [
        "Every beat should still serve a present-day viewer benefit.",
        "Keep the story grounded in one product truth or ritual payoff.",
        "Do not drift into vague brand mythology without a useful end point."
      ]
    },
    sceneFramework: {
      flow: [
        "Opening story cue or routine memory.",
        "Conflict, challenge, or discovery beat.",
        "Present-day ritual payoff tied to the product."
      ],
      continuityRules: [
        "Keep the story world cohesive rather than jumping between unrelated aesthetics.",
        "If the story references the past, make the visual transition clean and intentional."
      ]
    },
    visualPromptFramework: {
      motion: "Use purposeful reveal motion and memory-like transitions without becoming dreamy or abstract.",
      composition: "Favor objects, hands, environments, and ritual details that imply history and trust.",
      mood: "Warm, grounded, and narrative."
    },
    platformGuidance: {
      tiktok: "Keep the story hook sharp and curiosity-driven so it still earns attention in the first two seconds.",
      instagram: "Lean into visual polish and ritual beauty while keeping the story concise."
    },
    brandFit: {
      queen_helene: "Excellent fit for heritage, trusted ritual, and affordable classic-product storytelling.",
      prell: "Use this for comeback, classic-favorite, or old-school clean reset stories.",
      tnt: "Use sparingly for founder mindset, training culture, or why the routine exists."
    },
    fallbackBeats(context) {
      return [
        {
          shotType: "hook",
          sourceStrategy: "hybrid",
          text: `There is a reason ${context.subject} keeps showing up in real routines.`,
          visualIntent: "Open with one familiar ritual image that hints at story and trust."
        },
        {
          shotType: "origin",
          sourceStrategy: "hybrid",
          text: `It started with a simple need: ${context.hookAngle || context.problemLabel}.`,
          visualIntent: "Show the original friction, routine gap, or reason the product matters."
        },
        {
          shotType: "proof",
          sourceStrategy: "image",
          text: `That is why it still helps deliver ${context.outcomeLabel}.`,
          visualIntent: "Bring the story into the present with a tactile, believable use moment."
        },
        {
          shotType: "cta",
          sourceStrategy: "hybrid",
          text: context.ctaLine,
          visualIntent: "Close on the product as part of a lived-in routine with an inviting finish."
        }
      ];
    }
  },
  {
    id: "before_after_transformation",
    label: "Before / After Transformation",
    description: "Use a stark before-state and a satisfying after-state to drive the story.",
    recommendedBrandIds: ["tnt", "prell", "queen_helene"],
    recommendedPipelines: ["product", "edu"],
    dynamicHookPrompt: "Describe the transformation the viewer should care about most.",
    scriptFramework: {
      hookPattern: "Open on the before-state or a line that promises the change.",
      pacing: "Get to the after-state quickly enough to keep momentum, then explain just enough to earn it.",
      fixedRules: [
        "The before and after states must be visibly different.",
        "Show the transformation path, not just the endpoints.",
        "Do not exaggerate beyond what the product category can plausibly deliver."
      ]
    },
    sceneFramework: {
      flow: [
        "Before-state visual.",
        "Transition or method beat.",
        "After-state reveal with proof and CTA."
      ],
      continuityRules: [
        "Keep the same subject, setting, and category cues through the transformation.",
        "Use the after-shot as a payoff, not as a disconnected glamour scene."
      ]
    },
    visualPromptFramework: {
      motion: "Use reveal motion, transitions, and tactile cues that make the transformation feel earned.",
      composition: "Make the contrast readable at a glance through framing, texture, and lighting.",
      mood: "Satisfying, contrast-led, and confidence-building."
    },
    platformGuidance: {
      tiktok: "Show the before-state immediately and get to the transformation fast.",
      instagram: "Let the after-state hold a little longer and look cleaner without losing believability."
    },
    brandFit: {
      tnt: "Perfect for effort-to-result or low-energy-to-activated transformations.",
      queen_helene: "Works well for skin texture, hydration, mask payoff, or ritual transformation beats.",
      prell: "Ideal for dull or heavy buildup turning into lightweight clean hair."
    },
    fallbackBeats(context) {
      return [
        {
          shotType: "before",
          sourceStrategy: "hybrid",
          text: `This is the before: ${context.problemLabel}.`,
          visualIntent: "Open on the clearest before-state with texture and friction visible."
        },
        {
          shotType: "transition",
          sourceStrategy: "image",
          text: `Now watch what changes once ${context.subject} enters the routine.`,
          visualIntent: "Show the turning-point action that moves the scene from before to after."
        },
        {
          shotType: "after",
          sourceStrategy: "hybrid",
          text: `This is the after: ${context.outcomeLabel}.`,
          visualIntent: "Reveal the after-state in a way that clearly contrasts with the opening."
        },
        {
          shotType: "cta",
          sourceStrategy: "hybrid",
          text: context.ctaLine,
          visualIntent: "End on the after-state holding steady with one final proof detail."
        }
      ];
    }
  },
  {
    id: "did_you_know_quick_explainer",
    label: "Did You Know? / Quick Explainer",
    description: "Start from a curiosity hook, explain one insight fast, and land on a useful takeaway.",
    recommendedBrandIds: ["tnt", "prell", "queen_helene", "la_baby"],
    recommendedPipelines: ["edu", "product"],
    dynamicHookPrompt: "State the quick fact, surprising truth, or angle that should open the explainer.",
    scriptFramework: {
      hookPattern: "Lead with a curiosity hook that sounds worth knowing in one sentence.",
      pacing: "Deliver one clear insight fast, then support it with one proof beat and one takeaway beat.",
      fixedRules: [
        "Explain one idea, not three ideas at once.",
        "Use plainspoken language that sounds spoken, not textbook.",
        "Support the insight with one visible piece of proof or demonstration."
      ]
    },
    sceneFramework: {
      flow: [
        "Curiosity hook scene.",
        "Mechanism or explanation beat.",
        "Proof or takeaway beat."
      ],
      continuityRules: [
        "Keep the explainer tied to one object, product, or routine world.",
        "Make the proof scene feel like evidence, not decorative filler."
      ]
    },
    visualPromptFramework: {
      motion: "Use visual proof, demonstrations, or object-led actions that clarify the point quickly.",
      composition: "Frame the subject or product so the mechanism is easy to follow.",
      mood: "Fast, useful, and confident."
    },
    platformGuidance: {
      tiktok: "Open with the strongest curiosity phrase possible and get to the explanation immediately.",
      instagram: "Make the proof scene cleaner and more aesthetically composed while staying informative."
    },
    brandFit: {
      tnt: "Strong for quick fitness and sweat explainers that feel coach-led.",
      queen_helene: "Use for ingredient facts, ritual shortcuts, or why a classic product works.",
      prell: "Ideal for quick scalp, buildup, or clarifying facts.",
      la_baby: "A safe fit for gentle parent education if the tone stays reassuring and practical."
    },
    fallbackBeats(context) {
      return [
        {
          shotType: "hook",
          sourceStrategy: "hybrid",
          text: `Did you know ${context.hookAngle || context.factLine}?`,
          visualIntent: "Open on a visual cue that makes the curiosity hook feel immediate."
        },
        {
          shotType: "explain",
          sourceStrategy: "hybrid",
          text: `Here is the simple reason: ${context.factLine}.`,
          visualIntent: "Show one clear mechanism, demonstration, or product-led explanation beat."
        },
        {
          shotType: "proof",
          sourceStrategy: context.pipeline === "product" ? "image" : "hybrid",
          text: `That is why it helps with ${context.outcomeLabel}.`,
          visualIntent: "Support the explanation with a concrete proof image or routine result."
        },
        {
          shotType: "cta",
          sourceStrategy: "hybrid",
          text: context.ctaLine,
          visualIntent: "Finish with the clearest takeaway or routine reminder still on screen."
        }
      ];
    }
  },
  {
    id: "ingredient_spotlight",
    label: "Ingredient Spotlight",
    description: "Center one ingredient, hero component, or product property and connect it to the result.",
    recommendedBrandIds: ["queen_helene", "prell", "la_baby", "tnt"],
    recommendedPipelines: ["product", "edu"],
    dynamicHookPrompt: "Set the ingredient or hero property angle the narrator should focus on.",
    scriptFramework: {
      hookPattern: "Open by naming the ingredient, hero property, or what makes the formula special.",
      pacing: "Move quickly from spotlight to what it does to what the viewer gets from it.",
      fixedRules: [
        "Focus on one ingredient or hero property, not the entire label.",
        "Translate the ingredient into a viewer benefit quickly.",
        "Keep claims grounded in visible, believable outcomes."
      ]
    },
    sceneFramework: {
      flow: [
        "Ingredient or hero-property hook.",
        "Texture, formula, or application beat.",
        "Benefit or result payoff."
      ],
      continuityRules: [
        "Keep the product package, formula texture, and setting consistent.",
        "Make the ingredient feel connected to the result, not like trivia."
      ]
    },
    visualPromptFramework: {
      motion: "Use texture shots, application cues, ingredient-inspired environments, and tactile close-ups.",
      composition: "Keep packaging, formula texture, and hands readable and clean.",
      mood: "Specific, tactile, and persuasive."
    },
    platformGuidance: {
      tiktok: "Make the ingredient feel like a quick insider secret with a fast payoff.",
      instagram: "Lean into texture, product beauty, and ritual polish while staying informative."
    },
    brandFit: {
      queen_helene: "Excellent for cocoa butter, mint, masks, and familiar ingredient-led rituals.",
      prell: "Works best when framed around the clarifying formula or what makes the clean feel so distinct.",
      la_baby: "Use only if the ingredient story can stay gentle, safe, and parent-friendly.",
      tnt: "Best when focused on the active sensation or hero property rather than beauty-style ingredient language."
    },
    fallbackBeats(context) {
      return [
        {
          shotType: "hook",
          sourceStrategy: "image",
          text: `The hero here is ${context.heroDetail}.`,
          visualIntent: "Open on the product, formula, or ingredient-inspired detail that anchors the story."
        },
        {
          shotType: "explain",
          sourceStrategy: "image",
          text: `That is what helps drive ${context.outcomeLabel}.`,
          visualIntent: "Show texture, formula behavior, or tactile application in a clean close-up."
        },
        {
          shotType: "proof",
          sourceStrategy: "hybrid",
          text: `You can see it in the result.`,
          visualIntent: "Reveal the benefit in the same product world with a satisfying payoff shot."
        },
        {
          shotType: "cta",
          sourceStrategy: "hybrid",
          text: context.ctaLine,
          visualIntent: "End with the hero product still feeling tactile, trusted, and useful."
        }
      ];
    }
  }
];

function normalizeId(value, fallback, options) {
  const normalized = String(value || "").trim().toLowerCase();
  return options.some((option) => option.id === normalized) ? normalized : fallback;
}

function getNarratedTemplate(templateId) {
  return TEMPLATE_DEFINITIONS.find((template) => template.id === templateId) || TEMPLATE_DEFINITIONS[0];
}

function getToneOption(id) {
  return NARRATOR_TONES.find((option) => option.id === id) || NARRATOR_TONES[0];
}

function getCtaStyleOption(id) {
  return CTA_STYLES.find((option) => option.id === id) || CTA_STYLES[0];
}

function getVisualIntensityOption(id) {
  return VISUAL_INTENSITY_LEVELS.find((option) => option.id === id) || VISUAL_INTENSITY_LEVELS[1];
}

function normalizeNarratedSegmentCount(value, fallback = DEFAULT_NARRATED_SEGMENT_COUNT) {
  const parsed = Number.parseInt(value, 10);
  const safeValue = Number.isFinite(parsed) ? parsed : fallback;
  return clamp(safeValue, MIN_NARRATED_SEGMENT_COUNT, MAX_NARRATED_SEGMENT_COUNT);
}

function normalizeNarratedTemplateFields(fields = {}) {
  return {
    templateId: normalizeId(fields.templateId, DEFAULT_NARRATED_TEMPLATE_ID, TEMPLATE_DEFINITIONS),
    hookAngle: String(fields.hookAngle || "").trim(),
    narratorTone: normalizeId(fields.narratorTone, DEFAULT_NARRATOR_TONE_ID, NARRATOR_TONES),
    ctaStyle: normalizeId(fields.ctaStyle, DEFAULT_CTA_STYLE_ID, CTA_STYLES),
    visualIntensity: normalizeId(fields.visualIntensity, DEFAULT_VISUAL_INTENSITY_ID, VISUAL_INTENSITY_LEVELS),
    segmentCount: normalizeNarratedSegmentCount(fields.segmentCount)
  };
}

function getNarratedOptionsPayload() {
  return {
    templates: TEMPLATE_DEFINITIONS.map((template) => ({
      id: template.id,
      label: template.label,
      description: template.description,
      recommendedBrandIds: template.recommendedBrandIds,
      recommendedPipelines: template.recommendedPipelines
    })),
    narratorTones: NARRATOR_TONES.map(({ id, label, instruction }) => ({ id, label, instruction })),
    ctaStyles: CTA_STYLES.map(({ id, label, instruction }) => ({ id, label, instruction })),
    visualIntensityLevels: VISUAL_INTENSITY_LEVELS.map(({ id, label, instruction }) => ({ id, label, instruction }))
  };
}

function formatLines(lines = []) {
  return lines.map((line) => `- ${line}`).join("\n");
}

function getPrimaryBrandProduct(brand = {}) {
  return String(brand.products || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)[0] || `${brand.name || "Brand"} hero product`;
}

function getNarratedSubject(fields = {}, brand = {}, pipeline = "product") {
  if (pipeline === "edu") {
    return String(fields.topic || getPrimaryBrandProduct(brand)).trim() || getPrimaryBrandProduct(brand);
  }

  if (pipeline === "comedy") {
    return String(fields.scenario || getPrimaryBrandProduct(brand)).trim() || getPrimaryBrandProduct(brand);
  }

  return String(fields.productName || getPrimaryBrandProduct(brand)).trim() || getPrimaryBrandProduct(brand);
}

function getNarratedOutcome(fields = {}, pipeline = "product") {
  if (pipeline === "edu") {
    return String(fields.topic || "a useful takeaway").trim() || "a useful takeaway";
  }

  if (pipeline === "comedy") {
    return String(fields.scenario || "the punchline").trim() || "the punchline";
  }

  return String(fields.benefit || "a better result").trim() || "a better result";
}

function getNarratedProblemLabel(fields = {}, pipeline = "product") {
  if (pipeline === "edu") {
    return String(fields.hookAngle || fields.topic || "the confusion or mistake").trim() || "the confusion or mistake";
  }

  if (pipeline === "comedy") {
    return String(fields.hookAngle || fields.scenario || "the awkward setup").trim() || "the awkward setup";
  }

  return String(fields.hookAngle || fields.benefit || "the problem people want fixed").trim() || "the problem people want fixed";
}

function getNarratedHeroDetail(fields = {}, brand = {}, pipeline = "product") {
  return String(
    fields.hookAngle
      || fields.productBenefits?.[0]
      || fields.productDescription
      || (pipeline === "product" ? getNarratedSubject(fields, brand, pipeline) : getNarratedOutcome(fields, pipeline))
      || getPrimaryBrandProduct(brand)
  ).trim();
}

function buildNarratedCtaLine(fields = {}, brand = {}) {
  const ctaStyle = getCtaStyleOption(normalizeNarratedTemplateFields(fields).ctaStyle);
  const brandName = brand.name || "the brand";
  const productName = String(fields.productName || getPrimaryBrandProduct(brand)).trim() || brandName;

  if (ctaStyle.id === "direct") {
    return `Use this as the clear next step if you want the result faster.`;
  }

  if (ctaStyle.id === "curiosity") {
    return `If that angle surprised you, this is the version worth trying next.`;
  }

  if (ctaStyle.id === "save_share") {
    return `Save this so you remember the part that actually makes the difference.`;
  }

  if (ctaStyle.id === "shop_now") {
    return `If ${productName} fits your routine, this is the one to check out next.`;
  }

  return `Keep ${brandName} in mind if you want the cleanest version of this result.`;
}

function buildNarratedTemplatePromptContext({ brand = {}, pipeline = "product", fields = {} }) {
  const normalizedFields = normalizeNarratedTemplateFields(fields);
  const template = getNarratedTemplate(normalizedFields.templateId);
  const tone = getToneOption(normalizedFields.narratorTone);
  const ctaStyle = getCtaStyleOption(normalizedFields.ctaStyle);
  const visualIntensity = getVisualIntensityOption(normalizedFields.visualIntensity);
  const platformPreset = String(fields.platformPreset || "tiktok").trim().toLowerCase() || "tiktok";
  const brandNote = template.brandFit[brand.id] || `Adapt the template to ${brand.name || "the brand"} without losing the format logic.`;

  return [
    `Template selected: ${template.label}`,
    `Template summary: ${template.description}`,
    `Dynamic hook angle: ${normalizedFields.hookAngle || template.dynamicHookPrompt}`,
    `Narrator tone: ${tone.label}. ${tone.instruction}`,
    `CTA style: ${ctaStyle.label}. ${ctaStyle.instruction}`,
    `Visual intensity: ${visualIntensity.label}. ${visualIntensity.instruction}`,
    "Fixed template script framework:",
    formatLines([
      template.scriptFramework.hookPattern,
      template.scriptFramework.pacing,
      ...template.scriptFramework.fixedRules
    ]),
    "B-roll scene framework:",
    formatLines([
      ...template.sceneFramework.flow,
      ...template.sceneFramework.continuityRules
    ]),
    "Visual prompt framework:",
    formatLines([
      `Motion: ${template.visualPromptFramework.motion}`,
      `Composition: ${template.visualPromptFramework.composition}`,
      `Mood: ${template.visualPromptFramework.mood}`
    ]),
    `Platform tuning (${platformPreset}): ${template.platformGuidance[platformPreset] || template.platformGuidance.tiktok}`,
    `Brand adaptation note: ${brandNote}`
  ].join("\n");
}

function allocateDurations(totalDurationSeconds, segmentCount) {
  const safeCount = Math.max(1, Number(segmentCount || 1));
  const total = Math.max(safeCount, Number(totalDurationSeconds || 15));
  const base = Math.floor(total / safeCount);
  const durations = Array.from({ length: safeCount }, () => Math.max(2, base));
  let remainder = total - durations.reduce((sum, value) => sum + value, 0);

  let index = 0;
  while (remainder > 0) {
    durations[index % durations.length] += 1;
    remainder -= 1;
    index += 1;
  }

  return durations;
}

function fitFallbackBeatsToCount(beats = [], targetCount, context = {}) {
  const normalizedCount = normalizeNarratedSegmentCount(targetCount, beats.length || DEFAULT_NARRATED_SEGMENT_COUNT);
  const safeBeats = Array.isArray(beats) ? beats.filter(Boolean) : [];
  if (safeBeats.length === 0) {
    return [];
  }

  if (safeBeats.length === normalizedCount) {
    return safeBeats;
  }

  if (safeBeats.length > normalizedCount) {
    if (normalizedCount === 1) {
      return [safeBeats[0]];
    }

    const head = safeBeats[0];
    const tail = safeBeats[safeBeats.length - 1];
    const middleNeeded = Math.max(0, normalizedCount - 2);
    return [head, ...safeBeats.slice(1, 1 + middleNeeded), tail];
  }

  const expanded = [...safeBeats];
  while (expanded.length < normalizedCount) {
    const bridgeIndex = expanded.length;
    expanded.splice(expanded.length - 1, 0, {
      shotType: `bridge_${bridgeIndex}`,
      sourceStrategy: "hybrid",
      text: `Add one more proof beat that moves ${context.subject || "the story"} closer to ${context.outcomeLabel || "the payoff"}.`,
      visualIntent: "Show a fresh supporting moment in the same world that keeps momentum moving without restarting the setup."
    });
  }

  return expanded;
}

function buildNarratedFallbackPlan({ pipeline = "product", brand = {}, fields = {} }) {
  const normalizedFields = normalizeNarratedTemplateFields(fields);
  const template = getNarratedTemplate(normalizedFields.templateId);
  const totalDurationSeconds = Number.parseInt(fields.targetLengthSeconds, 10) || 15;
  const subject = getNarratedSubject(fields, brand, pipeline);
  const outcomeLabel = getNarratedOutcome(fields, pipeline);
  const problemLabel = getNarratedProblemLabel(fields, pipeline);
  const heroDetail = getNarratedHeroDetail(fields, brand, pipeline);
  const requestedSegmentCount = normalizeNarratedSegmentCount(normalizedFields.segmentCount, totalDurationSeconds <= 15 ? 3 : 4);
  const titleSeed = String(
    fields.narrationTitle
      || fields.topic
      || fields.scenario
      || fields.productName
      || `${brand.name || "Brand"} ${template.label}`
  ).trim();

  const beats = fitFallbackBeatsToCount(template.fallbackBeats({
    brand,
    pipeline,
    fields,
    subject,
    outcomeLabel,
    problemLabel,
    heroDetail,
    factLine: normalizedFields.hookAngle || problemLabel,
    hookAngle: normalizedFields.hookAngle,
    ctaLine: buildNarratedCtaLine(fields, brand),
    itemCount: requestedSegmentCount
  }), requestedSegmentCount, {
    subject,
    outcomeLabel
  });

  const durations = allocateDurations(totalDurationSeconds, beats.length);

  return {
    title: titleSeed,
    totalDurationSeconds,
    segments: beats.map((beat, index) => ({
      text: beat.text,
      visualIntent: beat.visualIntent,
      estimatedSeconds: durations[index],
      shotType: beat.shotType,
      sourceStrategy: beat.sourceStrategy || "hybrid"
    }))
  };
}

module.exports = {
  CTA_STYLES,
  DEFAULT_CTA_STYLE_ID,
  DEFAULT_NARRATED_SEGMENT_COUNT,
  DEFAULT_NARRATED_TEMPLATE_ID,
  DEFAULT_NARRATOR_TONE_ID,
  DEFAULT_VISUAL_INTENSITY_ID,
  MAX_NARRATED_SEGMENT_COUNT,
  MIN_NARRATED_SEGMENT_COUNT,
  NARRATOR_TONES,
  TEMPLATE_DEFINITIONS,
  VISUAL_INTENSITY_LEVELS,
  buildNarratedFallbackPlan,
  buildNarratedTemplatePromptContext,
  getNarratedOptionsPayload,
  getNarratedTemplate,
  normalizeNarratedSegmentCount,
  normalizeNarratedTemplateFields
};
