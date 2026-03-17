const { getGenerationProfile } = require("../generation/modelProfiles");
const { PLATFORM_RULES } = require("../channels/ayrshare");

function clean(value) {
  return String(value || "").trim();
}

function cleanList(values = []) {
  return values
    .map((value) => clean(value))
    .filter(Boolean);
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildBrandFingerprint(brand = {}) {
  return `${brand.id || ""} ${brand.name || ""} ${brand.category || ""} ${brand.products || ""} ${brand.targetAudience || ""}`.toLowerCase();
}

function getCategoryBrandProfile(brand = {}) {
  const fingerprint = buildBrandFingerprint(brand);

  if (brand.id === "tnt" || fingerprint.includes("fitness") || fingerprint.includes("sweat") || fingerprint.includes("gym") || fingerprint.includes("workout")) {
    return {
      essence: "Earned intensity for people who train hard and want believable results.",
      voiceRules: [
        "Sound like a credible coach or seasoned gym friend, not a brand deck.",
        "Use short, decisive lines with real training-world language.",
        "Favor effort, discipline, and visible payoff over hype."
      ],
      visualRules: [
        "Keep the world grounded in real training spaces like gym floors, treadmills, ellipticals, weights, locker rooms, and mirror checks.",
        "Show sweat, exertion, recovery, and physical texture instead of glossy lifestyle filler.",
        "Wardrobe, props, and background should feel practical and athletic."
      ],
      avoidRules: [
        "Avoid spa, luxury-beauty, or soft self-care language.",
        "Avoid fake science, miracle claims, or cringe bro-posturing.",
        "Avoid generic motivational fluff that could belong to any fitness brand."
      ],
      whimsy: "A sly gym-culture detail can make it stick: timer beeps, towel snaps, treadmill side-eye, mirror checks, chalk dust, or over-serious warm-up rituals.",
      storyBias: "Open with friction, prove effort, and let the payoff feel earned."
    };
  }

  if (brand.id === "la_baby" || fingerprint.includes("baby") || fingerprint.includes("infant") || fingerprint.includes("new parent") || fingerprint.includes("expecting")) {
    return {
      essence: "Gentle confidence for everyday parent moments that end in calm relief.",
      voiceRules: [
        "Speak parent-to-parent with warmth, reassurance, and plain clarity.",
        "Keep the tone protective, human, and emotionally safe.",
        "Favor comfort, trust, and everyday usefulness over hype."
      ],
      visualRules: [
        "Use believable parent environments like nurseries, bath time, bedtime, stroller walks, feeding setups, and changing stations.",
        "Keep hands, body language, and props safe, attentive, and calm.",
        "Light should feel soft, lived-in, and trustworthy."
      ],
      avoidRules: [
        "Avoid making the baby the joke.",
        "Avoid unsafe handling, frantic chaos, or harsh sarcasm.",
        "Avoid cold clinical language unless the product truly requires it."
      ],
      whimsy: "Use tender micro-moments like a tiny yawn, a blanket tuck, a bath splash, or a relieved diaper-bag save.",
      storyBias: "Start from a real parent stress point and land in ease, care, or relief."
    };
  }

  if (brand.id === "prell" || fingerprint.includes("hair")) {
    return {
      essence: "A crisp clean reset that feels satisfyingly real, not salon-fantasy polished.",
      voiceRules: [
        "Use direct, refreshing language with no fluff.",
        "Make the benefit feel tangible and immediate.",
        "Keep it confident without sounding expensive or precious."
      ],
      visualRules: [
        "Use shower steam, bathroom mirrors, scalp-close cues, rinse moments, and bounce-back texture.",
        "Favor clarity, freshness, movement, and satisfying clean-hair reveals.",
        "Hair behavior should feel physically believable and touchable."
      ],
      avoidRules: [
        "Avoid luxury salon fantasy, vague beauty-speak, or abstract glow language.",
        "Avoid overproduced glamour that hides the clean-hair payoff.",
        "Avoid generic product beauty posing without a visible clean result."
      ],
      whimsy: "A memorable clean-hair detail helps: the rinse moment, comb glide, towel flip, fresh-volume shake, or the 'my scalp can finally breathe' expression.",
      storyBias: "Make buildup the enemy and clarity the satisfying payoff."
    };
  }

  if (brand.id === "queen_helene" || fingerprint.includes("beauty") || fingerprint.includes("personal care") || fingerprint.includes("lotion") || fingerprint.includes("mask")) {
    return {
      essence: "Trusted, approachable beauty rituals with a classic product charm and everyday accessibility.",
      voiceRules: [
        "Keep it warm, conversational, and trustworthy.",
        "Make affordability and effectiveness feel like a pleasant discovery, not a discount pitch.",
        "Use modern language without losing the brand's dependable feel."
      ],
      visualRules: [
        "Use vanities, bathroom shelves, showers, and relaxed morning or night routines.",
        "Highlight tactile product textures, packaging familiarity, and little ritual moments.",
        "Keep the mood approachable rather than luxury-editorial."
      ],
      avoidRules: [
        "Avoid sterile clinical jargon, luxury snobbery, or trend-chasing slang overload.",
        "Avoid making self-care feel cold, ironic, or chaotic.",
        "Avoid visuals that could belong to any premium skincare ad."
      ],
      whimsy: "A small ritual delight works best here: a minty tingle smile, an under-$10 win, a vanity-shelf reveal, or a 'wait, this actually works' reaction.",
      storyBias: "Let the content feel like an affordable ritual win someone wants to tell a friend about."
    };
  }

  return {
    essence: "Human, specific, and visually grounded short-form content with real-world texture.",
    voiceRules: [
      "Use concrete language instead of generic marketing lines.",
      "Make the speaker sound like a person with a point of view.",
      "Keep every beat clear enough to picture immediately."
    ],
    visualRules: [
      "Keep settings, props, and actions believable for the product category.",
      "Use tactile details and natural movement.",
      "Favor one clear world over scattered generic aesthetics."
    ],
    avoidRules: [
      "Avoid generic creator-speak that could fit any brand.",
      "Avoid corporate phrasing, vague adjectives, and empty hype.",
      "Avoid random whimsy that disconnects from the product or audience."
    ],
    whimsy: "Add one memorable, brand-fitting human detail that makes the moment feel lived in.",
    storyBias: "Create a clear setup-to-payoff progression instead of disconnected moments."
  };
}

function getPipelineNarrativeProfile(pipeline) {
  if (pipeline === "edu") {
    return {
      sequenceArc: "curiosity -> explanation -> proof -> takeaway",
      ideaRule: "Generate one concrete mechanism, myth, mistake, or proof point per beat.",
      scriptRule: "Teach one clear insight per segment and make it feel immediately usable.",
      visualRule: "Support the explanation with visible behavior, props, or environmental proof instead of generic talking-head filler."
    };
  }

  if (pipeline === "comedy") {
    return {
      sequenceArc: "trigger -> escalation -> twist -> payoff",
      ideaRule: "Anchor every beat in one specific relatable trigger and a clearly visualized comedic escalation.",
      scriptRule: "Escalate the same joke world instead of swapping premises.",
      visualRule: "Build reactions, timing, props, and framing around one readable comic situation."
    };
  }

  return {
    sequenceArc: "problem -> demo -> proof -> payoff",
    ideaRule: "Keep the same core product and use case across the sequence.",
    scriptRule: "Show tactile use, visible cause-and-effect, and a believable payoff.",
    visualRule: "Keep the product legible, tactile, and actively used in every beat."
  };
}

function buildBrandDirection(brand = {}, pipeline = "edu") {
  const brandProfile = getCategoryBrandProfile(brand);
  const pipelineProfile = getPipelineNarrativeProfile(pipeline);

  return {
    ...brandProfile,
    pipelineProfile
  };
}

function buildBrandDirectionBlock(brand = {}, pipeline = "edu") {
  const direction = buildBrandDirection(brand, pipeline);
  return [
    `Brand essence: ${direction.essence}`,
    `Voice rules: ${direction.voiceRules.join(" | ")}`,
    `Visual rules: ${direction.visualRules.join(" | ")}`,
    `Avoid: ${direction.avoidRules.join(" | ")}`,
    `Story logic: ${direction.pipelineProfile.sequenceArc}. ${direction.pipelineProfile.ideaRule}`,
    `Signature charm: ${direction.whimsy}`
  ].join("\n");
}

function buildModelPromptGuidance(generationConfig = {}) {
  const profile = getGenerationProfile(generationConfig.profileId);
  const shared = [
    "keep subject identity, wardrobe, packaging geometry, and setting continuity stable",
    "make motion physically plausible and camera movement intentional",
    "avoid surprise extra limbs, duplicate products, warped hands, or text overlays"
  ];

  if (profile.id === "sora2_image") {
    return `Generation model: ${profile.label}. Prioritize strong first-frame fidelity, one coherent environment, realistic subject motion, clean hand/product interactions, and cinematic but believable movement. ${shared.join("; ")}.`;
  }

  if (profile.id === "veo31_image" || profile.id === "veo31_reference") {
    return `Generation model: ${profile.label}. Preserve the reference subject's face, hair, wardrobe, and product geometry closely. Favor controlled camera moves, clean spatial continuity, and a readable beginning-to-end action path. ${shared.join("; ")}.`;
  }

  if (profile.id === "seedance15pro") {
    const audioNote = generationConfig.generateAudio === false
      ? "Do not rely on audio for the payoff."
      : "If sound is implied, keep the action visually motivated by believable sound-producing movement.";
    return `Generation model: ${profile.label}. Favor tactile motion, crisp action readability, touchable product texture, and energetic but physically grounded movement. ${audioNote} ${shared.join("; ")}.`;
  }

  if (profile.id === "kling30") {
    const elementsNote = generationConfig.useElements
      ? "Treat the uploaded element references as locked visual anchors and keep that subject or object consistent throughout the clip."
      : "Do not invent a new hero subject unrelated to the uploaded reference imagery.";
    const multiShotNote = generationConfig.multiShots
      ? "Stage the action as two connected shots with a clear progression, clean continuity, and no scene reset between beats."
      : "Keep the clip readable as one coherent move, not a jumble of disconnected beats.";
    return `Generation model: ${profile.label}. Favor crisp cinematic motion, strong continuity, and visually motivated action beats that still feel physically believable. ${elementsNote} ${multiShotNote} ${shared.join("; ")}.`;
  }

  return `Generation model: ${profile.label}. ${shared.join("; ")}.`;
}

function buildVideoNegativeConstraints(pipeline = "edu", brand = {}, generationConfig = {}) {
  const profile = getGenerationProfile(generationConfig.profileId);
  const negatives = [
    "no random scene resets",
    "no floating objects",
    "no text overlays or captions burned into the video",
    "no extra fingers, warped hands, or duplicated products",
    "no off-brand glossy commercial polish unless the script clearly calls for it"
  ];

  if (pipeline === "product") {
    negatives.push("do not hide the product for most of the clip");
    negatives.push("do not let the product label morph between shots");
  }

  if (pipeline === "comedy") {
    negatives.push("do not turn the joke into chaotic nonsense that breaks the premise");
  }

  if (pipeline === "edu") {
    negatives.push("do not default to static generic talking-head filler without visual proof");
  }

  const fingerprint = buildBrandFingerprint(brand);
  if (brand.id === "la_baby" || fingerprint.includes("baby")) {
    negatives.push("no unsafe baby handling or careless physical comedy around the baby");
  }

  if (profile.id === "sora2_image") {
    negatives.push("do not drift away from the uploaded reference identity or product silhouette");
  }

  if (profile.id === "kling30" && generationConfig.useElements) {
    negatives.push("do not let the anchored element drift, morph, duplicate, or disappear");
  }

  if (profile.id === "kling30" && generationConfig.multiShots) {
    negatives.push("do not reset the subject, setting, or lighting between the connected shot beats");
  }

  return unique(negatives);
}

function buildCaptionPlatformGuidance() {
  return Object.entries(PLATFORM_RULES)
    .map(([platform, rules]) => {
      if (platform === "tiktok") {
        return `TikTok: conversational and curiosity-driven, like something a creator would really post; keep it well under ${rules.captionMaxLength} characters and use at most ${rules.hashtagLimit} strong hashtags.`;
      }

      if (platform === "instagram") {
        return `Instagram Reels: slightly more polished and lifestyle-aware while still sounding human; keep it well under ${rules.captionMaxLength} characters and use at most ${rules.hashtagLimit} hashtags.`;
      }

      return `YouTube Shorts: write it like a tight searchable title, not a paragraph; keep it under ${rules.captionMaxLength} characters and use at most ${rules.hashtagLimit} hashtags.`;
    })
    .join("\n");
}

function assembleVideoPromptParts(parts = {}) {
  const sections = cleanList([
    parts.format ? `${parts.format}.` : "",
    parts.subject ? `Subject: ${parts.subject}.` : "",
    parts.setting ? `Setting: ${parts.setting}.` : "",
    parts.story ? `Action progression: ${parts.story}.` : "",
    parts.camera ? `Camera: ${parts.camera}.` : "",
    parts.look ? `Lighting and texture: ${parts.look}.` : "",
    parts.motion ? `Performance and motion: ${parts.motion}.` : "",
    parts.continuity ? `Continuity: ${parts.continuity}.` : "",
    Array.isArray(parts.negative) && parts.negative.length > 0
      ? `Avoid: ${parts.negative.join(", ")}.`
      : ""
  ]);

  return sections
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  buildBrandDirection,
  buildBrandDirectionBlock,
  buildCaptionPlatformGuidance,
  buildModelPromptGuidance,
  buildVideoNegativeConstraints,
  assembleVideoPromptParts
};
