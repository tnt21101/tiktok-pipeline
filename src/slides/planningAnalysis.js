function buildSlidesPlanningAnalysis({ pipeline, brand, fields = {} }) {
  const anchor = pipeline === "edu"
    ? String(fields.topic || `${brand?.name || "Brand"} education concept`).trim()
    : pipeline === "comedy"
      ? String(fields.scenario || `${brand?.name || "Brand"} comedy concept`).trim()
      : String(fields.productName || brand?.products || `${brand?.name || "Brand"} product`).trim();

  const support = pipeline === "product"
    ? String(fields.benefit || fields.productDescription || "Show the product payoff clearly.").trim()
    : pipeline === "edu"
      ? `Teach ${anchor.toLowerCase()} in a clean, swipeable sequence.`
      : `Turn ${anchor.toLowerCase()} into a short payoff-driven joke sequence.`;

  return [
    `${brand?.name || "Brand"} ${pipeline} slide deck.`,
    `Primary angle: ${anchor}.`,
    `Supporting direction: ${support}.`,
    fields.hasReferenceImage
      ? "A reference image is attached for visual continuity."
      : "No reference image is attached, so use brand-forward, easy-to-read slide concepts."
  ].join(" ");
}

module.exports = {
  buildSlidesPlanningAnalysis
};
