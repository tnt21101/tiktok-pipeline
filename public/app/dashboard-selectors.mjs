const REVIEWABLE_STATUSES = new Set([
  "script_ready",
  "slides_ready",
  "voice_ready",
  "broll_ready",
  "ready_to_compose",
  "ready",
  "distributed"
]);

const OUTPUT_STATUSES = new Set([
  "ready",
  "distributed",
  "rendering_slides",
  "voice_ready",
  "broll_ready",
  "ready_to_compose",
  "composing"
]);

const PUBLISHABLE_STATUSES = new Set(["ready", "distributed"]);

function byNewest(left, right) {
  return String(right?.createdAt || "").localeCompare(String(left?.createdAt || ""));
}

export function getStatusTone(status = "") {
  if (["failed", "stopped"].includes(status)) {
    return "failed";
  }

  if (["ready", "distributed", "voice_ready", "ready_to_compose", "broll_ready", "slides_ready"].includes(status)) {
    return "ready";
  }

  if (["submitting", "polling", "awaiting_generation", "analyzing", "scripting", "captioning", "prompting", "planning_broll", "rendering_broll", "rendering_slides", "composing", "creating"].includes(status)) {
    return "active";
  }

  return "info";
}

export function getReviewJobs(jobs = []) {
  return [...jobs]
    .filter((job) => REVIEWABLE_STATUSES.has(job?.status))
    .sort(byNewest);
}

export function getOutputJobs(jobs = []) {
  return [...jobs]
    .filter((job) => Boolean(job?.videoUrl) || OUTPUT_STATUSES.has(job?.status))
    .sort(byNewest);
}

export function getPublishJobs(jobs = []) {
  return [...jobs]
    .filter((job) => PUBLISHABLE_STATUSES.has(job?.status) && Boolean(job?.videoUrl))
    .sort(byNewest);
}

export function getAttentionJobs(jobs = [], activeStatuses = []) {
  const active = new Set(activeStatuses);
  return [...jobs]
    .filter((job) => job?.status === "failed" || active.has(job?.status))
    .sort((left, right) => {
      if (left?.status === "failed" && right?.status !== "failed") {
        return -1;
      }
      if (right?.status === "failed" && left?.status !== "failed") {
        return 1;
      }
      return byNewest(left, right);
    });
}

export function getRecentFinishedJobs(jobs = [], limit = 6) {
  return [...jobs]
    .filter((job) => ["ready", "distributed"].includes(job?.status) && Boolean(job?.videoUrl))
    .sort(byNewest)
    .slice(0, limit);
}

export function filterJobsByQuery(jobs = [], query = "", getSearchText = () => "") {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) {
    return jobs;
  }

  return jobs.filter((job) => getSearchText(job).includes(normalized));
}

export function getWorkflowStageCards(jobs = [], activeStatuses = []) {
  const active = new Set(activeStatuses);
  const generating = jobs.filter((job) => active.has(job?.status)).length;
  const review = jobs.filter((job) => REVIEWABLE_STATUSES.has(job?.status)).length;
  const ready = jobs.filter((job) => job?.status === "ready").length;
  const published = jobs.filter((job) => job?.status === "distributed").length;

  return [
    {
      id: "generate",
      label: "Generating",
      value: generating,
      copy: "Jobs that are queued, rendering, or still moving through content prep."
    },
    {
      id: "review",
      label: "Review Gates",
      value: review,
      copy: "Drafts, segments, and finished assets waiting on operator approval."
    },
    {
      id: "ready",
      label: "Ready",
      value: ready,
      copy: "Completed outputs prepared for final inspection and publishing."
    },
    {
      id: "publish",
      label: "Published",
      value: published,
      copy: "Assets successfully sent to connected distribution channels."
    }
  ];
}
