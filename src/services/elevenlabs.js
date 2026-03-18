const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { AppError } = require("../utils/errors");
const { DEFAULT_NARRATED_VOICE_ID, resolveNarratedVoiceProviderValue } = require("../narrated/voices");

const ELEVENLABS_API_BASE_URL = "https://api.elevenlabs.io";
const DEFAULT_MODEL_ID = "eleven_turbo_v2_5";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";
const VOICE_CACHE_TTL_MS = 5 * 60 * 1000;

function normalizeVoiceKey(value) {
  return String(value || "").trim().toLowerCase();
}

function buildPublicOutputUrl(baseUrl, relativePath) {
  const root = String(baseUrl || "").replace(/\/$/, "");
  const outputPath = String(relativePath || "").replace(/^\/+/, "");
  return `${root}/output/${outputPath}`;
}

function createElevenLabsService(options = {}) {
  const fetchImpl = options.fetch || global.fetch;
  const logger = options.logger || { info() {}, warn() {}, error() {} };
  const resolveBaseUrl = typeof options.baseUrl === "function"
    ? options.baseUrl
    : () => options.baseUrl || "";
  const outputDir = options.outputDir || "";
  const resolveConfiguredApiKey = typeof options.apiKey === "function"
    ? options.apiKey
    : () => options.apiKey || "";

  let voiceCache = {
    voices: null,
    cachedAt: 0,
    apiKey: ""
  };

  if (typeof fetchImpl !== "function") {
    throw new Error("createElevenLabsService requires a fetch implementation.");
  }

  function resolveApiKey(override) {
    return String(override || resolveConfiguredApiKey() || "").trim();
  }

  function getRequestHeaders(apiKey, headers = {}) {
    return {
      "xi-api-key": apiKey,
      ...headers
    };
  }

  async function parseErrorResponse(response) {
    let message = `ElevenLabs request failed with status ${response.status}.`;
    try {
      const payload = await response.json();
      message = String(
        payload?.detail?.message
        || payload?.detail
        || payload?.message
        || payload?.error
        || message
      ).trim() || message;
    } catch {
      try {
        const text = await response.text();
        if (text.trim()) {
          message = text.trim();
        }
      } catch {
        // Ignore parse failures and keep the generic message.
      }
    }

    return message;
  }

  async function requestJson(url, options = {}) {
    const response = await fetchImpl(url, options);
    if (!response.ok) {
      const message = await parseErrorResponse(response);
      throw new AppError(response.status, message, {
        code: "elevenlabs_request_failed"
      });
    }

    return response.json();
  }

  async function listVoices(options = {}) {
    const apiKey = resolveApiKey(options.apiKey);
    if (!apiKey) {
      throw new AppError(503, "ELEVENLABS_API_KEY is not configured.", {
        code: "missing_elevenlabs_api_key"
      });
    }

    const now = Date.now();
    if (voiceCache.apiKey !== apiKey) {
      voiceCache = {
        voices: null,
        cachedAt: 0,
        apiKey
      };
    }

    if (voiceCache.voices && (now - voiceCache.cachedAt) < VOICE_CACHE_TTL_MS) {
      return voiceCache.voices;
    }

    const payload = await requestJson(`${ELEVENLABS_API_BASE_URL}/v1/voices`, {
      method: "GET",
      headers: getRequestHeaders(apiKey, {
        Accept: "application/json"
      })
    });

    const voices = Array.isArray(payload?.voices)
      ? payload.voices.map((voice) => ({
        voiceId: String(voice.voice_id || voice.voiceId || "").trim(),
        name: String(voice.name || "").trim()
      })).filter((voice) => voice.voiceId && voice.name)
      : [];

    voiceCache = {
      voices,
      cachedAt: now,
      apiKey
    };

    return voices;
  }

  async function resolveProviderVoice(voiceId, options = {}) {
    const requestedVoice = normalizeVoiceKey(
      resolveNarratedVoiceProviderValue(voiceId || DEFAULT_NARRATED_VOICE_ID) || voiceId
    );
    const voices = await listVoices(options);

    const matchedVoice = voices.find((voice) =>
      normalizeVoiceKey(voice.name) === requestedVoice
      || normalizeVoiceKey(voice.voiceId) === requestedVoice
    );

    if (matchedVoice) {
      return matchedVoice;
    }

    throw new AppError(400, `The ElevenLabs voice "${resolveNarratedVoiceProviderValue(voiceId)}" is not available on this account.`, {
      code: "elevenlabs_voice_not_available"
    });
  }

  async function generateVoiceover({ text, voiceId, apiKey, fileNamePrefix = "narrated" } = {}) {
    const script = String(text || "").trim();
    if (!script) {
      throw new AppError(400, "Voice-over text is required.", {
        code: "missing_voiceover_text"
      });
    }

    const effectiveApiKey = resolveApiKey(apiKey);
    if (!effectiveApiKey) {
      throw new AppError(503, "ELEVENLABS_API_KEY is not configured.", {
        code: "missing_elevenlabs_api_key"
      });
    }

    const baseUrl = resolveBaseUrl();
    if (!outputDir || !baseUrl) {
      throw new AppError(500, "ElevenLabs output storage is not configured.", {
        code: "elevenlabs_output_not_configured"
      });
    }

    const providerVoice = await resolveProviderVoice(voiceId, { apiKey: effectiveApiKey });
    const requestUrl = new URL(`/v1/text-to-speech/${providerVoice.voiceId}`, ELEVENLABS_API_BASE_URL);
    requestUrl.searchParams.set("output_format", DEFAULT_OUTPUT_FORMAT);

    const response = await fetchImpl(requestUrl, {
      method: "POST",
      headers: getRequestHeaders(effectiveApiKey, {
        Accept: "audio/mpeg",
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({
        text: script,
        model_id: DEFAULT_MODEL_ID,
        voice_settings: {
          stability: 0.35,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      const message = await parseErrorResponse(response);
      throw new AppError(response.status, message, {
        code: "elevenlabs_tts_failed"
      });
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const relativeDir = "narrated-audio";
    const absoluteDir = path.join(outputDir, relativeDir);
    fs.mkdirSync(absoluteDir, { recursive: true });

    const safePrefix = String(fileNamePrefix || "narrated").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "narrated";
    const fileName = `${safePrefix}-${randomUUID()}.mp3`;
    const outputPath = path.join(absoluteDir, fileName);
    fs.writeFileSync(outputPath, audioBuffer);

    const relativePath = path.posix.join(relativeDir, fileName);
    logger.info("elevenlabs_voice_generated", {
      voiceId: providerVoice.voiceId,
      voiceName: providerVoice.name,
      fileName
    });

    return {
      taskId: `elevenlabs-${randomUUID()}`,
      status: "success",
      audioUrl: buildPublicOutputUrl(baseUrl, relativePath),
      durationSeconds: null,
      providerVoiceId: providerVoice.voiceId,
      providerVoiceName: providerVoice.name
    };
  }

  async function pollVoiceover() {
    throw new AppError(410, "Direct ElevenLabs voice generation completes immediately and does not support polling.", {
      code: "elevenlabs_poll_not_supported"
    });
  }

  return {
    generateVoiceover,
    listVoices,
    pollVoiceover
  };
}

module.exports = {
  createElevenLabsService
};
