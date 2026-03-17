const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRuntime } = require("../../src/runtime");

const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WmMvs0AAAAASUVORK5CYII=";

function writeTinyPng(filePath) {
  fs.writeFileSync(filePath, Buffer.from(TINY_PNG_BASE64, "base64"));
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tiktok-pipeline-test-"));
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
    anthropicApiKey: "test-anthropic",
    kieApiKey: "test-kie",
    ayrshareApiKey: "test-ayrshare",
    falApiKey: options.falApiKey === undefined ? "test-fal" : options.falApiKey,
    jobPollIntervalMs: options.pollIntervalMs || 40,
    generationTimeoutMs: options.generationTimeoutMs || 30 * 60 * 1000,
    maxUploadBytes: 10 * 1024 * 1024,
    internalApiToken: ""
  };

  let pollCalls = 0;
  const generateCalls = [];
  const distributionCalls = [];
  const mergeCalls = [];

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
          sequenceHandOff: index + 1 === count ? "Finish the sequence." : "Set up the next beat."
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

  const runtime = createRuntime({
    config,
    anthropicService,
    kieService,
    falService,
    distributionService,
    amazonCatalogService
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
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

module.exports = {
  createDefaultCaptions,
  startTestServer,
  waitFor,
  writeTinyPng
};
