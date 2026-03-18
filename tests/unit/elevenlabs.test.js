const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createElevenLabsService } = require("../../src/services/elevenlabs");

test("direct ElevenLabs voice generation resolves a named voice and stores audio under /output", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "elevenlabs-test-"));
  const outputDir = path.join(root, "output");
  fs.mkdirSync(outputDir, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const requests = [];
  const service = createElevenLabsService({
    apiKey: "test-elevenlabs",
    outputDir,
    baseUrl: "http://127.0.0.1:3000",
    fetch: async (url, options = {}) => {
      requests.push({
        url: String(url),
        options
      });

      if (String(url).includes("/v1/voices")) {
        return new Response(JSON.stringify({
          voices: [
            { voice_id: "voice-rachel", name: "Rachel" }
          ]
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }

      return new Response(Buffer.from("fake-mp3"), {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg"
        }
      });
    }
  });

  const result = await service.generateVoiceover({
    text: "A direct ElevenLabs voice sample.",
    voiceId: "rachel",
    fileNamePrefix: "job-1-segment-1"
  });

  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /\/v1\/voices$/);
  assert.match(requests[1].url, /\/v1\/text-to-speech\/voice-rachel\?/);
  assert.match(result.audioUrl || "", /^http:\/\/127\.0\.0\.1:3000\/output\/narrated-audio\/job-1-segment-1-/);

  const storedRelativePath = result.audioUrl.replace("http://127.0.0.1:3000/output/", "");
  const storedPath = path.join(outputDir, storedRelativePath);
  assert.equal(fs.existsSync(storedPath), true);
  assert.equal(fs.readFileSync(storedPath, "utf8"), "fake-mp3");
});

test("voice list cache resets when the configured api key changes", async () => {
  let currentApiKey = "first-elevenlabs-key";
  const requests = [];
  const service = createElevenLabsService({
    apiKey: () => currentApiKey,
    outputDir: os.tmpdir(),
    baseUrl: "http://127.0.0.1:3000",
    fetch: async (_url, options = {}) => {
      requests.push(options.headers["xi-api-key"]);
      return new Response(JSON.stringify({
        voices: [
          { voice_id: `${requests.length}`, name: `Voice ${requests.length}` }
        ]
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
  });

  await service.listVoices();
  await service.listVoices();

  currentApiKey = "second-elevenlabs-key";
  await service.listVoices();

  assert.deepEqual(requests, [
    "first-elevenlabs-key",
    "second-elevenlabs-key"
  ]);
});
