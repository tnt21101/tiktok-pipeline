const test = require("node:test");
const assert = require("node:assert/strict");
const { createApiKeyStore } = require("../../src/settings/apiKeys");

function createSettingsRepository(initialValue = null) {
  let entry = initialValue
    ? {
      key: "api_keys",
      value: initialValue,
      updatedAt: "2026-03-17T10:00:00.000Z"
    }
    : null;

  return {
    get(key) {
      return key === "api_keys" ? entry : null;
    },
    set(key, value) {
      entry = {
        key,
        value,
        updatedAt: "2026-03-17T11:00:00.000Z"
      };
      return entry;
    }
  };
}

test("api key store prefers saved values and falls back to environment config", () => {
  const store = createApiKeyStore({
    config: {
      anthropicApiKey: "env-anthropic",
      kieApiKey: "",
      elevenLabsApiKey: "",
      ayrshareApiKey: "",
      falApiKey: ""
    },
    settingsRepository: createSettingsRepository({
      anthropicApiKey: "saved-anthropic",
      kieApiKey: "saved-kie"
    })
  });

  assert.equal(store.getEffectiveValue("anthropic"), "saved-anthropic");
  assert.equal(store.getEffectiveValue("kie"), "saved-kie");
  assert.equal(store.getEffectiveValue("elevenlabs"), "");

  const payload = store.buildPayload();
  assert.equal(payload.providers.find((provider) => provider.id === "anthropic").source, "saved");
  assert.equal(payload.providers.find((provider) => provider.id === "kie").source, "saved");
  assert.equal(payload.providers.find((provider) => provider.id === "elevenlabs").source, "missing");
});

test("api key store clears saved values back to environment fallback", () => {
  const store = createApiKeyStore({
    config: {
      anthropicApiKey: "env-anthropic",
      kieApiKey: "",
      elevenLabsApiKey: "",
      ayrshareApiKey: "",
      falApiKey: ""
    },
    settingsRepository: createSettingsRepository({
      anthropicApiKey: "saved-anthropic"
    })
  });

  const payload = store.setProviderValues({
    anthropic: ""
  });

  const anthropic = payload.providers.find((provider) => provider.id === "anthropic");
  assert.equal(anthropic.source, "environment");
  assert.equal(anthropic.value, "");
  assert.equal(store.getEffectiveValue("anthropic"), "env-anthropic");
});

test("api key store reloads saved values written by another store instance", () => {
  const settingsRepository = createSettingsRepository();
  const config = {
    anthropicApiKey: "",
    kieApiKey: "",
    elevenLabsApiKey: "",
    ayrshareApiKey: "",
    falApiKey: ""
  };

  const firstStore = createApiKeyStore({
    config,
    settingsRepository
  });
  const secondStore = createApiKeyStore({
    config,
    settingsRepository
  });

  assert.equal(firstStore.getEffectiveValue("elevenlabs"), "");

  secondStore.setProviderValues({
    elevenlabs: "saved-elevenlabs"
  });

  assert.equal(firstStore.getEffectiveValue("elevenlabs"), "saved-elevenlabs");
  assert.equal(
    firstStore.buildPayload().providers.find((provider) => provider.id === "elevenlabs").source,
    "saved"
  );
});
