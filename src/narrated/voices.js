const NARRATED_VOICES = [
  { id: "rachel", label: "Rachel", providerValue: "Rachel" },
  { id: "adam", label: "Adam", providerValue: "Adam" },
  { id: "antoni", label: "Antoni", providerValue: "Antoni" },
  { id: "bella", label: "Bella", providerValue: "Bella" },
  { id: "domi", label: "Domi", providerValue: "Domi" },
  { id: "elli", label: "Elli", providerValue: "Elli" },
  { id: "josh", label: "Josh", providerValue: "Josh" },
  { id: "sam", label: "Sam", providerValue: "Sam" }
];

const DEFAULT_NARRATED_VOICE_ID = NARRATED_VOICES[0].id;

function normalizeVoiceKey(value) {
  return String(value || "").trim().toLowerCase();
}

const VOICES_BY_ID = new Map(NARRATED_VOICES.map((voice) => [voice.id, voice]));
const VOICES_BY_KEY = new Map();

for (const voice of NARRATED_VOICES) {
  [voice.id, voice.label, voice.providerValue].forEach((value) => {
    const key = normalizeVoiceKey(value);
    if (key) {
      VOICES_BY_KEY.set(key, voice);
    }
  });
}

function getNarratedVoice(value = DEFAULT_NARRATED_VOICE_ID) {
  return VOICES_BY_KEY.get(normalizeVoiceKey(value)) || VOICES_BY_ID.get(DEFAULT_NARRATED_VOICE_ID);
}

function listNarratedVoices() {
  return NARRATED_VOICES.map(({ id, label }) => ({ id, label }));
}

function normalizeNarratedVoiceId(value = DEFAULT_NARRATED_VOICE_ID) {
  return getNarratedVoice(value).id;
}

function resolveNarratedVoiceProviderValue(value = DEFAULT_NARRATED_VOICE_ID) {
  return getNarratedVoice(value).providerValue;
}

module.exports = {
  DEFAULT_NARRATED_VOICE_ID,
  NARRATED_VOICES,
  listNarratedVoices,
  normalizeNarratedVoiceId,
  resolveNarratedVoiceProviderValue
};
