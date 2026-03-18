const API_KEYS_SETTINGS_KEY = "api_keys";

const API_KEY_PROVIDER_DEFINITIONS = [
  {
    id: "anthropic",
    configKey: "anthropicApiKey",
    storageKey: "anthropicApiKey",
    label: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    description: "Used for analysis, scripts, prompts, and planning."
  },
  {
    id: "kie",
    configKey: "kieApiKey",
    storageKey: "kieApiKey",
    label: "Kie.ai",
    envVar: "KIEAI_API_KEY",
    description: "Used for video generation and provider-side polling."
  },
  {
    id: "elevenlabs",
    configKey: "elevenLabsApiKey",
    storageKey: "elevenLabsApiKey",
    label: "ElevenLabs",
    envVar: "ELEVENLABS_API_KEY",
    description: "Used for narrated voice-over generation."
  },
  {
    id: "fal",
    configKey: "falApiKey",
    storageKey: "falApiKey",
    label: "FAL",
    envVar: "FAL_KEY",
    description: "Used for stitched multi-clip compilation and merges."
  },
  {
    id: "ayrshare",
    configKey: "ayrshareApiKey",
    storageKey: "ayrshareApiKey",
    label: "Ayrshare",
    envVar: "AYRSHARE_API_KEY",
    description: "Used for direct social publishing."
  }
];

function normalizeSecret(value) {
  return String(value || "").trim();
}

function maskSecret(value) {
  const normalized = normalizeSecret(value);
  if (!normalized) {
    return "Not configured";
  }

  if (normalized.length <= 8) {
    return `${normalized.slice(0, 2)}••••${normalized.slice(-2)}`;
  }

  return `${normalized.slice(0, 4)}••••${normalized.slice(-4)}`;
}

function findApiKeyProviderDefinition(providerId) {
  return API_KEY_PROVIDER_DEFINITIONS.find((definition) => definition.id === providerId) || null;
}

function normalizeSavedApiKeys(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(API_KEY_PROVIDER_DEFINITIONS.map((definition) => [
    definition.storageKey,
    normalizeSecret(source[definition.storageKey] || source[definition.id])
  ]));
}

function createApiKeyStore({ config, settingsRepository }) {
  let savedValues = {};
  let updatedAt = null;

  function refreshFromRepository() {
    const record = settingsRepository.get(API_KEYS_SETTINGS_KEY);
    savedValues = normalizeSavedApiKeys(record?.value);
    updatedAt = record?.updatedAt || null;
  }

  refreshFromRepository();

  function getEnvironmentValue(definition) {
    return normalizeSecret(config?.[definition.configKey]);
  }

  function getSavedValue(providerId, options = {}) {
    if (options.refresh !== false) {
      refreshFromRepository();
    }
    const definition = findApiKeyProviderDefinition(providerId);
    if (!definition) {
      return "";
    }

    return savedValues[definition.storageKey] || "";
  }

  function getEffectiveValue(providerId, options = {}) {
    if (options.refresh !== false) {
      refreshFromRepository();
    }
    const definition = findApiKeyProviderDefinition(providerId);
    if (!definition) {
      return "";
    }

    return getSavedValue(providerId, { refresh: false }) || getEnvironmentValue(definition);
  }

  function getProviderState(providerId, options = {}) {
    if (options.refresh !== false) {
      refreshFromRepository();
    }
    const definition = findApiKeyProviderDefinition(providerId);
    if (!definition) {
      return null;
    }

    const savedValue = getSavedValue(providerId, { refresh: false });
    const environmentValue = getEnvironmentValue(definition);
    const effectiveValue = savedValue || environmentValue;
    const source = savedValue
      ? "saved"
      : environmentValue
        ? "environment"
        : "missing";

    return {
      id: definition.id,
      label: definition.label,
      envVar: definition.envVar,
      description: definition.description,
      configured: Boolean(effectiveValue),
      source,
      value: savedValue,
      maskedValue: maskSecret(effectiveValue),
      hasSavedValue: Boolean(savedValue)
    };
  }

  function buildPayload() {
    refreshFromRepository();
    return {
      updatedAt,
      providers: API_KEY_PROVIDER_DEFINITIONS.map((definition) => getProviderState(definition.id, { refresh: false }))
    };
  }

  function persist(nextSavedValues) {
    const entry = settingsRepository.set(API_KEYS_SETTINGS_KEY, nextSavedValues);
    savedValues = normalizeSavedApiKeys(entry?.value);
    updatedAt = entry?.updatedAt || null;
    return buildPayload();
  }

  function setProviderValues(providerValues = {}) {
    refreshFromRepository();
    const nextSavedValues = {
      ...savedValues
    };

    for (const [providerId, value] of Object.entries(providerValues)) {
      const definition = findApiKeyProviderDefinition(providerId);
      if (!definition) {
        continue;
      }

      nextSavedValues[definition.storageKey] = normalizeSecret(value);
    }

    return persist(nextSavedValues);
  }

  return {
    buildPayload,
    getProviderState,
    getSavedValue,
    getEffectiveValue,
    setProviderValues
  };
}

module.exports = {
  API_KEYS_SETTINGS_KEY,
  API_KEY_PROVIDER_DEFINITIONS,
  createApiKeyStore,
  findApiKeyProviderDefinition,
  maskSecret,
  normalizeSavedApiKeys
};
