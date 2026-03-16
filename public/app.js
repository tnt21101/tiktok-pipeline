const state = {
  viewMode: "single",
  activePipeline: "edu",
  brands: [],
  generationProfiles: [],
  spendSummary: null,
  brandModal: {
    mode: "new",
    editingBrandId: null
  },
  single: {
    imageUrl: "",
    previewUrl: "",
    secondaryImageUrl: "",
    secondaryPreviewUrl: "",
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
    pollTimer: null
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

function renderSpendSummary(summary = state.spendSummary) {
  const monthlyLabel = document.getElementById("monthlyEstimateLabel");
  const unknownLabel = document.getElementById("unknownEstimateLabel");
  const currentEstimateLabel = document.getElementById("currentEstimateLabel");

  currentEstimateLabel.textContent = formatUsd(estimateCurrentRunCost(getSelectedGenerationProfile()));

  if (!summary) {
    monthlyLabel.textContent = "$0.000 est.";
    unknownLabel.textContent = "0";
    return;
  }

  monthlyLabel.textContent = formatUsd(summary.estimatedTotalUsd);
  unknownLabel.textContent = String(summary.estimatedUnknownJobs || 0);
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
      length: document.getElementById("edu-length").value
    };
  }

  if (pipeline === "comedy") {
    return {
      scenario: document.getElementById("comedy-scenario").value.trim(),
      format: document.getElementById("comedy-format").value,
      energy: document.getElementById("comedy-energy").value
    };
  }

  return {
    productName: document.getElementById("product-name").value.trim(),
    benefit: document.getElementById("product-benefit").value.trim(),
    format: document.getElementById("product-format").value,
    cta: document.getElementById("product-cta").value
  };
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
    const generationConfig = buildGenerationConfig();
    const payload = await requestJson("/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        brandId: getActiveBrandId(),
        pipeline: state.activePipeline,
        fields: getPipelineFields(state.activePipeline),
        imageUrl: state.single.imageUrl,
        imageUrls: generationConfig.imageUrls,
        generationConfig,
        kieApiKey: document.getElementById("kieApiKey").value.trim()
      })
    });

    renderSingleJob(payload.job);
    refreshSpendSummary();
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

  const educationTopics = document.getElementById("batch-edu-topics").value
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const comedyScenarios = document.getElementById("batch-comedy-scenarios").value
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const productLines = document.getElementById("batch-products").value
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);

  const items = [];
  for (let index = 0; index < educationCount; index += 1) {
    items.push({
      localId: `edu-${index}`,
      pipeline: "edu",
      label: educationTopics[index] || `Auto topic ${index + 1}`,
      imageUrl: state.batch.presenterImageUrl,
      fields: { topic: educationTopics[index] || "" }
    });
  }

  for (let index = 0; index < comedyCount; index += 1) {
    items.push({
      localId: `comedy-${index}`,
      pipeline: "comedy",
      label: comedyScenarios[index] || `Auto scenario ${index + 1}`,
      imageUrl: state.batch.presenterImageUrl,
      fields: { scenario: comedyScenarios[index] || "" }
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
        benefit: benefit.trim()
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
  state.batch.items = items.map((item) => ({ ...item, status: "creating", job: null, jobId: null }));
  renderBatchQueue();

  runButton.disabled = true;
  runButton.textContent = "Queueing...";

  try {
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
  switchCaptionTab("tiktok");
  updateSingleRunState();
  refreshSpendSummary();
}

init().catch((error) => {
  showToast(error.message);
});
