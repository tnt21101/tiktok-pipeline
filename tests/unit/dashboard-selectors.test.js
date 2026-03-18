const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

let selectorModulePromise;

function loadSelectors() {
  if (!selectorModulePromise) {
    selectorModulePromise = import(pathToFileURL(
      path.resolve(__dirname, "../../public/app/dashboard-selectors.mjs")
    ).href);
  }

  return selectorModulePromise;
}

test("getStatusTone maps failed and ready states to stable tones", async () => {
  const { getStatusTone } = await loadSelectors();

  assert.equal(getStatusTone("failed"), "failed");
  assert.equal(getStatusTone("ready"), "ready");
  assert.equal(getStatusTone("polling"), "active");
  assert.equal(getStatusTone("mystery_state"), "info");
});

test("review, output, and publish selectors bucket jobs for the new workflow screens", async () => {
  const { getReviewJobs, getOutputJobs, getPublishJobs } = await loadSelectors();
  const jobs = [
    { id: "review", status: "slides_ready", createdAt: "2026-03-18T03:00:00.000Z", videoUrl: "" },
    { id: "output", status: "ready", createdAt: "2026-03-18T04:00:00.000Z", videoUrl: "https://example.com/video.mp4" },
    { id: "published", status: "distributed", createdAt: "2026-03-18T05:00:00.000Z", videoUrl: "https://example.com/published.mp4" },
    { id: "active", status: "polling", createdAt: "2026-03-18T06:00:00.000Z", videoUrl: "" }
  ];

  assert.deepEqual(getReviewJobs(jobs).map((job) => job.id), ["published", "output", "review"]);
  assert.deepEqual(getOutputJobs(jobs).map((job) => job.id), ["published", "output"]);
  assert.deepEqual(getPublishJobs(jobs).map((job) => job.id), ["published", "output"]);
});

test("workflow stage cards and queue query filtering reflect the dashboard grouping", async () => {
  const { filterJobsByQuery, getWorkflowStageCards } = await loadSelectors();
  const jobs = [
    { id: "one", status: "polling", createdAt: "2026-03-18T02:00:00.000Z" },
    { id: "two", status: "ready", createdAt: "2026-03-18T03:00:00.000Z" },
    { id: "three", status: "distributed", createdAt: "2026-03-18T04:00:00.000Z" }
  ];

  const cards = getWorkflowStageCards(jobs, ["polling", "submitting"]);
  assert.equal(cards.find((card) => card.id === "generate").value, 1);
  assert.equal(cards.find((card) => card.id === "ready").value, 1);
  assert.equal(cards.find((card) => card.id === "publish").value, 1);

  const filtered = filterJobsByQuery(jobs, "three", (job) => `${job.id} ${job.status}`);
  assert.deepEqual(filtered.map((job) => job.id), ["three"]);
});
