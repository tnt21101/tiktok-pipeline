import {
  filterJobsByQuery,
  getAttentionJobs,
  getOutputJobs,
  getPublishJobs,
  getRecentFinishedJobs,
  getReviewJobs,
  getStatusTone,
  getWorkflowStageCards
} from "./app/dashboard-selectors.mjs";
import {
  renderDetailHero,
  renderDetailStat,
  renderEmptyState,
  renderMetricCard,
  renderStageCard,
  renderWorkspaceJobCard
} from "./app/dashboard-primitives.mjs";
import { createDashboardWorkspaceRenderer } from "./app/dashboard-workspaces.mjs";
import { createApiSettingsController } from "./app/api-settings.mjs";

function createEmptySingleSequenceState() {
  return {
    items: [],
    compilation: {
      loading: false,
      result: null,
      error: "",
      finalJobId: null
    },
    distributionResults: []
  };
}

function createEmptySingleAutoProgressState() {
  return {
    enabled: false,
    mode: "clip",
    jobId: "",
    pendingAction: "",
    queued: false,
    outputsOpened: false,
    blockedReason: "",
    steps: {
      voice: false,
      broll: false,
      compose: false,
      renderSlides: false
    }
  };
}

function createEmptyStrategyState() {
  return {
    asin: "",
    productUrl: "",
    fields: {
      brandSummary: "",
      productDescription: "",
      targetAudience: "",
      constraints: ""
    },
    fieldSources: {
      brandSummary: "manual",
      productDescription: "manual",
      targetAudience: "manual",
      constraints: "manual"
    },
    fetchedListing: null,
    normalizedInputs: null,
    result: null,
    loading: {
      fetch: false,
      generate: false
    },
    errors: {
      fetch: "",
      generate: ""
    }
  };
}

const state = {
  viewMode: "overview",
  createWorkspaceMode: "single",
  activePipeline: "edu",
  brands: [],
  generationProfiles: [],
  system: {
    health: null,
    narratedOptions: null
  },
  spendSummary: null,
  dashboard: {
    queueSearch: "",
    reviewJobId: "",
    outputJobId: "",
    publishJobId: ""
  },
  history: {
    jobs: [],
    loading: false,
    deletingJobId: "",
    runsFilter: "all"
  },
  brandModal: {
    mode: "new",
    editingBrandId: null,
    importingProducts: false,
    lastFocusedElement: null
  },
  apiSettings: {
    loading: false,
    saving: false,
    lastFocusedElement: null,
    updatedAt: "",
    providers: [],
    error: ""
  },
  ideaAssist: {
    loading: false,
    byPipeline: {
      edu: { suggestions: [], analysis: "" },
      comedy: { suggestions: [], analysis: "" },
      product: { suggestions: [], analysis: "" }
    }
  },
  single: {
    creationMode: "clip",
    imageUrl: "",
    previewUrl: "",
    secondaryImageUrl: "",
    secondaryPreviewUrl: "",
    ideaMeta: {
      edu: {},
      comedy: {},
      product: {}
    },
    job: null,
    pollTimer: null,
    requestVersion: 0,
    readyToastShownFor: null,
    uploading: false,
    running: false,
    slideAction: {
      saving: false,
      rendering: false,
      draftPayload: null
    },
    autoProgress: createEmptySingleAutoProgressState(),
    sequence: createEmptySingleSequenceState()
  },
  batch: {
    presenterImageUrl: "",
    presenterPreviewUrl: "",
    presenterSecondaryImageUrl: "",
    presenterSecondaryPreviewUrl: "",
    productImageUrl: "",
    productPreviewUrl: "",
    productSecondaryImageUrl: "",
    productSecondaryPreviewUrl: "",
    items: [],
    pollTimer: null,
    ideaLoading: {
      edu: "",
      comedy: "",
      product: ""
    },
    ideaMeta: {
      edu: [],
      comedy: [],
      product: []
    },
    control: {
      running: false,
      submitting: false,
      paused: false,
      stopRequested: false,
      queueCompleted: false,
      monitoring: false
    },
    compilation: {
      loading: false,
      results: [],
      error: ""
    }
  },
  strategy: createEmptyStrategyState(),
  captionsDirty: {
    tiktok: false,
    instagram: false,
    youtube: false
  },
  captionTab: "tiktok",
  platformModes: {
    tiktok: "draft",
    instagram: "draft",
    youtube: "draft"
  },
  toastTimer: null
};

const ACTIVE_JOB_STATUSES = ["queued", "retry_queued", "creating", "analyzing", "planning_narration", "script_ready", "generating_voice", "planning_broll", "rendering_broll", "composing", "planning_slides", "slides_ready", "rendering_slides", "scripting", "captioning", "prompting", "awaiting_generation", "submitting", "polling", "distributing"];

function getRunsFilterConfig() {
  return [
    { id: "all", label: "All runs" },
    { id: "active", label: "Active" },
    { id: "failed", label: "Failed" },
    { id: "ready", label: "Ready" },
    { id: "published", label: "Published" }
  ];
}

function getPipelineLabel(pipeline) {
  return {
    edu: "Education",
    comedy: "Comedy",
    product: "Product"
  }[pipeline] || "Run";
}

function getCreationModeLabel(mode) {
  if (mode === "slides") {
    return "TikTok Slides";
  }

  if (mode === "narrated") {
    return "Narrated";
  }

  return mode === "storyboard" ? "Storyboard" : "Single clip";
}

function isNarratedMode() {
  return state.single.creationMode === "narrated";
}

function isStoryboardMode() {
  return state.single.creationMode === "storyboard";
}

function isSlidesMode() {
  return state.single.creationMode === "slides";
}

function getCreationModeForJob(job) {
  if (job?.mode === "narrated") {
    return "narrated";
  }

  if (job?.mode === "slides") {
    return "slides";
  }

  const recordedSequenceCount = Number.parseInt(job?.fields?.sequenceCount, 10) || 1;
  return recordedSequenceCount > 1 ? "storyboard" : "clip";
}

function isBrandModalOpen() {
  return document.getElementById("brandModal")?.classList.contains("is-open");
}

function isApiSettingsModalOpen() {
  return document.getElementById("apiSettingsModal")?.classList.contains("is-open");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Request failed (${response.status})`);
  }

  return payload;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeUrl(value, options = {}) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw, window.location.origin);
    const allowedProtocols = new Set(["http:", "https:"]);
    if (options.allowBlob) {
      allowedProtocols.add("blob:");
    }

    if (!allowedProtocols.has(url.protocol)) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

function safeLinkHtml(url, label, options = {}) {
  const safeUrl = sanitizeUrl(url, options);
  if (!safeUrl) {
    return "";
  }

  const attributes = [
    `href="${escapeHtml(safeUrl)}"`,
    options.className ? `class="${escapeHtml(options.className)}"` : "",
    options.download ? "download" : "",
    options.newTab === false ? "" : 'target="_blank" rel="noreferrer"'
  ].filter(Boolean).join(" ");

  return `<a ${attributes}>${escapeHtml(label)}</a>`;
}

function getUploadRemoveButtonId(zoneId) {
  return {
    singleUploadZone: "singleUploadRemoveButton",
    singleUploadZoneSecondary: "singleUploadSecondaryRemoveButton",
    batchPresenterZone: "batchPresenterRemoveButton",
    batchPresenterSecondaryZone: "batchPresenterSecondaryRemoveButton",
    batchProductZone: "batchProductRemoveButton",
    batchProductSecondaryZone: "batchProductSecondaryRemoveButton"
  }[zoneId] || "";
}

function setUploadRemoveButtonVisible(zoneId, visible) {
  const buttonId = getUploadRemoveButtonId(zoneId);
  if (!buttonId) {
    return;
  }

  const button = document.getElementById(buttonId);
  if (!button) {
    return;
  }

  button.classList.toggle("is-hidden", !visible);
  button.disabled = !visible;
}

function clearFileInputValue(inputId) {
  const input = document.getElementById(inputId);
  if (input) {
    input.value = "";
  }
}

function revokePreviewUrl(previewUrl) {
  const safePreviewUrl = sanitizeUrl(previewUrl, { allowBlob: true });
  if (safePreviewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(safePreviewUrl);
  }
}

function setUploadZoneMessage(zone, title, subtitle) {
  if (!zone) {
    return;
  }

  setUploadRemoveButtonVisible(zone.id, false);
  zone.innerHTML = `
    <div class="upload-zone-copy">
      <div class="upload-title">${escapeHtml(title)}</div>
      <div class="upload-subtitle">${escapeHtml(subtitle)}</div>
    </div>
  `;
}

function renderSelectOptions(select, options, selectedValue = "") {
  if (!select) {
    return;
  }

  select.innerHTML = "";
  options.forEach((entry) => {
    const option = document.createElement("option");
    option.value = String(entry.value || "");
    option.textContent = String(entry.label || "");
    if (option.value === String(selectedValue || "")) {
      option.selected = true;
    }
    select.append(option);
  });
}

function cleanMetaString(value) {
  const normalized = String(value || "").trim();
  return normalized || "";
}

function createClientSequenceGroupId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `sequence-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseMetaInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractSequenceMeta(fields = {}) {
  const sequenceCount = parseMetaInteger(fields.sequenceCount);
  if (!sequenceCount || sequenceCount <= 1) {
    return {};
  }

  return Object.fromEntries(Object.entries({
    sequenceTheme: cleanMetaString(fields.sequenceTheme),
    sequenceRole: cleanMetaString(fields.sequenceRole),
    sequenceLeadIn: cleanMetaString(fields.sequenceLeadIn),
    sequenceHandOff: cleanMetaString(fields.sequenceHandOff),
    sequenceIndex: parseMetaInteger(fields.sequenceIndex),
    sequenceCount
  }).filter(([, value]) => value !== null && value !== ""));
}

function getSequenceGroupIdForJob(job) {
  return cleanMetaString(job?.fields?.sequenceGroupId);
}

function isSequenceFinalOutputJob(job) {
  return Boolean(getSequenceGroupIdForJob(job) && job?.fields?.sequenceIsFinalOutput);
}

function getVisibleHistoryJobs(jobs = state.history.jobs) {
  const finalSequenceGroups = new Set((Array.isArray(jobs) ? jobs : [])
    .filter((job) => isSequenceFinalOutputJob(job))
    .map((job) => getSequenceGroupIdForJob(job))
    .filter(Boolean));

  return (Array.isArray(jobs) ? jobs : []).filter((job) => {
    const sequenceGroupId = getSequenceGroupIdForJob(job);
    if (!sequenceGroupId) {
      return true;
    }

    if (isSequenceFinalOutputJob(job)) {
      return true;
    }

    return !finalSequenceGroups.has(sequenceGroupId);
  });
}

function getSingleIdeaMeta(pipeline) {
  return state.single.ideaMeta[pipeline] || {};
}

function setSingleIdeaMeta(pipeline, fields = {}) {
  state.single.ideaMeta[pipeline] = extractSequenceMeta(fields);
}

function clearSingleIdeaMeta(pipeline) {
  state.single.ideaMeta[pipeline] = {};
}

function getBatchIdeaMetaList(pipeline) {
  return state.batch.ideaMeta[pipeline] || [];
}

function setBatchIdeaMetaList(pipeline, items = []) {
  state.batch.ideaMeta[pipeline] = items.map((entry) => extractSequenceMeta(entry));
}

function clearBatchIdeaMeta(pipeline) {
  state.batch.ideaMeta[pipeline] = [];
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 3200);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSingleVideoCount() {
  if (isNarratedMode() || !isStoryboardMode()) {
    return 1;
  }

  return Math.max(1, Number.parseInt(document.getElementById("singleVideoCount")?.value || "1", 10) || 1);
}

function getSlidesDraftCount(job = null) {
  const jobSlideCount = Number.parseInt(job?.fields?.slideCount, 10) || (Array.isArray(job?.slides) ? job.slides.length : 0);
  if (jobSlideCount > 0) {
    return jobSlideCount;
  }

  return Math.max(1, Number.parseInt(document.getElementById("slidesCount")?.value || "5", 10) || 5);
}

function getNarratedSegmentCount(job = null) {
  const jobSegmentCount = Number.parseInt(job?.fields?.segmentCount, 10) || (Array.isArray(job?.segments) ? job.segments.length : 0);
  if (jobSegmentCount > 0) {
    return jobSegmentCount;
  }

  return Math.max(1, Number.parseInt(document.getElementById("narratedSegmentCount")?.value || "3", 10) || 3);
}

function getNarratedTargetLengthSeconds(job = null) {
  const segmentCount = getNarratedSegmentCount(job);
  const generationConfig = job?.providerConfig?.generationConfig || {};
  const profile = getGenerationProfileById(generationConfig.profileId || "")
    || getSelectedGenerationProfile("single");
  const configuredDuration = Number.parseInt(
    generationConfig.duration
      || document.getElementById(getGenerationControlIds("single").durationSelectId)?.value
      || profile?.defaults?.duration
      || "",
    10
  );
  const clipDurationSeconds = Number.isFinite(configuredDuration) && configuredDuration > 0
    ? configuredDuration
    : 8;

  return segmentCount * clipDurationSeconds;
}

function isSingleSequenceRequested() {
  return isStoryboardMode();
}

function resetSingleAutoProgress() {
  state.single.autoProgress = createEmptySingleAutoProgressState();
}

function startSingleAutoProgress(mode = "clip", options = {}) {
  state.single.autoProgress = {
    ...createEmptySingleAutoProgressState(),
    enabled: true,
    mode,
    jobId: String(options.jobId || "").trim()
  };
}

function setSingleAutoProgressJobId(jobId = "") {
  if (!state.single.autoProgress.enabled) {
    return;
  }

  state.single.autoProgress.jobId = String(jobId || "").trim();
}

function isSingleAutoProgressTarget(job) {
  if (!state.single.autoProgress.enabled || !job) {
    return false;
  }

  const trackedJobId = String(state.single.autoProgress.jobId || "").trim();
  return !trackedJobId || trackedJobId === String(job.id || "").trim();
}

function isNarratedCheckpointStatus(status = "") {
  return ["script_ready", "voice_ready", "broll_ready", "ready_to_compose"].includes(status);
}

function isNarratedAutoProgressStatus(status = "") {
  return [
    "creating",
    "analyzing",
    "planning_narration",
    "script_ready",
    "generating_voice",
    "voice_ready",
    "planning_broll",
    "broll_ready",
    "rendering_broll",
    "ready_to_compose",
    "composing"
  ].includes(status);
}

function isSlidesAutoProgressStatus(status = "") {
  return ["creating", "analyzing", "planning_slides", "slides_ready", "rendering_slides"].includes(status);
}

function buildAutoProgressStepsForJob(job) {
  const status = String(job?.status || "");
  if (job?.mode === "narrated") {
    return {
      voice: ["generating_voice", "voice_ready", "planning_broll", "broll_ready", "rendering_broll", "ready_to_compose", "composing", "ready", "distributed"].includes(status),
      broll: ["planning_broll", "rendering_broll", "ready_to_compose", "composing", "ready", "distributed"].includes(status),
      compose: ["composing", "ready", "distributed"].includes(status),
      renderSlides: false
    };
  }

  if (job?.mode === "slides") {
    return {
      voice: false,
      broll: false,
      compose: false,
      renderSlides: ["rendering_slides", "ready", "distributed"].includes(status)
    };
  }

  return {
    voice: false,
    broll: false,
    compose: false,
    renderSlides: false
  };
}

function maybeResumeSingleAutoProgress(job) {
  if (!job || job.isTerminal) {
    return false;
  }

  const mode = getCreationModeForJob(job);
  const shouldResume = mode === "narrated"
    ? isNarratedAutoProgressStatus(job.status)
    : mode === "slides"
      ? isSlidesAutoProgressStatus(job.status)
      : false;
  if (!shouldResume) {
    return false;
  }

  state.single.autoProgress = {
    ...createEmptySingleAutoProgressState(),
    enabled: true,
    mode,
    jobId: String(job.id || "").trim(),
    steps: buildAutoProgressStepsForJob(job)
  };
  return true;
}

function shouldContinueSinglePolling(job) {
  if (!job || job.isTerminal) {
    return false;
  }

  const isDraftStageWithoutAutoProgress = !state.single.autoProgress.enabled && (
    (job.mode === "narrated" && isNarratedCheckpointStatus(job.status))
    || (job.mode === "slides" && job.status === "slides_ready")
  );

  return !isDraftStageWithoutAutoProgress;
}

function resetSingleSequenceState() {
  state.single.sequence = createEmptySingleSequenceState();
}

function formatCountLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function isSlidesJobEditable(job) {
  return ["slides_ready", "failed", "ready", "distributed"].includes(job?.status);
}

function isSlidesJobRenderable(job) {
  return ["slides_ready", "failed", "ready", "distributed"].includes(job?.status);
}

function getSlidesLockedMessage(job) {
  if (job?.status === "rendering_slides") {
    return "Slide video is already rendering. Give it a moment to finish.";
  }

  if (job?.status === "planning_slides") {
    return "Slide planning is still finishing. Wait for the draft to finish loading, then render.";
  }

  return "Slide draft is not ready for editing yet. Refresh the job and try again.";
}

function formatJobStatusLabel(status, options = {}) {
  const normalized = String(status || "").trim();
  const aheadCount = Number.isFinite(options.aheadCount) ? options.aheadCount : 0;

  switch (normalized) {
    case "awaiting_generation":
      return aheadCount > 0 ? `Queued (${aheadCount} ahead)` : "Queued";
    case "submitting":
      return "Starting render";
    case "polling":
      return "Rendering now";
    case "creating":
      return "Preparing";
    case "script_ready":
      return "Draft ready";
    case "slides_ready":
      return "Slides ready";
    case "generating_voice":
      return "Generating voice";
    case "broll_ready":
      return "B-roll planned";
    case "planning_broll":
      return "Planning B-roll";
    case "rendering_broll":
      return "Rendering B-roll";
    case "rendering_slides":
      return "Rendering slides";
    case "ready_to_compose":
      return "Ready to compose";
    case "composing":
      return "Composing final video";
    case "voice_ready":
      return "Voice ready";
    case "ready":
      return "Ready";
    case "distributed":
      return "Posted";
    case "failed":
      return "Failed";
    case "stopped":
      return "Stopped";
    default:
      return normalized.replaceAll("_", " ");
  }
}

function getBatchGenerationAheadCount(targetItem) {
  const index = state.batch.items.indexOf(targetItem);
  if (index <= 0) {
    return 0;
  }

  return state.batch.items
    .slice(0, index)
    .filter((item) => {
      const status = item.job?.status || item.status || "";
      return item.jobId && ["awaiting_generation", "submitting", "polling"].includes(status);
    })
    .length;
}

function getBatchItemStatusCopy(item, status, scriptPreview = "") {
  const aheadCount = getBatchGenerationAheadCount(item);

  if (item.note) {
    return item.note;
  }

  if (item.job?.error) {
    return item.job.error;
  }

  if (status === "creating") {
    return "Preparing this clip before it joins the render queue.";
  }

  if (status === "awaiting_generation") {
    return aheadCount > 0
      ? `${formatCountLabel(aheadCount, "earlier clip")} from this batch ${aheadCount === 1 ? "is" : "are"} ahead. This clip is waiting for the next render slot.`
      : "This clip is ready and waiting for the next render slot.";
  }

  if (status === "submitting") {
    return "Sending this clip to the video model now.";
  }

  if (status === "polling") {
    return "This clip is rendering now. The rest of the batch will follow in order.";
  }

  if (status === "stopped") {
    return "Stopped before this clip was queued.";
  }

  if (status === "ready" || status === "distributed") {
    return scriptPreview || "Clip finished successfully.";
  }

  return scriptPreview || "Queued for processing.";
}

function getSingleSequenceAheadCount(targetItem) {
  const index = state.single.sequence.items.indexOf(targetItem);
  if (index <= 0) {
    return 0;
  }

  return state.single.sequence.items
    .slice(0, index)
    .filter((item) => {
      const status = item.job?.status || item.status || "";
      return item.jobId && ["awaiting_generation", "submitting", "polling"].includes(status);
    })
    .length;
}

function getSingleSequenceStatusCopy(item, status, scriptPreview = "") {
  const aheadCount = getSingleSequenceAheadCount(item);

  if (item.note) {
    return item.note;
  }

  if (item.job?.error) {
    return item.job.error;
  }

  if (status === "creating") {
    return "Preparing this sequence clip.";
  }

  if (status === "awaiting_generation") {
    return aheadCount > 0
      ? `${formatCountLabel(aheadCount, "earlier clip")} from this sequence ${aheadCount === 1 ? "is" : "are"} ahead.`
      : "This clip is ready and waiting for the next render slot.";
  }

  if (status === "submitting") {
    return "Sending this clip to the video model now.";
  }

  if (status === "polling") {
    return "This clip is rendering now.";
  }

  if (status === "failed") {
    return item.job?.error || "This clip failed.";
  }

  if (status === "ready" || status === "distributed") {
    return scriptPreview || "Clip finished successfully.";
  }

  return scriptPreview || "Waiting for this clip.";
}

function hasSingleSequenceRun() {
  return state.single.sequence.items.length > 0;
}

function isSingleSequenceTerminal() {
  return hasSingleSequenceRun()
    && state.single.sequence.items.every((item) => ["ready", "distributed", "failed", "stopped"].includes(item.job?.status || item.status));
}

function hasSingleSequencePendingJobs() {
  return state.single.sequence.items.some((item) => !["ready", "distributed", "failed", "stopped"].includes(item.job?.status || item.status));
}

function getReadySingleSequenceResult() {
  const result = state.single.sequence.compilation.result;
  return result?.status === "ready" ? result : null;
}

function getActiveSingleOutputVideoUrl() {
  return getReadySingleSequenceResult()?.videoUrl || state.single.job?.videoUrl || "";
}

function getActiveSingleOutputThumbnailUrl() {
  if (getReadySingleSequenceResult()) {
    return "";
  }

  return state.single.job?.thumbnailUrl || "";
}

function chooseFeaturedSingleSequenceJob() {
  const priorityStatuses = ["failed", "analyzing", "scripting", "captioning", "prompting", "awaiting_generation", "submitting", "polling"];
  for (const status of priorityStatuses) {
    const match = state.single.sequence.items.find((item) => (item.job?.status || item.status) === status);
    if (match?.job) {
      return match.job;
    }
  }

  return state.single.sequence.items.find((item) => item.job)?.job || null;
}

function getSingleProductCatalogImageUrls() {
  if (state.activePipeline !== "product" || state.single.imageUrl) {
    return [];
  }

  return getCatalogProductImageUrls(getSelectedCatalogProduct("single"));
}

function getEffectiveSingleImageUrls() {
  const uploaded = [state.single.imageUrl, state.single.secondaryImageUrl].filter(Boolean);
  if (uploaded.length > 0) {
    return uploaded;
  }

  return getSingleProductCatalogImageUrls();
}

function getEffectiveSingleImageUrl() {
  return getEffectiveSingleImageUrls()[0] || "";
}

function getNarratedOptionEntries(key) {
  return Array.isArray(state.system.narratedOptions?.[key]) ? state.system.narratedOptions[key] : [];
}

function getSelectedNarratedTemplate() {
  const templateId = document.getElementById("narratedTemplate")?.value || "";
  return getNarratedOptionEntries("templates").find((template) => template.id === templateId) || null;
}

function getSelectedNarratedTemplateLabel() {
  return getSelectedNarratedTemplate()?.label || "Template";
}

function shouldAutoSyncNarratedHookAngle() {
  return isNarratedMode() || state.single.job?.mode === "narrated";
}

function applySuggestedNarratedHookAngle(hookAngle, options = {}) {
  const input = document.getElementById("narratedHookAngle");
  const nextHookAngle = String(hookAngle || "").trim();
  if (!input || !nextHookAngle) {
    return;
  }

  const onlyFillMissing = Boolean(options.onlyFillMissing);
  if (onlyFillMissing && input.value.trim()) {
    return;
  }

  input.value = nextHookAngle;
  renderCreateSummaryCard();
}

function populateNarratedOptionControls() {
  renderSelectOptions(document.getElementById("narratedVoice"), getNarratedOptionEntries("voices").map((entry) => ({
    value: entry.id,
    label: entry.label
  })), document.getElementById("narratedVoice")?.value || "rachel");

  renderSelectOptions(document.getElementById("narratedPlatformPreset"), getNarratedOptionEntries("platformPresets").map((entry) => ({
    value: entry.id,
    label: entry.label
  })), document.getElementById("narratedPlatformPreset")?.value || "tiktok");

  renderSelectOptions(document.getElementById("narratedTemplate"), getNarratedOptionEntries("templates").map((entry) => ({
    value: entry.id,
    label: entry.label
  })), document.getElementById("narratedTemplate")?.value || "problem_solution_result");

  renderSelectOptions(document.getElementById("narratedNarratorTone"), getNarratedOptionEntries("narratorTones").map((entry) => ({
    value: entry.id,
    label: entry.label
  })), document.getElementById("narratedNarratorTone")?.value || "brand_default");

  renderSelectOptions(document.getElementById("narratedCtaStyle"), getNarratedOptionEntries("ctaStyles").map((entry) => ({
    value: entry.id,
    label: entry.label
  })), document.getElementById("narratedCtaStyle")?.value || "soft");

  renderSelectOptions(document.getElementById("narratedVisualIntensity"), getNarratedOptionEntries("visualIntensityLevels").map((entry) => ({
    value: entry.id,
    label: entry.label
  })), document.getElementById("narratedVisualIntensity")?.value || "balanced");
}

function renderNarratedTemplateMeta() {
  const description = document.getElementById("narratedTemplateDescription");
  const fit = document.getElementById("narratedTemplateFit");
  const hookPrompt = document.getElementById("narratedHookAnglePrompt");
  const template = getSelectedNarratedTemplate();
  const brand = getActiveBrand();
  if (!description || !fit || !hookPrompt) {
    return;
  }

  if (!template) {
    description.textContent = "Choose a narrated format template to shape the hook, script structure, pacing, and B-roll plan.";
    fit.textContent = "Template guidance will appear here.";
    hookPrompt.textContent = "Add a hook angle if you want to steer the opening line more tightly. Surprise me topic picks can auto-fill this with one of the current TikTok hook patterns.";
    return;
  }

  description.textContent = template.description;
  const isRecommendedBrand = Array.isArray(template.recommendedBrandIds) && template.recommendedBrandIds.includes(brand?.id);
  const pipelineFits = Array.isArray(template.recommendedPipelines)
    ? template.recommendedPipelines.map((pipeline) => getPipelineLabel(pipeline)).join(", ")
    : "any narrated run";
  fit.textContent = `${isRecommendedBrand ? "Strong fit" : "Usable fit"} for ${brand?.name || "this brand"} • Best for ${pipelineFits.toLowerCase()} narrated videos.`;
  const trendingHookCount = getNarratedOptionEntries("trendingHooks").length;
  hookPrompt.textContent = trendingHookCount > 0
    ? `Hook angle tip: ${template.description} Surprise me topic picks will auto-suggest one of ${trendingHookCount} current TikTok hook patterns.`
    : `Hook angle tip: ${template.description}`;
}

function getEffectiveEduLength() {
  const durationValue = document.getElementById(getGenerationControlIds("single").durationSelectId)?.value || "";
  const durationSeconds = Number.parseInt(durationValue, 10);
  return Number.isFinite(durationSeconds) && durationSeconds > 0 ? `${durationSeconds}s` : "15s";
}

function getActiveSingleMode() {
  return state.single.job?.mode || state.single.creationMode || "clip";
}

function renderVideoSpinnerCopy(job = state.single.job) {
  const label = document.getElementById("videoSpinnerLabel");
  if (!label) {
    return;
  }

  const activeMode = getActiveSingleMode();
  let text = activeMode === "narrated"
    ? "Waiting for B-roll video generation."
    : activeMode === "slides"
      ? "Waiting for slide render."
      : "Video is generating...";

  if (state.single.sequence.compilation.loading) {
    text = "Compiling final sequence...";
  } else if (job?.stepState?.video === "running") {
    text = normalizeStepLabel(job, "video");
  }

  label.textContent = text;
}

function renderCreatePromptCardMeta() {
  const title = document.getElementById("stepPromptTitle");
  const scriptTitle = document.getElementById("stepScriptTitle");
  const videoTitle = document.getElementById("stepVideoTitle");
  if (!title) {
    return;
  }

  const activeMode = getActiveSingleMode();
  if (scriptTitle) {
    scriptTitle.textContent = activeMode === "narrated"
      ? "Narration draft"
      : activeMode === "slides"
        ? "Slide draft"
        : "Script";
  }
  title.textContent = activeMode === "narrated"
    ? "B-roll prompts"
    : activeMode === "slides"
      ? "Deck summary"
      : "Video prompt";
  if (videoTitle) {
    videoTitle.textContent = activeMode === "slides"
        ? "Slide render"
        : "Video generation";
  }
  renderVideoSpinnerCopy();

  if (state.single.job) {
    return;
  }

  if (activeMode === "narrated") {
    setStepState("prompt", "waiting", "Waiting for narration draft.");
    setStepState("video", "waiting", "Waiting for B-roll prompts.");
    return;
  }

  if (activeMode === "slides") {
    setStepState("prompt", "waiting", "Waiting for slide draft.");
    setStepState("video", "waiting", "Waiting for slide render.");
    return;
  }
  setStepState("video", "waiting", "Waiting for prompt.");
}

function renderNarratedModeUi() {
  const isNarrated = isNarratedMode();
  const isStoryboard = isStoryboardMode();
  const isSlides = isSlidesMode();
  const isClip = !isNarrated && !isStoryboard && !isSlides;
  const videoCountSelect = document.getElementById("singleVideoCount");
  const narratedSegmentCountSelect = document.getElementById("narratedSegmentCount");
  const storyboardFields = document.getElementById("singleStoryboardFields");
  const slidesFields = document.getElementById("singleSlidesFields");
  document.getElementById("creationModeClip")?.classList.toggle("is-active", isClip);
  document.getElementById("creationModeStoryboard")?.classList.toggle("is-active", isStoryboard);
  document.getElementById("creationModeSlides")?.classList.toggle("is-active", isSlides);
  document.getElementById("creationModeNarrated")?.classList.toggle("is-active", isNarrated);
  document.getElementById("creationModeClip")?.setAttribute("aria-pressed", isClip ? "true" : "false");
  document.getElementById("creationModeStoryboard")?.setAttribute("aria-pressed", isStoryboard ? "true" : "false");
  document.getElementById("creationModeSlides")?.setAttribute("aria-pressed", isSlides ? "true" : "false");
  document.getElementById("creationModeNarrated")?.setAttribute("aria-pressed", isNarrated ? "true" : "false");
  document.getElementById("narratedFields")?.classList.toggle("is-hidden", !isNarrated);
  storyboardFields?.classList.toggle("is-hidden", !isStoryboard);
  slidesFields?.classList.toggle("is-hidden", !isSlides);
  renderNarratedTemplateMeta();
  renderCreatePromptCardMeta();
  if (videoCountSelect) {
    videoCountSelect.disabled = !isStoryboard;
    if (!isStoryboard) {
      videoCountSelect.value = "1";
    } else if (Number.parseInt(videoCountSelect.value || "0", 10) < 1) {
      videoCountSelect.value = "1";
    }
  }
  if (narratedSegmentCountSelect && Number.parseInt(narratedSegmentCountSelect.value || "0", 10) < 1) {
    narratedSegmentCountSelect.value = "1";
  }
  updateSingleUploadMessaging();
  const modelDescription = document.getElementById("generationModelDescription");
  const profile = getSelectedGenerationProfile("single");
  if (modelDescription && profile) {
    modelDescription.textContent = isNarrated
      ? `${profile.description} Narrated drafts can start without a reference image. This model's imagery settings apply later during B-roll rendering.`
      : isSlides
        ? `${profile.description} Slides mode renders with the built-in slideshow composer. These model settings stay attached to the run for consistency, but they are not used to render the deck itself.`
      : profile.description;
  }
}

function setSingleCreationMode(mode) {
  const nextMode = ["clip", "storyboard", "slides", "narrated"].includes(mode) ? mode : "clip";
  const modeChanged = state.single.creationMode !== nextMode;
  state.single.creationMode = nextMode;
  if (modeChanged && state.single.job) {
    resetSingleJob({ keepImage: true });
  }
  renderNarratedModeUi();
  renderSingleSequenceCard();
  renderNarratedSegmentsCard();
  renderSlidesDraftCard();
  renderIdeaAssist();
  updateSingleRunState();
  renderCreateSummaryCard();
}

function updateSingleUploadMessaging() {
  const uploadHeading = document.getElementById("singleUploadHeading");
  const uploadCopy = document.getElementById("singleUploadCopy");
  if (!uploadHeading || !uploadCopy) {
    return;
  }

  if (isNarratedMode()) {
    uploadHeading.textContent = "Add optional reference image";
    uploadCopy.textContent = "Narrated drafts can start from the topic alone. Add a product, category, or lifestyle image only if you want tighter visual continuity during B-roll generation.";
    if (!state.single.imageUrl) {
      setZoneEmpty(
        "singleUploadZone",
        "Drop a reference image here",
        "Optional for narrated planning. Helpful for category, lifestyle, or product continuity later"
      );
    }
    return;
  }

  if (isSlidesMode()) {
    uploadHeading.textContent = "Add optional slide reference image";
    uploadCopy.textContent = "Slide drafts can start from the idea alone. Add a product or lifestyle image only if you want the deck visually anchored to a real reference.";
    if (!state.single.imageUrl) {
      setZoneEmpty(
        "singleUploadZone",
        "Drop a reference image here",
        "Optional for slide drafting. Helpful when you want the cover and deck tied to a real product or lifestyle image"
      );
    }
    return;
  }

  if (state.activePipeline === "product") {
    uploadHeading.textContent = "Choose a product or upload an override";
    uploadCopy.textContent = "Select an imported catalog product to use its product imagery automatically, or upload a custom product image if you want to override it.";
  } else {
    uploadHeading.textContent = "Upload presenter image";
    uploadCopy.textContent = "Use one image as the source character for the full run.";
  }

  if (!state.single.imageUrl) {
    setZoneEmpty("singleUploadZone", "Drop an image here", "or click to choose a file");
  }
}

function updateSingleRunState() {
  const runButton = document.getElementById("runButton");
  const runHint = document.getElementById("runHint");
  const sequenceHint = document.getElementById("singleSequenceHint");
  const profile = getSelectedGenerationProfile();
  const effectiveImageUrls = getEffectiveSingleImageUrls();
  const selectedProduct = getSelectedCatalogProduct("single");
  const sequenceCount = getSingleVideoCount();
  const slideCount = getSlidesDraftCount();
  const narratedSegmentCount = getNarratedSegmentCount();
  const isStoryboard = isStoryboardMode();
  const isSlides = isSlidesMode();
  const generationConfig = buildGenerationConfig("single");
  const validationMessage = !isNarratedMode() && !isSlides
    ? getGenerationValidationMessage({
      generationConfig,
      imageUrls: effectiveImageUrls
    })
    : "";
  if (!runButton || !runHint) {
    return;
  }

  runHint.classList.remove("is-success", "is-warning");
  if (sequenceHint) {
    sequenceHint.textContent = isNarratedMode()
      ? narratedSegmentCount === 1
        ? "This run will build one voiced part and turn it into one narrated video after voice-over and B-roll generation."
        : `This run will build ${narratedSegmentCount} voiced parts and stitch them into one narrated video after voice-over and B-roll generation.`
      : isSlides
        ? slideCount === 1
          ? "This run will build one slide and render it as one vertical slideshow video with a PNG cover."
          : `This run will build ${slideCount} slides and stitch them into one vertical slideshow video and PNG cover.`
      : isStoryboard
      ? sequenceCount === 1
        ? "This run will create one storyboard clip as the final video output."
        : `This run will create ${sequenceCount} linked clips and stitch them into one final video.`
      : "Single clip mode generates one video from the current pipeline inputs.";
    sequenceHint.classList.toggle("is-hidden", false);
  }

  if (state.single.uploading) {
    runButton.disabled = true;
    runButton.textContent = "Uploading image...";
    runHint.textContent = "Finishing your upload before the pipeline can start.";
    runHint.classList.add("is-warning");
    return;
  }

  if (state.single.running) {
    runButton.disabled = true;
    runButton.textContent = isNarratedMode()
      ? "Building narrated draft..."
      : isSlides
        ? "Building slide draft..."
      : isStoryboard
        ? sequenceCount === 1 ? "Starting storyboard clip..." : "Starting storyboard..."
        : "Starting...";
    runHint.textContent = isNarratedMode()
      ? narratedSegmentCount === 1
        ? "Planning the one-part narrated draft now. If a reference image is attached, it will guide visual continuity."
        : `Planning the ${narratedSegmentCount}-part narrated draft now. If a reference image is attached, it will guide visual continuity.`
      : isSlides
        ? slideCount === 1
          ? "Planning the one-slide deck now. If a reference image is attached, it can inform the deck cover and visual direction."
          : `Planning the ${slideCount}-slide deck now. If a reference image is attached, it can inform the deck cover and visual direction.`
      : isStoryboard
      ? sequenceCount === 1
        ? "Building the storyboard clip now."
        : "Building the linked clips and queueing them for stitching."
      : "Creating the job and kicking off the pipeline.";
    return;
  }

  runButton.textContent = isNarratedMode()
    ? "Build narrated draft"
    : isSlides
      ? "Build slide draft"
    : isStoryboard
      ? sequenceCount === 1 ? "Run storyboard clip" : "Run storyboard sequence"
      : "Run single clip";
  runButton.disabled = validationMessage
    ? true
    : isNarratedMode() || isSlides
      ? false
      : effectiveImageUrls.length === 0;

  if (validationMessage) {
    runHint.textContent = validationMessage;
    runHint.classList.add("is-warning");
    renderSpendSummary();
    renderCreateSummaryCard();
    return;
  }

  if (effectiveImageUrls.length > 0) {
    if (state.activePipeline === "product" && !state.single.imageUrl && selectedProduct) {
      runHint.textContent = selectedProduct.imageUrl
        ? "Catalog product selected. Ready to run with imported product imagery."
        : "Selected product has no imported image yet. Upload a custom image to run.";
    } else if (isNarratedMode()) {
      runHint.textContent = narratedSegmentCount === 1
        ? "Reference image attached. Build the narrated draft now. Edits here are optional before voice-over and B-roll."
        : `Reference image attached. Build the ${narratedSegmentCount}-part narrated draft now. Edits here are optional before voice-over and B-roll.`;
    } else if (isSlides) {
      runHint.textContent = slideCount === 1
        ? "Reference image attached. Build the slide draft now. Edits here are optional before the final slideshow render."
        : `Reference image attached. Build the ${slideCount}-slide draft now. Edits here are optional before the final slideshow render.`;
    } else {
      runHint.textContent = isStoryboard
        ? sequenceCount === 1
          ? "Image uploaded. Ready to create one storyboard clip."
          : `Image uploaded. Ready to create ${sequenceCount} linked clips and stitch them together.`
        : profile?.maxImages > 1 && !state.single.secondaryImageUrl
          ? "Primary image uploaded. You can add a second image, or run now."
          : "Image uploaded. Ready to run the full pipeline.";
    }
    runHint.classList.add("is-success");
    renderSpendSummary();
    renderCreateSummaryCard();
    return;
  }

  runHint.textContent = isNarratedMode()
    ? narratedSegmentCount === 1
      ? "Reference image is optional for narrated drafting. You can run now with just the topic to build one narrated part, or add an image later for tighter B-roll continuity."
      : `Reference image is optional for narrated drafting. You can run now with just the topic to build ${narratedSegmentCount} stitched parts, or add one later for tighter B-roll continuity.`
    : isSlides
      ? slideCount === 1
        ? "Reference image is optional for slide drafting. You can run now with just the idea to build one slide, or add one for a more product-led deck."
        : `Reference image is optional for slide drafting. You can run now with just the idea to build ${slideCount} stitched slides, or add one for a more product-led deck.`
    : state.activePipeline === "product"
      ? "Choose an imported product or upload one image to enable the pipeline."
      : "Upload one image to enable the pipeline.";
  runHint.classList.add("is-warning");
  renderSpendSummary();
  renderCreateSummaryCard();
}

function initDropZone(zoneId, fileInputId) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(fileInputId);

  ["dragenter", "dragover"].forEach((eventName) => {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.remove("is-dragover");
    });
  });

  zone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (!file) {
      return;
    }

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event("change"));
  });
}

function getActiveBrandId() {
  return document.getElementById("brandSelect").value;
}

function getActiveBrand() {
  return state.brands.find((brand) => brand.id === getActiveBrandId()) || state.brands[0];
}

function getActiveBrandProducts() {
  return getActiveBrand()?.productCatalog || [];
}

function getCatalogProductById(productId) {
  return getActiveBrandProducts().find((product) => product.id === productId) || null;
}

function getCatalogProductSelectId(scope = "single") {
  return scope === "batch" ? "batch-product-catalog-select" : "product-catalog-select";
}

function getSelectedCatalogProduct(scope = "single") {
  return getCatalogProductById(document.getElementById(getCatalogProductSelectId(scope))?.value || "");
}

function getCatalogProductImageUrls(product) {
  if (!product) {
    return [];
  }

  return Array.from(new Set([product.imageUrl, ...(Array.isArray(product.galleryImages) ? product.galleryImages : [])]
    .map((value) => String(value || "").trim())
    .filter(Boolean)));
}

function getProductBenefitText(product) {
  if (!product) {
    return "";
  }

  return product.primaryBenefit || product.benefits?.[0] || "";
}

function getGenerationControlIds(scope = "single") {
  if (scope === "batch") {
    return {
      selectId: "batchGenerationProfile",
      fallbackSelectId: "batchGenerationFallbackProfile",
      descriptionId: "batchGenerationModelDescription",
      durationFieldId: "batchDurationField",
      durationSelectId: "batchGenerationDuration",
      resolutionFieldId: "batchResolutionField",
      resolutionSelectId: "batchGenerationResolution",
      audioFieldId: "batchAudioField",
      audioInputId: "batchGenerationAudio",
      multiShotsFieldId: "batchMultiShotsField",
      multiShotsInputId: "batchGenerationMultiShots",
      elementsFieldId: "batchElementsField",
      elementsInputId: "batchGenerationUseElements"
    };
  }

  return {
    selectId: "generationProfile",
    fallbackSelectId: "generationFallbackProfile",
    descriptionId: "generationModelDescription",
    durationFieldId: "durationField",
    durationSelectId: "generationDuration",
    resolutionFieldId: "resolutionField",
    resolutionSelectId: "generationResolution",
    audioFieldId: "audioField",
    audioInputId: "generationAudio",
    multiShotsFieldId: "multiShotsField",
    multiShotsInputId: "generationMultiShots",
    elementsFieldId: "elementsField",
    elementsInputId: "generationUseElements"
  };
}

function getSelectedGenerationProfile(scope = "single") {
  const profileId = document.getElementById(getGenerationControlIds(scope).selectId)?.value || state.generationProfiles[0]?.id;
  return state.generationProfiles.find((profile) => profile.id === profileId) || state.generationProfiles[0] || null;
}

function getSelectedFallbackProfile(scope = "single") {
  const controlIds = getGenerationControlIds(scope);
  const select = document.getElementById(controlIds.fallbackSelectId);
  const profileId = String(select?.value || "").trim();
  if (!profileId) {
    return null;
  }

  return state.generationProfiles.find((profile) => profile.id === profileId) || null;
}

function getGenerationProfileById(profileId = "") {
  const normalizedProfileId = String(profileId || "").trim();
  if (!normalizedProfileId) {
    return null;
  }

  return state.generationProfiles.find((profile) => profile.id === normalizedProfileId) || null;
}

function getIdeaAssistState(pipeline = state.activePipeline) {
  if (!state.ideaAssist.byPipeline[pipeline]) {
    state.ideaAssist.byPipeline[pipeline] = {
      suggestions: [],
      analysis: ""
    };
  }

  return state.ideaAssist.byPipeline[pipeline];
}

function clearIdeaAssistState() {
  state.ideaAssist.byPipeline = {
    edu: { suggestions: [], analysis: "" },
    comedy: { suggestions: [], analysis: "" },
    product: { suggestions: [], analysis: "" }
  };
}

function clearAllSingleIdeaMeta() {
  ["edu", "comedy", "product"].forEach((pipeline) => clearSingleIdeaMeta(pipeline));
}

function clearAllBatchIdeaMeta() {
  ["edu", "comedy", "product"].forEach((pipeline) => clearBatchIdeaMeta(pipeline));
}

function getIdeaAssistMeta(pipeline = state.activePipeline) {
  const catalog = {
    edu: {
      label: "Need a topic?",
      fieldName: "topic",
      readyMessage: "Your topic will be used. Click a card to swap it fast.",
      emptyMessage: "Leave it blank and the app will pitch education topics automatically.",
      loadingMessage: "Generating fresh education topics..."
    },
    comedy: {
      label: "Need a scenario?",
      fieldName: "scenario",
      readyMessage: "Your scenario will be used. Click a card if you want a different angle.",
      emptyMessage: "Leave it blank and the app will pitch comedy scenarios automatically.",
      loadingMessage: "Generating fresh comedy scenarios..."
    },
    product: {
      label: "Need a product angle?",
      fieldName: "product angle",
      readyMessage: "Your product angle will be used. Click a card to swap it.",
      emptyMessage: "Pick a catalog product or leave product details blank and the app will generate product plus benefit angles.",
      loadingMessage: "Generating fresh product angles..."
    }
  };

  return catalog[pipeline];
}

function fieldsNeedIdea(pipeline, fields = getPipelineFields(pipeline)) {
  if (pipeline === "edu") {
    return !fields.topic;
  }

  if (pipeline === "comedy") {
    return !fields.scenario;
  }

  return !fields.productName || !fields.benefit;
}

function formatUsd(value) {
  if (typeof value !== "number") {
    return "Estimate unavailable";
  }

  return `$${value.toFixed(3)} est.`;
}

function getBatchRequestedClipCount() {
  return ["batch-edu-count", "batch-comedy-count", "batch-product-count"]
    .map((id) => Number.parseInt(document.getElementById(id)?.value || "0", 10) || 0)
    .reduce((total, value) => total + value, 0);
}

function estimateProfileCost(profile, scope = "single") {
  if (!profile) {
    return null;
  }

  const controlIds = getGenerationControlIds(scope);

  if (profile.pricing?.type === "per_second") {
    const duration = Number.parseInt(
      document.getElementById(controlIds.durationSelectId)?.value || profile.defaults?.duration || "0",
      10
    );
    return Number.isFinite(duration) ? Number((duration * Number(profile.pricing.rateUsd || 0)).toFixed(3)) : null;
  }

  if (profile.pricing?.type === "fixed") {
    return Number(profile.pricing.amountUsd || 0);
  }

  return null;
}

function estimateCurrentRunCost(scope = state.viewMode) {
  const normalizedScope = scope === "batch" ? "batch" : "single";
  const profile = getSelectedGenerationProfile(scope);
  const perVideoCost = estimateProfileCost(profile, normalizedScope);
  if (normalizedScope !== "batch") {
    return perVideoCost;
  }

  const clipCount = getBatchRequestedClipCount();
  if (clipCount <= 0) {
    return 0;
  }

  return typeof perVideoCost === "number"
    ? Number((perVideoCost * clipCount).toFixed(3))
    : null;
}

function getHistoryJobsForSidebar() {
  const priority = (job) => {
    if (ACTIVE_JOB_STATUSES.includes(job.status)) {
      return 0;
    }
    if (job.status === "failed") {
      return 1;
    }
    if (job.status === "ready") {
      return 2;
    }
    return 3;
  };

  return [...getVisibleHistoryJobs()]
    .sort((left, right) => {
      const priorityDiff = priority(left) - priority(right);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
    })
    .slice(0, 6);
}

function getJobCounts(jobs = getVisibleHistoryJobs()) {
  return jobs.reduce((counts, job) => {
    if (ACTIVE_JOB_STATUSES.includes(job.status)) {
      counts.active += 1;
    } else if (job.status === "failed") {
      counts.failed += 1;
    } else if (job.status === "ready") {
      counts.ready += 1;
    } else if (job.status === "distributed") {
      counts.published += 1;
    }

    return counts;
  }, {
    active: 0,
    failed: 0,
    ready: 0,
    published: 0
  });
}

function renderBrandSelect() {
  const select = document.getElementById("brandSelect");
  const previousValue = select?.value || "";
  renderSelectOptions(select, state.brands.map((brand) => ({
    value: brand.id,
    label: brand.name
  })), previousValue || state.brands[0]?.id || "");
}

function renderActiveBrandSummary() {
  const summary = document.getElementById("activeBrandSummary");
  if (!summary) {
    return;
  }

  const brand = getActiveBrand();
  if (!brand) {
    summary.textContent = "Add a brand to load products, defaults, and publishing destinations.";
    return;
  }

  const productCount = Array.isArray(brand.productCatalog) ? brand.productCatalog.length : 0;
  const channels = [brand.socialAccounts?.tiktokHandle, brand.socialAccounts?.instagramHandle, brand.socialAccounts?.youtubeHandle]
    .filter(Boolean)
    .length;
  summary.textContent = `${brand.category || "Uncategorized"} brand • ${productCount} imported product${productCount === 1 ? "" : "s"} • ${channels} social destination${channels === 1 ? "" : "s"}`;
}

function renderOperationsSummary() {
  const counts = getJobCounts();
  const mappings = [
    ["queueActiveCount", counts.active],
    ["queueFailedCount", counts.failed],
    ["queueReadyCount", counts.ready],
    ["queuePublishedCount", counts.published],
    ["topbarActiveCount", counts.active],
    ["topbarFailedCount", counts.failed],
    ["topbarReadyCount", counts.ready]
  ];

  mappings.forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = String(value);
    }
  });
}

function renderViewScopedSections() {
  document.querySelectorAll("[data-view-scope]").forEach((element) => {
    const allowedViews = String(element.dataset.viewScope || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    element.classList.toggle("is-hidden", allowedViews.length > 0 && !allowedViews.includes(state.viewMode));
  });
}

function moveNodeToSlot(nodeId, slotId) {
  const node = document.getElementById(nodeId);
  const slot = document.getElementById(slotId);
  if (!node || !slot || node.parentElement === slot) {
    return;
  }

  slot.appendChild(node);
}

function mountWorkflowCards() {
  moveNodeToSlot("step-script", state.viewMode === "review" ? "reviewScriptSlot" : "createScriptSlot");
  moveNodeToSlot("narratedSegmentsCard", state.viewMode === "review" ? "reviewNarratedSlot" : "createNarratedSlot");
  moveNodeToSlot("slidesDraftCard", state.viewMode === "review" ? "reviewSlidesSlot" : "createSlidesSlot");
  moveNodeToSlot("step-captions", state.viewMode === "review" ? "reviewCaptionsSlot" : "createCaptionsSlot");
  moveNodeToSlot("singleSequenceCard", state.viewMode === "outputs" ? "outputsSequenceSlot" : "createSequenceSlot");
  moveNodeToSlot("step-video", state.viewMode === "outputs" ? "outputsVideoSlot" : "createVideoSlot");
  moveNodeToSlot("step-distribution", state.viewMode === "publish" ? "publishDistributionSlot" : "createDistributionSlot");
}

function mountDashboardShell() {
  moveNodeToSlot("brandWorkspaceSection", "workspaceBrandSlot");
  moveNodeToSlot("pipelineLibrarySection", "createPipelineSlot");
  moveNodeToSlot("operationsSummarySection", "overviewOperationsSlot");
  moveNodeToSlot("spendSummarySection", "overviewSpendSlot");
  moveNodeToSlot("recentActivitySection", "overviewHistorySlot");
  mountWorkflowCards();
}

function getCurrentRunScope() {
  if (state.viewMode === "create" && state.createWorkspaceMode === "batch") {
    return "batch";
  }

  return "single";
}

function setCreateWorkspaceMode(mode) {
  state.createWorkspaceMode = mode === "batch"
    ? "batch"
    : mode === "strategy"
      ? "strategy"
      : "single";
  const isSingle = state.createWorkspaceMode === "single";
  const isBatch = state.createWorkspaceMode === "batch";
  const isStrategy = state.createWorkspaceMode === "strategy";
  document.getElementById("workspaceModeSingle")?.classList.toggle("is-active", isSingle);
  document.getElementById("workspaceModeSingle")?.setAttribute("aria-pressed", isSingle ? "true" : "false");
  document.getElementById("workspaceModeBatch")?.classList.toggle("is-active", isBatch);
  document.getElementById("workspaceModeBatch")?.setAttribute("aria-pressed", isBatch ? "true" : "false");
  document.getElementById("workspaceModeStrategy")?.classList.toggle("is-active", isStrategy);
  document.getElementById("workspaceModeStrategy")?.setAttribute("aria-pressed", isStrategy ? "true" : "false");
  document.getElementById("singleMode")?.classList.toggle("is-hidden", !isSingle || state.viewMode !== "create");
  document.getElementById("batchMode")?.classList.toggle("is-hidden", !isBatch || state.viewMode !== "create");
  document.getElementById("strategyMode")?.classList.toggle("is-hidden", !isStrategy || state.viewMode !== "create");
  document.getElementById("createPipelineSlot")?.classList.toggle("is-hidden", isStrategy);
  mountWorkflowCards();
  renderSpendSummary();
  renderStrategyStudio();
}

function setQueueSearch(value = "") {
  state.dashboard.queueSearch = String(value || "").trim();
  renderRunsView();
}

function getDashboardSelectionKey(kind) {
  return `${kind}JobId`;
}

function setDashboardSelection(kind, jobId = "") {
  state.dashboard[getDashboardSelectionKey(kind)] = jobId;
}

function getDashboardSelection(kind) {
  return state.dashboard[getDashboardSelectionKey(kind)] || "";
}

function ensureDashboardSelection(kind, jobs = [], preferredJobId = "") {
  const preferredMatch = preferredJobId
    ? jobs.find((job) => job.id === preferredJobId)
    : null;
  if (preferredMatch) {
    setDashboardSelection(kind, preferredMatch.id);
    return preferredMatch;
  }

  const current = getDashboardSelection(kind);
  const match = jobs.find((job) => job.id === current);
  if (match) {
    return match;
  }

  const fallback = jobs[0] || null;
  setDashboardSelection(kind, fallback?.id || "");
  return fallback;
}

function focusDashboardJob(jobId, kind = "outputs") {
  const targetView = kind === "review"
    ? "review"
    : kind === "publish"
      ? "publish"
      : kind === "queue"
        ? "queue"
        : "outputs";
  const targetButton = document.getElementById(`view-${targetView}`);
  if (targetButton) {
    setViewMode(targetView, targetButton);
  }
  setDashboardSelection(kind === "queue" ? "output" : kind, jobId);
  loadJobIntoSingleView(jobId, { switchView: false });
}

function syncDashboardViewSelection(mode = state.viewMode) {
  if (mode === "review") {
    const jobs = getReviewJobs(getVisibleHistoryJobs());
    const job = ensureDashboardSelection("review", jobs, state.single.job?.id || "");
    if (job && state.single.job?.id !== job.id) {
      loadJobIntoSingleView(job.id, { switchView: false });
    }
  }

  if (mode === "outputs") {
    const jobs = getOutputJobs(getVisibleHistoryJobs());
    const job = ensureDashboardSelection("output", jobs, state.single.job?.id || "");
    if (job && state.single.job?.id !== job.id) {
      loadJobIntoSingleView(job.id, { switchView: false });
    }
  }

  if (mode === "publish") {
    const jobs = getPublishJobs(getVisibleHistoryJobs());
    const job = ensureDashboardSelection("publish", jobs, state.single.job?.id || "");
    if (job && state.single.job?.id !== job.id) {
      loadJobIntoSingleView(job.id, { switchView: false });
    }
  }
}

function renderOverviewScreen() {
  const metrics = document.getElementById("overviewMetrics");
  const stages = document.getElementById("overviewStages");
  const attentionList = document.getElementById("overviewAttentionList");
  const readyList = document.getElementById("overviewReadyList");
  const outputsList = document.getElementById("overviewOutputsList");
  if (!metrics || !stages || !attentionList || !readyList || !outputsList) {
    return;
  }

  const jobs = getVisibleHistoryJobs();
  const overview = dashboardWorkspaceRenderer.buildOverviewScreen({
    jobs,
    counts: getJobCounts(jobs)
  });

  metrics.innerHTML = overview.metricsHtml;
  stages.innerHTML = overview.stagesHtml;
  attentionList.innerHTML = overview.attentionHtml;
  readyList.innerHTML = overview.readyHtml;
  outputsList.innerHTML = overview.outputsHtml;
}

function renderReviewWorkspace(preferredJobId = "") {
  const list = document.getElementById("reviewList");
  const toolbarCopy = document.getElementById("reviewToolbarCopy");
  const summary = document.getElementById("reviewSummary");
  if (!list || !toolbarCopy || !summary) {
    return;
  }

  const jobs = getReviewJobs(getVisibleHistoryJobs());
  const selectedJob = ensureDashboardSelection("review", jobs, preferredJobId);

  const reviewWorkspace = dashboardWorkspaceRenderer.buildReviewWorkspace({
    jobs,
    selectedJob
  });
  toolbarCopy.textContent = reviewWorkspace.toolbarCopy;
  list.innerHTML = reviewWorkspace.listHtml;
  summary.innerHTML = reviewWorkspace.summaryHtml;
}

function renderOutputsWorkspace(preferredJobId = "") {
  const list = document.getElementById("outputsList");
  const toolbarCopy = document.getElementById("outputsToolbarCopy");
  const summary = document.getElementById("outputsSummary");
  const metadata = document.getElementById("outputsMetadata");
  if (!list || !toolbarCopy || !summary || !metadata) {
    return;
  }

  const jobs = getOutputJobs(getVisibleHistoryJobs());
  const selectedJob = ensureDashboardSelection("output", jobs, preferredJobId);

  const outputsWorkspace = dashboardWorkspaceRenderer.buildOutputsWorkspace({
    jobs,
    selectedJob
  });
  toolbarCopy.textContent = outputsWorkspace.toolbarCopy;
  list.innerHTML = outputsWorkspace.listHtml;
  summary.innerHTML = outputsWorkspace.summaryHtml;
  metadata.innerHTML = outputsWorkspace.metadataHtml;
}

function renderPublishWorkspace(preferredJobId = "") {
  const list = document.getElementById("publishList");
  const toolbarCopy = document.getElementById("publishToolbarCopy");
  const summary = document.getElementById("publishSummary");
  if (!list || !toolbarCopy || !summary) {
    return;
  }

  const jobs = getPublishJobs(getVisibleHistoryJobs());
  const selectedJob = ensureDashboardSelection("publish", jobs, preferredJobId);

  const publishWorkspace = dashboardWorkspaceRenderer.buildPublishWorkspace({
    jobs,
    selectedJob
  });
  toolbarCopy.textContent = publishWorkspace.toolbarCopy;
  list.innerHTML = publishWorkspace.listHtml;
  summary.innerHTML = publishWorkspace.summaryHtml;
}

function setDashboardFocus(kind, jobId) {
  setDashboardSelection(kind, jobId);
  renderReviewWorkspace(kind === "review" ? jobId : "");
  renderOutputsWorkspace(kind === "output" ? jobId : "");
  renderPublishWorkspace(kind === "publish" ? jobId : "");
  loadJobIntoSingleView(jobId, { switchView: false });
}

function renderGenerationProfileSelect() {
  ["single", "batch"].forEach((scope) => {
    const controlIds = getGenerationControlIds(scope);
    const select = document.getElementById(controlIds.selectId);
    if (!select) {
      return;
    }

    const previousValue = select.value;
    renderSelectOptions(select, state.generationProfiles.map((profile) => ({
      value: profile.id,
      label: profile.label
    })), previousValue);
    const fallbackValue = state.generationProfiles[0]?.id || "";
    select.value = select.querySelector(`option[value="${previousValue}"]`)
      ? previousValue
      : fallbackValue;

    renderFallbackProfileSelect(scope);
  });
}

function renderCatalogProductSelects() {
  const products = getActiveBrandProducts();
  ["single", "batch"].forEach((scope) => {
    const select = document.getElementById(getCatalogProductSelectId(scope));
    if (!select) {
      return;
    }

    const previousValue = select.value;
    renderSelectOptions(select, [
      { value: "", label: "Choose an imported product" },
      ...products.map((product) => {
        const labelParts = [product.title || product.asin || "Untitled"];
        if (product.asin) {
          labelParts.push(product.asin);
        }
        return {
          value: product.id,
          label: labelParts.join(" • ")
        };
      })
    ], previousValue);
    select.value = select.querySelector(`option[value="${previousValue}"]`) ? previousValue : "";
  });

  renderSelectedCatalogProduct("single");
  renderSelectedCatalogProduct("batch");
}

function renderSelectedCatalogProduct(scope = "single") {
  const product = getSelectedCatalogProduct(scope);
  const previewId = scope === "batch" ? "batchProductCatalogPreview" : "singleProductCatalogPreview";
  const hintId = scope === "batch" ? "batchProductCatalogHint" : "singleProductCatalogHint";
  const preview = document.getElementById(previewId);
  const hint = document.getElementById(hintId);
  if (!preview || !hint) {
    return;
  }

  if (!product) {
    preview.classList.add("is-empty");
    preview.innerHTML = '<div class="catalog-product-empty">Select a brand product to use its images and listing details automatically.</div>';
    hint.textContent = "Choose an imported product, or upload a custom product image if you want to override the catalog imagery.";
    hint.classList.remove("is-success", "is-warning");
    return;
  }

  const safeImageUrl = sanitizeUrl(product.imageUrl);
  preview.classList.remove("is-empty");
  preview.innerHTML = `
    ${safeImageUrl ? `<img src="${escapeHtml(safeImageUrl)}" alt="${escapeHtml(product.title)}" />` : ""}
    <div class="catalog-product-meta">
      <strong>${escapeHtml(product.title || "Imported product")}</strong>
      <span>${escapeHtml(product.asin || "No ASIN")}</span>
      <span>${escapeHtml(getProductBenefitText(product) || product.description || "No product highlights imported yet.")}</span>
    </div>
  `;
  hint.textContent = product.imageUrl
    ? "This product's imported image will be used automatically unless you upload a custom override."
    : "This product imported without an image, so upload a custom product image if you want to run it.";
  hint.classList.toggle("is-success", Boolean(product.imageUrl));
  hint.classList.toggle("is-warning", !product.imageUrl);
}

function getStrategyFieldElementId(field) {
  return {
    brandSummary: "strategyBrandSummary",
    productDescription: "strategyProductDescription",
    targetAudience: "strategyTargetAudience",
    constraints: "strategyConstraints"
  }[field] || "";
}

function getStrategySourceElementId(field) {
  return {
    brandSummary: "strategySourceBrandSummary",
    productDescription: "strategySourceProductDescription",
    targetAudience: "strategySourceTargetAudience",
    constraints: "strategySourceConstraints"
  }[field] || "";
}

function getStrategyInputPayload() {
  return {
    asin: state.strategy.asin,
    productUrl: state.strategy.productUrl,
    brandSummary: state.strategy.fields.brandSummary,
    productDescription: state.strategy.fields.productDescription,
    targetAudience: state.strategy.fields.targetAudience,
    constraints: state.strategy.fields.constraints,
    fieldSources: state.strategy.fieldSources
  };
}

function getStrategySourceBadgeConfig(source = "manual") {
  if (source === "amazon") {
    return {
      label: "Auto-filled",
      status: "ready"
    };
  }

  if (source === "manual") {
    return {
      label: "Manual",
      status: "info"
    };
  }

  return {
    label: "Empty",
    status: "warning"
  };
}

function renderStrategyFieldBadges() {
  ["brandSummary", "productDescription", "targetAudience", "constraints"].forEach((field) => {
    const badge = document.getElementById(getStrategySourceElementId(field));
    if (!badge) {
      return;
    }

    const config = getStrategySourceBadgeConfig(state.strategy.fieldSources[field]);
    badge.textContent = config.label;
    badge.setAttribute("data-status", config.status);
  });
}

function renderStrategyListingSummary() {
  const container = document.getElementById("strategyListingSummary");
  if (!container) {
    return;
  }

  const listing = state.strategy.fetchedListing;
  if (!listing) {
    container.innerHTML = `
      <strong>No listing fetched yet.</strong>
      <span>After a successful fetch, the app will summarize category, imagery hints, and draft review fields here.</span>
    `;
    return;
  }

  const imageryHints = Array.isArray(listing.imageryHints) && listing.imageryHints.length > 0
    ? listing.imageryHints.join(" | ")
    : "No imagery hints extracted.";
  const reviewThemes = Array.isArray(listing.reviewThemes) && listing.reviewThemes.length > 0
    ? listing.reviewThemes.join(" | ")
    : "No review themes detected.";
  const title = listing.title || "Fetched listing";
  const category = listing.category || "Unknown category";

  container.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    <span>${escapeHtml(category)}</span>
    <span>${escapeHtml(imageryHints)}</span>
    <span>${escapeHtml(reviewThemes)}</span>
  `;
}

function renderStrategyFetchStatus() {
  const element = document.getElementById("strategyFetchStatus");
  const button = document.getElementById("strategyFetchButton");
  if (!element || !button) {
    return;
  }

  const hasListing = Boolean(state.strategy.fetchedListing);
  button.disabled = state.strategy.loading.fetch;
  button.textContent = state.strategy.loading.fetch ? "Fetching..." : "Fetch Listing";

  if (state.strategy.errors.fetch) {
    element.textContent = state.strategy.errors.fetch;
    element.classList.add("is-warning");
    element.classList.remove("is-success");
    return;
  }

  if (hasListing) {
    element.textContent = "Listing fetched. Review the draft inputs below and edit anything you want before generation.";
    element.classList.add("is-success");
    element.classList.remove("is-warning");
    return;
  }

  element.textContent = "Enter an ASIN or Amazon URL, or skip this step and work fully from manual inputs.";
  element.classList.remove("is-success", "is-warning");
}

function renderStrategyReviewStatus() {
  const element = document.getElementById("strategyReviewStatus");
  const button = document.getElementById("strategyGenerateButton");
  if (!element || !button) {
    return;
  }

  const hasAnyInput = Object.values(state.strategy.fields).some((value) => String(value || "").trim());
  button.disabled = state.strategy.loading.generate || !hasAnyInput;
  button.textContent = state.strategy.loading.generate ? "Generating..." : "Confirm & Generate";

  if (state.strategy.errors.generate) {
    element.textContent = state.strategy.errors.generate;
    element.classList.add("is-warning");
    element.classList.remove("is-success");
    return;
  }

  if (state.strategy.result) {
    element.textContent = "Generation complete. The full six-part JSON object is ready for downstream script and video agents.";
    element.classList.add("is-success");
    element.classList.remove("is-warning");
    return;
  }

  element.textContent = "Review the inputs, then confirm to generate the downstream angle, topic, hook, and payload JSON.";
  element.classList.remove("is-success", "is-warning");
}

function renderStrategySummary() {
  const summaryGrid = document.getElementById("strategySummaryGrid");
  const preview = document.getElementById("strategyStagePreview");
  const output = document.getElementById("strategyJsonOutput");
  const copyButton = document.getElementById("strategyCopyButton");
  if (!summaryGrid || !preview || !output || !copyButton) {
    return;
  }

  const result = state.strategy.result;
  if (!result) {
    summaryGrid.innerHTML = `
      <div class="detail-stat">
        <div class="detail-stat-value">0</div>
        <div class="detail-stat-copy">Angles</div>
      </div>
      <div class="detail-stat">
        <div class="detail-stat-value">0</div>
        <div class="detail-stat-copy">Topics</div>
      </div>
      <div class="detail-stat">
        <div class="detail-stat-value">0</div>
        <div class="detail-stat-copy">Hooks</div>
      </div>
      <div class="detail-stat">
        <div class="detail-stat-value">0</div>
        <div class="detail-stat-copy">Approved concepts</div>
      </div>
    `;
    preview.innerHTML = `
      <strong>No strategy output yet.</strong>
      <span>Confirm the Stage 0 inputs to generate the full JSON payload.</span>
    `;
    output.textContent = "{}";
    copyButton.disabled = true;
    return;
  }

  const angleCount = Array.isArray(result.angle_bank) ? result.angle_bank.length : 0;
  const topicCount = Array.isArray(result.topic_grid) ? result.topic_grid.length : 0;
  const hookCount = Array.isArray(result.hook_bank) ? result.hook_bank.length : 0;
  const approvedCount = Array.isArray(result.approved_concepts) ? result.approved_concepts.length : 0;
  const topConcept = result.concept_payloads?.[0];

  summaryGrid.innerHTML = `
    <div class="detail-stat">
      <div class="detail-stat-value">${angleCount}</div>
      <div class="detail-stat-copy">Angles</div>
    </div>
    <div class="detail-stat">
      <div class="detail-stat-value">${topicCount}</div>
      <div class="detail-stat-copy">Topics</div>
    </div>
    <div class="detail-stat">
      <div class="detail-stat-value">${hookCount}</div>
      <div class="detail-stat-copy">Hooks</div>
    </div>
    <div class="detail-stat">
      <div class="detail-stat-value">${approvedCount}</div>
      <div class="detail-stat-copy">Approved concepts</div>
    </div>
  `;

  preview.innerHTML = topConcept
    ? `
      <strong>${escapeHtml(topConcept.hook_text || "Top concept ready")}</strong>
      <span>${escapeHtml(topConcept.topic || "Topic unavailable")}</span>
      <span>${escapeHtml(topConcept.target_audience || "")}</span>
    `
    : `
      <strong>Generation complete.</strong>
      <span>The JSON payload is ready for downstream agents.</span>
    `;
  output.textContent = JSON.stringify(result, null, 2);
  copyButton.disabled = false;
}

function renderStrategyStudio() {
  const asinInput = document.getElementById("strategyAsin");
  const productUrlInput = document.getElementById("strategyProductUrl");
  if (asinInput && asinInput.value !== state.strategy.asin) {
    asinInput.value = state.strategy.asin;
  }
  if (productUrlInput && productUrlInput.value !== state.strategy.productUrl) {
    productUrlInput.value = state.strategy.productUrl;
  }

  ["brandSummary", "productDescription", "targetAudience", "constraints"].forEach((field) => {
    const element = document.getElementById(getStrategyFieldElementId(field));
    if (!element) {
      return;
    }

    if (element.value !== state.strategy.fields[field]) {
      element.value = state.strategy.fields[field];
    }
  });

  renderStrategyFieldBadges();
  renderStrategyListingSummary();
  renderStrategyFetchStatus();
  renderStrategyReviewStatus();
  renderStrategySummary();
}

function renderFallbackProfileSelect(scope = "single") {
  const controlIds = getGenerationControlIds(scope);
  const select = document.getElementById(controlIds.fallbackSelectId);
  if (!select) {
    return;
  }

  const primaryProfileId = getSelectedGenerationProfile(scope)?.id || "";
  const previousValue = select.value;
  renderSelectOptions(select, [
    { value: "", label: "No auto fallback" },
    ...state.generationProfiles
      .filter((profile) => profile.id !== primaryProfileId)
      .map((profile) => ({
        value: profile.id,
        label: profile.label
      }))
  ], previousValue);
  select.value = select.querySelector(`option[value="${previousValue}"]`)
    ? previousValue
    : "";
}

function renderIdeaAssist() {
  const label = document.getElementById("ideaAssistLabel");
  const hint = document.getElementById("ideaAssistHint");
  const suggestionsEl = document.getElementById("ideaSuggestions");
  const generateButton = document.getElementById("ideaGenerateButton");
  const regenerateButton = document.getElementById("ideaRegenerateButton");
  if (!label || !hint || !suggestionsEl || !generateButton || !regenerateButton) {
    return;
  }

  const meta = getIdeaAssistMeta(state.activePipeline);
  const ideaState = getIdeaAssistState(state.activePipeline);
  const hasCurrentValue = !fieldsNeedIdea(state.activePipeline, getPipelineFields(state.activePipeline));
  const sequenceCount = getSingleVideoCount();
  const sequenceMode = sequenceCount > 1;

  label.textContent = meta.label;
  hint.textContent = state.ideaAssist.loading
    ? meta.loadingMessage
    : hasCurrentValue
      ? sequenceMode
        ? `Your current ${meta.fieldName} will anchor a ${sequenceCount}-clip stitched sequence.`
        : meta.readyMessage
      : sequenceMode
        ? `Leave it blank or click Surprise me to outline a ${sequenceCount}-clip stitched sequence.`
        : meta.emptyMessage;
  hint.classList.toggle("is-success", hasCurrentValue && !state.ideaAssist.loading);
  hint.classList.toggle("is-warning", !hasCurrentValue && !state.ideaAssist.loading);

  generateButton.disabled = state.ideaAssist.loading;
  regenerateButton.disabled = state.ideaAssist.loading;
  generateButton.textContent = state.ideaAssist.loading
    ? "Generating..."
    : sequenceMode
      ? "Outline sequence"
      : "Surprise me";
  regenerateButton.textContent = state.ideaAssist.loading
    ? "Refreshing..."
    : sequenceMode
      ? "Regenerate sequence"
      : "Regenerate";

  if (state.ideaAssist.loading) {
    suggestionsEl.classList.remove("is-empty");
    suggestionsEl.innerHTML = `
      <div class="idea-card is-loading">
        <strong>${meta.loadingMessage}</strong>
        <span>This only takes a moment.</span>
      </div>
    `;
    return;
  }

  if (!ideaState.suggestions.length) {
    suggestionsEl.classList.add("is-empty");
    suggestionsEl.innerHTML = `
      <div class="idea-card is-empty">
        <strong>No suggestions yet.</strong>
        <span>${sequenceMode ? `Click Outline sequence to map all ${sequenceCount} linked clips, or run and let the app build them automatically.` : "Click Surprise me, or just leave the field blank and the app will create one on run."}</span>
      </div>
    `;
    return;
  }

  suggestionsEl.classList.remove("is-empty");
  suggestionsEl.innerHTML = ideaState.suggestions.map((suggestion, index) => `
    <button type="button" class="idea-card" onclick="applyIdeaSuggestionByIndex('${state.activePipeline}', ${index})">
      <strong>${escapeHtml(suggestion.label)}</strong>
      <span>${suggestion.fields?.sequenceCount > 1 ? `Part ${escapeHtml(suggestion.fields.sequenceIndex)} of ${escapeHtml(suggestion.fields.sequenceCount)} in one stitched sequence.` : `Click to use this ${meta.fieldName}.`}</span>
    </button>
  `).join("");
}

function getHistoryBrandName(brandId) {
  return state.brands.find((brand) => brand.id === brandId)?.name || brandId || "Unknown brand";
}

function formatHistoryTimestamp(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function getHistoryLabel(job) {
  if (job.mode === "slides") {
    return job.fields?.slideDeckTitle || "Slides run";
  }

  if (job.pipeline === "edu") {
    return job.fields?.topic || "Education run";
  }

  if (job.pipeline === "comedy") {
    return job.fields?.scenario || "Comedy run";
  }

  if (job.pipeline === "product") {
    const productName = job.fields?.productName || "Product";
    const benefit = job.fields?.benefit ? ` - ${job.fields.benefit}` : "";
    return `${productName}${benefit}`;
  }

  return "Recent run";
}

const dashboardWorkspaceRenderer = createDashboardWorkspaceRenderer({
  ACTIVE_JOB_STATUSES,
  escapeHtml,
  formatHistoryTimestamp,
  formatJobStatusLabel,
  getAttentionJobs,
  getCreationModeForJob,
  getCreationModeLabel,
  getHistoryBrandName,
  getHistoryLabel,
  getOutputJobs,
  getPipelineLabel,
  getPublishJobs,
  getRecentFinishedJobs,
  getReviewJobs,
  getRunRowCopy,
  getStatusTone,
  getWorkflowStageCards,
  isSequenceFinalOutputJob,
  renderDetailHero,
  renderDetailStat,
  renderEmptyState,
  renderMetricCard,
  renderStageCard,
  renderWorkspaceJobCard,
  safeLinkHtml
});

function renderHistory() {
  const historyList = document.getElementById("historyList");
  if (!historyList) {
    return;
  }

  if (state.history.loading && state.history.jobs.length === 0) {
    historyList.innerHTML = `<div class="history-empty">Loading recent runs...</div>`;
    return;
  }

  const sidebarJobs = getHistoryJobsForSidebar();
  if (!sidebarJobs.length) {
    historyList.innerHTML = `<div class="history-empty">No recent runs yet.</div>`;
    return;
  }

  historyList.innerHTML = dashboardWorkspaceRenderer.buildHistorySidebar({
    jobs: sidebarJobs,
    deletingJobId: state.history.deletingJobId
  });
}

function getRunsFilterCount(filterId) {
  return getVisibleHistoryJobs().filter((job) => matchesRunsFilter(job, filterId)).length;
}

function matchesRunsFilter(job, filterId = state.history.runsFilter) {
  if (filterId === "all") {
    return true;
  }

  if (filterId === "active") {
    return ACTIVE_JOB_STATUSES.includes(job.status);
  }

  if (filterId === "failed") {
    return job.status === "failed";
  }

  if (filterId === "ready") {
    return job.status === "ready";
  }

  if (filterId === "published") {
    return job.status === "distributed";
  }

  return true;
}

function getRunRowCopy(job) {
  if (job.error) {
    return job.error;
  }

  if (job.status === "ready" || job.status === "distributed") {
    if (isSequenceFinalOutputJob(job)) {
      return `Final stitched sequence is ready${job.status === "distributed" ? " and has already been published." : " for outputs and publishing."}`;
    }
    if (job.mode === "slides") {
      return `Slide video is ready${job.status === "distributed" ? " and has already been published." : " for outputs and publishing."}`;
    }
    if (job.pipeline === "product") {
      return `${job.fields?.productName || "Product"} is ready${job.status === "distributed" ? " and has already been published." : " for outputs and publishing."}`;
    }
    return `${getPipelineLabel(job.pipeline)} content is ready${job.status === "distributed" ? " and has already been published." : " for outputs and publishing."}`;
  }

  if (job.status === "slides_ready") {
    return "Slide draft is ready. Edit the deck here if you want, then render the final slideshow video.";
  }

  if (job.status === "rendering_slides") {
    return "Rendering the final slideshow video now.";
  }

  if (job.status === "awaiting_generation") {
    return "Queued for the next generation slot.";
  }

  if (job.status === "polling" || job.status === "submitting") {
    return "Still rendering with the current video model.";
  }

  return "Tracked in the current dashboard history.";
}

function renderRunsFilters() {
  const container = document.getElementById("runsFilters");
  if (!container) {
    return;
  }

  container.innerHTML = dashboardWorkspaceRenderer.buildRunsFilters({
    filters: getRunsFilterConfig(),
    activeFilterId: state.history.runsFilter,
    getCount: getRunsFilterCount
  });
}

function renderRunsOverview() {
  const container = document.getElementById("runsOverview");
  if (!container) {
    return;
  }

  container.innerHTML = dashboardWorkspaceRenderer.buildRunsOverview({
    counts: getJobCounts()
  });
}

function renderRunsList() {
  const container = document.getElementById("runsList");
  const toolbarCopy = document.getElementById("runsToolbarCopy");
  if (!container || !toolbarCopy) {
    return;
  }

  const jobs = filterJobsByQuery(
    getVisibleHistoryJobs().filter((job) => matchesRunsFilter(job)),
    state.dashboard.queueSearch,
    (job) => [
      getHistoryLabel(job),
      getHistoryBrandName(job.brandId),
      getPipelineLabel(job.pipeline),
      getCreationModeLabel(getCreationModeForJob(job)),
      formatJobStatusLabel(job.status),
      getRunRowCopy(job)
    ].join(" ").toLowerCase()
  );
  const runsList = dashboardWorkspaceRenderer.buildRunsList({ jobs });
  toolbarCopy.textContent = runsList.toolbarCopy;
  container.innerHTML = runsList.listHtml;
}

function renderRunsView() {
  renderRunsOverview();
  renderRunsFilters();
  renderRunsList();
}

function setRunsFilter(filterId) {
  state.history.runsFilter = filterId;
  renderRunsView();
}

function renderSpendSummary(summary = state.spendSummary) {
  const monthlyLabel = document.getElementById("monthlyEstimateLabel");
  const unknownLabel = document.getElementById("unknownEstimateLabel");
  const currentEstimateLabel = document.getElementById("currentEstimateLabel");
  const unknownRow = document.getElementById("unknownEstimateRow");

  currentEstimateLabel.textContent = formatUsd(estimateCurrentRunCost(getCurrentRunScope()));

  if (!summary) {
    monthlyLabel.textContent = "$0.000 est.";
    unknownLabel.textContent = "0";
    unknownRow?.classList.add("is-hidden");
    return;
  }

  monthlyLabel.textContent = formatUsd(summary.estimatedTotalUsd);
  const unknownJobs = Number(summary.estimatedUnknownJobs || 0);
  unknownLabel.textContent = String(unknownJobs);
  unknownRow?.classList.toggle("is-hidden", unknownJobs <= 0);
}

async function refreshSpendSummary() {
  try {
    const payload = await requestJson("/api/costs/summary");
    state.spendSummary = payload.summary;
    renderSpendSummary();
  } catch {
    renderSpendSummary();
  }
}

async function refreshHistory() {
  state.history.loading = true;
  renderHistory();
  renderOverviewScreen();
  renderReviewWorkspace();
  renderRunsView();
  renderOutputsWorkspace();
  renderPublishWorkspace();

  try {
    const payload = await requestJson("/api/jobs?limit=60");
    state.history.jobs = (payload.jobs || []).slice(0, 60);
  } catch {
    state.history.jobs = state.history.jobs || [];
  } finally {
    state.history.loading = false;
    renderHistory();
    renderOverviewScreen();
    renderReviewWorkspace();
    renderRunsView();
    renderOutputsWorkspace();
    renderPublishWorkspace();
    renderOperationsSummary();
  }
}

function removeJobFromSingleSequence(jobId) {
  if (!hasSingleSequenceRun()) {
    return;
  }

  state.single.sequence.items = state.single.sequence.items.filter((item) => item.jobId !== jobId);
  if (!state.single.sequence.items.length) {
    resetSingleSequenceState();
  }
}

function getKnownJobById(jobId) {
  return state.history.jobs.find((entry) => entry.id === jobId)
    || (state.single.job?.id === jobId ? state.single.job : null)
    || state.single.sequence.items.find((item) => item.jobId === jobId)?.job
    || null;
}

async function performDeleteJob(jobId, options = {}) {
  const job = getKnownJobById(jobId);
  if (state.history.deletingJobId === jobId) {
    return false;
  }

  const confirmed = options.skipConfirm
    ? true
    : window.confirm(`Delete "${getHistoryLabel(job || { pipeline: "", fields: {} })}"? This removes it from the queue and recent runs.`);
  if (!confirmed) {
    return false;
  }

  state.history.deletingJobId = jobId;
  renderHistory();
  renderRunsView();

  try {
    const payload = await requestJson(`/api/jobs/${jobId}`, {
      method: "DELETE"
    });
    const deletedJobIds = new Set(Array.isArray(payload.deletedJobIds) && payload.deletedJobIds.length > 0
      ? payload.deletedJobIds
      : [jobId]);

    state.history.jobs = state.history.jobs.filter((entry) => !deletedJobIds.has(entry.id));
    if (state.single.job?.id && deletedJobIds.has(state.single.job.id) && !hasSingleSequenceRun()) {
      resetSingleJob({ keepImage: true });
    } else if (state.single.job?.id && deletedJobIds.has(state.single.job.id)) {
      state.single.job = null;
    }
    deletedJobIds.forEach((deletedJobId) => removeJobFromSingleSequence(deletedJobId));
    const featuredJob = chooseFeaturedSingleSequenceJob();
    if (featuredJob) {
      renderSingleJob(featuredJob);
    }
    renderSingleSequenceCard();
    renderSingleVideoOutput();
    renderHistory();
    renderRunsView();
    renderCreateSummaryCard();
    refreshSpendSummary();
    refreshHistory();
    showToast("Run deleted.");
    return true;
  } catch (error) {
    showToast(error.message);
    return false;
  } finally {
    state.history.deletingJobId = "";
    renderHistory();
    renderRunsView();
  }
}

async function deleteHistoryJob(jobId) {
  const job = getKnownJobById(jobId);
  if (!job) {
    return;
  }

  await performDeleteJob(jobId);
}

async function retryRunFromList(jobId) {
  const job = getKnownJobById(jobId);
  if (!job?.canRetry) {
    return;
  }

  try {
    const payload = await requestJson(`/api/jobs/${jobId}/retry`, {
      method: "POST"
    });
    if (state.single.job?.id === jobId) {
      renderSingleJob(payload.job);
      await pollSingleJob(payload.job.id);
    }
    await refreshHistory();
    showToast("Run queued for retry.");
  } catch (error) {
    showToast(error.message);
  }
}

function setZoneEmpty(zoneId, title, subtitle) {
  const zone = document.getElementById(zoneId);
  if (!zone) {
    return;
  }

  setUploadRemoveButtonVisible(zoneId, false);
  zone.classList.remove("has-image");
  zone.innerHTML = `
    <div class="upload-zone-copy">
      <div class="upload-title">${title}</div>
      <div class="upload-subtitle">${subtitle}</div>
    </div>
  `;
}

function getBatchImageUrlsForPipeline(pipeline) {
  if (pipeline === "product") {
    const uploaded = [state.batch.productImageUrl, state.batch.productSecondaryImageUrl].filter(Boolean);
    if (uploaded.length > 0) {
      return uploaded;
    }

    return getCatalogProductImageUrls(getSelectedCatalogProduct("batch"));
  }

  return [state.batch.presenterImageUrl, state.batch.presenterSecondaryImageUrl].filter(Boolean);
}

function buildGenerationConfig(scope = "single", overrides = {}) {
  const profile = getSelectedGenerationProfile(scope);
  const fallbackProfile = getSelectedFallbackProfile(scope);
  const controlIds = getGenerationControlIds(scope);
  const defaultImageUrls = scope === "batch"
    ? []
    : getEffectiveSingleImageUrls();
  const imageUrls = overrides.imageUrls || defaultImageUrls;
  const duration = profile?.controls?.duration
    ? (document.getElementById(controlIds.durationSelectId)?.value || profile?.defaults?.duration || "")
    : (profile?.defaults?.duration || "");
  const resolution = profile?.controls?.resolution
    ? (document.getElementById(controlIds.resolutionSelectId)?.value || profile?.defaults?.resolution || "")
    : (profile?.defaults?.resolution || "");
  const generateAudio = profile?.controls?.generateAudio
    ? (document.getElementById(controlIds.audioInputId)?.checked ?? Boolean(profile?.defaults?.generateAudio))
    : Boolean(profile?.defaults?.generateAudio);
  const multiShots = profile?.controls?.multiShots
    ? (document.getElementById(controlIds.multiShotsInputId)?.checked ?? Boolean(profile?.defaults?.multiShots))
    : Boolean(profile?.defaults?.multiShots);
  const useElements = profile?.controls?.useElements
    ? (document.getElementById(controlIds.elementsInputId)?.checked ?? Boolean(profile?.defaults?.useElements))
    : Boolean(profile?.defaults?.useElements);
  return {
    profileId: profile?.id,
    fallbackProfileId: fallbackProfile?.id || "",
    imageUrls,
    duration,
    resolution,
    generateAudio,
    multiShots,
    useElements,
    estimatedCostUsd: estimateProfileCost(profile, scope)
  };
}

function getGenerationValidationMessage({
  generationConfig = {},
  imageUrls = [],
  enforceProfileImageMinimum = false,
  validationContext = ""
} = {}) {
  const normalizedImages = Array.isArray(imageUrls)
    ? imageUrls.filter(Boolean)
    : [];
  const profile = getGenerationProfileById(generationConfig.profileId);

  if (generationConfig.profileId === "kling30" && generationConfig.useElements && normalizedImages.length < 2) {
    return profile
      ? `${profile.label} needs two reference images before you can continue with Kling elements enabled.`
      : "Kling elements need two reference images before you can continue.";
  }

  if (enforceProfileImageMinimum && profile) {
    const minImages = Number(profile.minImages || 0);
    if (minImages > 0 && normalizedImages.length < minImages) {
      const requiredImagesLabel = minImages === 1 ? "a reference image" : `${minImages} reference images`;
      if (validationContext === "narrated_broll") {
        return `${profile.label} needs ${requiredImagesLabel} before narrated B-roll rendering can start. Upload the missing reference image${minImages === 1 ? "" : "s"}, then plan B-roll prompts again.`;
      }
      return `${profile.label} needs ${requiredImagesLabel} before you can continue.`;
    }
  }

  return "";
}

function getNarratedJobImageUrls(job) {
  const configuredImageUrls = Array.isArray(job?.providerConfig?.generationConfig?.imageUrls)
    ? job.providerConfig.generationConfig.imageUrls.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  if (configuredImageUrls.length > 0) {
    return configuredImageUrls;
  }

  return [job?.sourceImageUrl].map((value) => String(value || "").trim()).filter(Boolean);
}

function getNarratedBrollValidationMessage(job, options = {}) {
  if (!job || job.mode !== "narrated") {
    return "";
  }

  return getGenerationValidationMessage({
    generationConfig: job.providerConfig?.generationConfig || {},
    imageUrls: Array.isArray(options.imageUrls) ? options.imageUrls : getNarratedJobImageUrls(job),
    enforceProfileImageMinimum: true,
    validationContext: "narrated_broll"
  });
}

function segmentsHaveCompleteVoice(segments = []) {
  return Array.isArray(segments)
    && segments.length > 0
    && segments.every((segment) => segment.voiceStatus === "complete" && segment.audioUrl);
}

function refreshBatchReferenceUploadUi(profile) {
  const presenterSecondaryWrap = document.getElementById("batchPresenterSecondaryWrap");
  const productSecondaryWrap = document.getElementById("batchProductSecondaryWrap");
  const secondaryTitle = profile.id === "veo31_reference"
    ? "Reference image"
    : "Optional second image";
  const secondarySubtitle = profile.id === "veo31_reference"
    ? "Use this extra frame as a reference pair for the generated shot"
    : "Use this for first-frame, last-frame, or extra reference control";

  const showSecondary = profile.maxImages >= 2;
  presenterSecondaryWrap.classList.toggle("is-hidden", !showSecondary);
  productSecondaryWrap.classList.toggle("is-hidden", !showSecondary);

  if (showSecondary) {
    if (!state.batch.presenterSecondaryImageUrl) {
      setZoneEmpty("batchPresenterSecondaryZone", secondaryTitle, secondarySubtitle);
    }
    if (!state.batch.productSecondaryImageUrl) {
      setZoneEmpty("batchProductSecondaryZone", secondaryTitle, secondarySubtitle);
    }
    return;
  }

  state.batch.presenterSecondaryImageUrl = "";
  state.batch.presenterSecondaryPreviewUrl = "";
  state.batch.productSecondaryImageUrl = "";
  state.batch.productSecondaryPreviewUrl = "";
  const presenterInput = document.getElementById("batchPresenterSecondaryInput");
  const productInput = document.getElementById("batchProductSecondaryInput");
  if (presenterInput) {
    presenterInput.value = "";
  }
  if (productInput) {
    productInput.value = "";
  }
  setZoneEmpty("batchPresenterSecondaryZone", "Optional second presenter image", "Use this for reference, first frame, or last frame control");
  setZoneEmpty("batchProductSecondaryZone", "Optional second product image", "Use this for reference, first frame, or last frame control");
}

function refreshGenerationProfileUi(scope = "single") {
  const profile = getSelectedGenerationProfile(scope);
  if (!profile) {
    return;
  }

  renderFallbackProfileSelect(scope);

  const controlIds = getGenerationControlIds(scope);
  const description = document.getElementById(controlIds.descriptionId);
  const durationField = document.getElementById(controlIds.durationFieldId);
  const resolutionField = document.getElementById(controlIds.resolutionFieldId);
  const audioField = document.getElementById(controlIds.audioFieldId);
  const durationSelect = document.getElementById(controlIds.durationSelectId);
  const resolutionSelect = document.getElementById(controlIds.resolutionSelectId);
  const audioInput = document.getElementById(controlIds.audioInputId);
  const multiShotsField = document.getElementById(controlIds.multiShotsFieldId);
  const multiShotsInput = document.getElementById(controlIds.multiShotsInputId);
  const elementsField = document.getElementById(controlIds.elementsFieldId);
  const elementsInput = document.getElementById(controlIds.elementsInputId);

  function applySelectControl(select, field, control) {
    if (!field || !select) {
      return;
    }

    field.classList.toggle("is-hidden", !control);
    if (!control) {
      select.innerHTML = "";
      return;
    }

    const previousValue = select.value;
    select.innerHTML = (Array.isArray(control.options) ? control.options : [])
      .map((option) => `<option value="${option.value}">${option.label}</option>`)
      .join("");
    const defaultValue = String(control.defaultValue ?? control.options?.[0]?.value ?? "");
    select.value = select.querySelector(`option[value="${previousValue}"]`)
      ? previousValue
      : select.querySelector(`option[value="${defaultValue}"]`)
        ? defaultValue
        : control.options?.[0]?.value || "";
  }

  const profileDescription = profile.id === "kling30"
    ? `${profile.description} Kling elements require two uploaded reference images, and multi-shot mode auto-builds a two-beat shot plan from the main video prompt.`
    : profile.description;
  description.textContent = scope === "single" && isNarratedMode()
    ? `${profileDescription} Narrated drafts can start without a reference image. This model's imagery settings apply later during B-roll rendering.`
    : profileDescription;

  applySelectControl(durationSelect, durationField, profile.controls?.duration || null);
  applySelectControl(resolutionSelect, resolutionField, profile.controls?.resolution || null);

  function applyBooleanControl(field, input, control, fallbackDefault) {
    if (!field || !input) {
      return;
    }

    field.classList.toggle("is-hidden", !control);
    const switchedProfiles = input.dataset.lastProfileId !== profile.id;
    if (control) {
      if (switchedProfiles) {
        input.checked = Boolean(control.defaultValue);
      }
    } else {
      input.checked = Boolean(fallbackDefault);
    }
    input.dataset.lastProfileId = profile.id;
  }

  applyBooleanControl(audioField, audioInput, profile.controls?.generateAudio || null, profile.defaults?.generateAudio);
  applyBooleanControl(multiShotsField, multiShotsInput, profile.controls?.multiShots || null, profile.defaults?.multiShots);
  applyBooleanControl(elementsField, elementsInput, profile.controls?.useElements || null, profile.defaults?.useElements);

  if (scope === "single") {
    const secondaryUploadWrap = document.getElementById("secondaryUploadWrap");
    const secondaryZone = document.getElementById("singleUploadZoneSecondary");
    secondaryUploadWrap.classList.toggle("is-hidden", profile.maxImages < 2);
    if (profile.maxImages >= 2) {
      if (!state.single.secondaryImageUrl) {
        setZoneEmpty(
          "singleUploadZoneSecondary",
          profile.id === "veo31_reference" ? "Reference image" : "Optional second image",
          profile.id === "veo31_reference"
            ? "Use this extra frame as a reference pair for the generated shot"
            : "Use this for reference or first/last frame models"
        );
      } else if (secondaryZone.querySelector(".upload-title")) {
        secondaryZone.querySelector(".upload-title").textContent = profile.id === "veo31_reference"
          ? "Reference image"
          : "Optional second image";
      }
    } else {
      state.single.secondaryImageUrl = "";
      state.single.secondaryPreviewUrl = "";
      const secondaryInput = document.getElementById("singleFileInputSecondary");
      if (secondaryInput) {
        secondaryInput.value = "";
      }
      setZoneEmpty("singleUploadZoneSecondary", "Optional second image", "Use this for reference or first/last frame models");
    }
  } else {
    refreshBatchReferenceUploadUi(profile);
  }

  renderSpendSummary();
  if (scope === "single") {
    updateSingleRunState();
  }
}

function handleGenerationProfileChange(scope = "single") {
  refreshGenerationProfileUi(scope);
}

function handleSingleVideoCountChange() {
  const videoCountSelect = document.getElementById("singleVideoCount");
  if (isStoryboardMode() && videoCountSelect && Number.parseInt(videoCountSelect.value || "0", 10) < 1) {
    videoCountSelect.value = "1";
  }
  renderIdeaAssist();
  renderSingleSequenceCard();
  updateSingleRunState();
  renderCreateSummaryCard();
}

function applyCatalogProductToFields(scope = "single") {
  const product = getSelectedCatalogProduct(scope);
  if (!product) {
    return;
  }

  const nameInput = scope === "batch"
    ? null
    : document.getElementById("product-name");
  const benefitInput = scope === "batch"
    ? null
    : document.getElementById("product-benefit");

  if (nameInput) {
    nameInput.value = product.title || "";
  }
  if (benefitInput) {
    benefitInput.value = getProductBenefitText(product);
  }

  if (scope === "single") {
    clearSingleIdeaMeta("product");
    renderIdeaAssist();
    updateSingleRunState();
  } else {
    clearBatchIdeaMeta("product");
  }
}

function renderBatchProductRequirement() {
  const hint = document.getElementById("batchProductCatalogHint");
  if (!hint) {
    return;
  }

  const product = getSelectedCatalogProduct("batch");
  if (product?.imageUrl) {
    hint.textContent = "Selected catalog product will supply product imagery for batch product clips unless you upload an override.";
    hint.classList.add("is-success");
    hint.classList.remove("is-warning");
    return;
  }

  hint.textContent = product
    ? "This imported product does not have an image yet, so upload a product image if you want to use it."
    : "Select an imported product or upload a product image for product clips.";
  hint.classList.remove("is-success");
  hint.classList.add("is-warning");
}

function handleProductSelectionChange(scope = "single") {
  applyCatalogProductToFields(scope);
  renderSelectedCatalogProduct(scope);
  renderBatchProductRequirement();
  renderSpendSummary();
}

function handleBrandChange() {
  clearIdeaAssistState();
  clearAllSingleIdeaMeta();
  clearAllBatchIdeaMeta();
  renderCatalogProductSelects();
  renderActiveBrandSummary();
  renderOverviewScreen();
  renderNarratedTemplateMeta();
  renderBrandsView();
  renderIdeaAssist();
  resetSingleJob();
  renderBatchProductRequirement();
}

function handleStrategyFieldInput(field) {
  const element = document.getElementById(getStrategyFieldElementId(field));
  if (!element) {
    return;
  }

  state.strategy.fields[field] = element.value;
  state.strategy.fieldSources[field] = element.value.trim() ? "manual" : "empty";
  state.strategy.errors.generate = "";
  renderStrategyStudio();
}

async function fetchStrategyListing() {
  const asinInput = document.getElementById("strategyAsin");
  const productUrlInput = document.getElementById("strategyProductUrl");
  const asin = asinInput?.value.trim() || "";
  const productUrl = productUrlInput?.value.trim() || "";

  if (!asin && !productUrl) {
    showToast("Enter an ASIN or Amazon product URL first.");
    return;
  }

  state.strategy.asin = asin;
  state.strategy.productUrl = productUrl;
  state.strategy.loading.fetch = true;
  state.strategy.errors.fetch = "";
  renderStrategyStudio();

  try {
    const payload = await requestJson("/api/strategy/normalize", {
      method: "POST",
      body: JSON.stringify(getStrategyInputPayload())
    });

    state.strategy.fetchedListing = payload.review?.listing || null;
    state.strategy.normalizedInputs = payload.normalizedInputs || null;
    state.strategy.fields = {
      brandSummary: payload.review?.mergedDraft?.brandSummary || "",
      productDescription: payload.review?.mergedDraft?.productDescription || "",
      targetAudience: payload.review?.mergedDraft?.targetAudience || "",
      constraints: payload.review?.mergedDraft?.constraints || ""
    };
    state.strategy.fieldSources = {
      brandSummary: payload.review?.fieldSources?.brandSummary || "manual",
      productDescription: payload.review?.fieldSources?.productDescription || "manual",
      targetAudience: payload.review?.fieldSources?.targetAudience || "manual",
      constraints: payload.review?.fieldSources?.constraints || "manual"
    };
    showToast("Listing fetched and draft inputs prepared.");
  } catch (error) {
    state.strategy.errors.fetch = error.message;
    showToast(error.message);
  } finally {
    state.strategy.loading.fetch = false;
    renderStrategyStudio();
  }
}

async function generateStrategy() {
  state.strategy.asin = document.getElementById("strategyAsin")?.value.trim() || state.strategy.asin;
  state.strategy.productUrl = document.getElementById("strategyProductUrl")?.value.trim() || state.strategy.productUrl;
  state.strategy.loading.generate = true;
  state.strategy.errors.generate = "";
  renderStrategyStudio();

  try {
    const payload = await requestJson("/api/strategy/generate", {
      method: "POST",
      body: JSON.stringify(getStrategyInputPayload())
    });
    state.strategy.result = payload;
    state.strategy.normalizedInputs = payload.normalized_inputs || null;
    showToast("Strategy pipeline generated.");
  } catch (error) {
    state.strategy.errors.generate = error.message;
    showToast(error.message);
  } finally {
    state.strategy.loading.generate = false;
    renderStrategyStudio();
  }
}

function copyStrategyJson() {
  copyContent("strategyJsonOutput");
}

function setViewMode(mode, button) {
  state.viewMode = mode;
  document.querySelectorAll(".mode-tab, .utility-tab").forEach((tab) => {
    const isActive = tab.dataset.view === mode;
    tab.classList.toggle("is-active", isActive);
    if (tab.hasAttribute("aria-pressed")) {
      tab.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
  });
  if (button) {
    button.classList.add("is-active");
  }
  document.getElementById("overviewMode")?.classList.toggle("is-hidden", mode !== "overview");
  document.getElementById("singleMode")?.classList.toggle("is-hidden", mode !== "create" || state.createWorkspaceMode !== "single");
  document.getElementById("batchMode")?.classList.toggle("is-hidden", mode !== "create" || state.createWorkspaceMode !== "batch");
  document.getElementById("strategyMode")?.classList.toggle("is-hidden", mode !== "create" || state.createWorkspaceMode !== "strategy");
  document.getElementById("reviewMode")?.classList.toggle("is-hidden", mode !== "review");
  document.getElementById("runsMode")?.classList.toggle("is-hidden", mode !== "queue");
  document.getElementById("outputsMode")?.classList.toggle("is-hidden", mode !== "outputs");
  document.getElementById("publishMode")?.classList.toggle("is-hidden", mode !== "publish");
  document.getElementById("brandsMode")?.classList.toggle("is-hidden", mode !== "brands");
  mountWorkflowCards();
  renderViewScopedSections();
  syncDashboardViewSelection(mode);
  renderSpendSummary();
  renderOverviewScreen();
  renderReviewWorkspace();
  renderRunsView();
  renderOutputsWorkspace();
  renderPublishWorkspace();
  renderBrandsView();
  renderCreateSummaryCard();
  renderStrategyStudio();
}

function selectPipeline(pipeline, options = {}) {
  state.activePipeline = pipeline;
  ["edu", "comedy", "product"].forEach((value) => {
    document.getElementById(`pipeline-${value}`).classList.toggle("is-active", value === pipeline);
    document.getElementById(`pipeline-${value}`).setAttribute("aria-pressed", value === pipeline ? "true" : "false");
    document.getElementById(`fields-${value}`).classList.toggle("is-hidden", value !== pipeline);
  });

  renderSelectedCatalogProduct("single");
  renderIdeaAssist();
  if (!options.preserveJob) {
    resetSingleJob();
  } else {
    renderNarratedModeUi();
    updateSingleUploadMessaging();
    renderCreateSummaryCard();
  }
  updateSingleUploadMessaging();
  renderCreateSummaryCard();
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append("image", file);

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || "Upload failed.");
  }

  return payload.imageUrl;
}

function setZonePreview(zoneId, previewUrl, title) {
  const zone = document.getElementById(zoneId);
  if (!zone) {
    return;
  }

  setUploadRemoveButtonVisible(zoneId, true);
  zone.classList.add("has-image");
  const safePreviewUrl = sanitizeUrl(previewUrl, { allowBlob: true });
  zone.innerHTML = `${safePreviewUrl ? `<img src="${escapeHtml(safePreviewUrl)}" alt="${escapeHtml(title)}" />` : ""}<div class="upload-subtitle">${escapeHtml(title)}</div>`;
}

function getBatchUploadMeta(kind) {
  return {
    presenter: {
      zoneId: "batchPresenterZone",
      imageKey: "presenterImageUrl",
      previewKey: "presenterPreviewUrl",
      inputId: "batchPresenterInput",
      emptyTitle: "Upload presenter",
      emptySubtitle: "Used for education and comedy jobs"
    },
    presenterSecondary: {
      zoneId: "batchPresenterSecondaryZone",
      imageKey: "presenterSecondaryImageUrl",
      previewKey: "presenterSecondaryPreviewUrl",
      inputId: "batchPresenterSecondaryInput",
      emptyTitle: "Optional second presenter image",
      emptySubtitle: "Use this for reference, first frame, or last frame control"
    },
    product: {
      zoneId: "batchProductZone",
      imageKey: "productImageUrl",
      previewKey: "productPreviewUrl",
      inputId: "batchProductInput",
      emptyTitle: "Upload product override",
      emptySubtitle: "Only needed if you do not want to use catalog imagery"
    },
    productSecondary: {
      zoneId: "batchProductSecondaryZone",
      imageKey: "productSecondaryImageUrl",
      previewKey: "productSecondaryPreviewUrl",
      inputId: "batchProductSecondaryInput",
      emptyTitle: "Optional second product image",
      emptySubtitle: "Use this for reference, first frame, or last frame control"
    }
  }[kind] || null;
}

async function handleSingleUpload(slot, event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const isPrimary = slot !== "secondary";
  const zoneId = isPrimary ? "singleUploadZone" : "singleUploadZoneSecondary";
  const zone = document.getElementById(zoneId);
  state.single.uploading = true;
  if (isPrimary) {
    state.single.imageUrl = "";
  } else {
    state.single.secondaryImageUrl = "";
  }
  updateSingleRunState();
  setUploadZoneMessage(zone, "Uploading...", file.name);

  try {
    const uploadedImageUrl = await uploadFile(file);
    const previewUrl = URL.createObjectURL(file);
    clearIdeaAssistState();
    clearAllSingleIdeaMeta();
    renderIdeaAssist();
    if (isPrimary) {
      revokePreviewUrl(state.single.previewUrl);
      state.single.imageUrl = uploadedImageUrl;
      state.single.previewUrl = previewUrl;
      setZonePreview("singleUploadZone", previewUrl, file.name);
    } else {
      revokePreviewUrl(state.single.secondaryPreviewUrl);
      state.single.secondaryImageUrl = uploadedImageUrl;
      state.single.secondaryPreviewUrl = previewUrl;
      setZonePreview("singleUploadZoneSecondary", previewUrl, file.name);
    }
    state.single.uploading = false;
    clearFileInputValue(isPrimary ? "singleFileInput" : "singleFileInputSecondary");
    if (state.single.job?.mode === "narrated") {
      // Keep the narrated draft on screen when a late reference image is uploaded; it syncs on the next narrated action.
      updateSingleRunState();
      renderNarratedSegmentsCard();
      renderCreateSummaryCard();
      queueSingleAutoProgress(state.single.job);
    } else {
      resetSingleJob({ keepImage: true });
    }
  } catch (error) {
    state.single.uploading = false;
    if (isPrimary) {
      state.single.imageUrl = "";
    } else {
      state.single.secondaryImageUrl = "";
    }
    clearFileInputValue(isPrimary ? "singleFileInput" : "singleFileInputSecondary");
    setUploadZoneMessage(zone, "Upload failed", error.message);
    updateSingleRunState();
  }
}

function clearSingleUpload(slot = "primary") {
  const isPrimary = slot !== "secondary";
  const imageKey = isPrimary ? "imageUrl" : "secondaryImageUrl";
  const previewKey = isPrimary ? "previewUrl" : "secondaryPreviewUrl";
  const inputId = isPrimary ? "singleFileInput" : "singleFileInputSecondary";
  if (!state.single[imageKey] && !state.single[previewKey]) {
    return;
  }

  revokePreviewUrl(state.single[previewKey]);
  state.single[imageKey] = "";
  state.single[previewKey] = "";
  clearFileInputValue(inputId);
  clearIdeaAssistState();
  clearAllSingleIdeaMeta();
  renderIdeaAssist();

  if (isNarratedMode() || isSlidesMode()) {
    renderNarratedModeUi();
    refreshGenerationProfileUi("single");
    renderSlidesDraftCard();
    renderNarratedSegmentsCard();
    updateSingleRunState();
    renderCreateSummaryCard();
  } else {
    resetSingleJob({ keepImage: true });
    refreshGenerationProfileUi("single");
  }

  showToast(isPrimary ? "Photo removed. Upload another one when you're ready." : "Reference photo removed.");
}

async function handleBatchUpload(kind, event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const uploadMeta = getBatchUploadMeta(kind);

  if (!uploadMeta) {
    return;
  }

  const zoneId = uploadMeta.zoneId;
  const zone = document.getElementById(zoneId);
  setUploadZoneMessage(zone, "Uploading...", file.name);

  try {
    const imageUrl = await uploadFile(file);
    const previewUrl = URL.createObjectURL(file);
    clearIdeaAssistState();
    clearAllBatchIdeaMeta();
    renderIdeaAssist();
    revokePreviewUrl(state.batch[uploadMeta.previewKey]);
    state.batch[uploadMeta.imageKey] = imageUrl;
    state.batch[uploadMeta.previewKey] = previewUrl;

    setZonePreview(zoneId, previewUrl, file.name);
    clearFileInputValue(uploadMeta.inputId);
    renderSelectedCatalogProduct("batch");
    renderBatchProductRequirement();
    renderSpendSummary();
  } catch (error) {
    clearFileInputValue(uploadMeta.inputId);
    setUploadZoneMessage(zone, "Upload failed", error.message);
  }
}

function clearBatchUpload(kind) {
  const uploadMeta = getBatchUploadMeta(kind);
  if (!uploadMeta) {
    return;
  }

  if (!state.batch[uploadMeta.imageKey] && !state.batch[uploadMeta.previewKey]) {
    return;
  }

  revokePreviewUrl(state.batch[uploadMeta.previewKey]);
  state.batch[uploadMeta.imageKey] = "";
  state.batch[uploadMeta.previewKey] = "";
  clearFileInputValue(uploadMeta.inputId);
  clearIdeaAssistState();
  clearAllBatchIdeaMeta();
  renderIdeaAssist();
  setZoneEmpty(uploadMeta.zoneId, uploadMeta.emptyTitle, uploadMeta.emptySubtitle);
  refreshGenerationProfileUi("batch");
  renderSelectedCatalogProduct("batch");
  renderBatchProductRequirement();
  showToast("Photo removed. Upload another one when you're ready.");
}

function getNarratedModeFields() {
  return {
    voiceId: document.getElementById("narratedVoice")?.value || "rachel",
    platformPreset: document.getElementById("narratedPlatformPreset")?.value || "tiktok",
    targetLengthSeconds: getNarratedTargetLengthSeconds(),
    segmentCount: getNarratedSegmentCount(),
    templateId: document.getElementById("narratedTemplate")?.value || "problem_solution_result",
    hookAngle: document.getElementById("narratedHookAngle")?.value.trim() || "",
    narratorTone: document.getElementById("narratedNarratorTone")?.value || "brand_default",
    ctaStyle: document.getElementById("narratedCtaStyle")?.value || "soft",
    visualIntensity: document.getElementById("narratedVisualIntensity")?.value || "balanced"
  };
}

function getSlidesModeFields() {
  return {
    slideCount: getSlidesDraftCount(),
    slideDeckTitle: document.getElementById("slidesDeckTitleInput")?.value.trim() || ""
  };
}

function getPipelineFields(pipeline) {
  const modeFields = isNarratedMode()
    ? getNarratedModeFields()
    : isSlidesMode()
      ? getSlidesModeFields()
      : {};

  if (pipeline === "edu") {
    return {
      topic: document.getElementById("edu-topic").value.trim(),
      format: document.getElementById("edu-format").value,
      length: getEffectiveEduLength(),
      ...getSingleIdeaMeta("edu"),
      ...modeFields
    };
  }

  if (pipeline === "comedy") {
    return {
      scenario: document.getElementById("comedy-scenario").value.trim(),
      format: document.getElementById("comedy-format").value,
      energy: document.getElementById("comedy-energy").value,
      ...getSingleIdeaMeta("comedy"),
      ...modeFields
    };
  }

  const selectedProduct = getSelectedCatalogProduct("single");
  return {
    productId: selectedProduct?.id || "",
    productAsin: selectedProduct?.asin || "",
    productUrl: selectedProduct?.productUrl || "",
    productImageUrl: selectedProduct?.imageUrl || "",
    productGalleryImages: selectedProduct?.galleryImages || [],
    productDescription: selectedProduct?.description || "",
    productBenefits: selectedProduct?.benefits || [],
    productName: document.getElementById("product-name").value.trim() || selectedProduct?.title || "",
    benefit: document.getElementById("product-benefit").value.trim() || getProductBenefitText(selectedProduct),
    format: document.getElementById("product-format").value,
    cta: document.getElementById("product-cta").value,
    ...getSingleIdeaMeta("product"),
    ...modeFields
  };
}

function setSelectValue(select, value) {
  if (!select || value === undefined || value === null || value === "") {
    return;
  }

  const normalizedValue = String(value);
  if (select.querySelector(`option[value="${CSS.escape(normalizedValue)}"]`)) {
    select.value = normalizedValue;
  }
}

function setPipelineFields(pipeline, nextFields = {}, options = {}) {
  const onlyFillMissing = Boolean(options.onlyFillMissing);

  if (pipeline === "edu") {
    const input = document.getElementById("edu-topic");
    if (input && (!onlyFillMissing || !input.value.trim())) {
      input.value = nextFields.topic || "";
    }
    setSelectValue(document.getElementById("edu-format"), nextFields.format);
    setSingleIdeaMeta("edu", nextFields);
    renderIdeaAssist();
    return;
  }

  if (pipeline === "comedy") {
    const input = document.getElementById("comedy-scenario");
    if (input && (!onlyFillMissing || !input.value.trim())) {
      input.value = nextFields.scenario || "";
    }
    setSelectValue(document.getElementById("comedy-format"), nextFields.format);
    setSelectValue(document.getElementById("comedy-energy"), nextFields.energy);
    setSingleIdeaMeta("comedy", nextFields);
    renderIdeaAssist();
    return;
  }

  const productSelect = document.getElementById("product-catalog-select");
  if (productSelect && nextFields.productId) {
    setSelectValue(productSelect, nextFields.productId);
  }
  renderSelectedCatalogProduct("single");
  const productNameInput = document.getElementById("product-name");
  const benefitInput = document.getElementById("product-benefit");
  if (productNameInput && (!onlyFillMissing || !productNameInput.value.trim())) {
    productNameInput.value = nextFields.productName || "";
  }
  if (benefitInput && (!onlyFillMissing || !benefitInput.value.trim())) {
    benefitInput.value = nextFields.benefit || "";
  }
  setSelectValue(document.getElementById("product-format"), nextFields.format);
  setSelectValue(document.getElementById("product-cta"), nextFields.cta);
  setSingleIdeaMeta("product", nextFields);
  renderIdeaAssist();
}

function openCurrentRunOutputs(jobId = "") {
  if (jobId) {
    setDashboardSelection("output", jobId);
  }
  const outputsTab = document.getElementById("view-outputs");
  if (outputsTab) {
    setViewMode("outputs", outputsTab);
  }
  renderOutputsWorkspace(jobId || state.single.job?.id || "");
}

function maybeAutoOpenSingleOutputs(job = state.single.job) {
  const autoProgress = state.single.autoProgress;
  if (!autoProgress.enabled || autoProgress.outputsOpened) {
    return false;
  }

  let targetJobId = String(job?.id || "").trim();
  const readySequence = autoProgress.mode === "storyboard" ? getReadySingleSequenceResult() : null;
  const hasReadyOutput = autoProgress.mode === "storyboard"
    ? Boolean(readySequence?.videoUrl)
    : Boolean(job?.videoUrl);

  if (!hasReadyOutput) {
    return false;
  }

  if (autoProgress.mode === "storyboard") {
    targetJobId = String(state.single.sequence.compilation.finalJobId || targetJobId).trim();
  }

  autoProgress.outputsOpened = true;
  openCurrentRunOutputs(targetJobId);
  if (job?.isTerminal || autoProgress.mode === "storyboard") {
    autoProgress.enabled = false;
  }
  return true;
}

async function maybeAdvanceSingleJob(job = state.single.job) {
  const autoProgress = state.single.autoProgress;
  if (!autoProgress.enabled || autoProgress.pendingAction || !job || !isSingleAutoProgressTarget(job)) {
    maybeAutoOpenSingleOutputs(job);
    return;
  }

  if (job.status === "failed") {
    autoProgress.enabled = false;
    return;
  }

  if (job.mode === "slides" && autoProgress.mode === "slides" && job.status === "slides_ready" && !autoProgress.steps.renderSlides && !state.single.slideAction.rendering && !state.single.slideAction.saving) {
    autoProgress.pendingAction = "renderSlides";
    autoProgress.steps.renderSlides = true;
    try {
      await renderSlidesVideo({ autoProgress: true });
    } finally {
      autoProgress.pendingAction = "";
    }
    return;
  }

  if (job.mode === "narrated" && autoProgress.mode === "narrated") {
    if (job.status === "script_ready" && !autoProgress.steps.voice) {
      autoProgress.pendingAction = "voice";
      autoProgress.steps.voice = true;
      try {
        await generateNarratedVoice({ autoProgress: true });
      } finally {
        autoProgress.pendingAction = "";
      }
      return;
    }

    if (["voice_ready", "broll_ready"].includes(job.status) && !autoProgress.steps.broll) {
      const validationMessage = getNarratedBrollValidationMessage(job);
      if (validationMessage) {
        if (autoProgress.blockedReason !== validationMessage) {
          autoProgress.blockedReason = validationMessage;
          showToast(validationMessage);
        }
        clearSinglePoll();
        return;
      }

      autoProgress.blockedReason = "";
      autoProgress.pendingAction = "broll";
      autoProgress.steps.broll = true;
      try {
        await generateNarratedBroll({ autoProgress: true });
      } finally {
        autoProgress.pendingAction = "";
      }
      return;
    }

    if (job.status === "ready_to_compose" && !autoProgress.steps.compose) {
      autoProgress.pendingAction = "compose";
      autoProgress.steps.compose = true;
      try {
        await composeNarratedVideo({ autoProgress: true });
      } finally {
        autoProgress.pendingAction = "";
      }
      return;
    }
  }

  maybeAutoOpenSingleOutputs(job);
}

function queueSingleAutoProgress(job = state.single.job) {
  const autoProgress = state.single.autoProgress;
  if (!autoProgress.enabled || autoProgress.queued) {
    maybeAutoOpenSingleOutputs(job);
    return;
  }

  autoProgress.queued = true;
  window.setTimeout(async () => {
    autoProgress.queued = false;
    try {
      await maybeAdvanceSingleJob(job);
    } catch (error) {
      autoProgress.pendingAction = "";
      showToast(error.message);
    }
  }, 0);
}

function hydrateGenerationConfig(scope = "single", generationConfig = {}) {
  const controlIds = getGenerationControlIds(scope);
  const profileSelect = document.getElementById(controlIds.selectId);
  const fallbackSelect = document.getElementById(controlIds.fallbackSelectId);
  if (profileSelect && generationConfig.profileId) {
    setSelectValue(profileSelect, generationConfig.profileId);
  }
  refreshGenerationProfileUi(scope);
  if (fallbackSelect) {
    setSelectValue(fallbackSelect, generationConfig.fallbackProfileId || "");
  }
  setSelectValue(document.getElementById(controlIds.durationSelectId), generationConfig.duration);
  setSelectValue(document.getElementById(controlIds.resolutionSelectId), generationConfig.resolution);
  const audioInput = document.getElementById(controlIds.audioInputId);
  const multiShotsInput = document.getElementById(controlIds.multiShotsInputId);
  const elementsInput = document.getElementById(controlIds.elementsInputId);
  if (audioInput && generationConfig.generateAudio !== undefined) {
    audioInput.checked = Boolean(generationConfig.generateAudio);
    audioInput.dataset.lastProfileId = generationConfig.profileId || "";
  }
  if (multiShotsInput && generationConfig.multiShots !== undefined) {
    multiShotsInput.checked = Boolean(generationConfig.multiShots);
    multiShotsInput.dataset.lastProfileId = generationConfig.profileId || "";
  }
  if (elementsInput && generationConfig.useElements !== undefined) {
    elementsInput.checked = Boolean(generationConfig.useElements);
    elementsInput.dataset.lastProfileId = generationConfig.profileId || "";
  }
  renderSpendSummary();
}

function setSingleImagePreview(slot, imageUrl, title = "Saved image") {
  const safeImageUrl = sanitizeUrl(imageUrl);
  const isPrimary = slot !== "secondary";
  if (isPrimary) {
    state.single.imageUrl = safeImageUrl;
    state.single.previewUrl = safeImageUrl;
    if (safeImageUrl) {
      setZonePreview("singleUploadZone", safeImageUrl, title);
    }
  } else {
    state.single.secondaryImageUrl = safeImageUrl;
    state.single.secondaryPreviewUrl = safeImageUrl;
    if (safeImageUrl) {
      setZonePreview("singleUploadZoneSecondary", safeImageUrl, title);
    }
  }
}

function hydrateSingleImagesFromJob(job) {
  const generationImageUrls = Array.isArray(job.providerConfig?.generationConfig?.imageUrls)
    ? job.providerConfig.generationConfig.imageUrls.map((value) => sanitizeUrl(value)).filter(Boolean)
    : [];
  const primaryImageUrl = sanitizeUrl(job.sourceImageUrl || generationImageUrls[0] || "");
  const orderedImageUrls = primaryImageUrl
    ? [primaryImageUrl, ...generationImageUrls.filter((value) => value !== primaryImageUrl)]
    : generationImageUrls;
  const secondaryImageUrl = orderedImageUrls[1] || "";

  state.single.imageUrl = "";
  state.single.previewUrl = "";
  state.single.secondaryImageUrl = "";
  state.single.secondaryPreviewUrl = "";

  if (primaryImageUrl) {
    setSingleImagePreview("primary", primaryImageUrl, isNarratedMode() || isSlidesMode() ? "Saved reference image" : "Saved source image");
  } else {
    setZoneEmpty("singleUploadZone", "Drop an image here", "or click to choose a file");
  }

  if (secondaryImageUrl) {
    setSingleImagePreview("secondary", secondaryImageUrl, "Saved secondary image");
  } else {
    setZoneEmpty("singleUploadZoneSecondary", "Optional second image", "Use this for reference or first/last frame models");
  }
}

function hydrateModeFieldsFromJob(job) {
  if (job.mode === "narrated") {
    setSelectValue(document.getElementById("narratedVoice"), job.fields?.voiceId);
    setSelectValue(document.getElementById("narratedPlatformPreset"), job.fields?.platformPreset);
    setSelectValue(document.getElementById("narratedSegmentCount"), String(job.fields?.segmentCount || job.segments?.length || ""));
    setSelectValue(document.getElementById("narratedTemplate"), job.fields?.templateId);
    document.getElementById("narratedHookAngle").value = job.fields?.hookAngle || "";
    setSelectValue(document.getElementById("narratedNarratorTone"), job.fields?.narratorTone);
    setSelectValue(document.getElementById("narratedCtaStyle"), job.fields?.ctaStyle);
    setSelectValue(document.getElementById("narratedVisualIntensity"), job.fields?.visualIntensity);
    return;
  }

  if (job.mode === "slides") {
    setSelectValue(document.getElementById("slidesCount"), String(job.fields?.slideCount || job.slides?.length || ""));
    document.getElementById("slidesDeckTitleInput").value = job.fields?.slideDeckTitle || "";
  }
}

function hydrateSingleJobContext(job) {
  const brandSelect = document.getElementById("brandSelect");
  if (brandSelect && brandSelect.querySelector(`option[value="${job.brandId}"]`)) {
    brandSelect.value = job.brandId;
  }
  renderCatalogProductSelects();
  renderActiveBrandSummary();
  renderNarratedTemplateMeta();
  renderBatchProductRequirement();
  renderBrandsView();
  selectPipeline(job.pipeline, { preserveJob: true });
  state.single.creationMode = getCreationModeForJob(job);
  const videoCountSelect = document.getElementById("singleVideoCount");
  if (videoCountSelect) {
    videoCountSelect.value = String(Math.max(1, Number.parseInt(job.fields?.sequenceCount, 10) || 1));
  }
  hydrateGenerationConfig("single", job.providerConfig?.generationConfig || {});
  setPipelineFields(job.pipeline, job.fields || {});
  hydrateModeFieldsFromJob(job);
  renderNarratedModeUi();
  hydrateSingleImagesFromJob(job);
}

function applyIdeaSuggestion(suggestion, pipeline = state.activePipeline, options = {}) {
  if (!suggestion?.fields) {
    return;
  }

  setPipelineFields(pipeline, suggestion.fields, {
    onlyFillMissing: Boolean(options.onlyFillMissing)
  });
  if (shouldAutoSyncNarratedHookAngle()) {
    applySuggestedNarratedHookAngle(suggestion.fields.hookAngle, {
      onlyFillMissing: Boolean(options.onlyFillMissing)
    });
  }

  if (!options.silent) {
    showToast(`Using AI-generated ${getIdeaAssistMeta(pipeline).fieldName}.`);
  }
}

function applyIdeaSuggestionByIndex(pipeline, index) {
  const suggestion = getIdeaAssistState(pipeline).suggestions[index];
  applyIdeaSuggestion(suggestion, pipeline);
}

async function requestIdeaSuggestions(pipeline, count = 3, options = {}) {
  const pipelineState = getIdeaAssistState(pipeline);
  const payload = await requestJson("/api/ideas", {
    method: "POST",
    body: JSON.stringify({
      brandId: getActiveBrandId(),
      pipeline,
      count,
      imageUrl: options.imageUrl || "",
      analysis: options.analysis !== undefined ? options.analysis : (pipelineState.analysis || ""),
      fields: options.fields || getPipelineFields(pipeline),
      sequenceOptions: options.sequenceOptions || {}
    })
  });

  pipelineState.suggestions = payload.suggestions || [];
  if (payload.analysis) {
    pipelineState.analysis = payload.analysis;
  }

  return pipelineState.suggestions;
}

async function generateIdeasForActivePipeline() {
  if (state.ideaAssist.loading) {
    return;
  }

  state.ideaAssist.loading = true;
  renderIdeaAssist();

  try {
    const count = isSingleSequenceRequested() ? getSingleVideoCount() : 3;
    await requestIdeaSuggestions(state.activePipeline, count, {
      imageUrl: getEffectiveSingleImageUrl(),
      sequenceOptions: {
        sequence: count > 1,
        totalCount: count,
        existingItems: []
      }
    });
  } catch (error) {
    showToast(error.message);
  } finally {
    state.ideaAssist.loading = false;
    renderIdeaAssist();
  }
}

async function regenerateIdeasForActivePipeline() {
  await generateIdeasForActivePipeline();
}

async function ensureSingleIdeaFields() {
  const pipeline = state.activePipeline;
  if (!fieldsNeedIdea(pipeline)) {
    return getPipelineFields(pipeline);
  }

  state.ideaAssist.loading = true;
  renderIdeaAssist();
  try {
    const suggestions = await requestIdeaSuggestions(pipeline, 1, {
      imageUrl: getEffectiveSingleImageUrl(),
      sequenceOptions: {
        sequence: false,
        totalCount: 1,
        existingItems: []
      }
    });
    if (suggestions[0]) {
      applyIdeaSuggestion(suggestions[0], pipeline, {
        onlyFillMissing: true,
        silent: true
      });
      showToast(`Generated a ${getIdeaAssistMeta(pipeline).fieldName} for this run.`);
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    state.ideaAssist.loading = false;
    renderIdeaAssist();
  }

  return getPipelineFields(pipeline);
}

function getSingleSequenceItemLabel(pipeline, fields = {}, index = 0) {
  if (pipeline === "edu") {
    return fields.topic || `Education clip ${index + 1}`;
  }

  if (pipeline === "comedy") {
    return fields.scenario || `Comedy clip ${index + 1}`;
  }

  const productName = fields.productName || "Product";
  const benefit = fields.benefit ? ` - ${fields.benefit}` : "";
  return `${productName}${benefit}`.trim() || `Product clip ${index + 1}`;
}

async function buildSingleSequenceItems() {
  const count = getSingleVideoCount();
  const pipeline = state.activePipeline;
  const baseFields = getPipelineFields(pipeline);
  const sequenceGroupId = createClientSequenceGroupId();

  state.ideaAssist.loading = true;
  renderIdeaAssist();

  try {
    const suggestions = await requestIdeaSuggestions(pipeline, count, {
      imageUrl: getEffectiveSingleImageUrl(),
      analysis: "",
      fields: baseFields,
      sequenceOptions: {
        sequence: count > 1,
        totalCount: count,
        existingItems: []
      }
    });

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      throw new Error("The app could not outline the linked sequence for this run.");
    }

    const items = Array.from({ length: count }, (_, index) => {
      const suggestion = suggestions[index] || suggestions[suggestions.length - 1] || { fields: {} };
      const fields = {
        ...baseFields,
        ...(suggestion.fields || {}),
        sequenceGroupId,
        sequenceIsFinalOutput: false
      };

      return {
        localId: `single-${pipeline}-${index}`,
        pipeline,
        label: suggestion.label || getSingleSequenceItemLabel(pipeline, fields, index),
        fields,
        status: "creating",
        note: "Preparing this clip.",
        jobId: null,
        job: null
      };
    });

    if (suggestions[0]?.fields) {
      setPipelineFields(pipeline, {
        ...baseFields,
        ...suggestions[0].fields
      }, {
        onlyFillMissing: true
      });
    }

    return items;
  } finally {
    state.ideaAssist.loading = false;
    renderIdeaAssist();
  }
}

function getBatchTextAreaLines(id) {
  return document.getElementById(id).value
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

function setBatchTextAreaLines(id, lines) {
  document.getElementById(id).value = lines.filter(Boolean).join("\n");
}

function getBatchPlanConfig(pipeline) {
  if (pipeline === "edu") {
    return {
      pipeline,
      count: Number.parseInt(document.getElementById("batch-edu-count").value, 10) || 0,
      textareaId: "batch-edu-topics",
      imageUrl: state.batch.presenterImageUrl,
      label: "topics"
    };
  }

  if (pipeline === "comedy") {
    return {
      pipeline,
      count: Number.parseInt(document.getElementById("batch-comedy-count").value, 10) || 0,
      textareaId: "batch-comedy-scenarios",
      imageUrl: state.batch.presenterImageUrl,
      label: "scenarios"
    };
  }

  return {
    pipeline,
    count: Number.parseInt(document.getElementById("batch-product-count").value, 10) || 0,
    textareaId: "batch-products",
    imageUrl: getBatchImageUrlsForPipeline("product")[0] || "",
    label: "product angles"
  };
}

function getBatchBaseFields(pipeline) {
  if (pipeline !== "product") {
    return {};
  }

  const selectedProduct = getSelectedCatalogProduct("batch");
  return {
    productId: selectedProduct?.id || "",
    productAsin: selectedProduct?.asin || "",
    productUrl: selectedProduct?.productUrl || "",
    productImageUrl: selectedProduct?.imageUrl || "",
    productGalleryImages: selectedProduct?.galleryImages || [],
    productDescription: selectedProduct?.description || "",
    productBenefits: selectedProduct?.benefits || [],
    productName: selectedProduct?.title || "",
    benefit: getProductBenefitText(selectedProduct)
  };
}

function getBatchIdeaLabel(pipeline) {
  if (pipeline === "edu") {
    return "topics";
  }

  if (pipeline === "comedy") {
    return "scenarios";
  }

  return "product angles";
}

function getBatchCategoryLabel(pipeline) {
  if (pipeline === "edu") {
    return "Education reel";
  }

  if (pipeline === "comedy") {
    return "Comedy reel";
  }

  return "Product reel";
}

function isFalConfigured() {
  return Boolean(state.system.health?.providers?.fal?.configured);
}

function getBatchSubmittedCount() {
  return state.batch.items.filter((item) => Boolean(item.jobId)).length;
}

function hasBatchPendingQueueItems() {
  return state.batch.items.some((item) => !item.jobId && !["stopped"].includes(item.status || ""));
}

function hasBatchActiveSubmittedJobs() {
  return state.batch.items.some((item) => {
    if (!item.jobId) {
      return false;
    }

    const status = item.job?.status || item.status || "queued";
    return !["ready", "distributed", "failed", "stopped"].includes(status);
  });
}

function resetBatchControlState() {
  state.batch.control = {
    running: false,
    submitting: false,
    paused: false,
    stopRequested: false,
    queueCompleted: false,
    monitoring: false
  };
}

function isBatchTerminal() {
  return state.batch.items.length > 0
    && state.batch.items.every((item) => ["ready", "distributed", "failed", "stopped"].includes(item.job?.status || item.status));
}

function buildBatchCompileGroups() {
  return ["edu", "comedy", "product"]
    .map((pipeline) => {
      const items = state.batch.items.filter((item) => item.pipeline === pipeline);
      if (items.length === 0) {
        return null;
      }

      return {
        pipeline,
        label: getBatchCategoryLabel(pipeline),
        requestedSegments: items.length,
        videoUrls: items
          .map((item) => item.job?.videoUrl || "")
          .filter(Boolean)
      };
    })
    .filter(Boolean);
}

function renderBatchRunControls() {
  const runButton = document.getElementById("batchRunButton");
  const pauseButton = document.getElementById("batchPauseButton");
  const stopButton = document.getElementById("batchStopButton");
  const hint = document.getElementById("batchRunHint");
  if (!runButton || !pauseButton || !stopButton || !hint) {
    return;
  }

  const hasItems = state.batch.items.length > 0;
  const hasSubmittedJobs = getBatchSubmittedCount() > 0;
  const activeJobs = hasBatchActiveSubmittedJobs();
  const activeSession = state.batch.control.running;

  hint.classList.remove("is-success", "is-warning");

  if (!activeSession) {
    runButton.disabled = false;
    runButton.textContent = "Queue full batch";
    pauseButton.disabled = true;
    pauseButton.textContent = "Pause batch";
    stopButton.disabled = true;
    stopButton.textContent = "Stop batch";
    hint.textContent = hasItems
      ? "Queue a fresh batch run, then use pause or stop if you need to intervene."
      : "Queue a batch to unlock pause, stop, and final reel compilation controls.";
    return;
  }

  runButton.disabled = true;
  if (state.batch.control.submitting) {
    runButton.textContent = state.batch.control.stopRequested
      ? "Stopping queue..."
      : state.batch.control.paused
        ? "Batch paused"
        : "Queueing batch...";
  } else if (activeJobs) {
    runButton.textContent = state.batch.control.paused
      ? "Monitoring paused"
      : state.batch.control.stopRequested
        ? "Finishing submitted jobs..."
        : "Batch running";
  } else {
    runButton.textContent = state.batch.control.stopRequested ? "Stopping batch..." : "Batch running";
  }

  pauseButton.disabled = state.batch.control.stopRequested || (!state.batch.control.submitting && !activeJobs);
  pauseButton.textContent = state.batch.control.paused ? "Resume batch" : "Pause batch";
  stopButton.disabled = state.batch.control.stopRequested || (!state.batch.control.submitting && !activeJobs && !hasSubmittedJobs);
  stopButton.textContent = state.batch.control.stopRequested ? "Stop requested" : "Stop batch";

  if (state.batch.control.stopRequested) {
    hint.textContent = hasSubmittedJobs
      ? "No more clips will be queued. Already-submitted jobs will keep finishing in the background."
      : "Stop requested. Remaining clips will not be queued.";
    hint.classList.add("is-warning");
  } else if (state.batch.control.paused) {
    hint.textContent = state.batch.control.submitting
      ? "Batch queueing is paused. Resume when you're ready to keep creating clips."
      : "Batch monitoring is paused. Submitted jobs may still finish on the provider side.";
    hint.classList.add("is-warning");
  } else if (state.batch.control.submitting) {
    hint.textContent = "Queueing clips now. Use pause to hold the line or stop to prevent the remaining clips from starting.";
  } else if (activeJobs) {
    hint.textContent = "Submitted clips are still rendering. Once each category is done, the app will compile one final reel per category.";
  } else {
    hint.textContent = "This batch session is wrapping up.";
  }
}

function renderBatchCompilation() {
  const button = document.getElementById("batchCompileButton");
  const hint = document.getElementById("batchCompileHint");
  const outputs = document.getElementById("batchCompiledOutputs");
  if (!button || !hint || !outputs) {
    return;
  }

  const groups = buildBatchCompileGroups();
  const hasReadySegments = groups.some((group) => group.videoUrls.length > 0);
  const requiresMerge = groups.some((group) => group.videoUrls.length > 1);
  const mergeUnavailable = requiresMerge && !isFalConfigured();
  const showButton = hasReadySegments && (isBatchTerminal() || state.batch.compilation.results.length > 0 || mergeUnavailable);

  button.classList.toggle("is-hidden", !showButton);
  button.disabled = state.batch.compilation.loading || !hasReadySegments || mergeUnavailable;
  if (state.batch.compilation.loading) {
    button.textContent = "Compiling category reels...";
  } else if (mergeUnavailable) {
    button.textContent = "Set FAL_KEY to stitch reels";
  } else {
    button.textContent = state.batch.compilation.results.length > 0
      ? "Recompile category reels"
      : "Compile category reels";
  }

  hint.classList.remove("is-success", "is-warning");
  if (state.batch.compilation.loading) {
    hint.textContent = "Compiling one final education, comedy, and product reel from the finished clips.";
  } else if (mergeUnavailable && hasReadySegments) {
    hint.textContent = "Clips are finishing, but this Render service is missing FAL stitching. Add FAL_KEY to get one final reel per category instead of separate downloads.";
    hint.classList.add("is-warning");
  } else if (state.batch.compilation.error) {
    hint.textContent = state.batch.compilation.error;
    hint.classList.add("is-warning");
  } else if (state.batch.compilation.results.length > 0) {
    const readyCount = state.batch.compilation.results.filter((result) => result.status === "ready").length;
    const failedCount = state.batch.compilation.results.filter((result) => result.status === "failed").length;
    hint.textContent = failedCount > 0
      ? `Compiled ${readyCount} category reel${readyCount === 1 ? "" : "s"}. ${failedCount} need${failedCount === 1 ? "s" : ""} attention.`
      : `Compiled ${readyCount} final category reel${readyCount === 1 ? "" : "s"}.`;
    hint.classList.add(failedCount > 0 ? "is-warning" : "is-success");
  } else if (isBatchTerminal() && hasReadySegments) {
    hint.textContent = "Batch complete. Compile final category reels now, or wait for the automatic compile.";
  } else {
    hint.textContent = "Batch completion will auto-compile one final video per category.";
  }

  if (!state.batch.compilation.results.length) {
    outputs.innerHTML = "";
    return;
  }

  outputs.innerHTML = state.batch.compilation.results.map((result) => `
    <div class="result-item ${result.status === "ready" ? "is-success" : "is-failed"}">
      <strong>${escapeHtml(result.label)}</strong>
      <div>${escapeHtml(result.sourceSegments)} of ${escapeHtml(result.requestedSegments)} clip${result.requestedSegments === 1 ? "" : "s"} ${result.merged ? "stitched into one final reel" : "available as the final output"}.</div>
      <div>${escapeHtml(result.error || (result.videoUrl ? "Ready." : "Compilation did not return a video URL."))}</div>
      ${result.videoUrl ? `<div>${safeLinkHtml(result.videoUrl, "Open final video")}</div>` : ""}
    </div>
  `).join("");
}

function renderBatchIdeaButtons() {
  ["edu", "comedy", "product"].forEach((pipeline) => {
    const action = state.batch.ideaLoading[pipeline] || "";
    const generateButton = document.getElementById(`batch-${pipeline}-generate`);
    const regenerateButton = document.getElementById(`batch-${pipeline}-regenerate`);
    if (!generateButton || !regenerateButton) {
      return;
    }

    const label = getBatchIdeaLabel(pipeline);
    const isLoading = Boolean(action);

    generateButton.disabled = isLoading;
    regenerateButton.disabled = isLoading;
    generateButton.classList.toggle("is-loading", isLoading);
    regenerateButton.classList.toggle("is-loading", isLoading);
    generateButton.textContent = action === "generate" ? `Generating ${label}...` : `Generate ${label}`;
    regenerateButton.textContent = action === "regenerate" ? `Refreshing ${label}...` : `Regenerate ${label}`;
  });
}

function formatBatchIdeaLine(suggestion) {
  if (!suggestion) {
    return "";
  }

  if (suggestion.fields?.productName || suggestion.fields?.benefit) {
    const productName = suggestion.fields.productName || "";
    const benefit = suggestion.fields.benefit || "";
    return suggestion.label || `${productName} — ${benefit}`;
  }

  return suggestion.label || suggestion.fields?.topic || suggestion.fields?.scenario || "";
}

async function populateBatchIdeas(pipeline, options = {}) {
  const plan = getBatchPlanConfig(pipeline);
  const replace = Boolean(options.replace);
  const existingLines = getBatchTextAreaLines(plan.textareaId);
  const existingMeta = getBatchIdeaMetaList(pipeline);
  const requestCount = replace ? plan.count : Math.max(plan.count - existingLines.length, 0);

  if (plan.count <= 0) {
    if (!options.silent) {
      showToast(`Set the ${pipeline} batch count above 0 first.`);
    }
    return 0;
  }

  if (requestCount <= 0) {
    if (!options.silent) {
      showToast(`You already have ${plan.count} ${plan.label}. Use regenerate to replace them.`);
    }
    return 0;
  }

  const suggestions = await requestIdeaSuggestions(plan.pipeline, requestCount, {
    imageUrl: plan.imageUrl,
    analysis: "",
    fields: getBatchBaseFields(pipeline),
    sequenceOptions: {
      sequence: plan.count > 1,
      totalCount: plan.count,
      existingItems: replace ? [] : existingLines
    }
  });
  const generatedLines = suggestions.slice(0, requestCount).map(formatBatchIdeaLine).filter(Boolean);
  const generatedMeta = suggestions.slice(0, requestCount).map((suggestion) => extractSequenceMeta(suggestion.fields || {}));
  const nextLines = replace
    ? generatedLines.slice(0, plan.count)
    : existingLines.concat(generatedLines).slice(0, plan.count);
  const nextMeta = replace
    ? generatedMeta.slice(0, plan.count)
    : existingMeta.slice(0, existingLines.length).concat(generatedMeta).slice(0, plan.count);

  setBatchTextAreaLines(plan.textareaId, nextLines);
  setBatchIdeaMetaList(pipeline, nextMeta);

  if (!options.silent && generatedLines.length > 0) {
    showToast(replace
      ? `Regenerated ${generatedLines.length} ${plan.label}.`
      : `Generated ${generatedLines.length} ${plan.label}.`);
  }

  return generatedLines.length;
}

async function generateBatchIdeasForPipeline(pipeline) {
  state.batch.ideaLoading[pipeline] = "generate";
  renderBatchIdeaButtons();
  try {
    await populateBatchIdeas(pipeline);
  } catch (error) {
    showToast(error.message);
  } finally {
    state.batch.ideaLoading[pipeline] = "";
    renderBatchIdeaButtons();
  }
}

async function regenerateBatchIdeasForPipeline(pipeline) {
  state.batch.ideaLoading[pipeline] = "regenerate";
  renderBatchIdeaButtons();
  try {
    await populateBatchIdeas(pipeline, { replace: true });
  } catch (error) {
    showToast(error.message);
  } finally {
    state.batch.ideaLoading[pipeline] = "";
    renderBatchIdeaButtons();
  }
}

async function compileBatchOutputs(options = {}) {
  const groups = buildBatchCompileGroups();
  if (groups.length === 0 || groups.every((group) => group.videoUrls.length === 0)) {
    if (!options.silent) {
      showToast("No ready category clips are available to compile yet.");
    }
    return [];
  }

  const mergeUnavailable = groups.some((group) => group.videoUrls.length > 1) && !isFalConfigured();
  if (mergeUnavailable) {
    state.batch.compilation.results = groups
      .filter((group) => group.videoUrls.length === 1)
      .map((group) => ({
        pipeline: group.pipeline,
        label: group.label,
        requestedSegments: group.requestedSegments,
        sourceSegments: 1,
        merged: false,
        status: "ready",
        videoUrl: group.videoUrls[0],
        error: null
      }));
    state.batch.compilation.error = "FAL stitching is not configured on this server yet. Add FAL_KEY in Render to merge multiple batch clips into one final reel.";
    renderBatchCompilation();
    if (!options.silent) {
      showToast("Set FAL_KEY in Render to stitch multi-clip category reels.");
    }
    return state.batch.compilation.results;
  }

  state.batch.compilation.loading = true;
  state.batch.compilation.error = "";
  renderBatchCompilation();

  try {
    const payload = await requestJson("/api/batch/compile", {
      method: "POST",
      body: JSON.stringify({ groups })
    });

    state.batch.compilation.results = payload.results || [];
    const failedCount = state.batch.compilation.results.filter((result) => result.status === "failed").length;
    const readyCount = state.batch.compilation.results.filter((result) => result.status === "ready").length;
    if (!options.silent) {
      showToast(failedCount > 0
        ? `Compiled ${readyCount} category reels. ${failedCount} need attention.`
        : `Compiled ${readyCount} final category reels.`);
    }
    return state.batch.compilation.results;
  } catch (error) {
    state.batch.compilation.results = [];
    state.batch.compilation.error = error.message;
    if (!options.silent) {
      showToast(error.message);
    }
    return [];
  } finally {
    state.batch.compilation.loading = false;
    renderBatchCompilation();
  }
}

async function ensureBatchIdeas() {
  let generated = 0;

  for (const pipeline of ["edu", "comedy", "product"]) {
    try {
      generated += await populateBatchIdeas(pipeline, { silent: true });
    } catch (error) {
      showToast(`Could not auto-generate ${pipeline} ideas. The backend will still try on run.`);
    }
  }

  return generated;
}

function clearSinglePoll() {
  if (state.single.pollTimer) {
    clearInterval(state.single.pollTimer);
    state.single.pollTimer = null;
  }
}

function invalidateSingleRequests() {
  state.single.requestVersion += 1;
  return state.single.requestVersion;
}

function isSingleRequestCurrent(requestVersion) {
  return requestVersion === state.single.requestVersion;
}

function clearBatchPoll() {
  if (state.batch.pollTimer) {
    clearInterval(state.batch.pollTimer);
    state.batch.pollTimer = null;
  }
}

function resetSingleJob(options = {}) {
  clearSinglePoll();
  invalidateSingleRequests();
  state.single.job = null;
  state.single.readyToastShownFor = null;
  resetSingleAutoProgress();
  state.single.slideAction.saving = false;
  state.single.slideAction.rendering = false;
  state.single.slideAction.draftPayload = null;
  resetSingleSequenceState();
  state.captionsDirty = { tiktok: false, instagram: false, youtube: false };
  document.getElementById("retryButton").classList.add("is-hidden");
  document.getElementById("distributeButton").disabled = true;
  document.getElementById("distributionResults").innerHTML = "";
  document.getElementById("videoWrap").innerHTML = "";
  document.getElementById("videoSpinner").classList.add("is-hidden");
  renderVideoSpinnerCopy(null);
  document.getElementById("narratedTitleInput").value = "";
  document.getElementById("narratedSegmentsList").innerHTML = "";
  document.getElementById("saveNarratedSegmentsButton").disabled = true;
  document.getElementById("generateNarratedVoiceButton").disabled = true;
  document.getElementById("generateNarratedBrollButton").disabled = true;
  document.getElementById("composeNarratedVideoButton").disabled = true;
  document.getElementById("slidesDeckTitleInput").value = "";
  document.getElementById("slidesDraftList").innerHTML = "";
  document.getElementById("saveSlidesButton").disabled = true;
  document.getElementById("renderSlidesVideoButton").disabled = true;
  setPromptMetrics(0);
  [
    ["analysis", "Waiting for a run."],
    ["script", "Waiting for analysis."],
    ["prompt", "Waiting for script."],
    ["video", "Waiting for prompt."],
    ["captions", "Waiting for script."],
    ["distribution", "Waiting for video."]
  ].forEach(([step, label]) => setStepState(step, "waiting", label));
  ["analysis", "script", "prompt"].forEach((step) => {
    document.getElementById(`content-${step}`).textContent = "";
  });
  ["tiktok", "instagram", "youtube"].forEach((platform) => {
    document.getElementById(`caption-${platform}`).value = "";
    document.getElementById(`hashtags-${platform}`).value = "";
  });

  if (!options.keepImage) {
    state.single.imageUrl = "";
    state.single.previewUrl = "";
    state.single.secondaryImageUrl = "";
    state.single.secondaryPreviewUrl = "";
    setZoneEmpty("singleUploadZone", "Drop an image here", "or click to choose a file");
    setZoneEmpty("singleUploadZoneSecondary", "Optional second image", "Use this for reference or first/last frame models");
  }

  renderSingleSequenceCard();
  renderNarratedSegmentsCard();
  renderSlidesDraftCard();
  renderNarratedModeUi();
  updateSingleRunState();
  renderCreateSummaryCard();
}

function setStepState(step, stateName, label) {
  const card = document.getElementById(`step-${step}`);
  card.classList.remove("is-running", "is-done", "is-error");
  if (stateName === "running") card.classList.add("is-running");
  if (stateName === "done") card.classList.add("is-done");
  if (stateName === "error") card.classList.add("is-error");
  document.getElementById(`status-${step}`).textContent = label;
}

function setPromptMetrics(length, nearLimit = false, tooLong = false) {
  const pill = document.getElementById("promptMetrics");
  pill.textContent = `${length} / 1800`;
  pill.classList.toggle("is-warning", Boolean(nearLimit));
  pill.classList.toggle("is-error", Boolean(tooLong));
}

function normalizeStepLabel(job, step) {
  const stepState = job.stepState[step];
  if (stepState === "done") {
    if (job.mode === "narrated" && step === "script" && job.status === "script_ready") {
      return "Narration draft ready.";
    }
    if (job.mode === "slides" && step === "script" && job.status === "slides_ready") {
      return "Slide draft ready.";
    }
    if (job.mode === "narrated" && step === "prompt" && ["broll_ready", "rendering_broll", "ready_to_compose", "composing", "ready"].includes(job.status)) {
      return "B-roll prompts ready.";
    }
    if (job.mode === "narrated" && step === "video" && job.status === "ready_to_compose") {
      return "B-roll video segments ready to compose.";
    }
    if (step === "video") return job.videoUrl ? "Video ready." : "Complete.";
    if (step === "distribution") {
      const results = job.distribution?.results || [];
      if (results.length === 0) return "Waiting for video.";
      if (results.some((result) => result.status === "failed")) return "Some platforms failed.";
      return "Distribution complete.";
    }
    return "Complete.";
  }

  if (stepState === "error") {
    return job.error || "This step failed.";
  }

  if (stepState === "running") {
    const labels = {
      analysis: "Analyzing image...",
      script: job.mode === "narrated"
        ? "Planning narration..."
        : job.mode === "slides"
          ? "Planning slide draft..."
          : "Writing script...",
      captions: "Generating captions...",
      prompt: job.mode === "narrated"
        ? "Planning B-roll prompts..."
        : job.mode === "slides"
          ? "Building slide deck summary..."
          : "Building video prompt...",
      video: job.mode === "narrated"
        ? job.status === "composing"
          ? "Composing final narrated video..."
          : "Generating B-roll video segments..."
        : job.mode === "slides"
          ? "Rendering slide video..."
        : job.status === "awaiting_generation"
          ? "Waiting for the next render slot..."
          : job.status === "submitting"
            ? "Starting video generation..."
            : "Generating video...",
      distribution: "Distributing..."
    };
    return labels[step];
  }

  const waiting = {
    analysis: "Waiting for a run.",
    script: job.mode === "narrated" && job.status === "voice_ready"
      ? "Narration and voice-over are ready."
      : job.mode === "slides"
        ? "Waiting for slide draft."
        : "Waiting for analysis.",
    captions: "Waiting for script.",
    prompt: job.mode === "narrated" && job.status === "voice_ready"
      ? "Waiting for B-roll prompt planning."
      : job.mode === "slides"
        ? "Waiting for slide draft."
        : "Waiting for script.",
    video: job.mode === "narrated" && job.status === "broll_ready"
      ? "Waiting for B-roll video generation."
      : job.mode === "slides" && job.status === "slides_ready"
        ? "Waiting for slide render."
        : "Waiting for prompt.",
    distribution: "Waiting for video."
  };
  return waiting[step];
}

function maybePopulateCaptions(job) {
  if (!job.captions) {
    return;
  }

  ["tiktok", "instagram", "youtube"].forEach((platform) => {
    if (!state.captionsDirty[platform]) {
      document.getElementById(`caption-${platform}`).value = job.captions[platform]?.caption || "";
      document.getElementById(`hashtags-${platform}`).value = (job.captions[platform]?.hashtags || []).join(", ");
    }
  });
}

function renderDistributionResults(results = []) {
  const container = document.getElementById("distributionResults");
  if (results.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = results.map((result) => `
    <div class="result-item ${result.status === "success" ? "is-success" : "is-failed"}">
      <strong>${escapeHtml(result.platform)}</strong> · ${escapeHtml(result.mode)} · ${escapeHtml(result.status)}
      <div>${escapeHtml(result.error || (result.externalId ? `External id: ${result.externalId}` : "Delivered"))}</div>
    </div>
  `).join("");
}

function renderSingleVideoOutput() {
  const videoWrap = document.getElementById("videoWrap");
  const distributeButton = document.getElementById("distributeButton");
  if (!videoWrap || !distributeButton) {
    return;
  }

  const sequenceResult = getReadySingleSequenceResult();
  const videoUrl = sanitizeUrl(sequenceResult?.videoUrl || state.single.job?.videoUrl || "");
  const thumbnailUrl = sanitizeUrl(getActiveSingleOutputThumbnailUrl());
  if (!videoUrl) {
    videoWrap.innerHTML = "";
    distributeButton.disabled = true;
    return;
  }

  const sequenceMeta = sequenceResult
    ? `<div class="video-result-label">${escapeHtml(sequenceResult.label)} · ${escapeHtml(sequenceResult.sourceSegments)} of ${escapeHtml(sequenceResult.requestedSegments)} clip${sequenceResult.requestedSegments === 1 ? "" : "s"} ${sequenceResult.merged ? "stitched into one final video" : "used as the final output"}.</div>`
    : "";

  videoWrap.innerHTML = `
    ${sequenceMeta}
    <div class="video-result-grid">
      ${thumbnailUrl ? `
        <div class="video-result-card">
          <div class="video-result-label">Cover image</div>
          <img src="${escapeHtml(thumbnailUrl)}" alt="Cover preview" loading="lazy" />
          ${safeLinkHtml(thumbnailUrl, "Download cover", { className: "copy-button", download: true, newTab: false })}
        </div>
      ` : ""}
      <div class="video-result-card">
        <div class="video-result-label">${sequenceResult ? "Final sequence" : "Video output"}</div>
        <video controls src="${escapeHtml(videoUrl)}"></video>
        ${safeLinkHtml(videoUrl, sequenceResult ? "Download final sequence" : "Download video", { className: "copy-button", download: true, newTab: false })}
      </div>
    </div>
  `;
  distributeButton.disabled = false;
}

function renderSingleSequenceCard() {
  const card = document.getElementById("singleSequenceCard");
  const status = document.getElementById("singleSequenceStatus");
  const queue = document.getElementById("singleSequenceQueue");
  const result = document.getElementById("singleSequenceResult");
  if (!card || !status || !queue || !result) {
    return;
  }

  const requestedCount = getSingleVideoCount();
  if (isNarratedMode() || isSlidesMode() || state.single.job?.mode === "narrated" || state.single.job?.mode === "slides") {
    card.classList.add("is-hidden");
    return;
  }
  const shouldShow = requestedCount > 1
    || hasSingleSequenceRun()
    || Boolean(state.single.sequence.compilation.result)
    || Boolean(state.single.sequence.compilation.error);
  card.classList.toggle("is-hidden", !shouldShow);
  if (!shouldShow) {
    return;
  }

  const items = state.single.sequence.items;
  const readyCount = items.filter((item) => ["ready", "distributed"].includes(item.job?.status || item.status)).length;
  const failedCount = items.filter((item) => (item.job?.status || item.status) === "failed").length;
  const renderingCount = items.filter((item) => ["submitting", "polling"].includes(item.job?.status || item.status)).length;
  const queuedCount = items.filter((item) => (item.job?.status || item.status) === "awaiting_generation").length;

  status.textContent = state.single.sequence.compilation.loading
    ? "Stitching the final sequence now."
    : state.single.sequence.compilation.result?.status === "ready"
      ? "Final stitched sequence ready."
      : state.single.sequence.compilation.error
        ? state.single.sequence.compilation.error
        : items.length === 0
          ? `Ready to build ${requestedCount} linked clip${requestedCount === 1 ? "" : "s"} for one final sequence.`
          : failedCount > 0
            ? `${failedCount} clip${failedCount === 1 ? "" : "s"} failed. You can delete stuck runs from Recent Runs and rerun.`
            : renderingCount > 0 && queuedCount > 0
              ? `${formatCountLabel(renderingCount, "clip")} rendering now. ${formatCountLabel(queuedCount, "more clip")} queued behind it.`
              : renderingCount > 0
                ? `${formatCountLabel(renderingCount, "clip")} rendering now.`
                : queuedCount > 0
                  ? `${formatCountLabel(queuedCount, "clip")} queued for the next render slot.`
                  : isSingleSequenceTerminal()
                    ? "All clips are finished."
                    : "Preparing the linked sequence.";

  if (!items.length) {
    queue.innerHTML = `<div class="history-empty">Run more than one video here and each linked clip will appear in order.</div>`;
  } else {
    queue.innerHTML = items.map((item, index) => {
      const itemStatus = item.job?.status || item.status || "creating";
      const scriptPreview = item.job?.script ? item.job.script.split("\n").slice(0, 2).join(" ") : "";
      const aheadCount = getSingleSequenceAheadCount(item);
      return `
        <div class="single-sequence-item">
          <div class="single-sequence-head">
            <strong>Part ${index + 1}</strong>
            <span class="status-chip is-${itemStatus}">${escapeHtml(formatJobStatusLabel(itemStatus, { aheadCount }))}</span>
          </div>
          <div class="single-sequence-title">${escapeHtml(item.label)}</div>
          <div class="single-sequence-copy">${escapeHtml(getSingleSequenceStatusCopy(item, itemStatus, scriptPreview))}</div>
          ${item.job?.videoUrl ? `<div>${safeLinkHtml(item.job.videoUrl, "Open clip")}</div>` : ""}
        </div>
      `;
    }).join("");
  }

  const sequenceResult = state.single.sequence.compilation.result;
  if (state.single.sequence.compilation.loading) {
    result.innerHTML = `<div class="result-item">Stitching the finished clips into one final sequence now.</div>`;
  } else if (sequenceResult) {
    result.innerHTML = `
      <div class="result-item ${sequenceResult.status === "ready" ? "is-success" : "is-failed"}">
        <strong>${escapeHtml(sequenceResult.label)}</strong>
        <div>${escapeHtml(sequenceResult.sourceSegments)} of ${escapeHtml(sequenceResult.requestedSegments)} clip${sequenceResult.requestedSegments === 1 ? "" : "s"} ${sequenceResult.merged ? "stitched into one final video" : "available as the final output"}.</div>
        <div>${escapeHtml(sequenceResult.error || (sequenceResult.videoUrl ? "Ready to distribute." : "Compilation did not return a video URL."))}</div>
        ${sequenceResult.videoUrl ? `<div>${safeLinkHtml(sequenceResult.videoUrl, "Open final sequence")}</div>` : ""}
      </div>
    `;
  } else if (state.single.sequence.compilation.error) {
    result.innerHTML = `<div class="result-item is-failed">${escapeHtml(state.single.sequence.compilation.error)}</div>`;
  } else {
    result.innerHTML = "";
  }
}

function renderNarratedSegmentsCard() {
  const card = document.getElementById("narratedSegmentsCard");
  const status = document.getElementById("narratedSegmentsStatus");
  const titleInput = document.getElementById("narratedTitleInput");
  const list = document.getElementById("narratedSegmentsList");
  const saveButton = document.getElementById("saveNarratedSegmentsButton");
  const voiceButton = document.getElementById("generateNarratedVoiceButton");
  const brollButton = document.getElementById("generateNarratedBrollButton");
  const composeButton = document.getElementById("composeNarratedVideoButton");
  if (!card || !status || !titleInput || !list || !saveButton || !voiceButton || !brollButton || !composeButton) {
    return;
  }

  const activeNarratedJob = state.single.job?.mode === "narrated" ? state.single.job : null;
  const shouldShow = isNarratedMode() || Boolean(activeNarratedJob);
  card.classList.toggle("is-hidden", !shouldShow);
  if (!shouldShow) {
    return;
  }

  if (!activeNarratedJob) {
    status.textContent = "Build a narrated draft here. Edits are optional before voice-over and B-roll.";
    titleInput.value = "";
    list.innerHTML = `<div class="history-empty">No narrated segments yet.</div>`;
    saveButton.disabled = true;
    voiceButton.disabled = true;
    brollButton.disabled = true;
    composeButton.disabled = true;
    voiceButton.textContent = "Generate voice-over";
    brollButton.textContent = "Generate B-roll";
    composeButton.textContent = "Compose final video";
    return;
  }

  const canEdit = ["script_ready", "failed"].includes(activeNarratedJob.status);
  const canGenerateVoice = ["script_ready", "failed", "voice_ready"].includes(activeNarratedJob.status);
  const allVoiceComplete = segmentsHaveCompleteVoice(activeNarratedJob.segments || []);
  const canGenerateBroll = ["voice_ready", "broll_ready", "ready_to_compose"].includes(activeNarratedJob.status)
    || (activeNarratedJob.status === "failed" && allVoiceComplete);
  const canCompose = activeNarratedJob.status === "ready_to_compose";
  const effectiveNarratedImageUrls = isNarratedMode() ? getEffectiveSingleImageUrls() : [];
  const narratedBrollValidationMessage = getNarratedBrollValidationMessage(activeNarratedJob, {
    imageUrls: effectiveNarratedImageUrls.length > 0 ? effectiveNarratedImageUrls : getNarratedJobImageUrls(activeNarratedJob)
  });
  status.textContent = canEdit
    ? "Narration draft is ready. Edit segments here if you want before voice-over and B-roll."
    : activeNarratedJob.status === "generating_voice"
      ? "Generating voice-over for every segment now."
      : activeNarratedJob.status === "voice_ready"
        ? "Voice-over is ready. Generate B-roll next to plan source strategy and render the clips."
        : activeNarratedJob.status === "planning_broll"
          ? "Planning source strategy and B-roll prompts now."
          : activeNarratedJob.status === "broll_ready"
            ? "B-roll prompts are ready. Generate B-roll to render the clips."
            : activeNarratedJob.status === "rendering_broll"
              ? "Generating narrated B-roll now. Completed segments will appear with video previews."
              : activeNarratedJob.status === "ready_to_compose"
                ? "All segment assets are ready. Compose the final narrated video next."
                : activeNarratedJob.status === "composing"
                  ? "Composing the final narrated video now."
                : activeNarratedJob.status === "failed"
                  ? allVoiceComplete
                    ? "One or more narrated B-roll segments failed. Generate B-roll again when you're ready."
                    : "Voice-over failed for one or more segments. Generate the voice-over again to continue."
                : activeNarratedJob.status === "ready"
                  ? "Final narrated video is ready to distribute."
                    : "Narration is locked because downstream generation has already started.";
  if (narratedBrollValidationMessage && ["voice_ready", "broll_ready", "failed"].includes(activeNarratedJob.status)) {
    status.textContent += ` ${narratedBrollValidationMessage}`;
  } else if (effectiveNarratedImageUrls.length === 0 && !activeNarratedJob.sourceImageUrl && ["voice_ready", "broll_ready", "ready_to_compose", "failed"].includes(activeNarratedJob.status)) {
    status.textContent += " No reference image is attached yet, so current B-roll models may still need one before rendering.";
  }
  titleInput.value = activeNarratedJob.fields?.narrationTitle || "";
  titleInput.disabled = !canEdit;

  const segments = Array.isArray(activeNarratedJob.segments) ? activeNarratedJob.segments : [];
  if (segments.length === 0) {
    list.innerHTML = `<div class="history-empty">This narrated draft has no saved segments yet.</div>`;
    saveButton.disabled = true;
    voiceButton.disabled = true;
    brollButton.disabled = true;
    composeButton.disabled = true;
    voiceButton.textContent = "Generate voice-over";
    brollButton.textContent = "Generate B-roll";
    composeButton.textContent = "Compose final video";
    return;
  }

  list.innerHTML = segments.map((segment) => `
    <div class="narrated-segment-card">
      <div class="narrated-segment-head">
        <strong>Part ${escapeHtml(segment.segmentIndex)} · ${escapeHtml(segment.shotType || "beat")}</strong>
        <div class="inline-actions">
          <span class="status-chip is-${escapeHtml(segment.voiceStatus || "waiting")}">voice: ${escapeHtml(segment.voiceStatus || "waiting")}</span>
          <span class="status-chip is-${escapeHtml(segment.brollStatus || "waiting")}">b-roll: ${escapeHtml(segment.brollStatus || "waiting")}</span>
        </div>
      </div>
      <label class="field">
        <span>Narration</span>
        <textarea id="narrated-segment-text-${escapeHtml(segment.id)}" ${canEdit ? "" : "disabled"}>${escapeHtml(segment.text || "")}</textarea>
      </label>
      <label class="field">
        <span>Visual intent</span>
        <textarea id="narrated-segment-visual-${escapeHtml(segment.id)}" ${canEdit ? "" : "disabled"}>${escapeHtml(segment.visualIntent || "")}</textarea>
      </label>
      <div class="field-grid">
        <label class="field">
          <span>Estimated seconds</span>
          <input id="narrated-segment-seconds-${escapeHtml(segment.id)}" type="number" min="1" max="30" value="${escapeHtml(segment.estimatedSeconds || 0)}" ${canEdit ? "" : "disabled"} />
        </label>
        <label class="field">
          <span>Source strategy</span>
          <select id="narrated-segment-source-${escapeHtml(segment.id)}" ${canEdit ? "" : "disabled"}>
            <option value="hybrid" ${segment.sourceStrategy === "hybrid" ? "selected" : ""}>Hybrid</option>
            <option value="image" ${segment.sourceStrategy === "image" ? "selected" : ""}>Use reference image</option>
            <option value="text" ${segment.sourceStrategy === "text" ? "selected" : ""}>Text to video</option>
          </select>
        </label>
      </div>
      <div class="inline-actions">
        ${segment.audioUrl ? `<audio controls preload="none" src="${escapeHtml(sanitizeUrl(segment.audioUrl))}"></audio>` : `<span class="summary-metadata">Voice-over will appear here after you generate all audio.</span>`}
      </div>
      <label class="field">
        <span>B-roll prompt</span>
        <textarea readonly>${escapeHtml(segment.brollPrompt || "Generate B-roll once to plan the source strategy and create this segment's visual instruction.")}</textarea>
      </label>
      <div class="inline-actions">
        ${segment.videoUrl ? `<video controls preload="none" src="${escapeHtml(sanitizeUrl(segment.videoUrl))}"></video>` : `<span class="summary-metadata">No B-roll clip yet.</span>`}
      </div>
      ${segment.actualDurationSeconds ? `<div class="summary-metadata">Actual duration: ${escapeHtml(Number(segment.actualDurationSeconds).toFixed(1))}s</div>` : ""}
      ${segment.error ? `<div class="result-item is-failed">${escapeHtml(segment.error)}</div>` : ""}
    </div>
  `).join("");

  saveButton.disabled = !canEdit;
  voiceButton.disabled = !canGenerateVoice || activeNarratedJob.status === "generating_voice";
  brollButton.disabled = !canGenerateBroll || activeNarratedJob.status === "planning_broll" || activeNarratedJob.status === "rendering_broll" || Boolean(narratedBrollValidationMessage);
  composeButton.disabled = !canCompose || activeNarratedJob.status === "composing";
  voiceButton.textContent = activeNarratedJob.status === "generating_voice"
    ? "Generating voice..."
    : activeNarratedJob.status === "voice_ready"
      ? "Regenerate all voice-over"
      : "Generate voice-over";
  brollButton.textContent = ["planning_broll", "rendering_broll"].includes(activeNarratedJob.status)
    ? "Generating B-roll..."
    : segments.some((segment) => segment.videoUrl)
      ? "Regenerate B-roll"
      : "Generate B-roll";
  composeButton.textContent = activeNarratedJob.status === "composing" ? "Composing..." : "Compose final video";
}

function collectSlidesDraftPayload(job) {
  const title = document.getElementById("slidesDeckTitleInput")?.value.trim() || "";
  const slides = (job.slides || []).map((slide) => ({
    ...slide,
    headline: document.getElementById(`slide-headline-${slide.id}`)?.value.trim() || "",
    body: document.getElementById(`slide-body-${slide.id}`)?.value.trim() || "",
    imageUrl: sanitizeUrl(document.getElementById(`slide-image-${slide.id}`)?.value.trim() || ""),
    durationSeconds: Number.parseFloat(document.getElementById(`slide-duration-${slide.id}`)?.value || String(slide.durationSeconds || 3.5)) || 3.5
  }));

  return {
    title,
    slideDeckTitle: title,
    slides
  };
}

function hasSlidesDraftChanges(job) {
  if (!job || job.mode !== "slides") {
    return false;
  }

  const payload = collectSlidesDraftPayload(job);
  if (payload.title !== String(job.fields?.slideDeckTitle || "")) {
    return true;
  }

  const slides = Array.isArray(job.slides) ? job.slides : [];
  if (payload.slides.length !== slides.length) {
    return true;
  }

  return payload.slides.some((slide, index) => {
    const savedSlide = slides[index] || {};
    return slide.headline !== String(savedSlide.headline || "")
      || slide.body !== String(savedSlide.body || "")
      || slide.imageUrl !== sanitizeUrl(savedSlide.imageUrl || "")
      || Math.abs(Number(slide.durationSeconds || 0) - Number(savedSlide.durationSeconds || 0)) > 0.01;
  });
}

async function fetchLatestSingleJob(jobId, options = {}) {
  if (!jobId) {
    return null;
  }

  const payload = await requestJson(`/api/jobs/${jobId}`);
  if (options.render !== false) {
    renderSingleJob(payload.job);
  }
  return payload.job;
}

function renderSlidesDraftCard() {
  const card = document.getElementById("slidesDraftCard");
  const status = document.getElementById("slidesDraftStatus");
  const titleInput = document.getElementById("slidesDeckTitleInput");
  const list = document.getElementById("slidesDraftList");
  const saveButton = document.getElementById("saveSlidesButton");
  const renderButton = document.getElementById("renderSlidesVideoButton");
  if (!card || !status || !titleInput || !list || !saveButton || !renderButton) {
    return;
  }

  const activeSlidesJob = state.single.job?.mode === "slides" ? state.single.job : null;
  const draftPayload = state.single.slideAction.draftPayload;
  const shouldShow = isSlidesMode() || Boolean(activeSlidesJob);
  card.classList.toggle("is-hidden", !shouldShow);
  if (!shouldShow) {
    return;
  }

  if (!activeSlidesJob) {
    status.textContent = "Build a slide draft here. Edits are optional before the final render.";
    titleInput.value = "";
    list.innerHTML = `<div class="history-empty">No slide draft yet.</div>`;
    saveButton.disabled = true;
    renderButton.disabled = true;
    renderButton.textContent = "Render slide video";
    return;
  }

  const canEdit = isSlidesJobEditable(activeSlidesJob);
  const canRender = isSlidesJobRenderable(activeSlidesJob);
  status.textContent = activeSlidesJob.status === "rendering_slides"
    ? "Rendering the final slideshow video now."
    : activeSlidesJob.status === "ready"
        ? "Slide video is ready to distribute. Save edits if you want to reopen the deck and rerender."
      : activeSlidesJob.status === "distributed"
        ? "Slide video has been published. Save edits if you want to reopen the deck and rerender."
        : activeSlidesJob.status === "failed"
          ? activeSlidesJob.error || "Slide rendering failed. Inspect the deck and try again."
          : "Slide draft is ready. Edit the deck here if you want, then render the final slideshow video.";
  titleInput.value = draftPayload?.title || activeSlidesJob.fields?.slideDeckTitle || "";
  titleInput.disabled = !canEdit;

  const slides = Array.isArray(draftPayload?.slides) && draftPayload.slides.length > 0
    ? draftPayload.slides.map((slide, index) => ({
      ...slide,
      slideIndex: slide.slideIndex || index + 1
    }))
    : Array.isArray(activeSlidesJob.slides) ? activeSlidesJob.slides : [];
  if (!slides.length) {
    list.innerHTML = `<div class="history-empty">This slide draft has no saved slides yet.</div>`;
    saveButton.disabled = true;
    renderButton.disabled = true;
    return;
  }

  list.innerHTML = slides.map((slide) => `
    <div class="slides-draft-card">
      <div class="slides-draft-head">
        <strong>Slide ${escapeHtml(slide.slideIndex)}</strong>
        <span class="status-chip is-${escapeHtml(activeSlidesJob.status)}">${escapeHtml(formatJobStatusLabel(activeSlidesJob.status))}</span>
      </div>
      <label class="field">
        <span>Headline</span>
        <input id="slide-headline-${escapeHtml(slide.id)}" type="text" value="${escapeHtml(slide.headline || "")}" ${canEdit ? "" : "disabled"} />
      </label>
      <label class="field">
        <span>Body</span>
        <textarea id="slide-body-${escapeHtml(slide.id)}" ${canEdit ? "" : "disabled"}>${escapeHtml(slide.body || "")}</textarea>
      </label>
      <div class="field-grid">
        <label class="field">
          <span>Image URL</span>
          <input id="slide-image-${escapeHtml(slide.id)}" type="url" value="${escapeHtml(slide.imageUrl || "")}" placeholder="Optional slide image URL" ${canEdit ? "" : "disabled"} />
        </label>
        <label class="field">
          <span>Duration (seconds)</span>
          <input id="slide-duration-${escapeHtml(slide.id)}" type="number" min="1.5" max="8" step="0.1" value="${escapeHtml(slide.durationSeconds || 3.5)}" ${canEdit ? "" : "disabled"} />
        </label>
      </div>
      ${slide.imageUrl ? `${safeLinkHtml(slide.imageUrl, "Open slide image", { className: "copy-button compact-button" })}` : `<span class="summary-metadata">This slide will use the deck gradient background unless you add an image.</span>`}
    </div>
  `).join("");

  saveButton.disabled = !canEdit || state.single.slideAction.saving || state.single.slideAction.rendering;
  renderButton.disabled = !canRender || state.single.slideAction.saving || state.single.slideAction.rendering;
  renderButton.textContent = activeSlidesJob.status === "rendering_slides" || state.single.slideAction.rendering
    ? "Rendering..."
    : state.single.slideAction.saving
      ? "Saving..."
      : "Render slide video";
}

async function syncNarratedReferenceImageIfNeeded(job) {
  if (!job || job.mode !== "narrated") {
    return { job, changed: false };
  }

  const nextImageUrls = getEffectiveSingleImageUrls();
  const nextSourceImageUrl = nextImageUrls[0] || "";
  const currentImageUrls = Array.isArray(job.providerConfig?.generationConfig?.imageUrls)
    ? job.providerConfig.generationConfig.imageUrls
    : [];
  const currentSourceImageUrl = job.sourceImageUrl || currentImageUrls[0] || "";
  const imageChanged = currentSourceImageUrl !== nextSourceImageUrl
    || currentImageUrls.length !== nextImageUrls.length
    || currentImageUrls.some((value, index) => value !== nextImageUrls[index]);

  if (!imageChanged) {
    return { job, changed: false };
  }

  const payload = await requestJson(`/api/jobs/${job.id}/reference-image`, {
    method: "PATCH",
    body: JSON.stringify({
      imageUrl: nextSourceImageUrl,
      imageUrls: nextImageUrls
    })
  });

  renderSingleJob(payload.job);
  return {
    job: payload.job,
    changed: true
  };
}

async function saveNarratedSegments() {
  const job = state.single.job;
  if (!job || job.mode !== "narrated") {
    return;
  }

  try {
    const synced = await syncNarratedReferenceImageIfNeeded(job);
    const title = document.getElementById("narratedTitleInput")?.value.trim() || "";
    const segments = (synced.job.segments || []).map((segment) => ({
    ...segment,
    text: document.getElementById(`narrated-segment-text-${segment.id}`)?.value.trim() || "",
    visualIntent: document.getElementById(`narrated-segment-visual-${segment.id}`)?.value.trim() || "",
    estimatedSeconds: Number.parseInt(document.getElementById(`narrated-segment-seconds-${segment.id}`)?.value || String(segment.estimatedSeconds || 0), 10) || 0,
    sourceStrategy: document.getElementById(`narrated-segment-source-${segment.id}`)?.value || segment.sourceStrategy || "hybrid"
    }));
    const payload = await requestJson(`/api/jobs/${synced.job.id}/narration`, {
      method: "PATCH",
      body: JSON.stringify({
        title,
        segments
      })
    });

    renderSingleJob(payload.job);
    refreshHistory();
    showToast("Narration draft saved.");
  } catch (error) {
    showToast(error.message);
  }
}

async function saveSlides(options = {}) {
  let job = options.job || state.single.job;
  if (!job || job.mode !== "slides") {
    return null;
  }

  const draftPayload = options.draftPayload || collectSlidesDraftPayload(job);
  state.single.slideAction.draftPayload = draftPayload;
  state.single.slideAction.saving = true;
  renderSlidesDraftCard();

  try {
    if (job.id) {
      job = await fetchLatestSingleJob(job.id, { render: false }) || job;
    }
    if (!isSlidesJobEditable(job)) {
      renderSingleJob(job);
      if (!options.silent && !options.suppressErrorToast) {
        showToast(getSlidesLockedMessage(job));
      }
      return null;
    }

    const payload = await requestJson(`/api/jobs/${job.id}/slides`, {
      method: "PATCH",
      body: JSON.stringify(draftPayload)
    });

    state.single.readyToastShownFor = null;
    renderSingleJob(payload.job);
    refreshHistory();
    if (!options.silent) {
      showToast("Slide draft saved.");
    }
    return payload.job;
  } catch (error) {
    if (!options.suppressErrorToast) {
      showToast(error.message);
    }
    return null;
  } finally {
    state.single.slideAction.saving = false;
    state.single.slideAction.draftPayload = null;
    renderSlidesDraftCard();
  }
}

async function renderSlidesVideo(options = {}) {
  const job = state.single.job;
  if (!job || job.mode !== "slides") {
    return;
  }

  const pendingDraftChanges = hasSlidesDraftChanges(job);
  const draftPayload = pendingDraftChanges ? collectSlidesDraftPayload(job) : null;
  state.single.slideAction.draftPayload = draftPayload;
  state.single.slideAction.rendering = true;
  renderSlidesDraftCard();

  try {
    let latestJob = await fetchLatestSingleJob(job.id, { render: false }) || job;
    if (!isSlidesJobRenderable(latestJob)) {
      renderSingleJob(latestJob);
      showToast(getSlidesLockedMessage(latestJob));
      return;
    }

    if (pendingDraftChanges) {
      latestJob = await saveSlides({
        job: latestJob,
        draftPayload,
        silent: true,
        suppressErrorToast: true
      });
      if (!latestJob) {
        const refreshedJob = await fetchLatestSingleJob(job.id, { render: false });
        if (!refreshedJob || !isSlidesJobRenderable(refreshedJob)) {
          if (refreshedJob) {
            renderSingleJob(refreshedJob);
            showToast(getSlidesLockedMessage(refreshedJob));
          }
          return;
        }
        latestJob = refreshedJob;
      }
    }

    const payload = await requestJson(`/api/jobs/${latestJob.id}/slides/render`, {
      method: "POST"
    });

    renderSingleJob(payload.job);
    refreshHistory();
  } catch (error) {
    showToast(error.message);
  } finally {
    state.single.slideAction.rendering = false;
    state.single.slideAction.draftPayload = null;
    renderSlidesDraftCard();
  }
}

async function generateNarratedVoice(options = {}) {
  const job = state.single.job;
  if (!job || job.mode !== "narrated") {
    return;
  }

  try {
    const payload = await requestJson(`/api/jobs/${job.id}/voice`, {
      method: "POST"
    });

    renderSingleJob(payload.job);
    refreshHistory();
    if (payload.job.status === "generating_voice") {
      await pollSingleJob(payload.job.id);
    }
    if (!options.autoProgress) {
      showToast(payload.job.status === "voice_ready" ? "Voice-over is ready." : "Voice generation started.");
    }
  } catch (error) {
    showToast(error.message);
  }
}

async function generateNarratedBroll(options = {}) {
  const job = state.single.job;
  if (!job || job.mode !== "narrated") {
    return;
  }

  try {
    const synced = await syncNarratedReferenceImageIfNeeded(job);
    const currentSegments = Array.isArray(synced.job.segments) ? synced.job.segments : [];
    const shouldPlanPrompts = synced.changed || !currentSegments.every((segment) => segment.brollPrompt);
    const plannedJob = shouldPlanPrompts
      ? (await requestJson(`/api/jobs/${synced.job.id}/broll/prompts`, {
        method: "POST"
      })).job
      : synced.job;
    const validationMessage = getNarratedBrollValidationMessage(plannedJob);
    if (validationMessage) {
      renderSingleJob(plannedJob);
      showToast(validationMessage);
      return;
    }
    const renderPayload = await requestJson(`/api/jobs/${plannedJob.id}/broll`, {
      method: "POST"
    });

    renderSingleJob(renderPayload.job);
    refreshHistory();
    if (renderPayload.job.status === "rendering_broll") {
      await pollSingleJob(renderPayload.job.id);
    }
    if (!options.autoProgress) {
      showToast("B-roll generation started.");
    }
  } catch (error) {
    showToast(error.message);
  }
}

async function composeNarratedVideo(options = {}) {
  const job = state.single.job;
  if (!job || job.mode !== "narrated") {
    return;
  }

  try {
    const payload = await requestJson(`/api/jobs/${job.id}/compose`, {
      method: "POST"
    });

    renderSingleJob(payload.job);
    if (!payload.job.isTerminal) {
      await pollSingleJob(payload.job.id);
    }
    refreshHistory();
    if (!options.autoProgress) {
      showToast("Final narrated video ready.");
    }
  } catch (error) {
    showToast(error.message);
  }
}

function getCreateReadinessItems() {
  const health = state.system.health;
  if (!health) {
    return [];
  }

  const items = [];
  const warningBodies = new Set();
  const pushItem = (tone, title, body) => {
    const normalizedBody = String(body || "").trim();
    if (!normalizedBody || warningBodies.has(normalizedBody)) {
      return;
    }

    warningBodies.add(normalizedBody);
    items.push({
      tone,
      title,
      body: normalizedBody
    });
  };

  if (!health.checks?.baseUrlIsPublic) {
    pushItem("warning", "Public URL", "BASE_URL is still local. Uploads, callbacks, and shared output links will only work on this machine until the app points at a public URL.");
  }

  if (!health.providers?.anthropic?.configured) {
    pushItem("danger", "Planning offline", "ANTHROPIC_API_KEY is missing, so analysis, scripts, and slide or narrated planning will fail.");
  }

  if (!health.providers?.kie?.configured) {
    pushItem("danger", "Video generation offline", "KIEAI_API_KEY is missing, so clip, storyboard, and narrated B-roll video generation will fail.");
  }

  if (!health.providers?.elevenlabs?.configured) {
    pushItem("danger", "Voice-over offline", "ELEVENLABS_API_KEY is missing, so narrated voice-over generation will fail.");
  }

  if (!health.providers?.ayrshare?.configured) {
    pushItem("warning", "Publishing offline", "AYRSHARE_API_KEY is missing, so direct social distribution is unavailable.");
  }

  if (!health.checks?.narratedRenderAvailable) {
    pushItem("danger", "Remotion render offline", "The Remotion compose engine is not available on this deployment, so narrated and slide video renders will fail.");
  }

  if (!health.providers?.fal?.configured) {
    pushItem("warning", "Batch stitching limited", "FAL_KEY is missing, so category compilation and stitched batch outputs are unavailable.");
  }

  return items;
}

function renderCreateReadinessBanner() {
  const banner = document.getElementById("createReadinessBanner");
  if (!banner) {
    return;
  }

  const items = getCreateReadinessItems();
  banner.classList.toggle("is-hidden", items.length === 0);
  banner.innerHTML = items.map((item) => `
    <div class="readiness-item ${item.tone === "danger" ? "is-danger" : "is-warning"}">
      <div class="readiness-item-title">${escapeHtml(item.title)}</div>
      <div class="readiness-item-body">${escapeHtml(item.body)}</div>
    </div>
  `).join("");
}

function renderCreateSummaryCard() {
  const status = document.getElementById("createSummaryStatus");
  const meta = document.getElementById("createSummaryMeta");
  const stats = document.getElementById("createSummaryStats");
  const actions = document.getElementById("createSummaryActions");
  if (!status || !meta || !stats || !actions) {
    return;
  }

  renderCreateReadinessBanner();

  const brand = getActiveBrand();
  const profile = getSelectedGenerationProfile("single");
  const sequenceCount = getSingleVideoCount();
  const currentJob = state.single.job;
  const sequenceResult = getReadySingleSequenceResult();
  const outputUrl = getActiveSingleOutputVideoUrl();
  const creationMode = currentJob ? getCreationModeForJob(currentJob) : state.single.creationMode;
  const templateLabel = creationMode === "narrated" ? getSelectedNarratedTemplateLabel() : "";
  const slideCount = creationMode === "slides" ? getSlidesDraftCount(currentJob) : 0;
  const narratedSegmentCount = creationMode === "narrated" ? getNarratedSegmentCount(currentJob) : 0;
  const currentStatus = sequenceResult?.status === "ready"
    ? "Final stitched sequence ready."
    : state.single.sequence.compilation.loading
      ? "Stitching the finished clips together."
      : state.single.running
        ? "Preparing this run."
        : currentJob
          ? formatJobStatusLabel(currentJob.status)
          : "Set up a run and start generating.";

  status.textContent = currentStatus;
  meta.textContent = creationMode === "narrated"
    ? `${brand?.name || "No brand selected"} • ${getPipelineLabel(state.activePipeline)} • ${templateLabel} • ${profile?.label || "No model selected"}`
    : `${brand?.name || "No brand selected"} • ${getPipelineLabel(state.activePipeline)} • ${getCreationModeLabel(creationMode)} • ${profile?.label || "No model selected"}`;

  const statItems = [
    ["Pipeline", getPipelineLabel(state.activePipeline)],
    ["Model", profile?.label || "Choose a model"],
    ["Mode", getCreationModeLabel(creationMode)],
    ...(creationMode === "narrated" ? [["Template", templateLabel]] : []),
    [
      creationMode === "slides"
        ? "Slides"
        : creationMode === "narrated"
          ? "Parts"
          : "Clips",
      creationMode === "narrated"
        ? String(narratedSegmentCount)
        : creationMode === "slides"
          ? String(slideCount)
          : String(sequenceCount)
    ],
    ["Estimate", formatUsd(estimateCurrentRunCost("single"))]
  ];
  stats.innerHTML = statItems.map(([label, value]) => `
    <div class="summary-stat">
      <div class="summary-stat-label">${escapeHtml(label)}</div>
      <div class="summary-stat-value">${escapeHtml(value)}</div>
    </div>
  `).join("");

  const actionBits = [];
  if (outputUrl) {
    actionBits.push(safeLinkHtml(outputUrl, sequenceResult ? "Open final video" : "Open video", {
      className: "copy-button compact-button"
    }));
    const thumbnailUrl = sanitizeUrl(getActiveSingleOutputThumbnailUrl());
    if (thumbnailUrl) {
      actionBits.push(safeLinkHtml(thumbnailUrl, "Open cover", {
        className: "secondary-button compact-button"
      }));
    }
    actionBits.push(`<button type="button" class="primary-button compact-button" onclick="distributeCurrentJob()">Publish this run</button>`);
  }
  if (currentJob?.canRetry) {
    actionBits.push(`<button type="button" class="secondary-button compact-button" onclick="retryCurrentJob()">Retry</button>`);
  }
  if (currentJob?.id) {
    actionBits.push(`<button type="button" class="ghost-button compact-button history-delete-button" onclick="performDeleteJob('${currentJob.id}')">Delete run</button>`);
  }

  actions.innerHTML = actionBits.length > 0
    ? actionBits.join("")
    : `<div class="summary-metadata">Your active run, stitched sequence status, and publish actions will surface here.</div>`;
}

function getJobScriptPreview(job) {
  if (!job) {
    return "";
  }

  if (job.mode === "narrated" && Array.isArray(job.segments) && job.segments.length > 0) {
    return job.segments.map((segment, index) => {
      const segmentLabel = `Part ${segment.segmentIndex || index + 1}`;
      const lines = [segmentLabel];
      if (segment.text) {
        lines.push(segment.text);
      }
      if (segment.visualIntent) {
        lines.push(`Visual intent: ${segment.visualIntent}`);
      }
      return lines.join("\n");
    }).join("\n\n");
  }

  if ((!job.script || !job.script.trim()) && job.mode === "slides" && Array.isArray(job.slides) && job.slides.length > 0) {
    const title = job.fields?.slideDeckTitle || "Slides deck";
    const slides = job.slides.map((slide, index) => {
      const lines = [`Slide ${slide.slideIndex || index + 1}: ${slide.headline || "Untitled slide"}`];
      if (slide.body) {
        lines.push(slide.body);
      }
      if (slide.durationSeconds) {
        lines.push(`Duration: ${slide.durationSeconds}s`);
      }
      return lines.join("\n");
    }).join("\n\n");
    return `${title}\n\n${slides}`.trim();
  }

  return job.script || "";
}

function renderSingleJob(job) {
  state.single.job = job;
  if (state.single.autoProgress.enabled && !state.single.autoProgress.jobId) {
    setSingleAutoProgressJobId(job.id);
  }
  if (state.viewMode === "review") {
    setDashboardSelection("review", job.id);
  }
  if (state.viewMode === "outputs") {
    setDashboardSelection("output", job.id);
  }
  if (state.viewMode === "publish") {
    setDashboardSelection("publish", job.id);
  }
  hydrateSingleJobContext(job);
  if (job.analysis) {
    getIdeaAssistState(job.pipeline).analysis = job.analysis;
  }
  if (typeof job.providerConfig?.estimatedCostUsd === "number") {
    document.getElementById("currentEstimateLabel").textContent = formatUsd(job.providerConfig.estimatedCostUsd);
  }
  document.getElementById("retryButton").classList.toggle("is-hidden", !job.canRetry);
  document.getElementById("content-analysis").textContent = job.analysis || "";
  document.getElementById("content-script").textContent = getJobScriptPreview(job);
  document.getElementById("content-prompt").textContent = job.videoPrompt || "";
  setPromptMetrics(job.promptMetrics.length, job.promptMetrics.nearLimit, job.promptMetrics.exceedsLimit);

  ["analysis", "script", "captions", "prompt", "video", "distribution"].forEach((step) => {
    setStepState(step, job.stepState[step], normalizeStepLabel(job, step));
  });
  renderVideoSpinnerCopy(job);

  maybePopulateCaptions(job);
  renderDistributionResults(state.single.sequence.distributionResults.length > 0
    ? state.single.sequence.distributionResults
    : (job.distribution?.results || []));

  if (job.stepState.video === "running" || state.single.sequence.compilation.loading) {
    document.getElementById("videoSpinner").classList.remove("is-hidden");
  } else {
    document.getElementById("videoSpinner").classList.add("is-hidden");
  }

  renderSingleVideoOutput();
  renderSingleSequenceCard();
  renderNarratedSegmentsCard();
  renderSlidesDraftCard();
  renderNarratedModeUi();
  renderCreateSummaryCard();
  renderReviewWorkspace();
  renderOutputsWorkspace();
  renderPublishWorkspace();

  queueSingleAutoProgress(job);

  if (getReadySingleSequenceResult()) {
    setStepState("video", "done", "Final stitched sequence ready.");
  } else if (job.videoUrl && state.single.readyToastShownFor !== job.id && !hasSingleSequencePendingJobs()) {
    state.single.readyToastShownFor = job.id;
    showToast(job.mode === "slides"
      ? "Slide video ready to distribute."
      : "Video ready to distribute.");
  } else if (job.mode === "narrated" && job.status === "voice_ready" && state.single.readyToastShownFor !== `${job.id}:voice`) {
    state.single.readyToastShownFor = `${job.id}:voice`;
    clearSinglePoll();
    showToast("Narration voice-over ready.");
  } else if (job.mode === "narrated" && job.status === "ready_to_compose" && state.single.readyToastShownFor !== `${job.id}:broll`) {
    state.single.readyToastShownFor = `${job.id}:broll`;
    clearSinglePoll();
    showToast("B-roll segments are ready to compose.");
  }

  if (job.isTerminal && !hasSingleSequencePendingJobs()) {
    clearSinglePoll();
    refreshSpendSummary();
    refreshHistory();
  }
}

function loadJobIntoSingleView(jobId, options = {}) {
  const requestVersion = invalidateSingleRequests();
  resetSingleAutoProgress();
  if (options.switchView !== false) {
    const createTab = document.getElementById("view-create");
    if (createTab) {
      setViewMode("create", createTab);
    }
  }
  setCreateWorkspaceMode("single");
  clearSinglePoll();
  resetSingleSequenceState();
  renderSingleSequenceCard();

  const renderLoadedJob = (job, renderOptions = {}) => {
    if (!job) {
      return false;
    }

    try {
      if (renderOptions.restoreAutoProgress) {
        maybeResumeSingleAutoProgress(job);
      }
      renderSingleJob(job);
      return true;
    } catch (error) {
      showToast(error.message);
      return false;
    }
  };

  const cachedJob = getKnownJobById(jobId);
  const renderedCachedJob = renderLoadedJob(cachedJob, { restoreAutoProgress: true });
  if (cachedJob && !renderedCachedJob) {
    showToast("Saved job is loading. Pulling the latest version now.");
  }

  window.setTimeout(() => {
    if (!isSingleRequestCurrent(requestVersion)) {
      return;
    }

    requestJson(`/api/jobs/${jobId}`)
      .then(async (payload) => {
        if (!isSingleRequestCurrent(requestVersion)) {
          return;
        }

        if (!renderLoadedJob(payload.job, { restoreAutoProgress: true })) {
          showToast("This saved job could not be reopened in Create.");
          return;
        }

        if (shouldContinueSinglePolling(payload.job)) {
          await pollSingleJob(payload.job.id);
        }
      })
      .catch((error) => {
        if (!cachedJob && isSingleRequestCurrent(requestVersion)) {
          showToast(error.message);
        }
      });
  }, 0);
}

async function pollSingleJob(jobId) {
  clearSinglePoll();
  const requestVersion = state.single.requestVersion;
  state.single.pollTimer = setInterval(async () => {
    try {
      if (!isSingleRequestCurrent(requestVersion)) {
        clearSinglePoll();
        return;
      }

      const payload = await requestJson(`/api/jobs/${jobId}`);
      if (!isSingleRequestCurrent(requestVersion)) {
        clearSinglePoll();
        return;
      }
      renderSingleJob(payload.job);
      if (!shouldContinueSinglePolling(payload.job)) {
        clearSinglePoll();
      }
    } catch (error) {
      clearSinglePoll();
      if (isSingleRequestCurrent(requestVersion)) {
        showToast(error.message);
      }
    }
  }, 2500);
}

async function syncSingleSequenceJobs() {
  const ids = state.single.sequence.items.map((item) => item.jobId).filter(Boolean);
  if (ids.length === 0) {
    renderSingleSequenceCard();
    renderSingleVideoOutput();
    return true;
  }

  const payload = await requestJson(`/api/jobs?ids=${ids.join(",")}&limit=${ids.length}`);
  const jobsById = new Map((payload.jobs || []).map((job) => [job.id, job]));

  state.single.sequence.items = state.single.sequence.items.map((item) => {
    if (!item.jobId) {
      return item;
    }

    const job = jobsById.get(item.jobId);
    if (!job) {
      return {
        ...item,
        status: "stopped",
        job: null,
        note: "This clip was removed from the queue."
      };
    }

    return {
      ...item,
      job,
      status: job.status,
      note: ""
    };
  });

  const featuredJob = chooseFeaturedSingleSequenceJob();
  if (featuredJob) {
    renderSingleJob(featuredJob);
  } else {
    renderSingleSequenceCard();
    renderSingleVideoOutput();
  }

  if (isSingleSequenceTerminal()) {
    clearSinglePoll();
    if (!state.single.sequence.compilation.loading && !state.single.sequence.compilation.result && !state.single.sequence.compilation.error) {
      await compileSingleSequenceOutputs({ silent: true });
    }
    refreshSpendSummary();
    refreshHistory();
    return true;
  }

  return false;
}

async function pollSingleSequenceJobs() {
  clearSinglePoll();
  const done = await syncSingleSequenceJobs();
  if (done) {
    return;
  }

  state.single.pollTimer = setInterval(async () => {
    try {
      await syncSingleSequenceJobs();
    } catch (error) {
      clearSinglePoll();
      showToast(error.message);
    }
  }, 2500);
}

async function compileSingleSequenceOutputs(options = {}) {
  const requestedSegments = state.single.sequence.items.length;
  const videoUrls = state.single.sequence.items
    .map((item) => item.job?.videoUrl || "")
    .filter(Boolean);

  if (requestedSegments === 0) {
    return null;
  }

  if (videoUrls.length === 0) {
    state.single.sequence.compilation = {
      loading: false,
      result: null,
      error: "No finished clips were available to stitch into the final sequence.",
      finalJobId: null
    };
    renderSingleSequenceCard();
    return null;
  }

  if (videoUrls.length > 1 && !isFalConfigured()) {
    state.single.sequence.compilation = {
      loading: false,
      result: null,
      error: "FAL stitching is not configured on this server yet. Add FAL_KEY in Render to merge multiple single-page clips into one final sequence.",
      finalJobId: null
    };
    renderSingleSequenceCard();
    if (!options.silent) {
      showToast("Set FAL_KEY in Render to stitch multi-clip sequences.");
    }
    return null;
  }

  state.single.sequence.compilation.loading = true;
  state.single.sequence.compilation.error = "";
  state.single.sequence.compilation.result = null;
  state.single.sequence.compilation.finalJobId = null;
  setStepState("video", "running", "Stitching final sequence...");
  renderSingleSequenceCard();

  try {
    const payload = await requestJson("/api/batch/compile", {
      method: "POST",
      body: JSON.stringify({
        groups: [{
          pipeline: state.activePipeline,
          label: `${getBatchCategoryLabel(state.activePipeline)} final sequence`,
          requestedSegments,
          videoUrls
        }]
      })
    });

    const result = payload.results?.[0] || null;
    state.single.sequence.compilation.result = result;
    state.single.sequence.compilation.error = result?.status === "failed"
      ? result.error || "Sequence compilation failed."
      : "";

    if (result?.status === "ready") {
      const childJobIds = state.single.sequence.items.map((item) => item.jobId).filter(Boolean);
      if (childJobIds.length > 1) {
        try {
          const finalPayload = await requestJson("/api/jobs/sequence/finalize", {
            method: "POST",
            body: JSON.stringify({
              jobIds: childJobIds,
              videoUrl: result.videoUrl,
              thumbnailUrl: result.thumbnailUrl || null,
              requestedSegments: result.requestedSegments,
              sourceSegments: result.sourceSegments,
              merged: result.merged
            })
          });
          state.single.sequence.compilation.finalJobId = finalPayload.job?.id || null;
          refreshHistory();
        } catch (error) {
          if (!options.silent) {
            showToast(error.message);
          }
        }
      }
      setStepState("video", "done", "Final stitched sequence ready.");
      if (!options.silent) {
        showToast(result.merged
          ? "Final stitched sequence ready."
          : "Final sequence clip ready.");
      }
    } else if (result) {
      setStepState("video", "error", result.error || "Sequence compilation failed.");
    }

    return result;
  } catch (error) {
    state.single.sequence.compilation.result = null;
    state.single.sequence.compilation.error = error.message;
    setStepState("video", "error", error.message);
    if (!options.silent) {
      showToast(error.message);
    }
    return null;
  } finally {
    state.single.sequence.compilation.loading = false;
    renderSingleSequenceCard();
    renderSingleVideoOutput();
    maybeAutoOpenSingleOutputs();
  }
}

async function runSingleSequencePipeline(effectiveImageUrl, generationConfig) {
  const items = await buildSingleSequenceItems();
  state.single.sequence.items = items;
  state.single.sequence.compilation = {
    loading: false,
    result: null,
    error: "",
    finalJobId: null
  };
  state.single.sequence.distributionResults = [];
  renderSingleSequenceCard();

  for (const item of state.single.sequence.items) {
    const payload = await requestJson("/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        brandId: getActiveBrandId(),
        pipeline: item.pipeline,
        fields: item.fields,
        imageUrl: effectiveImageUrl,
        imageUrls: generationConfig.imageUrls,
        generationConfig
      })
    });

    item.jobId = payload.job.id;
    item.job = payload.job;
    item.status = payload.job.status;
    item.note = "";
    renderSingleSequenceCard();
  }

  const featuredJob = chooseFeaturedSingleSequenceJob();
  if (featuredJob) {
    setSingleAutoProgressJobId(featuredJob.id);
    renderSingleJob(featuredJob);
  }

  refreshSpendSummary();
  refreshHistory();
  await pollSingleSequenceJobs();
}

async function runPipeline() {
  const effectiveImageUrls = getEffectiveSingleImageUrls();
  const effectiveImageUrl = effectiveImageUrls[0] || "";
  const creationMode = state.single.creationMode;
  if (!effectiveImageUrl && !isNarratedMode() && !isSlidesMode()) {
    showToast(state.activePipeline === "product"
      ? "Choose an imported product or upload an image before running the pipeline."
      : "Upload an image before running the pipeline.");
    updateSingleRunState();
    return;
  }

  const generationConfig = buildGenerationConfig("single");
  const validationMessage = !isNarratedMode() && !isSlidesMode()
    ? getGenerationValidationMessage({
      generationConfig,
      imageUrls: effectiveImageUrls
    })
    : "";
  if (validationMessage) {
    showToast(validationMessage);
    updateSingleRunState();
    return;
  }

  state.single.running = true;
  updateSingleRunState();

  try {
    resetSingleJob({ keepImage: true });
    startSingleAutoProgress(creationMode);
    state.single.running = true;
    updateSingleRunState();
    if (isNarratedMode()) {
      const fields = await ensureSingleIdeaFields();
      const payload = await requestJson("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          brandId: getActiveBrandId(),
          pipeline: state.activePipeline,
          mode: "narrated",
          fields,
          imageUrl: effectiveImageUrl,
          generationConfig
        })
      });

      setSingleAutoProgressJobId(payload.job.id);
      renderSingleJob(payload.job);
      refreshHistory();
      await pollSingleJob(payload.job.id);
    } else if (isSlidesMode()) {
      const fields = await ensureSingleIdeaFields();
      const payload = await requestJson("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          brandId: getActiveBrandId(),
          pipeline: state.activePipeline,
          mode: "slides",
          fields,
          imageUrl: effectiveImageUrl,
          generationConfig
        })
      });

      setSingleAutoProgressJobId(payload.job.id);
      renderSingleJob(payload.job);
      refreshHistory();
      await pollSingleJob(payload.job.id);
    } else if (isSingleSequenceRequested()) {
      await runSingleSequencePipeline(effectiveImageUrl, generationConfig);
    } else {
      const fields = await ensureSingleIdeaFields();
      const payload = await requestJson("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          brandId: getActiveBrandId(),
          pipeline: state.activePipeline,
          fields,
          imageUrl: effectiveImageUrl,
          imageUrls: generationConfig.imageUrls,
          generationConfig
        })
      });

      setSingleAutoProgressJobId(payload.job.id);
      renderSingleJob(payload.job);
      refreshSpendSummary();
      refreshHistory();
      await pollSingleJob(payload.job.id);
    }
  } catch (error) {
    resetSingleAutoProgress();
    showToast(error.message);
  } finally {
    state.single.running = false;
    updateSingleRunState();
  }
}

async function retryCurrentJob() {
  if (!state.single.job) {
    return;
  }

  try {
    const payload = await requestJson(`/api/jobs/${state.single.job.id}/retry`, {
      method: "POST"
    });
    if (hasSingleSequenceRun()) {
      state.single.sequence.items = state.single.sequence.items.map((item) => item.jobId === payload.job.id
        ? {
          ...item,
          job: payload.job,
          status: payload.job.status,
          note: ""
        }
        : item);
      state.single.sequence.compilation = {
        loading: false,
        result: null,
        error: "",
        finalJobId: null
      };
      state.single.sequence.distributionResults = [];
      renderSingleSequenceCard();
    }
    renderSingleJob(payload.job);
    refreshHistory();
    if (hasSingleSequenceRun()) {
      await pollSingleSequenceJobs();
    } else {
      await pollSingleJob(payload.job.id);
    }
  } catch (error) {
    showToast(error.message);
  }
}

function switchCaptionTab(platform) {
  state.captionTab = platform;
  document.querySelectorAll("[data-caption-tab]").forEach((button) => {
    const isActive = button.dataset.captionTab === platform;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
  ["tiktok", "instagram", "youtube"].forEach((value) => {
    document.getElementById(`caption-pane-${value}`).classList.toggle("is-hidden", value !== platform);
  });
}

function setPlatformMode(platform, mode) {
  state.platformModes[platform] = mode;
  ["draft", "live"].forEach((value) => {
    const isActive = value === mode;
    document.getElementById(`mode-${platform}-${value}`).classList.toggle("is-active", isActive);
    document.getElementById(`mode-${platform}-${value}`).setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

["tiktok", "instagram", "youtube"].forEach((platform) => {
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById(`caption-${platform}`).addEventListener("input", () => {
      state.captionsDirty[platform] = true;
    });
    document.getElementById(`hashtags-${platform}`).addEventListener("input", () => {
      state.captionsDirty[platform] = true;
    });
  });
});

function getDistributionPayload() {
  const platforms = ["tiktok", "instagram", "youtube"];
  return Object.fromEntries(platforms
    .filter((platform) => document.getElementById(`platform-${platform}`).checked)
    .map((platform) => [platform, {
      enabled: true,
      mode: state.platformModes[platform],
      caption: document.getElementById(`caption-${platform}`).value.trim(),
      hashtags: document.getElementById(`hashtags-${platform}`).value
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    }]));
}

async function distributeCurrentJob() {
  const sequenceResult = getReadySingleSequenceResult();
  if (!sequenceResult?.videoUrl && !state.single.job?.id) {
    return;
  }

  const distributeButton = document.getElementById("distributeButton");
  distributeButton.disabled = true;
  distributeButton.textContent = "Distributing...";

  try {
    if (sequenceResult?.videoUrl) {
      const finalSequenceJobId = state.single.sequence.compilation.finalJobId;
      const payload = finalSequenceJobId
        ? await requestJson(`/api/jobs/${finalSequenceJobId}/distribute`, {
          method: "POST",
          body: JSON.stringify({
            platformConfigs: getDistributionPayload()
          })
        })
        : await requestJson("/api/distribute", {
          method: "POST",
          body: JSON.stringify({
            videoUrl: sequenceResult.videoUrl,
            platformConfigs: getDistributionPayload()
          })
        });

      state.single.sequence.distributionResults = payload.results || [];
      renderDistributionResults(state.single.sequence.distributionResults);
      const hasFailure = state.single.sequence.distributionResults.some((result) => result.status === "failed");
      setStepState("distribution", hasFailure ? "error" : "done", hasFailure ? "Some platforms failed." : "Distribution complete.");
      if (finalSequenceJobId) {
        refreshHistory();
      }
      showToast(hasFailure ? "Some platforms failed." : "Final sequence distributed.");
    } else {
      const payload = await requestJson(`/api/jobs/${state.single.job.id}/distribute`, {
        method: "POST",
        body: JSON.stringify({
          platformConfigs: getDistributionPayload()
        })
      });

      renderSingleJob(payload.job);
      refreshHistory();
      showToast("Distribution attempt finished.");
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    distributeButton.disabled = !getActiveSingleOutputVideoUrl();
    distributeButton.textContent = "Distribute selected platforms";
  }
}

function buildBatchItems() {
  const educationCount = Number.parseInt(document.getElementById("batch-edu-count").value, 10) || 0;
  const comedyCount = Number.parseInt(document.getElementById("batch-comedy-count").value, 10) || 0;
  const productCount = Number.parseInt(document.getElementById("batch-product-count").value, 10) || 0;

  const educationTopics = getBatchTextAreaLines("batch-edu-topics");
  const comedyScenarios = getBatchTextAreaLines("batch-comedy-scenarios");
  const productLines = getBatchTextAreaLines("batch-products");
  const batchProductFields = getBatchBaseFields("product");

  const items = [];
  for (let index = 0; index < educationCount; index += 1) {
    items.push({
      localId: `edu-${index}`,
      pipeline: "edu",
      label: educationTopics[index] || `Auto topic ${index + 1}`,
      imageUrl: state.batch.presenterImageUrl,
      fields: {
        topic: educationTopics[index] || "",
        ...(getBatchIdeaMetaList("edu")[index] || {})
      }
    });
  }

  for (let index = 0; index < comedyCount; index += 1) {
    items.push({
      localId: `comedy-${index}`,
      pipeline: "comedy",
      label: comedyScenarios[index] || `Auto scenario ${index + 1}`,
      imageUrl: state.batch.presenterImageUrl,
      fields: {
        scenario: comedyScenarios[index] || "",
        ...(getBatchIdeaMetaList("comedy")[index] || {})
      }
    });
  }

  for (let index = 0; index < productCount; index += 1) {
    const raw = productLines[index] || "";
    const [productName = "", benefit = ""] = raw.includes("—")
      ? raw.split("—")
      : raw.includes("-")
        ? raw.split("-")
        : [raw, ""];
    items.push({
      localId: `product-${index}`,
      pipeline: "product",
      label: raw || batchProductFields.productName || `Product ${index + 1}`,
      imageUrl: getBatchImageUrlsForPipeline("product")[0] || "",
      fields: {
        ...batchProductFields,
        productName: productName.trim() || batchProductFields.productName || "",
        benefit: benefit.trim() || batchProductFields.benefit || "",
        ...(getBatchIdeaMetaList("product")[index] || {})
      }
    });
  }

  return items;
}

function renderBatchQueue() {
  const queue = document.getElementById("batchQueue");
  const total = state.batch.items.length;
  const finished = state.batch.items.filter((item) => ["ready", "distributed", "failed", "stopped"].includes(item.job?.status || item.status)).length;
  const renderingCount = state.batch.items.filter((item) => ["submitting", "polling"].includes(item.job?.status || item.status)).length;
  const queuedCount = state.batch.items.filter((item) => (item.job?.status || item.status) === "awaiting_generation").length;
  document.getElementById("batchProgressLabel").textContent = total === 0
    ? "No jobs queued yet."
    : state.batch.control.stopRequested && !isBatchTerminal()
      ? "Batch stop requested. Submitted jobs are still finishing."
    : state.batch.control.paused
      ? "Batch paused."
    : state.batch.control.submitting
      ? "Queueing batch jobs..."
    : finished === total
      ? state.batch.control.stopRequested
        ? "Batch stopped."
        : "Batch complete."
      : renderingCount > 0 && queuedCount > 0
        ? `${formatCountLabel(renderingCount, "clip")} rendering now. ${formatCountLabel(queuedCount, "more clip")} queued for the next slot.`
      : renderingCount > 0
        ? `${formatCountLabel(renderingCount, "clip")} rendering now.`
      : queuedCount > 0
        ? `${formatCountLabel(queuedCount, "clip")} queued for the next render slot.`
      : "Batch is processing.";
  document.getElementById("batchProgressCount").textContent = `${finished} / ${total}`;
  document.getElementById("batchProgressFill").style.width = total === 0 ? "0%" : `${Math.round((finished / total) * 100)}%`;

  queue.innerHTML = state.batch.items.map((item) => {
    const job = item.job;
    const status = job?.status || item.status || "queued";
    const scriptPreview = job?.script ? job.script.split("\n").slice(0, 3).join(" ") : "";
    const aheadCount = getBatchGenerationAheadCount(item);
    const message = getBatchItemStatusCopy(item, status, scriptPreview);
    return `
      <div class="batch-item">
        <div class="batch-item-head">
          <span class="batch-badge ${item.pipeline}">${item.pipeline}</span>
          <strong>${escapeHtml(item.label)}</strong>
          <span class="status-chip is-${status}">${escapeHtml(formatJobStatusLabel(status, { aheadCount }))}</span>
        </div>
        <div>${escapeHtml(message)}</div>
        ${job?.videoUrl ? `<div>${safeLinkHtml(job.videoUrl, "Open video")}</div>` : ""}
      </div>
    `;
  }).join("");

  document.getElementById("copyScriptsButton").classList.toggle("is-hidden", state.batch.items.every((item) => !item.job?.script));
  renderBatchRunControls();
  renderBatchCompilation();
}

function markPendingBatchItemsStopped(note = "Stopped before this clip was queued.") {
  state.batch.items = state.batch.items.map((item) => {
    if (item.jobId) {
      return item;
    }

    const status = item.job?.status || item.status || "";
    if (["ready", "distributed", "failed", "stopped"].includes(status)) {
      return item;
    }

    return {
      ...item,
      status: "stopped",
      note
    };
  });
}

async function waitForBatchResumePermission() {
  while (state.batch.control.paused && !state.batch.control.stopRequested) {
    await sleep(180);
  }

  return !state.batch.control.stopRequested;
}

function finishBatchSession() {
  state.batch.control.running = false;
  state.batch.control.submitting = false;
  state.batch.control.monitoring = false;
  state.batch.control.paused = false;
  renderBatchQueue();
}

function toggleBatchPause() {
  if (!state.batch.control.running || state.batch.control.stopRequested) {
    return;
  }

  state.batch.control.paused = !state.batch.control.paused;
  if (state.batch.control.paused) {
    clearBatchPoll();
    state.batch.control.monitoring = false;
    showToast("Batch paused. Resume when you're ready.");
  } else {
    if (!state.batch.control.submitting && hasBatchActiveSubmittedJobs()) {
      pollBatchJobs();
    }
    showToast("Batch resumed.");
  }
  renderBatchQueue();
}

function stopBatch() {
  if (!state.batch.control.running || state.batch.control.stopRequested) {
    return;
  }

  state.batch.control.stopRequested = true;
  state.batch.control.paused = false;
  if (!state.batch.control.submitting) {
    markPendingBatchItemsStopped();
  }
  if (!state.batch.control.monitoring && hasBatchActiveSubmittedJobs()) {
    pollBatchJobs();
  }
  renderBatchQueue();
  showToast(getBatchSubmittedCount() > 0
    ? "Stop requested. No new clips will be queued."
    : "Stop requested before queueing the batch.");
}

async function pollBatchJobs() {
  clearBatchPoll();
  state.batch.control.monitoring = true;
  renderBatchRunControls();
  state.batch.pollTimer = setInterval(async () => {
    if (state.batch.control.paused) {
      clearBatchPoll();
      state.batch.control.monitoring = false;
      renderBatchRunControls();
      return;
    }

    const ids = state.batch.items.map((item) => item.jobId).filter(Boolean);
    if (ids.length === 0) {
      clearBatchPoll();
      state.batch.control.monitoring = false;
      if (!state.batch.control.submitting) {
        finishBatchSession();
      }
      return;
    }

    try {
      const payload = await requestJson(`/api/jobs?ids=${ids.join(",")}&limit=${ids.length}`);
      const byId = new Map(payload.jobs.map((job) => [job.id, job]));
      state.batch.items = state.batch.items.map((item) => ({
        ...item,
        job: item.jobId ? byId.get(item.jobId) || item.job : item.job
      }));
      renderBatchQueue();

      if (state.batch.items.every((item) => ["ready", "distributed", "failed", "stopped"].includes(item.job?.status || item.status))) {
        clearBatchPoll();
        state.batch.control.monitoring = false;
        refreshSpendSummary();
        refreshHistory();
        await compileBatchOutputs({ silent: true });
        finishBatchSession();
        showToast(state.batch.control.stopRequested ? "Batch stop complete." : "Batch processing complete.");
      }
    } catch (error) {
      clearBatchPoll();
      state.batch.control.monitoring = false;
      finishBatchSession();
      showToast(error.message);
    }
  }, 3500);
}

async function runBatch() {
  if (state.batch.control.running) {
    showToast("Batch processing is already active.");
    return;
  }

  const items = buildBatchItems();

  if (items.length === 0) {
    showToast("Add at least one batch item.");
    return;
  }

  const needsPresenter = items.some((item) => item.pipeline !== "product");
  const needsProduct = items.some((item) => item.pipeline === "product");
  const hasBatchProductImages = getBatchImageUrlsForPipeline("product").length > 0;
  if (needsPresenter && !state.batch.presenterImageUrl) {
    showToast("Upload a presenter image for education and comedy jobs.");
    return;
  }
  if (needsProduct && !hasBatchProductImages) {
    showToast("Select an imported product or upload a product image for product jobs.");
    return;
  }

  const presenterValidation = needsPresenter
    ? getGenerationValidationMessage({
      generationConfig: buildGenerationConfig("batch", {
        imageUrls: getBatchImageUrlsForPipeline("edu")
      }),
      imageUrls: getBatchImageUrlsForPipeline("edu")
    })
    : "";
  if (presenterValidation) {
    showToast(presenterValidation);
    return;
  }

  const productValidation = needsProduct
    ? getGenerationValidationMessage({
      generationConfig: buildGenerationConfig("batch", {
        imageUrls: getBatchImageUrlsForPipeline("product")
      }),
      imageUrls: getBatchImageUrlsForPipeline("product")
    })
    : "";
  if (productValidation) {
    showToast(productValidation);
    return;
  }

  clearBatchPoll();
  resetBatchControlState();
  state.batch.control.running = true;
  state.batch.control.submitting = true;
  state.batch.compilation = {
    loading: false,
    results: [],
    error: ""
  };
  state.batch.items = items.map((item) => ({
    ...item,
    status: "creating",
    job: null,
    jobId: null,
    note: "Preparing this clip."
  }));
  renderBatchRunControls();
  renderBatchQueue();
  renderBatchCompilation();

  try {
    const generatedIdeas = await ensureBatchIdeas();
    if (state.batch.control.stopRequested) {
      state.batch.items = items.map((item) => ({
        ...item,
        status: "stopped",
        job: null,
        jobId: null,
        note: "Stopped before this clip was queued."
      }));
      finishBatchSession();
      return;
    }

    const nextItems = buildBatchItems();
    state.batch.items = nextItems.map((item) => ({
      ...item,
      status: "creating",
      job: null,
      jobId: null,
      note: ""
    }));
    renderBatchQueue();

    if (generatedIdeas > 0) {
      showToast(`Generated ${generatedIdeas} missing batch ideas.`);
    }

    for (const item of state.batch.items) {
      const canContinue = await waitForBatchResumePermission();
      if (!canContinue) {
        markPendingBatchItemsStopped();
        break;
      }

      const generationConfig = buildGenerationConfig("batch", {
        imageUrls: getBatchImageUrlsForPipeline(item.pipeline)
      });
      const payload = await requestJson("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          brandId: getActiveBrandId(),
          pipeline: item.pipeline,
          fields: item.fields,
          imageUrl: item.imageUrl,
          imageUrls: generationConfig.imageUrls,
          generationConfig
        })
      });

      item.jobId = payload.job.id;
      item.job = payload.job;
      item.status = payload.job.status;
      item.note = "";
      renderBatchQueue();

      if (state.batch.control.stopRequested) {
        markPendingBatchItemsStopped();
        break;
      }
    }

    state.batch.control.submitting = false;
    state.batch.control.queueCompleted = true;
    refreshHistory();
    renderBatchQueue();

    if (hasBatchActiveSubmittedJobs()) {
      if (!state.batch.control.paused) {
        await pollBatchJobs();
      }
    } else {
      if (state.batch.control.stopRequested) {
        markPendingBatchItemsStopped();
      }
      if (isBatchTerminal()) {
        await compileBatchOutputs({ silent: true });
      }
      finishBatchSession();
    }
  } catch (error) {
    state.batch.control.submitting = false;
    state.batch.control.queueCompleted = true;
    if (state.batch.control.stopRequested) {
      markPendingBatchItemsStopped();
    }
    finishBatchSession();
    showToast(error.message);
  }
}

function copyAllScripts() {
  const scripts = state.batch.items
    .filter((item) => item.job?.script)
    .map((item, index) => `--- ${index + 1}: ${item.label} ---\n${item.job.script}`)
    .join("\n\n");

  navigator.clipboard.writeText(scripts);
  showToast("Copied all available scripts.");
}

function copyContent(id) {
  const text = document.getElementById(id).textContent;
  if (!text) {
    return;
  }

  navigator.clipboard.writeText(text);
  showToast("Copied to clipboard.");
}

function maskSecret(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "Not configured";
  }

  return `${text.slice(0, 4)}••••${text.slice(-4)}`;
}

function applySystemHealth(payload, options = {}) {
  state.system.health = payload || null;
  if (options.render === false) {
    return payload;
  }

  renderCreateSummaryCard();
  renderSingleSequenceCard();
  renderBatchCompilation();
  return payload;
}

async function refreshSystemHealth() {
  const payload = await requestJson("/api/health");
  return applySystemHealth(payload);
}

const {
  clearApiKeyInput,
  closeApiSettingsModal,
  openApiSettingsModal,
  saveApiSettings,
  toggleApiKeyVisibility
} = createApiSettingsController({
  state,
  requestJson,
  escapeHtml,
  formatHistoryTimestamp,
  refreshSystemHealth,
  showToast
});

function renderBrandsView() {
  const overview = document.getElementById("brandsOverview");
  const social = document.getElementById("brandSocialSummary");
  const products = document.getElementById("brandProductsSummary");
  if (!overview || !social || !products) {
    return;
  }

  const brand = getActiveBrand();
  if (!brand) {
    overview.innerHTML = `<div class="brand-empty">Add a brand to manage positioning, publishing destinations, and product catalog context.</div>`;
    social.innerHTML = `<div class="brand-empty">No brand selected.</div>`;
    products.innerHTML = `<div class="brand-empty">No product catalog loaded.</div>`;
    return;
  }

  overview.innerHTML = `
    <div class="brand-identity-card">
      <div class="brand-name">${escapeHtml(brand.name || "Untitled brand")}</div>
      <div class="brand-subline">${escapeHtml(brand.category || "No category set")} • ${escapeHtml(brand.targetAudience || "Audience not set")}</div>
      <div class="brand-detail-grid">
        <div class="brand-detail-item">
          <div class="brand-detail-label">Tone</div>
          <div class="brand-detail-value">${escapeHtml(brand.tone || "Not set")}</div>
        </div>
        <div class="brand-detail-item">
          <div class="brand-detail-label">Imported products</div>
          <div class="brand-detail-value">${escapeHtml((brand.productCatalog || []).length)}</div>
        </div>
        <div class="brand-detail-item">
          <div class="brand-detail-label">Publishing profile</div>
          <div class="brand-detail-value">${escapeHtml(brand.socialAccounts?.ayrshareProfileKey ? "Configured" : "Missing")}</div>
        </div>
      </div>
    </div>
    <div class="brand-notes-card">
      <div class="brand-detail-label">Voice</div>
      <div class="brand-detail-value">${escapeHtml(brand.voice || "No voice guidance saved yet.")}</div>
      <div class="brand-detail-label">Products / notes</div>
      <div class="brand-detail-value">${escapeHtml(brand.products || "No shorthand product notes saved yet.")}</div>
    </div>
  `;

  social.innerHTML = [
    ["Ayrshare profile", maskSecret(brand.socialAccounts?.ayrshareProfileKey)],
    ["TikTok", brand.socialAccounts?.tiktokHandle || "Not set"],
    ["Instagram", brand.socialAccounts?.instagramHandle || "Not set"],
    ["YouTube", brand.socialAccounts?.youtubeHandle || "Not set"]
  ].map(([label, value]) => `
    <div class="brand-channel-row">
      <div class="brand-channel-meta">
        <div class="brand-channel-label">${escapeHtml(label)}</div>
        <div class="brand-channel-value">${escapeHtml(value)}</div>
      </div>
      <span class="status-chip ${value === "Not set" || value === "Missing" || value === "Not configured" ? "is-failed" : "is-ready"}">${value === "Not set" || value === "Missing" || value === "Not configured" ? "Needs setup" : "Ready"}</span>
    </div>
  `).join("");

  if (!brand.productCatalog?.length) {
    products.innerHTML = `<div class="brand-empty">No imported products yet. Use Edit selected brand to import ASINs and attach listing imagery.</div>`;
    return;
  }

  products.innerHTML = brand.productCatalog.map((product) => `
    <div class="catalog-product-card">
      ${sanitizeUrl(product.imageUrl) ? `<img src="${escapeHtml(sanitizeUrl(product.imageUrl))}" alt="${escapeHtml(product.title)}" />` : ""}
      <div class="catalog-product-meta">
        <div class="catalog-product-item-head">
          <strong>${escapeHtml(product.title || "Imported product")}</strong>
          <span>${escapeHtml(product.asin || "")}</span>
        </div>
        <span>${escapeHtml(getProductBenefitText(product) || product.description || "No product highlights imported yet.")}</span>
        <div class="catalog-product-item-actions">
          ${safeLinkHtml(product.productUrl, "Open listing")}
        </div>
      </div>
    </div>
  `).join("");
}

function populateBrandModal(brand) {
  document.getElementById("brand-name").value = brand?.name || "";
  document.getElementById("brand-category").value = brand?.category || "";
  document.getElementById("brand-voice").value = brand?.voice || "";
  document.getElementById("brand-products").value = brand?.products || "";
  document.getElementById("brand-audience").value = brand?.targetAudience || "";
  document.getElementById("brand-tone").value = brand?.tone || "";
  document.getElementById("brand-ayrshare-profile-key").value = brand?.socialAccounts?.ayrshareProfileKey || "";
  document.getElementById("brand-tiktok-handle").value = brand?.socialAccounts?.tiktokHandle || "";
  document.getElementById("brand-instagram-handle").value = brand?.socialAccounts?.instagramHandle || "";
  document.getElementById("brand-youtube-handle").value = brand?.socialAccounts?.youtubeHandle || "";
  document.getElementById("brand-product-import-input").value = "";
  document.getElementById("brandProductImportStatus").textContent = "Imported products will appear below and can be selected in the video workflow.";
}

function renderBrandProductManager() {
  const brandId = state.brandModal.mode === "edit" ? state.brandModal.editingBrandId : "";
  const manager = document.getElementById("brandProductCatalogManager");
  const hint = document.getElementById("brandProductCatalogHint");
  const list = document.getElementById("brandProductList");
  const importButton = document.getElementById("brandProductImportButton");
  if (!manager || !hint || !list || !importButton) {
    return;
  }

  const brand = brandId ? state.brands.find((entry) => entry.id === brandId) : null;
  const products = brand?.productCatalog || [];
  const importing = state.brandModal.importingProducts;

  manager.classList.toggle("is-hidden", !brand);
  hint.classList.toggle("is-hidden", Boolean(brand));
  importButton.disabled = importing;
  importButton.textContent = importing ? "Importing..." : "Import products";

  if (!brand) {
    hint.textContent = "Save the brand first, then reopen edit mode to import ASINs and manage product imagery.";
    list.innerHTML = "";
    return;
  }

  hint.textContent = "Paste one ASIN or Amazon product URL per line. Imported products become selectable in the product video workflow.";

  if (products.length === 0) {
    list.innerHTML = `<div class="catalog-product-empty">No imported brand products yet.</div>`;
    return;
  }

  list.innerHTML = products.map((product) => `
    <div class="catalog-product-card">
      ${sanitizeUrl(product.imageUrl) ? `<img src="${escapeHtml(sanitizeUrl(product.imageUrl))}" alt="${escapeHtml(product.title)}" />` : ""}
      <div class="catalog-product-meta">
        <div class="catalog-product-item-head">
          <strong>${escapeHtml(product.title || "Imported product")}</strong>
          <span>${escapeHtml(product.asin || "")}</span>
        </div>
        <span>${escapeHtml(getProductBenefitText(product) || product.description || "No product highlights imported yet.")}</span>
        <div class="catalog-product-item-actions">
          ${safeLinkHtml(product.productUrl, "Open listing")}
          <button type="button" class="ghost-button compact-button" onclick="deleteBrandProduct('${product.id}')">Remove</button>
        </div>
      </div>
    </div>
  `).join("");
}

function closeBrandModal() {
  document.getElementById("brandModal").classList.remove("is-open");
  document.getElementById("brandModal").setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-modal-open");
  state.brandModal.lastFocusedElement?.focus?.();
}

function openBrandModal(mode = "new") {
  state.brandModal.lastFocusedElement = document.activeElement;
  state.brandModal.mode = mode;
  state.brandModal.editingBrandId = mode === "edit" ? getActiveBrandId() : null;
  state.brandModal.importingProducts = false;
  const brand = mode === "edit" ? getActiveBrand() : null;
  document.getElementById("brandModalTitle").textContent = mode === "edit" ? "Edit brand settings" : "Add brand";
  populateBrandModal(brand);
  renderBrandProductManager();
  document.getElementById("brandModal").classList.add("is-open");
  document.getElementById("brandModal").setAttribute("aria-hidden", "false");
  document.body.classList.add("is-modal-open");
  requestAnimationFrame(() => {
    document.querySelector("#brandModal .modal")?.focus();
    document.getElementById("brand-name")?.focus();
  });
}

async function importBrandProducts() {
  const brandId = state.brandModal.editingBrandId;
  if (!brandId) {
    showToast("Save the brand first, then import products in edit mode.");
    return;
  }

  const rawText = document.getElementById("brand-product-import-input").value.trim();
  if (!rawText) {
    showToast("Paste at least one ASIN or Amazon URL to import.");
    return;
  }

  state.brandModal.importingProducts = true;
  renderBrandProductManager();

  try {
    const payload = await requestJson(`/api/brands/${brandId}/products/import`, {
      method: "POST",
      body: JSON.stringify({ rawText })
    });
    state.brands = state.brands.map((brand) => brand.id === brandId
      ? { ...brand, productCatalog: payload.products || [] }
      : brand);
    document.getElementById("brand-product-import-input").value = "";
    document.getElementById("brandProductImportStatus").textContent = payload.failureCount > 0
      ? `Imported ${payload.importedCount} product${payload.importedCount === 1 ? "" : "s"}. ${payload.failureCount} need attention.`
      : `Imported ${payload.importedCount} product${payload.importedCount === 1 ? "" : "s"}.`;
    renderCatalogProductSelects();
    renderBrandsView();
    renderBrandProductManager();
    showToast(payload.failureCount > 0
      ? `Imported ${payload.importedCount} products. Some ASINs could not be fetched.`
      : `Imported ${payload.importedCount} products.`);
  } catch (error) {
    showToast(error.message);
  } finally {
    state.brandModal.importingProducts = false;
    renderBrandProductManager();
  }
}

async function deleteBrandProduct(productId) {
  const brandId = state.brandModal.editingBrandId;
  if (!brandId) {
    return;
  }

  try {
    const payload = await requestJson(`/api/brands/${brandId}/products/${productId}`, {
      method: "DELETE"
    });
    state.brands = state.brands.map((brand) => brand.id === brandId
      ? { ...brand, productCatalog: payload.products || [] }
      : brand);
    renderCatalogProductSelects();
    renderBrandsView();
    renderBrandProductManager();
    showToast("Product removed from this brand.");
  } catch (error) {
    showToast(error.message);
  }
}

async function saveBrand() {
  try {
    const body = {
      name: document.getElementById("brand-name").value.trim(),
      category: document.getElementById("brand-category").value.trim(),
      voice: document.getElementById("brand-voice").value.trim(),
      products: document.getElementById("brand-products").value.trim(),
      targetAudience: document.getElementById("brand-audience").value.trim(),
      tone: document.getElementById("brand-tone").value.trim(),
      socialAccounts: {
        ayrshareProfileKey: document.getElementById("brand-ayrshare-profile-key").value.trim(),
        tiktokHandle: document.getElementById("brand-tiktok-handle").value.trim(),
        instagramHandle: document.getElementById("brand-instagram-handle").value.trim(),
        youtubeHandle: document.getElementById("brand-youtube-handle").value.trim()
      }
    };

    const isEdit = state.brandModal.mode === "edit" && state.brandModal.editingBrandId;
    const payload = await requestJson(isEdit ? `/api/brands/${state.brandModal.editingBrandId}` : "/api/brands", {
      method: isEdit ? "PUT" : "POST",
      body: JSON.stringify({
        ...body
      })
    });

    if (isEdit) {
      state.brands = state.brands.map((brand) => brand.id === payload.id ? payload : brand);
    } else {
      state.brands.push(payload);
    }
    renderBrandSelect();
    document.getElementById("brandSelect").value = payload.id;
    renderActiveBrandSummary();
    renderCatalogProductSelects();
    renderBrandsView();
    closeBrandModal();
    showToast(isEdit ? "Brand settings updated." : "Brand saved.");
  } catch (error) {
    showToast(error.message);
  }
}

function trapBrandModalFocus(event) {
  if (!isBrandModalOpen() || event.key !== "Tab") {
    return;
  }

  const focusable = Array.from(document.querySelectorAll("#brandModal button, #brandModal input, #brandModal select, #brandModal textarea, #brandModal [tabindex]:not([tabindex='-1'])"))
    .filter((element) => !element.disabled && element.offsetParent !== null);
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function trapApiSettingsModalFocus(event) {
  if (!isApiSettingsModalOpen() || event.key !== "Tab") {
    return;
  }

  const focusable = Array.from(document.querySelectorAll("#apiSettingsModal button, #apiSettingsModal input, #apiSettingsModal select, #apiSettingsModal textarea, #apiSettingsModal [tabindex]:not([tabindex='-1'])"))
    .filter((element) => !element.disabled && element.offsetParent !== null);
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function init() {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isApiSettingsModalOpen()) {
      closeApiSettingsModal();
    } else if (event.key === "Escape" && isBrandModalOpen()) {
      closeBrandModal();
    }
    trapBrandModalFocus(event);
    trapApiSettingsModalFocus(event);
  });

  [
    { id: "edu-topic", pipeline: "edu" },
    { id: "comedy-scenario", pipeline: "comedy" },
    { id: "product-name", pipeline: "product" },
    { id: "product-benefit", pipeline: "product" }
  ].forEach(({ id, pipeline }) => {
    document.getElementById(id)?.addEventListener("input", () => {
      clearSingleIdeaMeta(pipeline);
      renderIdeaAssist();
    });
  });

  [
    { id: "batch-edu-topics", pipeline: "edu" },
    { id: "batch-comedy-scenarios", pipeline: "comedy" },
    { id: "batch-products", pipeline: "product" }
  ].forEach(({ id, pipeline }) => {
    document.getElementById(id)?.addEventListener("input", () => {
      clearBatchIdeaMeta(pipeline);
    });
  });

  initDropZone("singleUploadZone", "singleFileInput");
  initDropZone("singleUploadZoneSecondary", "singleFileInputSecondary");
  initDropZone("batchPresenterZone", "batchPresenterInput");
  initDropZone("batchPresenterSecondaryZone", "batchPresenterSecondaryInput");
  initDropZone("batchProductZone", "batchProductInput");
  initDropZone("batchProductSecondaryZone", "batchProductSecondaryInput");
  mountDashboardShell();

  const [brandPayload, profilePayload, healthPayload, narratedOptionsPayload] = await Promise.all([
    requestJson("/api/brands"),
    requestJson("/api/models"),
    requestJson("/api/health"),
    requestJson("/api/narrated/options")
  ]);
  state.brands = brandPayload;
  state.generationProfiles = profilePayload.models || profilePayload.profiles || profilePayload || [];
  applySystemHealth(healthPayload, { render: false });
  state.system.narratedOptions = narratedOptionsPayload || null;
  populateNarratedOptionControls();
  renderBrandSelect();
  renderActiveBrandSummary();
  renderCatalogProductSelects();
  renderGenerationProfileSelect();
  refreshGenerationProfileUi("single");
  refreshGenerationProfileUi("batch");
  renderIdeaAssist();
  renderViewScopedSections();
  renderSingleSequenceCard();
  renderNarratedSegmentsCard();
  renderNarratedModeUi();
  renderCreateSummaryCard();
  renderBatchIdeaButtons();
  renderBatchRunControls();
  renderHistory();
  renderOverviewScreen();
  renderReviewWorkspace();
  renderRunsView();
  renderOutputsWorkspace();
  renderPublishWorkspace();
  renderBrandsView();
  renderBatchCompilation();
  renderBatchProductRequirement();
  renderStrategyStudio();
  switchCaptionTab("tiktok");
  setCreateWorkspaceMode("single");
  setViewMode("overview", document.getElementById("view-overview"));
  updateSingleRunState();
  renderOperationsSummary();
  refreshSpendSummary();
  refreshHistory();
}

Object.assign(window, {
  applyIdeaSuggestionByIndex,
  closeBrandModal,
  closeApiSettingsModal,
  compileBatchOutputs,
  composeNarratedVideo,
  copyAllScripts,
  copyContent,
  clearApiKeyInput,
  deleteBrandProduct,
  deleteHistoryJob,
  distributeCurrentJob,
  copyStrategyJson,
  focusDashboardJob,
  fetchStrategyListing,
  generateBatchIdeasForPipeline,
  generateIdeasForActivePipeline,
  generateNarratedBroll,
  generateNarratedVoice,
  generateStrategy,
  clearBatchUpload,
  clearSingleUpload,
  handleBatchUpload,
  handleBrandChange,
  handleGenerationProfileChange,
  handleProductSelectionChange,
  handleStrategyFieldInput,
  handleSingleUpload,
  handleSingleVideoCountChange,
  importBrandProducts,
  loadJobIntoSingleView,
  openApiSettingsModal,
  openBrandModal,
  performDeleteJob,
  refreshGenerationProfileUi,
  refreshHistory,
  regenerateBatchIdeasForPipeline,
  regenerateIdeasForActivePipeline,
  renderCreateSummaryCard,
  renderNarratedTemplateMeta,
  renderSlidesVideo,
  retryCurrentJob,
  retryRunFromList,
  runBatch,
  runPipeline,
  saveBrand,
  saveApiSettings,
  saveNarratedSegments,
  saveSlides,
  selectPipeline,
  setCreateWorkspaceMode,
  setDashboardFocus,
  setPlatformMode,
  setQueueSearch,
  setRunsFilter,
  setSingleCreationMode,
  setViewMode,
  stopBatch,
  switchCaptionTab,
  toggleApiKeyVisibility,
  toggleBatchPause
});

init().catch((error) => {
  showToast(error.message);
});
