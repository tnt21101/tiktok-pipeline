const state = {
  viewMode: "single",
  activePipeline: "edu",
  brands: [],
  generationProfiles: [],
  spendSummary: null,
  history: {
    jobs: [],
    loading: false
  },
  brandModal: {
    mode: "new",
    editingBrandId: null
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
    readyToastShownFor: null,
    uploading: false,
    running: false
  },
  batch: {
    presenterImageUrl: "",
    presenterPreviewUrl: "",
    productImageUrl: "",
    productPreviewUrl: "",
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
    compilation: {
      loading: false,
      results: [],
      error: ""
    }
  },
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

function cleanMetaString(value) {
  const normalized = String(value || "").trim();
  return normalized || "";
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

function updateSingleRunState() {
  const runButton = document.getElementById("runButton");
  const runHint = document.getElementById("runHint");
  const profile = getSelectedGenerationProfile();
  if (!runButton || !runHint) {
    return;
  }

  runHint.classList.remove("is-success", "is-warning");

  if (state.single.uploading) {
    runButton.disabled = true;
    runButton.textContent = "Uploading image...";
    runHint.textContent = "Finishing your upload before the pipeline can start.";
    runHint.classList.add("is-warning");
    return;
  }

  if (state.single.running) {
    runButton.disabled = true;
    runButton.textContent = "Starting...";
    runHint.textContent = "Creating the job and kicking off the pipeline.";
    return;
  }

  runButton.textContent = "Run full pipeline";
  runButton.disabled = !state.single.imageUrl;

  if (state.single.imageUrl) {
    runHint.textContent = profile?.maxImages > 1 && !state.single.secondaryImageUrl
      ? "Primary image uploaded. You can add a second image, or run now."
      : "Image uploaded. Ready to run the full pipeline.";
    runHint.classList.add("is-success");
    renderSpendSummary();
    return;
  }

  runHint.textContent = "Upload one image to enable the pipeline.";
  runHint.classList.add("is-warning");
  renderSpendSummary();
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

function getSelectedGenerationProfile() {
  const profileId = document.getElementById("generationProfile")?.value || state.generationProfiles[0]?.id;
  return state.generationProfiles.find((profile) => profile.id === profileId) || state.generationProfiles[0] || null;
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
      emptyMessage: "Leave product details blank and the app will generate product plus benefit angles.",
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

function estimateCurrentRunCost(profile) {
  if (!profile) {
    return null;
  }

  if (profile.pricing?.type === "per_second") {
    const duration = Number.parseInt(document.getElementById("generationDuration")?.value || profile.defaults?.duration || "0", 10);
    return Number.isFinite(duration) ? Number((duration * Number(profile.pricing.rateUsd || 0)).toFixed(3)) : null;
  }

  if (profile.pricing?.type === "fixed") {
    return Number(profile.pricing.amountUsd || 0);
  }

  return null;
}

function renderBrandSelect() {
  const select = document.getElementById("brandSelect");
  select.innerHTML = state.brands
    .map((brand) => `<option value="${brand.id}">${brand.name}</option>`)
    .join("");
}

function renderGenerationProfileSelect() {
  const select = document.getElementById("generationProfile");
  select.innerHTML = state.generationProfiles
    .map((profile) => `<option value="${profile.id}">${profile.label}</option>`)
    .join("");
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

  label.textContent = meta.label;
  hint.textContent = state.ideaAssist.loading
    ? meta.loadingMessage
    : hasCurrentValue
      ? meta.readyMessage
      : meta.emptyMessage;
  hint.classList.toggle("is-success", hasCurrentValue && !state.ideaAssist.loading);
  hint.classList.toggle("is-warning", !hasCurrentValue && !state.ideaAssist.loading);

  generateButton.disabled = state.ideaAssist.loading;
  regenerateButton.disabled = state.ideaAssist.loading;
  generateButton.textContent = state.ideaAssist.loading ? "Generating..." : "Surprise me";
  regenerateButton.textContent = state.ideaAssist.loading ? "Refreshing..." : "Regenerate";

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
        <span>Click Surprise me, or just leave the field blank and the app will create one on run.</span>
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

function renderHistory() {
  const historyList = document.getElementById("historyList");
  if (!historyList) {
    return;
  }

  if (state.history.loading && state.history.jobs.length === 0) {
    historyList.innerHTML = `<div class="history-empty">Loading recent runs...</div>`;
    return;
  }

  if (!state.history.jobs.length) {
    historyList.innerHTML = `<div class="history-empty">No recent runs yet.</div>`;
    return;
  }

  historyList.innerHTML = state.history.jobs.map((job) => `
    <div class="history-item">
      <div class="history-item-head">
        <div class="history-item-title">${escapeHtml(getHistoryLabel(job))}</div>
        <span class="status-chip is-${job.status}">${escapeHtml(job.status.replaceAll("_", " "))}</span>
      </div>
      <div class="history-item-meta">${escapeHtml(getHistoryBrandName(job.brandId))} · ${escapeHtml(job.pipeline)} · ${escapeHtml(formatHistoryTimestamp(job.createdAt))}</div>
      <div class="history-item-actions">
        ${job.videoUrl ? `<a href="${job.videoUrl}" target="_blank" rel="noreferrer">Open video</a>` : ""}
        <button type="button" class="ghost-button compact-button" onclick="loadJobIntoSingleView('${job.id}')">View details</button>
      </div>
    </div>
  `).join("");
}

function renderSpendSummary(summary = state.spendSummary) {
  const monthlyLabel = document.getElementById("monthlyEstimateLabel");
  const unknownLabel = document.getElementById("unknownEstimateLabel");
  const currentEstimateLabel = document.getElementById("currentEstimateLabel");
  const unknownRow = document.getElementById("unknownEstimateRow");

  currentEstimateLabel.textContent = formatUsd(estimateCurrentRunCost(getSelectedGenerationProfile()));

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

  try {
    const payload = await requestJson("/api/jobs?limit=12");
    state.history.jobs = (payload.jobs || []).slice(0, 12);
  } catch {
    state.history.jobs = state.history.jobs || [];
  } finally {
    state.history.loading = false;
    renderHistory();
  }
}

function buildGenerationConfig() {
  const profile = getSelectedGenerationProfile();
  const imageUrls = [state.single.imageUrl, state.single.secondaryImageUrl].filter(Boolean);
  return {
    profileId: profile?.id,
    imageUrls,
    duration: document.getElementById("generationDuration")?.value || profile?.defaults?.duration || "",
    resolution: document.getElementById("generationResolution")?.value || profile?.defaults?.resolution || "",
    generateAudio: document.getElementById("generationAudio")?.checked ?? Boolean(profile?.defaults?.generateAudio),
    estimatedCostUsd: estimateCurrentRunCost(profile)
  };
}

function refreshGenerationProfileUi() {
  const profile = getSelectedGenerationProfile();
  if (!profile) {
    return;
  }

  const description = document.getElementById("generationModelDescription");
  const durationField = document.getElementById("durationField");
  const resolutionField = document.getElementById("resolutionField");
  const audioField = document.getElementById("audioField");
  const secondaryUploadWrap = document.getElementById("secondaryUploadWrap");
  const secondaryZone = document.getElementById("singleUploadZoneSecondary");
  const durationSelect = document.getElementById("generationDuration");

  description.textContent = profile.description;

  const durationControl = profile.controls?.duration;
  durationField.classList.toggle("is-hidden", !durationControl);
  if (durationControl) {
    const previousValue = durationSelect.value;
    durationSelect.innerHTML = durationControl.options
      .map((option) => `<option value="${option.value}">${option.label}</option>`)
      .join("");
    durationSelect.value = durationSelect.querySelector(`option[value="${previousValue}"]`)
      ? previousValue
      : durationSelect.querySelector(`option[value="${durationControl.defaultValue}"]`)
        ? durationControl.defaultValue
        : durationControl.options[0]?.value;
  }

  const showResolution = profile.id === "seedance15pro";
  resolutionField.classList.toggle("is-hidden", !showResolution);
  if (showResolution) {
    document.getElementById("generationResolution").value = "720p";
  }

  const showAudio = profile.id === "seedance15pro";
  audioField.classList.toggle("is-hidden", !showAudio);
  if (showAudio) {
    document.getElementById("generationAudio").checked = true;
  }

  secondaryUploadWrap.classList.toggle("is-hidden", profile.maxImages < 2);
  if (profile.maxImages >= 2) {
    secondaryZone.querySelector(".upload-title").textContent = profile.id === "veo31_reference"
      ? "Reference image"
      : "Optional second image";
  } else {
    state.single.secondaryImageUrl = "";
    state.single.secondaryPreviewUrl = "";
    secondaryZone.classList.remove("has-image");
    secondaryZone.innerHTML = `
      <div class="upload-zone-copy">
        <div class="upload-title">Optional second image</div>
        <div class="upload-subtitle">Use this for reference or first/last frame models</div>
      </div>
    `;
  }

  renderSpendSummary();
  updateSingleRunState();
}

function handleGenerationProfileChange() {
  refreshGenerationProfileUi();
}

function handleBrandChange() {
  clearIdeaAssistState();
  clearAllSingleIdeaMeta();
  clearAllBatchIdeaMeta();
  renderIdeaAssist();
  resetSingleJob();
}

function setViewMode(mode, button) {
  state.viewMode = mode;
  document.querySelectorAll(".mode-tab").forEach((tab) => tab.classList.remove("is-active"));
  button.classList.add("is-active");
  document.getElementById("singleMode").classList.toggle("is-hidden", mode !== "single");
  document.getElementById("batchMode").classList.toggle("is-hidden", mode !== "batch");
}

function selectPipeline(pipeline) {
  state.activePipeline = pipeline;
  ["edu", "comedy", "product"].forEach((value) => {
    document.getElementById(`pipeline-${value}`).classList.toggle("is-active", value === pipeline);
    document.getElementById(`fields-${value}`).classList.toggle("is-hidden", value !== pipeline);
  });

  const uploadHeading = document.getElementById("singleUploadHeading");
  const uploadCopy = document.getElementById("singleUploadCopy");
  if (pipeline === "product") {
    uploadHeading.textContent = "Upload product image";
    uploadCopy.textContent = "Use one product image as the hero asset for the full run.";
  } else {
    uploadHeading.textContent = "Upload presenter image";
    uploadCopy.textContent = "Use one image as the source character for the full run.";
  }

  renderIdeaAssist();
  resetSingleJob();
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
  zone.classList.add("has-image");
  zone.innerHTML = `<img src="${previewUrl}" alt="${title}" /><div class="upload-subtitle">${title}</div>`;
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
  zone.innerHTML = `<div class="upload-zone-copy"><div class="upload-title">Uploading...</div><div class="upload-subtitle">${file.name}</div></div>`;

  try {
    const uploadedImageUrl = await uploadFile(file);
    const previewUrl = URL.createObjectURL(file);
    clearIdeaAssistState();
    clearAllSingleIdeaMeta();
    renderIdeaAssist();
    if (isPrimary) {
      state.single.imageUrl = uploadedImageUrl;
      state.single.previewUrl = previewUrl;
      setZonePreview("singleUploadZone", previewUrl, file.name);
    } else {
      state.single.secondaryImageUrl = uploadedImageUrl;
      state.single.secondaryPreviewUrl = previewUrl;
      setZonePreview("singleUploadZoneSecondary", previewUrl, file.name);
    }
    state.single.uploading = false;
    resetSingleJob({ keepImage: true });
  } catch (error) {
    state.single.uploading = false;
    if (isPrimary) {
      state.single.imageUrl = "";
    } else {
      state.single.secondaryImageUrl = "";
    }
    zone.innerHTML = `<div class="upload-zone-copy"><div class="upload-title">Upload failed</div><div class="upload-subtitle">${error.message}</div></div>`;
    updateSingleRunState();
  }
}

async function handleBatchUpload(kind, event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const zoneId = kind === "presenter" ? "batchPresenterZone" : "batchProductZone";
  const zone = document.getElementById(zoneId);
  zone.innerHTML = `<div class="upload-zone-copy"><div class="upload-title">Uploading...</div><div class="upload-subtitle">${file.name}</div></div>`;

  try {
    const imageUrl = await uploadFile(file);
    const previewUrl = URL.createObjectURL(file);
    clearIdeaAssistState();
    clearAllBatchIdeaMeta();
    renderIdeaAssist();
    if (kind === "presenter") {
      state.batch.presenterImageUrl = imageUrl;
      state.batch.presenterPreviewUrl = previewUrl;
    } else {
      state.batch.productImageUrl = imageUrl;
      state.batch.productPreviewUrl = previewUrl;
    }

    setZonePreview(zoneId, previewUrl, file.name);
  } catch (error) {
    zone.innerHTML = `<div class="upload-zone-copy"><div class="upload-title">Upload failed</div><div class="upload-subtitle">${error.message}</div></div>`;
  }
}

function getPipelineFields(pipeline) {
  if (pipeline === "edu") {
    return {
      topic: document.getElementById("edu-topic").value.trim(),
      format: document.getElementById("edu-format").value,
      length: document.getElementById("edu-length").value,
      ...getSingleIdeaMeta("edu")
    };
  }

  if (pipeline === "comedy") {
    return {
      scenario: document.getElementById("comedy-scenario").value.trim(),
      format: document.getElementById("comedy-format").value,
      energy: document.getElementById("comedy-energy").value,
      ...getSingleIdeaMeta("comedy")
    };
  }

  return {
    productName: document.getElementById("product-name").value.trim(),
    benefit: document.getElementById("product-benefit").value.trim(),
    format: document.getElementById("product-format").value,
    cta: document.getElementById("product-cta").value,
    ...getSingleIdeaMeta("product")
  };
}

function setPipelineFields(pipeline, nextFields = {}, options = {}) {
  const onlyFillMissing = Boolean(options.onlyFillMissing);

  if (pipeline === "edu") {
    const input = document.getElementById("edu-topic");
    if (input && (!onlyFillMissing || !input.value.trim())) {
      input.value = nextFields.topic || "";
    }
    setSingleIdeaMeta("edu", nextFields);
    renderIdeaAssist();
    return;
  }

  if (pipeline === "comedy") {
    const input = document.getElementById("comedy-scenario");
    if (input && (!onlyFillMissing || !input.value.trim())) {
      input.value = nextFields.scenario || "";
    }
    setSingleIdeaMeta("comedy", nextFields);
    renderIdeaAssist();
    return;
  }

  const productNameInput = document.getElementById("product-name");
  const benefitInput = document.getElementById("product-benefit");
  if (productNameInput && (!onlyFillMissing || !productNameInput.value.trim())) {
    productNameInput.value = nextFields.productName || "";
  }
  if (benefitInput && (!onlyFillMissing || !benefitInput.value.trim())) {
    benefitInput.value = nextFields.benefit || "";
  }
  setSingleIdeaMeta("product", nextFields);
  renderIdeaAssist();
}

function applyIdeaSuggestion(suggestion, pipeline = state.activePipeline, options = {}) {
  if (!suggestion?.fields) {
    return;
  }

  setPipelineFields(pipeline, suggestion.fields, {
    onlyFillMissing: Boolean(options.onlyFillMissing)
  });

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
    await requestIdeaSuggestions(state.activePipeline, 3, {
      imageUrl: state.single.imageUrl,
      sequenceOptions: {
        sequence: true,
        totalCount: 3,
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
      imageUrl: state.single.imageUrl,
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
    imageUrl: state.batch.productImageUrl,
    label: "product angles"
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

function isBatchTerminal() {
  return state.batch.items.length > 0
    && state.batch.items.every((item) => ["ready", "distributed", "failed"].includes(item.job?.status || item.status));
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

function renderBatchCompilation() {
  const button = document.getElementById("batchCompileButton");
  const hint = document.getElementById("batchCompileHint");
  const outputs = document.getElementById("batchCompiledOutputs");
  if (!button || !hint || !outputs) {
    return;
  }

  const groups = buildBatchCompileGroups();
  const hasReadySegments = groups.some((group) => group.videoUrls.length > 0);
  const showButton = hasReadySegments && (isBatchTerminal() || state.batch.compilation.results.length > 0);

  button.classList.toggle("is-hidden", !showButton);
  button.disabled = state.batch.compilation.loading || !hasReadySegments;
  button.textContent = state.batch.compilation.loading
    ? "Compiling category reels..."
    : state.batch.compilation.results.length > 0
      ? "Recompile category reels"
      : "Compile category reels";

  hint.classList.remove("is-success", "is-warning");
  if (state.batch.compilation.loading) {
    hint.textContent = "Compiling one final education, comedy, and product reel from the finished clips.";
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
      <div>${escapeHtml(result.error || (result.videoUrl ? "Ready to review." : "Compilation did not return a video URL."))}</div>
      ${result.videoUrl ? `<div><a href="${result.videoUrl}" target="_blank" rel="noreferrer">Open final video</a></div>` : ""}
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
    fields: {},
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

function clearBatchPoll() {
  if (state.batch.pollTimer) {
    clearInterval(state.batch.pollTimer);
    state.batch.pollTimer = null;
  }
}

function resetSingleJob(options = {}) {
  clearSinglePoll();
  state.single.job = null;
  state.single.readyToastShownFor = null;
  state.captionsDirty = { tiktok: false, instagram: false, youtube: false };
  document.getElementById("retryButton").classList.add("is-hidden");
  document.getElementById("distributeButton").disabled = true;
  document.getElementById("distributionResults").innerHTML = "";
  document.getElementById("videoWrap").innerHTML = "";
  document.getElementById("videoSpinner").classList.add("is-hidden");
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
    document.getElementById("singleUploadZone").classList.remove("has-image");
    document.getElementById("singleUploadZone").innerHTML = `
      <div class="upload-zone-copy">
        <div class="upload-title">Drop an image here</div>
        <div class="upload-subtitle">or click to choose a file</div>
      </div>
    `;
    document.getElementById("singleUploadZoneSecondary").classList.remove("has-image");
    document.getElementById("singleUploadZoneSecondary").innerHTML = `
      <div class="upload-zone-copy">
        <div class="upload-title">Optional second image</div>
        <div class="upload-subtitle">Use this for reference or first/last frame models</div>
      </div>
    `;
  }

  updateSingleRunState();
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
      script: "Writing script...",
      captions: "Generating captions...",
      prompt: "Building video prompt...",
      video: job.status === "awaiting_generation" || job.status === "submitting"
        ? "Queued for video generation..."
        : "Generating video...",
      distribution: "Distributing..."
    };
    return labels[step];
  }

  const waiting = {
    analysis: "Waiting for a run.",
    script: "Waiting for analysis.",
    captions: "Waiting for script.",
    prompt: "Waiting for script.",
    video: "Waiting for prompt.",
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
      <strong>${result.platform}</strong> · ${result.mode} · ${result.status}
      <div>${result.error || (result.externalId ? `External id: ${result.externalId}` : "Delivered")}</div>
    </div>
  `).join("");
}

function renderSingleJob(job) {
  state.single.job = job;
  if (job.analysis) {
    getIdeaAssistState(job.pipeline).analysis = job.analysis;
  }
  if (typeof job.providerConfig?.estimatedCostUsd === "number") {
    document.getElementById("currentEstimateLabel").textContent = formatUsd(job.providerConfig.estimatedCostUsd);
  }
  document.getElementById("retryButton").classList.toggle("is-hidden", !job.canRetry);
  document.getElementById("content-analysis").textContent = job.analysis || "";
  document.getElementById("content-script").textContent = job.script || "";
  document.getElementById("content-prompt").textContent = job.videoPrompt || "";
  setPromptMetrics(job.promptMetrics.length, job.promptMetrics.nearLimit, job.promptMetrics.exceedsLimit);

  ["analysis", "script", "captions", "prompt", "video", "distribution"].forEach((step) => {
    setStepState(step, job.stepState[step], normalizeStepLabel(job, step));
  });

  maybePopulateCaptions(job);
  renderDistributionResults(job.distribution?.results || []);

  if (job.stepState.video === "running") {
    document.getElementById("videoSpinner").classList.remove("is-hidden");
  } else {
    document.getElementById("videoSpinner").classList.add("is-hidden");
  }

  if (job.videoUrl) {
    document.getElementById("videoWrap").innerHTML = `
      <video controls src="${job.videoUrl}"></video>
      <a class="copy-button" href="${job.videoUrl}" download>Download video</a>
    `;
    document.getElementById("distributeButton").disabled = false;
    if (state.single.readyToastShownFor !== job.id) {
      state.single.readyToastShownFor = job.id;
      showToast("Video ready to review and distribute.");
    }
  }

  if (job.isTerminal) {
    clearSinglePoll();
    refreshSpendSummary();
    refreshHistory();
  }
}

async function loadJobIntoSingleView(jobId) {
  try {
    const singleTab = document.querySelector(".mode-tab");
    if (singleTab) {
      setViewMode("single", singleTab);
    }
    const payload = await requestJson(`/api/jobs/${jobId}`);
    renderSingleJob(payload.job);
    if (!payload.job.isTerminal) {
      await pollSingleJob(payload.job.id);
    }
  } catch (error) {
    showToast(error.message);
  }
}

async function pollSingleJob(jobId) {
  clearSinglePoll();
  state.single.pollTimer = setInterval(async () => {
    try {
      const payload = await requestJson(`/api/jobs/${jobId}`);
      renderSingleJob(payload.job);
    } catch (error) {
      clearSinglePoll();
      showToast(error.message);
    }
  }, 2500);
}

async function runPipeline() {
  if (!state.single.imageUrl) {
    showToast("Upload an image before running the pipeline.");
    updateSingleRunState();
    return;
  }

  state.single.running = true;
  updateSingleRunState();

  try {
    resetSingleJob({ keepImage: true });
    state.single.running = true;
    updateSingleRunState();
    const fields = await ensureSingleIdeaFields();
    const generationConfig = buildGenerationConfig();
    const payload = await requestJson("/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        brandId: getActiveBrandId(),
        pipeline: state.activePipeline,
        fields,
        imageUrl: state.single.imageUrl,
        imageUrls: generationConfig.imageUrls,
        generationConfig
      })
    });

    renderSingleJob(payload.job);
    refreshSpendSummary();
    refreshHistory();
    await pollSingleJob(payload.job.id);
  } catch (error) {
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
    renderSingleJob(payload.job);
    refreshHistory();
    await pollSingleJob(payload.job.id);
  } catch (error) {
    showToast(error.message);
  }
}

function switchCaptionTab(platform) {
  state.captionTab = platform;
  document.querySelectorAll("[data-caption-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.captionTab === platform);
  });
  ["tiktok", "instagram", "youtube"].forEach((value) => {
    document.getElementById(`caption-pane-${value}`).classList.toggle("is-hidden", value !== platform);
  });
}

function setPlatformMode(platform, mode) {
  state.platformModes[platform] = mode;
  ["draft", "live"].forEach((value) => {
    document.getElementById(`mode-${platform}-${value}`).classList.toggle("is-active", value === mode);
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
  if (!state.single.job?.id) {
    return;
  }

  const distributeButton = document.getElementById("distributeButton");
  distributeButton.disabled = true;
  distributeButton.textContent = "Distributing...";

  try {
    const payload = await requestJson(`/api/jobs/${state.single.job.id}/distribute`, {
      method: "POST",
      body: JSON.stringify({
        platformConfigs: getDistributionPayload()
      })
    });

    renderSingleJob(payload.job);
    refreshHistory();
    showToast("Distribution attempt finished.");
  } catch (error) {
    showToast(error.message);
  } finally {
    distributeButton.disabled = !state.single.job?.videoUrl;
    distributeButton.textContent = "Review captions and distribute";
  }
}

function buildBatchItems() {
  const educationCount = Number.parseInt(document.getElementById("batch-edu-count").value, 10) || 0;
  const comedyCount = Number.parseInt(document.getElementById("batch-comedy-count").value, 10) || 0;
  const productCount = Number.parseInt(document.getElementById("batch-product-count").value, 10) || 0;

  const educationTopics = getBatchTextAreaLines("batch-edu-topics");
  const comedyScenarios = getBatchTextAreaLines("batch-comedy-scenarios");
  const productLines = getBatchTextAreaLines("batch-products");

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
      label: raw || `Product ${index + 1}`,
      imageUrl: state.batch.productImageUrl,
      fields: {
        productName: productName.trim(),
        benefit: benefit.trim(),
        ...(getBatchIdeaMetaList("product")[index] || {})
      }
    });
  }

  return items;
}

function renderBatchQueue() {
  const queue = document.getElementById("batchQueue");
  const total = state.batch.items.length;
  const finished = state.batch.items.filter((item) => ["ready", "distributed", "failed"].includes(item.job?.status || item.status)).length;
  document.getElementById("batchProgressLabel").textContent = total === 0
    ? "No jobs queued yet."
    : finished === total
      ? "Batch complete."
      : "Batch is processing.";
  document.getElementById("batchProgressCount").textContent = `${finished} / ${total}`;
  document.getElementById("batchProgressFill").style.width = total === 0 ? "0%" : `${Math.round((finished / total) * 100)}%`;

  queue.innerHTML = state.batch.items.map((item) => {
    const job = item.job;
    const status = job?.status || item.status || "queued";
    const scriptPreview = job?.script ? job.script.split("\n").slice(0, 3).join(" ") : "";
    return `
      <div class="batch-item">
        <div class="batch-item-head">
          <span class="batch-badge ${item.pipeline}">${item.pipeline}</span>
          <strong>${item.label}</strong>
          <span class="status-chip is-${status}">${status.replaceAll("_", " ")}</span>
        </div>
        <div>${job?.error || scriptPreview || "Queued for processing."}</div>
        ${job?.videoUrl ? `<div><a href="${job.videoUrl}" target="_blank" rel="noreferrer">Open video</a></div>` : ""}
      </div>
    `;
  }).join("");

  document.getElementById("copyScriptsButton").classList.toggle("is-hidden", state.batch.items.every((item) => !item.job?.script));
  renderBatchCompilation();
}

async function pollBatchJobs() {
  clearBatchPoll();
  state.batch.pollTimer = setInterval(async () => {
    const ids = state.batch.items.map((item) => item.jobId).filter(Boolean);
    if (ids.length === 0) {
      clearBatchPoll();
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

      if (state.batch.items.every((item) => ["ready", "distributed", "failed"].includes(item.job?.status || item.status))) {
        clearBatchPoll();
        refreshSpendSummary();
        refreshHistory();
        await compileBatchOutputs({ silent: true });
        showToast("Batch processing complete.");
      }
    } catch (error) {
      clearBatchPoll();
      showToast(error.message);
    }
  }, 3500);
}

async function runBatch() {
  const runButton = document.getElementById("batchRunButton");
  const items = buildBatchItems();

  if (items.length === 0) {
    showToast("Add at least one batch item.");
    return;
  }

  const needsPresenter = items.some((item) => item.pipeline !== "product");
  const needsProduct = items.some((item) => item.pipeline === "product");
  if (needsPresenter && !state.batch.presenterImageUrl) {
    showToast("Upload a presenter image for education and comedy jobs.");
    return;
  }
  if (needsProduct && !state.batch.productImageUrl) {
    showToast("Upload a product image for product jobs.");
    return;
  }

  clearBatchPoll();
  runButton.disabled = true;
  runButton.textContent = "Generating ideas...";
  state.batch.compilation = {
    loading: false,
    results: [],
    error: ""
  };
  renderBatchCompilation();

  try {
    const generatedIdeas = await ensureBatchIdeas();
    const nextItems = buildBatchItems();
    state.batch.items = nextItems.map((item) => ({ ...item, status: "creating", job: null, jobId: null }));
    renderBatchQueue();

    runButton.textContent = "Queueing...";
    if (generatedIdeas > 0) {
      showToast(`Generated ${generatedIdeas} missing batch ideas.`);
    }

    for (const item of state.batch.items) {
      const generationConfig = {
        ...buildGenerationConfig(),
        imageUrls: [item.imageUrl].filter(Boolean)
      };
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
      renderBatchQueue();
    }

    refreshHistory();
    await pollBatchJobs();
  } catch (error) {
    showToast(error.message);
  } finally {
    runButton.disabled = false;
    runButton.textContent = "Queue full batch";
    renderBatchQueue();
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
}

function closeBrandModal() {
  document.getElementById("brandModal").classList.remove("is-open");
  document.body.classList.remove("is-modal-open");
}

function openBrandModal(mode = "new") {
  state.brandModal.mode = mode;
  state.brandModal.editingBrandId = mode === "edit" ? getActiveBrandId() : null;
  const brand = mode === "edit" ? getActiveBrand() : null;
  document.getElementById("brandModalTitle").textContent = mode === "edit" ? "Edit brand settings" : "Add brand";
  populateBrandModal(brand);
  document.getElementById("brandModal").classList.add("is-open");
  document.body.classList.add("is-modal-open");
  requestAnimationFrame(() => {
    document.getElementById("brand-name")?.focus();
  });
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
    closeBrandModal();
    showToast(isEdit ? "Brand settings updated." : "Brand saved.");
  } catch (error) {
    showToast(error.message);
  }
}

async function init() {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.getElementById("brandModal")?.classList.contains("is-open")) {
      closeBrandModal();
    }
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
  initDropZone("batchProductZone", "batchProductInput");

  const [brandPayload, profilePayload] = await Promise.all([
    requestJson("/api/brands"),
    requestJson("/api/generation/profiles")
  ]);
  state.brands = brandPayload;
  state.generationProfiles = profilePayload.profiles || [];
  renderBrandSelect();
  renderGenerationProfileSelect();
  refreshGenerationProfileUi();
  renderIdeaAssist();
  renderBatchIdeaButtons();
  renderHistory();
  renderBatchCompilation();
  switchCaptionTab("tiktok");
  updateSingleRunState();
  refreshSpendSummary();
  refreshHistory();
}

init().catch((error) => {
  showToast(error.message);
});
