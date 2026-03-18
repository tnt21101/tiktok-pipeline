const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSlidesPromptSummary,
  buildSlidesScript,
  normalizeSlideCount,
  normalizeSlidesDraft,
  normalizeSlidesModeFields
} = require("../../src/slides/normalization");

test("normalizeSlidesModeFields clamps the requested slide count", () => {
  assert.equal(normalizeSlidesModeFields({ slideCount: 1 }).slideCount, 1);
  assert.equal(normalizeSlidesModeFields({ slideCount: 9 }).slideCount, 6);
  assert.equal(normalizeSlidesModeFields({ slideCount: 5 }).slideCount, 5);
});

test("normalizeSlidesDraft applies fallback images and stable ordering", () => {
  const slides = normalizeSlidesDraft([
    {
      headline: "Hook",
      body: "Open fast",
      durationSeconds: 3.7
    },
    {
      headline: "Proof",
      body: "Show the payoff",
      imageUrl: "https://example.com/slide-2.png",
      durationSeconds: 4.1
    }
  ], {
    fallbackImageUrl: "https://example.com/reference.png"
  });

  assert.equal(slides.length, 2);
  assert.equal(slides[0].slideIndex, 1);
  assert.equal(slides[0].imageUrl, "https://example.com/reference.png");
  assert.equal(slides[1].imageUrl, "https://example.com/slide-2.png");
  assert.equal(slides[1].durationSeconds, 4.1);
});

test("slide deck summaries include the title and slide copy", () => {
  const slides = normalizeSlidesDraft([
    {
      headline: "Hook",
      body: "Lead with the strongest line."
    },
    {
      headline: "Payoff",
      body: "Close on the clearest result."
    }
  ]);

  const script = buildSlidesScript("Deck title", slides);
  const summary = buildSlidesPromptSummary("Deck title", slides);

  assert.match(script, /Deck title/);
  assert.match(script, /Slide 1: Hook/);
  assert.match(summary, /Visual anchor:/);
});
