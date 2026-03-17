const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_NARRATED_VOICE_ID,
  listNarratedVoices,
  normalizeNarratedVoiceId,
  resolveNarratedVoiceProviderValue
} = require("../../src/narrated/voices");

test("narrated voice helpers normalize ids and provider labels to the canonical voice id", () => {
  assert.equal(DEFAULT_NARRATED_VOICE_ID, "rachel");
  assert.equal(normalizeNarratedVoiceId("rachel"), "rachel");
  assert.equal(normalizeNarratedVoiceId("Rachel"), "rachel");
  assert.equal(normalizeNarratedVoiceId("ADAM"), "adam");
  assert.equal(normalizeNarratedVoiceId("unknown-voice"), "rachel");
});

test("narrated voice helpers expose provider-safe voice values for the API call", () => {
  assert.equal(resolveNarratedVoiceProviderValue("rachel"), "Rachel");
  assert.equal(resolveNarratedVoiceProviderValue("Rachel"), "Rachel");
  assert.equal(resolveNarratedVoiceProviderValue("sam"), "Sam");
});

test("narrated voice helpers expose stable UI option payloads", () => {
  assert.deepEqual(listNarratedVoices()[0], {
    id: "rachel",
    label: "Rachel"
  });
  assert.equal(listNarratedVoices().length >= 8, true);
});
