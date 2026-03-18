const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRuntime } = require("../../src/runtime");

const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WmMvs0AAAAASUVORK5CYII=";

function writeTinyPng(filePath) {
  fs.writeFileSync(filePath, Buffer.from(TINY_PNG_BASE64, "base64"));
}

function createBasicAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function createDefaultCaptions() {
  return {
    tiktok: {
      caption: "TikTok caption",
      hashtags: ["fitness", "sweat"]
    },
    instagram: {
      caption: "Instagram caption",
      hashtags: ["fitness", "reels"]
    },
    youtube: {
      caption: "YouTube title",
      hashtags: ["shorts", "fitness"]
    }
  };
}

async function waitFor(assertion, options = {}) {
  const timeoutMs = options.timeoutMs || 5000;
  const intervalMs = options.intervalMs || 50;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const result = await assertion();
    if (result) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(options.message || "Timed out waiting for condition.");
}

async function startTestServer(options = {}) {
  const root = options.root || fs.mkdtempSync(path.join(os.tmpdir(), "tiktok-pipeline-test-"));
  const ownsRoot = !options.root;
  const projectPublicDir = path.resolve(__dirname, "..", "..", "public");
  const publicDir = options.useProjectPublicDir ? projectPublicDir : path.join(root, "public");
  const uploadsDir = path.join(root, "uploads");
  const outputDir = path.join(root, "output");
  if (!options.useProjectPublicDir) {
    fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(path.join(publicDir, "index.html"), "<!doctype html><html><body>test</body></html>");
  }
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const config = {
    nodeEnv: "test",
    port: 0,
    baseUrl: "http://127.0.0.1",
    databasePath: path.join(root, "data.sqlite"),
    publicDir,
    uploadsDir,
    outputDir,
    anthropicApiKey: options.anthropicApiKey === undefined ? "test-anthropic" : options.anthropicApiKey,
    kieApiKey: options.kieApiKey === undefined ? "test-kie" : options.kieApiKey,
    elevenLabsApiKey: options.elevenLabsApiKey === undefined ? "test-elevenlabs" : options.elevenLabsApiKey,
    ayrshareApiKey: options.ayrshareApiKey === undefined ? "test-ayrshare" : options.ayrshareApiKey,
    falApiKey: options.falApiKey === undefined ? "test-fal" : options.falApiKey,
    jobPollIntervalMs: options.pollIntervalMs || 40,
    generationTimeoutMs: options.generationTimeoutMs || 15 * 60 * 1000,
    maxUploadBytes: 10 * 1024 * 1024,
    basicAuthUser: options.basicAuthUser || "",
    basicAuthPassword: options.basicAuthPassword || ""
  };

  let pollCalls = 0;
  const generateCalls = [];
  const distributionCalls = [];
  const mergeCalls = [];
  let voiceGenerateCount = 0;

  const anthropicService = options.anthropicService || {
    async analyzeImage() {
      return "Athletic 25-35 presenter in a charcoal gym top.";
    },
    async suggestIdeas(_analysis, pipeline, brand, _fields, count = 3, options = {}) {
      return Array.from({ length: count }, (_, index) => {
        const sequenceFields = options.sequence ? {
          sequenceTheme: `${brand.name} stitched sequence`,
          sequenceRole: `beat-${index + 1}`,
          sequenceIndex: index + 1 + (options.existingItems?.length || 0),
          sequenceCount: options.totalCount || count,
          sequenceLeadIn: index === 0 ? "Open the sequence." : "Continue from the previous beat.",
          sequenceHandOff: index + 1 === count ? "Finish the sequence." : "Keep the story moving so the next beat cuts in cleanly."
        } : {};

        if (pipeline === "edu") {
          return {
            label: `${brand.name} topic ${index + 1}`,
            fields: {
              topic: `${brand.name} topic ${index + 1}`,
              ...sequenceFields
            }
          };
        }

        if (pipeline === "comedy") {
          return {
            label: `${brand.name} scenario ${index + 1}`,
            fields: {
              scenario: `${brand.name} scenario ${index + 1}`,
              ...sequenceFields
            }
          };
        }

        return {
          label: `${brand.name} product ${index + 1} — Benefit ${index + 1}`,
          fields: {
            productName: `${brand.name} product ${index + 1}`,
            benefit: `Benefit ${index + 1}`,
            ...sequenceFields
          }
        };
      });
    },
    async autofillMissingIdeaFields(analysis, pipeline, brand, fields = {}) {
      if ((pipeline === "edu" && fields.topic) || (pipeline === "comedy" && fields.scenario) || (pipeline === "product" && fields.productName && fields.benefit)) {
        return fields;
      }

      const [suggestion] = await this.suggestIdeas(analysis, pipeline, brand, fields, 1);
      return {
        ...fields,
        ...(suggestion?.fields || {})
      };
    },
    async generateScript(analysis, pipeline, brand, fields) {
      return `HOOK: ${pipeline} for ${brand.name}\nBODY: ${analysis}\nCTA: ${fields.topic || fields.scenario || fields.productName || "Save this."}`;
    },
    async generateVideoPrompt() {
      return "Vertical 9:16 gym video with direct-to-camera delivery.";
    },
    async generateNarratedPlan(_analysis, pipeline, brand, fields = {}) {
      const title = fields.topic || fields.scenario || fields.productName || `${brand.name} narrated video`;
      const segmentCount = Math.max(2, Number.parseInt(fields.segmentCount, 10) || 3);
      const segmentLabels = ["hook", "body", "proof", "payoff", "cta", "close"];
      return {
        title,
        totalDurationSeconds: Number.parseInt(fields.targetLengthSeconds, 10) || 15,
        segments: Array.from({ length: segmentCount }, (_, index) => ({
          text: `${pipeline} beat ${index + 1} for ${brand.name}`,
          visualIntent: index === 0
            ? "Open with the strongest visual beat."
            : index === segmentCount - 1
              ? "Land on the result or payoff visual."
              : "Show the core illustrative action.",
          estimatedSeconds: Math.max(2, Math.round((Number.parseInt(fields.targetLengthSeconds, 10) || 15) / segmentCount)),
          shotType: segmentLabels[index] || `part_${index + 1}`,
          sourceStrategy: "hybrid"
        }))
      };
    },
    async generateSlidesPlan(_analysis, pipeline, brand, fields = {}) {
      const slideCount = Number.parseInt(fields.slideCount, 10) || 5;
      const title = fields.slideDeckTitle || fields.topic || fields.scenario || fields.productName || `${brand.name} slides`;
      return {
        title,
        slides: Array.from({ length: slideCount }, (_, index) => ({
          headline: `${pipeline} slide ${index + 1}`,
          body: `${brand.name} ${pipeline} support copy ${index + 1}.`,
          imageUrl: index === 0 ? fields.productImageUrl || "" : "",
          durationSeconds: 3.5
        }))
      };
    },
    async generateNarratedBrollPlan(_analysis, _pipeline, _brand, _fields = {}, segments = []) {
      return segments.map((segment) => ({
        segmentIndex: segment.segmentIndex,
        prompt: `Vertical 9:16 B-roll for part ${segment.segmentIndex}. ${segment.visualIntent}`,
        sourceStrategy: segment.sourceStrategy || "hybrid"
      }));
    },
    async generateCaptionAndHashtags() {
      return createDefaultCaptions();
    }
  };

  const kieService = options.kieService || {
    async generateVideo(args) {
      generateCalls.push(args);
      return {
        taskId: `task-${generateCalls.length}`,
        status: "queueing",
        videoUrl: null
      };
    },
    async pollStatus(taskId) {
      pollCalls += 1;
      if (pollCalls >= (options.pollSuccessAfter || 1)) {
        return {
          status: "success",
          videoUrl: `https://example.com/${taskId}.mp4`,
          error: null
        };
      }

      return {
        status: "generating",
        videoUrl: null,
        error: null
      };
    },
    async generateSpeech(args) {
      return {
        taskId: `speech-${args.voiceId || "voice"}-${Date.now()}`
      };
    },
    async pollSpeechStatus(taskId) {
      return {
        status: "success",
        audioUrl: `https://example.com/${taskId}.mp3`,
        durationSeconds: 4.2,
        error: null
      };
    }
  };

  const elevenLabsService = options.elevenLabsService || {
    async generateVoiceover(args) {
      voiceGenerateCount += 1;
      return {
        taskId: `elevenlabs-${voiceGenerateCount}`,
        status: "success",
        audioUrl: `https://example.com/audio-${voiceGenerateCount}.mp3`,
        durationSeconds: 4.2
      };
    },
    async listVoices() {
      return [
        { voiceId: "voice-rachel", name: "Rachel" }
      ];
    }
  };

  const distributionService = options.distributionService || {
    getRequestHash(videoUrl, platformConfigs) {
      return `hash:${videoUrl}:${JSON.stringify(platformConfigs)}`;
    },
    async distributeVideo(videoUrl, platformConfigs) {
      distributionCalls.push({ videoUrl, platformConfigs });
      return {
        requestHash: this.getRequestHash(videoUrl, platformConfigs),
        results: Object.entries(platformConfigs)
          .filter(([, value]) => value.enabled)
          .map(([platform, value]) => ({
            platform,
            mode: value.mode,
            status: "success",
            externalId: `${platform}-external`,
            error: null
          }))
      };
    }
  };

  const falService = options.falService || (config.falApiKey
    ? {
      async mergeVideos(args) {
        mergeCalls.push(args);
        return {
          videoUrl: `https://example.com/merged-${mergeCalls.length}.mp4`
        };
      }
    }
    : {
      async mergeVideos() {
        throw new Error("FAL_KEY is not configured.");
      }
    });

  const amazonCatalogService = options.amazonCatalogService || {
    splitImportInputs(input) {
      return String(input || "")
        .split(/\r?\n|,/)
        .map((value) => value.trim())
        .filter(Boolean);
    },
    async importProduct({ input }) {
      const asin = String(input || "").match(/[A-Z0-9]{10}/i)?.[0]?.toUpperCase() || "B0TESTASIN";
      return {
        asin,
        marketplace: "com",
        title: `Imported product ${asin}`,
        productUrl: `https://www.amazon.com/dp/${asin}`,
        imageUrl: `https://example.com/${asin}.jpg`,
        galleryImages: [`https://example.com/${asin}.jpg`, `https://example.com/${asin}-2.jpg`],
        benefits: ["Primary imported benefit", "Secondary imported benefit"],
        description: "Imported Amazon listing description.",
        sourceData: {
          source: "amazon_listing"
        }
      };
    }
  };

  const narratedComposeService = typeof options.narratedComposeService === "function"
    ? options.narratedComposeService({ root, config, fs, path })
    : options.narratedComposeService || {
    isAvailable() {
      return true;
    },
    async compose(job) {
      return {
        videoUrl: `https://example.com/narrated-${job.id}.mp4`,
        thumbnailUrl: `https://example.com/narrated-${job.id}.png`
      };
    }
  };
  const slideComposeService = typeof options.slideComposeService === "function"
    ? options.slideComposeService({ root, config, fs, path })
    : options.slideComposeService || {
    isAvailable() {
      return true;
    },
    async compose(job) {
      return {
        videoUrl: `https://example.com/slides-${job.id}.mp4`,
        thumbnailUrl: `https://example.com/slides-${job.id}.png`
      };
    }
  };

  const runtime = createRuntime({
    config,
    anthropicService,
    kieService,
    elevenLabsService,
    falService,
    distributionService,
    amazonCatalogService,
    narratedComposeService,
    slideComposeService
  });

  const server = await new Promise((resolve, reject) => {
    const instance = runtime.app.listen(0, "127.0.0.1", () => resolve(instance));
    instance.on("error", reject);
  });

  const port = server.address().port;
  config.baseUrl = `http://127.0.0.1:${port}`;

  return {
    root,
    config,
    runtime,
    server,
    baseUrl: config.baseUrl,
    auth: config.basicAuthUser && config.basicAuthPassword
      ? {
        username: config.basicAuthUser,
        password: config.basicAuthPassword
      }
      : null,
    authHeader: config.basicAuthUser && config.basicAuthPassword
      ? createBasicAuthHeader(config.basicAuthUser, config.basicAuthPassword)
      : "",
    calls: {
      generateCalls,
      distributionCalls,
      mergeCalls,
      get pollCalls() {
        return pollCalls;
      }
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
      runtime.close();
      if (ownsRoot) {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  };
}

module.exports = {
  createBasicAuthHeader,
  createDefaultCaptions,
  startTestServer,
  waitFor,
  writeTinyPng
};
