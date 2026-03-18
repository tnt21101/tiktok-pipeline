export function createApiSettingsController({
  state,
  requestJson,
  escapeHtml,
  formatHistoryTimestamp,
  refreshSystemHealth,
  showToast
}) {
  function getApiKeyInputId(providerId) {
    return `api-key-${providerId}`;
  }

  function getApiKeyToggleButtonId(providerId) {
    return `api-key-toggle-${providerId}`;
  }

  function applyApiSettingsPayload(payload) {
    state.apiSettings.providers = Array.isArray(payload?.providers) ? payload.providers : [];
    state.apiSettings.updatedAt = payload?.updatedAt || "";
    state.apiSettings.error = "";
  }

  function getApiSettingsStatusLabel(provider) {
    if (!provider?.configured) {
      return "Missing";
    }

    if (provider.source === "saved") {
      return "Saved in app";
    }

    return provider.source === "environment" ? "Using env" : "Ready";
  }

  function getApiSettingsProviderHint(provider) {
    if (provider?.source === "saved") {
      return `Saved in the app database as ${provider.maskedValue}. Clear this field and save to fall back to ${provider.envVar} if it exists.`;
    }

    if (provider?.source === "environment") {
      return `Currently using ${provider.envVar} from the environment as ${provider.maskedValue}. Save a value here to override it inside the app.`;
    }

    return `No key is configured yet. Save a ${provider?.label || "provider"} key here to register it in the app.`;
  }

  function getApiSettingsInputPlaceholder(provider) {
    if (provider?.source === "environment") {
      return `Currently inherited from ${provider.envVar}`;
    }

    return `Paste ${provider?.label || "provider"} API key`;
  }

  function renderApiSettingsModal() {
    const fields = document.getElementById("apiSettingsFields");
    const status = document.getElementById("apiSettingsStatus");
    const saveButton = document.getElementById("apiSettingsSaveButton");
    if (!fields || !status || !saveButton) {
      return;
    }

    saveButton.disabled = state.apiSettings.loading || state.apiSettings.saving;
    saveButton.textContent = state.apiSettings.saving ? "Saving..." : "Save keys";

    if (state.apiSettings.loading) {
      status.textContent = "Loading provider key settings...";
      status.classList.remove("is-warning");
      fields.innerHTML = `<div class="empty-state"><strong>Loading API settings</strong><span>Pulling the current provider key status from the app.</span></div>`;
      return;
    }

    if (state.apiSettings.error) {
      status.textContent = state.apiSettings.error;
      status.classList.add("is-warning");
    } else if (state.apiSettings.updatedAt) {
      status.textContent = `Last saved ${formatHistoryTimestamp(state.apiSettings.updatedAt)}.`;
      status.classList.remove("is-warning");
    } else {
      status.textContent = "No app-managed keys saved yet. Environment variables will keep working if they are configured.";
      status.classList.remove("is-warning");
    }

    if (state.apiSettings.providers.length === 0) {
      fields.innerHTML = `<div class="empty-state"><strong>No provider slots available</strong><span>The app did not return any API key definitions.</span></div>`;
      return;
    }

    fields.innerHTML = state.apiSettings.providers.map((provider) => `
      <section class="secret-card">
        <div class="secret-card-head">
          <div>
            <div class="secret-card-title">${escapeHtml(provider.label || "Provider")}</div>
            <div class="secret-card-copy">${escapeHtml(provider.description || "")}</div>
          </div>
          <span class="status-chip ${provider.configured ? "is-ready" : "is-failed"}">${escapeHtml(getApiSettingsStatusLabel(provider))}</span>
        </div>
        <div class="secret-card-meta">
          <span class="secret-card-env">${escapeHtml(provider.envVar || "")}</span>
          <span>${escapeHtml(getApiSettingsProviderHint(provider))}</span>
        </div>
        <label class="field">
          <span>${escapeHtml(provider.label || "Provider")} key</span>
          <div class="secret-input-row">
            <input
              id="${escapeHtml(getApiKeyInputId(provider.id))}"
              type="password"
              value="${escapeHtml(provider.value || "")}"
              placeholder="${escapeHtml(getApiSettingsInputPlaceholder(provider))}"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
            />
            <button
              id="${escapeHtml(getApiKeyToggleButtonId(provider.id))}"
              type="button"
              class="ghost-button compact-button"
              onclick="toggleApiKeyVisibility('${provider.id}')"
            >Show</button>
            <button
              type="button"
              class="ghost-button compact-button"
              onclick="clearApiKeyInput('${provider.id}')"
            >Clear</button>
          </div>
        </label>
      </section>
    `).join("");
  }

  function closeApiSettingsModal() {
    document.getElementById("apiSettingsModal").classList.remove("is-open");
    document.getElementById("apiSettingsModal").setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-modal-open");
    state.apiSettings.lastFocusedElement?.focus?.();
  }

  async function openApiSettingsModal() {
    state.apiSettings.lastFocusedElement = document.activeElement;
    state.apiSettings.loading = true;
    state.apiSettings.saving = false;
    state.apiSettings.error = "";
    document.getElementById("apiSettingsModal").classList.add("is-open");
    document.getElementById("apiSettingsModal").setAttribute("aria-hidden", "false");
    document.body.classList.add("is-modal-open");
    renderApiSettingsModal();

    requestAnimationFrame(() => {
      document.querySelector("#apiSettingsModal .modal")?.focus();
    });

    try {
      const payload = await requestJson("/api/settings/api-keys");
      applyApiSettingsPayload(payload);
    } catch (error) {
      state.apiSettings.error = error.message;
    } finally {
      state.apiSettings.loading = false;
      renderApiSettingsModal();
    }

    requestAnimationFrame(() => {
      document.getElementById(getApiKeyInputId(state.apiSettings.providers[0]?.id || "anthropic"))?.focus();
    });
  }

  function toggleApiKeyVisibility(providerId) {
    const input = document.getElementById(getApiKeyInputId(providerId));
    const button = document.getElementById(getApiKeyToggleButtonId(providerId));
    if (!input || !button) {
      return;
    }

    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    button.textContent = reveal ? "Hide" : "Show";
  }

  function clearApiKeyInput(providerId) {
    const input = document.getElementById(getApiKeyInputId(providerId));
    const toggle = document.getElementById(getApiKeyToggleButtonId(providerId));
    if (!input) {
      return;
    }

    input.value = "";
    input.type = "password";
    if (toggle) {
      toggle.textContent = "Show";
    }
    input.focus();
  }

  async function saveApiSettings() {
    if (state.apiSettings.loading || state.apiSettings.saving) {
      return;
    }

    const saveButton = document.getElementById("apiSettingsSaveButton");
    const providerValues = Object.fromEntries(state.apiSettings.providers.map((provider) => [
      provider.id,
      document.getElementById(getApiKeyInputId(provider.id))?.value.trim() || ""
    ]));

    state.apiSettings.saving = true;
    state.apiSettings.error = "";
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "Saving...";
    }

    try {
      const payload = await requestJson("/api/settings/api-keys", {
        method: "PUT",
        body: JSON.stringify({
          providers: providerValues
        })
      });
      applyApiSettingsPayload(payload);
      await refreshSystemHealth();
      showToast("API key settings saved.");
    } catch (error) {
      state.apiSettings.error = error.message;
      showToast(error.message);
    } finally {
      state.apiSettings.saving = false;
      renderApiSettingsModal();
    }
  }

  return {
    clearApiKeyInput,
    closeApiSettingsModal,
    openApiSettingsModal,
    saveApiSettings,
    toggleApiKeyVisibility
  };
}
