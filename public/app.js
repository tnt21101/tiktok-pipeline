const state = {
  viewMode: "single",
  activePipeline: "edu",
  brands: [],
  generationProfiles: [],
  system: {
    health: null
  },
  spendSummary: null,
  history: {
    jobs: [],
    loading: false
  },
  brandModal: {
    mode: "new",
    editingBrandId: null,
    importingProducts: false
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

function setUploadZoneMessage(zone, title, subtitle) {
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatCountLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
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

function updateSingleRunState() {
  const runButton = document.getElementById("runButton");
  const runHint = document.getElementById("runHint");
  const profile = getSelectedGenerationProfile();
  const effectiveImageUrls = getEffectiveSingleImageUrls();
  const selectedProduct = getSelectedCatalogProduct("single");
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
  runButton.disabled = effectiveImageUrls.length === 0;

  if (effectiveImageUrls.length > 0) {
    if (state.activePipeline === "product" && !state.single.imageUrl && selectedProduct) {
      runHint.textContent = selectedProduct.imageUrl
        ? "Catalog product selected. Ready to run with imported product imagery."
        : "Selected product has no imported image yet. Upload a custom image to run.";
    } else {
      runHint.textContent = profile?.maxImages > 1 && !state.single.secondaryImageUrl
        ? "Primary image uploaded. You can add a second image, or run now."
        : "Image uploaded. Ready to run the full pipeline.";
    }
    runHint.classList.add("is-success");
    renderSpendSummary();
    return;
  }

  runHint.textContent = state.activePipeline === "product"
    ? "Choose an imported product or upload one image to enable the pipeline."
    : "Upload one image to enable the pipeline.";
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
      audioInputId: "batchGenerationAudio"
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
    audioInputId: "generationAudio"
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
  const profile = getSelectedGenerationProfile(scope);
  const perVideoCost = estimateProfileCost(profile, scope);
  if (scope !== "batch") {
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

function renderBrandSelect() {
  const select = document.getElementById("brandSelect");
  const previousValue = select?.value || "";
  renderSelectOptions(select, state.brands.map((brand) => ({
    value: brand.id,
    label: brand.name
  })), previousValue || state.brands[0]?.id || "");
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
        <span class="status-chip is-${job.status}">${escapeHtml(formatJobStatusLabel(job.status))}</span>
      </div>
      <div class="history-item-meta">${escapeHtml(getHistoryBrandName(job.brandId))} · ${escapeHtml(job.pipeline)} · ${escapeHtml(formatHistoryTimestamp(job.createdAt))}</div>
      <div class="history-item-actions">
        ${safeLinkHtml(job.videoUrl, "Open video")}
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

  currentEstimateLabel.textContent = formatUsd(estimateCurrentRunCost(state.viewMode));

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

function setZoneEmpty(zoneId, title, subtitle) {
  const zone = document.getElementById(zoneId);
  if (!zone) {
    return;
  }

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
  return {
    profileId: profile?.id,
    fallbackProfileId: fallbackProfile?.id || "",
    imageUrls,
    duration: document.getElementById(controlIds.durationSelectId)?.value || profile?.defaults?.duration || "",
    resolution: document.getElementById(controlIds.resolutionSelectId)?.value || profile?.defaults?.resolution || "",
    generateAudio: document.getElementById(controlIds.audioInputId)?.checked ?? Boolean(profile?.defaults?.generateAudio),
    estimatedCostUsd: estimateProfileCost(profile, scope)
  };
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
    resolutionSelect.value = "720p";
  }

  const showAudio = profile.id === "seedance15pro";
  audioField.classList.toggle("is-hidden", !showAudio);
  if (showAudio) {
    audioInput.checked = true;
  }

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
  renderIdeaAssist();
  resetSingleJob();
  renderBatchProductRequirement();
}

function setViewMode(mode, button) {
  state.viewMode = mode;
  document.querySelectorAll(".mode-tab").forEach((tab) => tab.classList.remove("is-active"));
  button.classList.add("is-active");
  document.getElementById("singleMode").classList.toggle("is-hidden", mode !== "single");
  document.getElementById("batchMode").classList.toggle("is-hidden", mode !== "batch");
  renderSpendSummary();
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
    uploadHeading.textContent = "Choose a product or upload an override";
    uploadCopy.textContent = "Select an imported catalog product to use its product imagery automatically, or upload a custom product image if you want to override it.";
  } else {
    uploadHeading.textContent = "Upload presenter image";
    uploadCopy.textContent = "Use one image as the source character for the full run.";
  }

  renderSelectedCatalogProduct("single");
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
  const safePreviewUrl = sanitizeUrl(previewUrl, { allowBlob: true });
  zone.innerHTML = `${safePreviewUrl ? `<img src="${escapeHtml(safePreviewUrl)}" alt="${escapeHtml(title)}" />` : ""}<div class="upload-subtitle">${escapeHtml(title)}</div>`;
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
    setUploadZoneMessage(zone, "Upload failed", error.message);
    updateSingleRunState();
  }
}

async function handleBatchUpload(kind, event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const uploadMeta = {
    presenter: {
      zoneId: "batchPresenterZone",
      imageKey: "presenterImageUrl",
      previewKey: "presenterPreviewUrl"
    },
    presenterSecondary: {
      zoneId: "batchPresenterSecondaryZone",
      imageKey: "presenterSecondaryImageUrl",
      previewKey: "presenterSecondaryPreviewUrl"
    },
    product: {
      zoneId: "batchProductZone",
      imageKey: "productImageUrl",
      previewKey: "productPreviewUrl"
    },
    productSecondary: {
      zoneId: "batchProductSecondaryZone",
      imageKey: "productSecondaryImageUrl",
      previewKey: "productSecondaryPreviewUrl"
    }
  }[kind];

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
    state.batch[uploadMeta.imageKey] = imageUrl;
    state.batch[uploadMeta.previewKey] = previewUrl;

    setZonePreview(zoneId, previewUrl, file.name);
    renderSelectedCatalogProduct("batch");
    renderBatchProductRequirement();
    renderSpendSummary();
  } catch (error) {
    setUploadZoneMessage(zone, "Upload failed", error.message);
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
      imageUrl: getEffectiveSingleImageUrl(),
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
      <div>${escapeHtml(result.error || (result.videoUrl ? "Ready to review." : "Compilation did not return a video URL."))}</div>
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
      video: job.status === "awaiting_generation"
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
      <strong>${escapeHtml(result.platform)}</strong> · ${escapeHtml(result.mode)} · ${escapeHtml(result.status)}
      <div>${escapeHtml(result.error || (result.externalId ? `External id: ${result.externalId}` : "Delivered"))}</div>
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
    const safeVideoUrl = sanitizeUrl(job.videoUrl);
    document.getElementById("videoWrap").innerHTML = `
      ${safeVideoUrl ? `<video controls src="${escapeHtml(safeVideoUrl)}"></video>` : ""}
      ${safeLinkHtml(safeVideoUrl, "Download video", { className: "copy-button", download: true, newTab: false })}
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
  const effectiveImageUrls = getEffectiveSingleImageUrls();
  const effectiveImageUrl = effectiveImageUrls[0] || "";
  if (!effectiveImageUrl) {
    showToast(state.activePipeline === "product"
      ? "Choose an imported product or upload an image before running the pipeline."
      : "Upload an image before running the pipeline.");
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
    const generationConfig = buildGenerationConfig("single");
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
  document.body.classList.remove("is-modal-open");
}

function openBrandModal(mode = "new") {
  state.brandModal.mode = mode;
  state.brandModal.editingBrandId = mode === "edit" ? getActiveBrandId() : null;
  state.brandModal.importingProducts = false;
  const brand = mode === "edit" ? getActiveBrand() : null;
  document.getElementById("brandModalTitle").textContent = mode === "edit" ? "Edit brand settings" : "Add brand";
  populateBrandModal(brand);
  renderBrandProductManager();
  document.getElementById("brandModal").classList.add("is-open");
  document.body.classList.add("is-modal-open");
  requestAnimationFrame(() => {
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
    renderCatalogProductSelects();
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
  initDropZone("batchPresenterSecondaryZone", "batchPresenterSecondaryInput");
  initDropZone("batchProductZone", "batchProductInput");
  initDropZone("batchProductSecondaryZone", "batchProductSecondaryInput");

  const [brandPayload, profilePayload, healthPayload] = await Promise.all([
    requestJson("/api/brands"),
    requestJson("/api/generation/profiles"),
    requestJson("/api/health")
  ]);
  state.brands = brandPayload;
  state.generationProfiles = profilePayload.profiles || [];
  state.system.health = healthPayload;
  renderBrandSelect();
  renderCatalogProductSelects();
  renderGenerationProfileSelect();
  refreshGenerationProfileUi("single");
  refreshGenerationProfileUi("batch");
  renderIdeaAssist();
  renderBatchIdeaButtons();
  renderBatchRunControls();
  renderHistory();
  renderBatchCompilation();
  renderBatchProductRequirement();
  switchCaptionTab("tiktok");
  updateSingleRunState();
  refreshSpendSummary();
  refreshHistory();
}

init().catch((error) => {
  showToast(error.message);
});
