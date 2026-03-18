const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  createBasicAuthHeader,
  startTestServer,
  waitFor,
  writeTinyPng
} = require("../support/runtime-fixtures");

function withAuthHeaders(server, headers = {}) {
  return server?.authHeader
    ? {
      ...headers,
      Authorization: server.authHeader
    }
    : headers;
}

async function uploadFixture(baseUrl, root, options = {}) {
  const imagePath = path.join(root, "tiny.png");
  writeTinyPng(imagePath);
  const form = new FormData();
  form.append("image", new Blob([fs.readFileSync(imagePath)], { type: "image/png" }), options.filename || "tiny.png");

  const response = await fetch(`${baseUrl}/api/upload`, {
    method: "POST",
    headers: options.headers || {},
    body: form
  });

  const payload = await response.json();
  return payload.imageUrl;
}

async function createComposedNarratedJob(server, options = {}) {
  const imageUrl = options.imageUrl || await uploadFixture(server.baseUrl, server.root, {
    headers: withAuthHeaders(server, options.uploadHeaders || {})
  });

  const created = await fetch(`${server.baseUrl}/api/jobs`, {
    method: "POST",
    headers: withAuthHeaders(server, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      brandId: options.brandId || "tnt",
      pipeline: options.pipeline || "edu",
      mode: "narrated",
      imageUrl,
      generationConfig: options.generationConfig || {
        profileId: "veo31_image"
      },
      fields: {
        topic: "Persist this narrated output",
        voiceId: "rachel",
        platformPreset: "tiktok",
        targetLengthSeconds: 15,
        ...(options.fields || {})
      }
    })
  }).then((response) => response.json());

  await fetch(`${server.baseUrl}/api/jobs/${created.job.id}/voice`, {
    method: "POST",
    headers: withAuthHeaders(server)
  }).then((response) => response.json());

  await waitFor(async () => {
    const payload = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}`, {
      headers: withAuthHeaders(server)
    }).then((response) => response.json());
    return payload.job.status === "voice_ready" ? payload.job : null;
  }, {
    timeoutMs: 4000,
    message: "Narrated voice generation never reached voice_ready."
  });

  await fetch(`${server.baseUrl}/api/jobs/${created.job.id}/broll`, {
    method: "POST",
    headers: withAuthHeaders(server)
  }).then((response) => response.json());

  await waitFor(async () => {
    const payload = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}`, {
      headers: withAuthHeaders(server)
    }).then((response) => response.json());
    return payload.job.status === "ready_to_compose" ? payload.job : null;
  }, {
    timeoutMs: 4000,
    message: "Narrated B-roll never reached ready_to_compose."
  });

  const composed = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}/compose`, {
    method: "POST",
    headers: withAuthHeaders(server)
  }).then((response) => response.json());

  return {
    imageUrl,
    job: composed.job
  };
}

async function createRenderedSlideJob(server, options = {}) {
  const imageUrl = options.includeImage === false
    ? ""
    : options.imageUrl || await uploadFixture(server.baseUrl, server.root, {
      headers: withAuthHeaders(server, options.uploadHeaders || {})
    });

  const created = await fetch(`${server.baseUrl}/api/jobs`, {
    method: "POST",
    headers: withAuthHeaders(server, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      brandId: options.brandId || "tnt",
      pipeline: options.pipeline || "edu",
      mode: "slides",
      imageUrl,
      generationConfig: options.generationConfig || {
        profileId: "veo31_image"
      },
      fields: {
        topic: "Slide draft topic",
        slideCount: 4,
        ...(options.fields || {})
      }
    })
  }).then((response) => response.json());

  const rendered = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}/slides/render`, {
    method: "POST",
    headers: withAuthHeaders(server)
  }).then((response) => response.json());

  return {
    imageUrl,
    created: created.job,
    job: rendered.job
  };
}

test("basic auth protects operator routes but leaves health and callbacks public", async (t) => {
  const server = await startTestServer({
    basicAuthUser: "operator",
    basicAuthPassword: "secret"
  });
  t.after(() => server.close());

  const publicHealth = await fetch(`${server.baseUrl}/api/health`);
  assert.equal(publicHealth.status, 200);

  const publicCallback = await fetch(`${server.baseUrl}/api/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskId: "public-task",
      videoUrl: "https://example.com/public.mp4"
    })
  });
  assert.equal(publicCallback.status, 200);

  const dashboard = await fetch(server.baseUrl);
  assert.equal(dashboard.status, 401);

  const readableApi = await fetch(`${server.baseUrl}/api/brands`);
  assert.equal(readableApi.status, 401);

  const uploadWithoutAuth = await fetch(`${server.baseUrl}/api/upload`, {
    method: "POST",
    body: new FormData()
  });
  assert.equal(uploadWithoutAuth.status, 401);

  const authenticatedDashboard = await fetch(server.baseUrl, {
    headers: {
      Authorization: createBasicAuthHeader("operator", "secret")
    }
  });
  assert.equal(authenticatedDashboard.status, 200);

  const authenticatedBrands = await fetch(`${server.baseUrl}/api/brands`, {
    headers: withAuthHeaders(server)
  });
  assert.equal(authenticatedBrands.status, 200);
});

test("api key settings persist saved overrides and fall back to environment values", async (t) => {
  const server = await startTestServer({
    anthropicApiKey: "env-anthropic",
    kieApiKey: "",
    elevenLabsApiKey: "",
    ayrshareApiKey: "",
    falApiKey: ""
  });
  t.after(() => server.close());

  const initialSettings = await fetch(`${server.baseUrl}/api/settings/api-keys`)
    .then((response) => response.json());
  const anthropic = initialSettings.providers.find((provider) => provider.id === "anthropic");
  const kie = initialSettings.providers.find((provider) => provider.id === "kie");

  assert.equal(anthropic.source, "environment");
  assert.equal(anthropic.configured, true);
  assert.equal(anthropic.value, "");
  assert.equal(anthropic.hasSavedValue, false);
  assert.equal(kie.source, "missing");
  assert.equal(kie.configured, false);

  const savedSettings = await fetch(`${server.baseUrl}/api/settings/api-keys`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      providers: {
        anthropic: "app-anthropic",
        kie: "app-kie",
        elevenlabs: "app-elevenlabs",
        ayrshare: "app-ayrshare",
        fal: "app-fal"
      }
    })
  }).then((response) => response.json());

  assert.equal(savedSettings.providers.find((provider) => provider.id === "anthropic").source, "saved");
  assert.equal(savedSettings.providers.find((provider) => provider.id === "anthropic").value, "app-anthropic");
  assert.equal(savedSettings.providers.find((provider) => provider.id === "kie").configured, true);

  const overriddenHealth = await fetch(`${server.baseUrl}/api/health`)
    .then((response) => response.json());
  assert.equal(overriddenHealth.providers.anthropic.source, "saved");
  assert.equal(overriddenHealth.providers.kie.configured, true);
  assert.equal(overriddenHealth.providers.fal.configured, true);

  const revertedSettings = await fetch(`${server.baseUrl}/api/settings/api-keys`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      providers: {
        anthropic: "",
        kie: "",
        elevenlabs: "",
        ayrshare: "",
        fal: ""
      }
    })
  }).then((response) => response.json());

  assert.equal(revertedSettings.providers.find((provider) => provider.id === "anthropic").source, "environment");
  assert.equal(revertedSettings.providers.find((provider) => provider.id === "kie").source, "missing");

  const revertedHealth = await fetch(`${server.baseUrl}/api/health`)
    .then((response) => response.json());
  assert.equal(revertedHealth.providers.anthropic.source, "environment");
  assert.equal(revertedHealth.providers.kie.configured, false);
  assert.equal(revertedHealth.providers.fal.configured, false);
});

test("legacy API routes normalize responses and accept Kie overrides", async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const imageUrl = await uploadFixture(server.baseUrl, server.root);
  assert.match(imageUrl, /\/uploads\//);

  const analyze = await fetch(`${server.baseUrl}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl, pipeline: "edu" })
  }).then((response) => response.json());
  assert.match(analyze.analysis, /presenter/);

  const script = await fetch(`${server.baseUrl}/api/script`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      analysis: analyze.analysis,
      pipeline: "edu",
      brandId: "tnt",
      fields: { topic: "Sweat science" }
    })
  }).then((response) => response.json());
  assert.match(script.script, /HOOK:/);

  const prompt = await fetch(`${server.baseUrl}/api/videoprompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      analysis: analyze.analysis,
      script: script.script,
      pipeline: "edu",
      brandId: "tnt"
    })
  }).then((response) => response.json());
  assert.match(prompt.videoPrompt, /Vertical 9:16/);

  const captions = await fetch(`${server.baseUrl}/api/captions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      script: script.script,
      pipeline: "edu",
      brandId: "tnt"
    })
  }).then((response) => response.json());
  assert.equal(captions.captions.tiktok.caption, "TikTok caption");

  const generate = await fetch(`${server.baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      videoPrompt: prompt.videoPrompt,
      imageUrl,
      kieApiKey: "override-kie-key"
    })
  }).then((response) => response.json());

  assert.equal(generate.taskId, "task-1");
  assert.equal(generate.status, "queueing");
  assert.equal(server.calls.generateCalls[0].kieApiKey, "override-kie-key");

  const poll = await fetch(`${server.baseUrl}/api/poll/${generate.taskId}`).then((response) => response.json());
  assert.equal(poll.status, "success");
  assert.match(poll.videoUrl, /task-1\.mp4/);
});

test("strategy normalize merges Amazon drafts with manual overrides and returns field sources", async (t) => {
  const server = await startTestServer({
    amazonCatalogService: {
      splitImportInputs(input) {
        return [String(input || "").trim()].filter(Boolean);
      },
      async fetchListingData() {
        return {
          asin: "B0STRAT123",
          marketplace: "com",
          title: "Example Fitness Tool",
          productUrl: "https://www.amazon.com/dp/B0STRAT123",
          imageUrl: "https://example.com/fitness-tool.jpg",
          galleryImages: ["https://example.com/fitness-tool.jpg"],
          bullets: ["Quick setup", "Portable design"],
          benefits: ["Quick setup", "Portable design"],
          description: "A compact tool for faster workout prep.",
          category: "Fitness and wellness",
          brandName: "Velocity Labs",
          reviewThemes: ["Easy to use", "Works well for busy mornings"],
          imageryHints: ["Active lifestyle routine", "Close-up action demo"],
          sourceData: {
            source: "amazon_listing"
          }
        };
      },
      async importProduct() {
        throw new Error("not used");
      }
    }
  });
  t.after(() => server.close());

  const payload = await fetch(`${server.baseUrl}/api/strategy/normalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      asin: "B0STRAT123",
      brandSummary: "Manual summary override for the review step."
    })
  }).then((response) => response.json());

  assert.equal(payload.review.fieldSources.brandSummary, "manual");
  assert.equal(payload.review.fieldSources.productDescription, "amazon");
  assert.equal(payload.review.mergedDraft.brandSummary, "Manual summary override for the review step.");
  assert.equal(payload.review.listing.asin, "B0STRAT123");
  assert.equal(payload.normalizedInputs.source.from_amazon, true);
  assert.equal(payload.normalizedInputs.source.from_manual, true);
});

test("strategy generate returns the full JSON bundle without leaking brand or product names", async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const payload = await fetch(`${server.baseUrl}/api/strategy/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandSummary: "AcmeFlux is a premium lifestyle brand for streamlined routines.",
      productDescription: "The AcmeFlux Orbit Pad helps busy professionals simplify their desk setup with a faster, cleaner workflow.",
      targetAudience: "Busy professionals and commuters",
      constraints: "No medical claims. No guaranteed results."
    })
  }).then((response) => response.json());

  assert.ok(payload.normalized_inputs);
  assert.ok(Array.isArray(payload.angle_bank));
  assert.ok(Array.isArray(payload.topic_grid));
  assert.ok(Array.isArray(payload.hook_bank));
  assert.ok(Array.isArray(payload.approved_concepts));
  assert.ok(Array.isArray(payload.concept_payloads));
  assert.equal(payload.normalized_inputs.source.from_amazon, false);
  assert.equal(payload.normalized_inputs.source.from_manual, true);
  assert.match(JSON.stringify(payload), /<TO_BE_FILLED_LATER>/);
  assert.doesNotMatch(JSON.stringify(payload), /AcmeFlux|Orbit Pad/);
});

test("uploads reject spoofed HTML and SVG payloads and normalize valid image extensions", async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const htmlForm = new FormData();
  htmlForm.append("image", new Blob(["<html><body>not an image</body></html>"], { type: "image/png" }), "spoofed.png");

  const htmlUpload = await fetch(`${server.baseUrl}/api/upload`, {
    method: "POST",
    body: htmlForm
  }).then(async (response) => ({
    status: response.status,
    payload: await response.json()
  }));

  assert.equal(htmlUpload.status, 400);
  assert.equal(htmlUpload.payload.code, "invalid_upload_type");

  const svgForm = new FormData();
  svgForm.append("image", new Blob(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], { type: "image/svg+xml" }), "vector.svg");

  const svgUpload = await fetch(`${server.baseUrl}/api/upload`, {
    method: "POST",
    body: svgForm
  }).then(async (response) => ({
    status: response.status,
    payload: await response.json()
  }));

  assert.equal(svgUpload.status, 400);
  assert.equal(svgUpload.payload.code, "invalid_upload_type");

  const normalizedImageUrl = await uploadFixture(server.baseUrl, server.root, {
    filename: "tiny.txt"
  });
  assert.match(normalizedImageUrl, /\/uploads\/.+\.png$/);

  const uploadedAsset = await fetch(normalizedImageUrl);
  assert.equal(uploadedAsset.status, 200);
  assert.equal(uploadedAsset.headers.get("x-content-type-options"), "nosniff");
});

test("jobs API supports create, retry, and distribution", async (t) => {
  let generateAttempts = 0;

  const server = await startTestServer({
    kieService: {
      async generateVideo() {
        generateAttempts += 1;
        if (generateAttempts === 1) {
          throw new Error("provider temporarily unavailable");
        }

        return {
          taskId: `task-${generateAttempts}`,
          status: "queueing",
          videoUrl: null
        };
      },
      async pollStatus(taskId) {
        return {
          status: "success",
          videoUrl: `https://example.com/${taskId}.mp4`,
          error: null
        };
      }
    }
  });

  t.after(() => server.close());

  const imageUrl = await uploadFixture(server.baseUrl, server.root);
  const created = await fetch(`${server.baseUrl}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "product",
      imageUrl,
      kieApiKey: "should-not-persist",
      fields: {
        productName: "TNT Sweat Cream",
        benefit: "Maximum sweat activation"
      }
    })
  }).then((response) => response.json());

  assert.equal(created.job.providerConfig.kieApiKey, undefined);

  const failedJob = await waitFor(async () => {
    const payload = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}`).then((response) => response.json());
    return payload.job.status === "failed" ? payload.job : null;
  }, {
    message: "Job never moved into failed state."
  });

  assert.equal(failedJob.canRetry, true);

  const retried = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}/retry`, {
    method: "POST"
  }).then((response) => response.json());
  assert.equal(retried.job.status, "awaiting_generation");

  const readyJob = await waitFor(async () => {
    const payload = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}`).then((response) => response.json());
    return payload.job.status === "ready" ? payload.job : null;
  }, {
    message: "Retried job never reached ready state."
  });

  assert.match(readyJob.videoUrl, /task-2\.mp4/);

  const distributed = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}/distribute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      platformConfigs: {
        tiktok: {
          enabled: true,
          mode: "draft",
          caption: "Caption",
          hashtags: ["fitness"]
        }
      }
    })
  }).then((response) => response.json());

  assert.equal(distributed.results[0].status, "success");

  const listed = await fetch(`${server.baseUrl}/api/jobs?ids=${created.job.id}&limit=1`).then((response) => response.json());
  assert.equal(listed.jobs.length, 1);
});

test("narrated jobs create a reviewable segment draft and allow narration edits", async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const optionsPayload = await fetch(`${server.baseUrl}/api/narrated/options`).then((response) => response.json());
  assert.equal(optionsPayload.templates.length, 7);
  assert.equal(optionsPayload.templates.some((template) => template.id === "ingredient_spotlight"), true);
  assert.equal(optionsPayload.trendingHooks.length, 10);
  assert.deepEqual(optionsPayload.voices[0], {
    id: "rachel",
    label: "Rachel"
  });

  const created = await fetch(`${server.baseUrl}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "edu",
      mode: "narrated",
      fields: {
        topic: "Sweat smarter",
        voiceId: "rachel",
        platformPreset: "tiktok",
        targetLengthSeconds: 15,
        segmentCount: 4,
        templateId: "myth_fact_stop_doing_this",
        hookAngle: "the mistake people make before cardio",
        narratorTone: "direct",
        ctaStyle: "save_share",
        visualIntensity: "bold"
      }
    })
  }).then((response) => response.json());

  assert.equal(created.job.mode, "narrated");
  assert.equal(created.job.status, "script_ready");
  assert.equal(created.job.segments.length, 4);
  assert.equal(created.job.sourceImageUrl, "");
  assert.equal(created.job.fields.voiceId, "rachel");
  assert.equal(created.job.fields.segmentCount, 4);
  assert.equal(created.job.fields.templateId, "myth_fact_stop_doing_this");
  assert.equal(created.job.fields.hookAngle, "the mistake people make before cardio");
  assert.equal(created.job.fields.narratorTone, "direct");
  assert.equal(created.job.fields.ctaStyle, "save_share");
  assert.equal(created.job.fields.visualIntensity, "bold");

  const loaded = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}`).then((response) => response.json());
  assert.equal(loaded.job.segments.length, 4);
  assert.match(loaded.job.script, /Visual:/);

  const updated = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}/narration`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Updated narrated draft",
      segments: loaded.job.segments.map((segment, index) => ({
        ...segment,
        text: `${segment.text} edit ${index + 1}`,
        visualIntent: `${segment.visualIntent} refined`,
        estimatedSeconds: segment.estimatedSeconds + 1
      }))
    })
  }).then((response) => response.json());

  assert.equal(updated.job.fields.narrationTitle, "Updated narrated draft");
  assert.match(updated.job.script, /Updated narrated draft/);
  assert.match(updated.job.segments[0].text, /edit 1/);
  assert.match(updated.job.segments[0].visualIntent, /refined/);
});

test("slide jobs create a reviewable draft, persist edits, and render a final slideshow", async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const created = await fetch(`${server.baseUrl}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "edu",
      mode: "slides",
      fields: {
        topic: "Why sweat routines need sequencing",
        slideCount: 1
      }
    })
  }).then((response) => response.json());

  assert.equal(created.job.mode, "slides");
  assert.equal(created.job.status, "slides_ready");
  assert.equal(created.job.slides.length, 1);
  assert.equal(created.job.fields.slideCount, 1);

  const updated = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}/slides`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Updated slide deck",
      slides: created.job.slides.map((slide, index) => ({
        ...slide,
        headline: `${slide.headline} ${index + 1}`,
        body: `${slide.body} refined ${index + 1}`,
        durationSeconds: 3.8
      }))
    })
  }).then((response) => response.json());

  assert.equal(updated.job.fields.slideDeckTitle, "Updated slide deck");
  assert.match(updated.job.script, /Updated slide deck/);
  assert.match(updated.job.slides[0].headline, /1/);

  const rendered = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}/slides/render`, {
    method: "POST"
  }).then((response) => response.json());

  assert.equal(rendered.job.status, "ready");
  assert.match(rendered.job.videoUrl || "", /https:\/\/example\.com\/slides-/);
  assert.match(rendered.job.thumbnailUrl || "", /https:\/\/example\.com\/slides-.*\.png/);

  const loaded = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}`).then((response) => response.json());
  assert.equal(loaded.job.mode, "slides");
  assert.equal(loaded.job.slides.length, 1);
  assert.equal(loaded.job.fields.slideDeckTitle, "Updated slide deck");
});

test("slide jobs reject rendering incomplete decks", async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const created = await fetch(`${server.baseUrl}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "edu",
      mode: "slides",
      fields: {
        topic: "Incomplete slides",
        slideCount: 1
      }
    })
  }).then((response) => response.json());

  const invalidUpdate = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}/slides`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Broken deck",
      slides: [{
        ...created.job.slides[0],
        headline: "Only one slide",
        body: ""
      }]
    })
  }).then(async (response) => ({
    status: response.status,
    payload: await response.json()
  }));

  assert.equal(invalidUpdate.status, 400);
  assert.equal(invalidUpdate.payload.code, "slide_content_incomplete");
});

test("storyboard sequences persist one final output job and delete as a group", async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const imageUrl = await uploadFixture(server.baseUrl, server.root);
  const sequenceGroupId = "storyboard-sequence-test";

  const createClip = async (sequenceIndex) => fetch(`${server.baseUrl}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "edu",
      imageUrl,
      fields: {
        topic: "Storyboard training reel",
        sequenceCount: 2,
        sequenceIndex,
        sequenceGroupId
      }
    })
  }).then((response) => response.json());

  const first = await createClip(1);
  const second = await createClip(2);

  const finalized = await fetch(`${server.baseUrl}/api/jobs/sequence/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jobIds: [first.job.id, second.job.id],
      videoUrl: "https://example.com/final-storyboard.mp4",
      requestedSegments: 2,
      sourceSegments: 2,
      merged: true
    })
  }).then((response) => response.json());

  assert.equal(finalized.job.status, "ready");
  assert.equal(finalized.job.fields.sequenceIsFinalOutput, true);
  assert.equal(finalized.job.fields.sequenceGroupId, sequenceGroupId);
  assert.equal(finalized.job.fields.sequenceChildJobIds.length, 2);
  assert.match(finalized.job.videoUrl || "", /final-storyboard\.mp4$/);

  const listed = await fetch(`${server.baseUrl}/api/jobs?limit=10`).then((response) => response.json());
  const groupedJobs = listed.jobs.filter((job) => job.fields?.sequenceGroupId === sequenceGroupId);
  assert.equal(groupedJobs.length, 3);
  assert.equal(groupedJobs.filter((job) => job.fields?.sequenceIsFinalOutput).length, 1);

  const deleted = await fetch(`${server.baseUrl}/api/jobs/${finalized.job.id}`, {
    method: "DELETE"
  }).then((response) => response.json());

  assert.equal(new Set(deleted.deletedJobIds).size, 3);
  assert.equal(deleted.deletedJobIds.includes(first.job.id), true);
  assert.equal(deleted.deletedJobIds.includes(second.job.id), true);
  assert.equal(deleted.deletedJobIds.includes(finalized.job.id), true);

  const relisted = await fetch(`${server.baseUrl}/api/jobs?limit=10`).then((response) => response.json());
  assert.equal(relisted.jobs.filter((job) => job.fields?.sequenceGroupId === sequenceGroupId).length, 0);
});

test("narrated jobs can start and complete voice generation for all segments", async (t) => {
  const voiceGenerateCalls = [];

  const server = await startTestServer({
    kieService: {
      async generateVideo() {
        return {
          taskId: "task-1",
          status: "queueing",
          videoUrl: null
        };
      },
      async pollStatus() {
        return {
          status: "success",
          videoUrl: "https://example.com/task-1.mp4",
          error: null
        };
      }
    },
    elevenLabsService: {
      async generateVoiceover(args) {
        voiceGenerateCalls.push(args);
        return {
          taskId: `elevenlabs-${voiceGenerateCalls.length}`,
          status: "success",
          audioUrl: `https://example.com/audio-${voiceGenerateCalls.length}.mp3`,
          durationSeconds: 4.6
        };
      }
    }
  });
  t.after(() => server.close());

  const imageUrl = await uploadFixture(server.baseUrl, server.root);
  const created = await fetch(`${server.baseUrl}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "edu",
      mode: "narrated",
      imageUrl,
      fields: {
        topic: "Sweat smarter",
        voiceId: "rachel",
        platformPreset: "tiktok",
        targetLengthSeconds: 15
      }
    })
  }).then((response) => response.json());

  const started = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}/voice`, {
    method: "POST"
  }).then((response) => response.json());

  assert.equal(started.job.status, "voice_ready");
  assert.equal(voiceGenerateCalls.length, 3);

  const refreshed = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}`).then((response) => response.json());
  assert.equal(refreshed.job.status, "voice_ready");
  assert.equal(refreshed.job.segments.every((segment) => segment.voiceStatus === "complete"), true);
  assert.equal(refreshed.job.segments.every((segment) => /https:\/\/example\.com\/audio-/.test(segment.audioUrl || "")), true);
});

test("narrated jobs can plan B-roll, render segment clips, and compose a final video", async (t) => {
  const server = await startTestServer({
    pollIntervalMs: 25
  });
  t.after(() => server.close());

  const imageUrl = await uploadFixture(server.baseUrl, server.root);
  const created = await fetch(`${server.baseUrl}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "queen_helene",
      pipeline: "product",
      mode: "narrated",
      imageUrl,
      generationConfig: {
        profileId: "veo31_image"
      },
      fields: {
        productName: "Mint Julep Masque",
        benefit: "a clearer reset",
        voiceId: "rachel",
        platformPreset: "instagram",
        targetLengthSeconds: 15,
        templateId: "ingredient_spotlight",
        hookAngle: "why mint still hits",
        narratorTone: "friendly",
        ctaStyle: "soft",
        visualIntensity: "clean"
      }
    })
  }).then((response) => response.json());

  await fetch(`${server.baseUrl}/api/jobs/${created.job.id}/voice`, {
    method: "POST"
  }).then((response) => response.json());

  await waitFor(async () => {
    const payload = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}`).then((response) => response.json());
    return payload.job.status === "voice_ready" ? payload.job : null;
  }, {
    message: "Narrated voice generation never reached voice_ready."
  });

  const rendering = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}/broll`, {
    method: "POST"
  }).then((response) => response.json());

  assert.equal(rendering.job.status, "rendering_broll");
  assert.equal(rendering.job.segments.every((segment) => /Vertical 9:16/.test(segment.brollPrompt || "")), true);

  const brollReady = await waitFor(async () => {
    const payload = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}`).then((response) => response.json());
    return payload.job.status === "ready_to_compose" ? payload.job : null;
  }, {
    message: "Narrated B-roll never reached ready_to_compose."
  });

  assert.equal(brollReady.segments.every((segment) => segment.brollStatus === "complete"), true);
  assert.equal(brollReady.segments.every((segment) => /https:\/\/example\.com\/task-/.test(segment.videoUrl || "")), true);

  const composed = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}/compose`, {
    method: "POST"
  }).then((response) => response.json());

  assert.equal(composed.job.status, "ready");
  assert.match(composed.job.videoUrl || "", /https:\/\/example\.com\/narrated-/);
  assert.match(composed.job.thumbnailUrl || "", /https:\/\/example\.com\/narrated-.*\.png/);
});

test("narrated jobs can start category-first and attach a reference image later for B-roll", async (t) => {
  const server = await startTestServer({
    pollIntervalMs: 25
  });
  t.after(() => server.close());

  const created = await fetch(`${server.baseUrl}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "la_baby",
      pipeline: "edu",
      mode: "narrated",
      generationConfig: {
        profileId: "veo31_image"
      },
      fields: {
        topic: "Why baby skin gets so dry after baths",
        voiceId: "rachel",
        platformPreset: "instagram",
        targetLengthSeconds: 15,
        templateId: "did_you_know_quick_explainer",
        hookAngle: "what most parents miss after bath time"
      }
    })
  }).then((response) => response.json());

  assert.equal(created.job.sourceImageUrl, "");

  await fetch(`${server.baseUrl}/api/jobs/${created.job.id}/voice`, {
    method: "POST"
  }).then((response) => response.json());

  await waitFor(async () => {
    const payload = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}`).then((response) => response.json());
    return payload.job.status === "voice_ready" ? payload.job : null;
  }, {
    message: "Category-first narrated voice generation never reached voice_ready."
  });

  const missingReference = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}/broll`, {
    method: "POST"
  }).then(async (response) => ({
    status: response.status,
    payload: await response.json()
  }));

  assert.equal(missingReference.status, 409);
  assert.equal(missingReference.payload.code, "narrated_broll_reference_image_required");

  const imageUrl = await uploadFixture(server.baseUrl, server.root);
  const updated = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}/reference-image`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageUrl,
      imageUrls: [imageUrl]
    })
  }).then((response) => response.json());

  assert.equal(updated.job.sourceImageUrl, imageUrl);

  await fetch(`${server.baseUrl}/api/jobs/${created.job.id}/broll`, {
    method: "POST"
  }).then((response) => response.json());

  const brollReady = await waitFor(async () => {
    const payload = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}`).then((response) => response.json());
    return payload.job.status === "ready_to_compose" ? payload.job : null;
  }, {
    message: "Narrated B-roll never reached ready_to_compose after attaching a reference image."
  });

  assert.equal(brollReady.segments.every((segment) => segment.brollStatus === "complete"), true);
});

test("compatibility narration and render routes stay aligned with the current services", async (t) => {
  const server = await startTestServer({
    elevenLabsService: {
      async generateVoiceover() {
        return {
          taskId: "elevenlabs-compat",
          status: "success",
          audioUrl: "https://example.com/compat-audio.mp3",
          durationSeconds: 4.2
        };
      }
    }
  });
  t.after(() => server.close());

  const models = await fetch(`${server.baseUrl}/api/models`).then((response) => response.json());
  assert.equal(Array.isArray(models.models), true);
  assert.equal(models.models.length > 0, true);

  const narration = await fetch(`${server.baseUrl}/api/narration/script`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "edu",
      fields: {
        topic: "Sweat smarter",
        templateId: "did_you_know_quick_explainer",
        platformPreset: "tiktok"
      }
    })
  }).then((response) => response.json());

  assert.equal(Array.isArray(narration.segments), true);
  assert.equal(narration.segments.length > 0, true);

  const voice = await fetch(`${server.baseUrl}/api/narration/voice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      voiceId: "rachel",
      text: narration.segments[0].text
    })
  }).then((response) => response.json());

  assert.match(voice.taskId, /^elevenlabs-/);
  assert.match(voice.audioUrl || "", /compat-audio\.mp3/);

  const brollPrompts = await fetch(`${server.baseUrl}/api/narration/broll-prompts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "edu",
      analysis: narration.analysis,
      fields: {
        topic: "Sweat smarter",
        templateId: "did_you_know_quick_explainer",
        platformPreset: "tiktok"
      },
      segments: narration.segments.map((segment) => ({
        ...segment,
        actualDurationSeconds: 4.2
      }))
    })
  }).then((response) => response.json());

  assert.equal(Array.isArray(brollPrompts.prompts), true);
  assert.equal(brollPrompts.prompts.length, narration.segments.length);

  const scenes = await fetch(`${server.baseUrl}/api/scenes/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "edu",
      fields: {
        topic: "Sweat smarter",
        templateId: "did_you_know_quick_explainer"
      }
    })
  }).then((response) => response.json());

  assert.equal(Array.isArray(scenes.scenes), true);
  assert.equal(scenes.scenes.length > 0, true);

  const stitch = await fetch(`${server.baseUrl}/api/stitch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      videoUrls: ["https://example.com/clip-1.mp4", "https://example.com/clip-2.mp4"]
    })
  }).then((response) => response.json());

  assert.equal(stitch.merged, true);
  assert.match(stitch.videoUrl, /merged-1\.mp4/);

  const directRender = await fetch(`${server.baseUrl}/api/render-narrated`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "edu",
      fields: {
        templateId: "problem_solution_result",
        platformPreset: "tiktok"
      },
      segments: narration.segments.map((segment, index) => ({
        ...segment,
        audioUrl: `https://example.com/audio-${index + 1}.mp3`,
        videoUrl: `https://example.com/video-${index + 1}.mp4`
      }))
    })
  }).then((response) => response.json());

  assert.match(directRender.videoUrl, /https:\/\/example\.com\/narrated-/);
  assert.match(directRender.thumbnailUrl, /https:\/\/example\.com\/narrated-.*\.png/);
});

test("direct narrated renders fail fast on malformed media inputs", async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const imageUrl = await uploadFixture(server.baseUrl, server.root);
  const narration = await fetch(`${server.baseUrl}/api/narration/script`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "edu",
      imageUrl,
      fields: {
        topic: "Sweat smarter"
      }
    })
  }).then((response) => response.json());

  const invalidSourceImage = await fetch(`${server.baseUrl}/api/render-narrated`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "edu",
      imageUrl: "https://example.com/not-an-image.mp4",
      segments: narration.segments.map((segment, index) => ({
        ...segment,
        audioUrl: `https://example.com/audio-${index + 1}.mp3`,
        videoUrl: `https://example.com/video-${index + 1}.mp4`
      }))
    })
  }).then(async (response) => ({
    status: response.status,
    payload: await response.json()
  }));

  assert.equal(invalidSourceImage.status, 400);
  assert.equal(invalidSourceImage.payload.code, "invalid_direct_source_image_url");

  const invalidAudio = await fetch(`${server.baseUrl}/api/render-narrated`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "edu",
      imageUrl,
      segments: narration.segments.map((segment, index) => ({
        ...segment,
        audioUrl: index === 0
          ? "https://example.com/not-audio.png"
          : `https://example.com/audio-${index + 1}.mp3`,
        videoUrl: `https://example.com/video-${index + 1}.mp4`
      }))
    })
  }).then(async (response) => ({
    status: response.status,
    payload: await response.json()
  }));

  assert.equal(invalidAudio.status, 400);
  assert.equal(invalidAudio.payload.code, "invalid_direct_segment_audio_url");
});

test("health reports remotion honestly and direct distribute remains available", async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const health = await fetch(`${server.baseUrl}/api/health`).then((response) => response.json());
  assert.equal(health.auth.enabled, false);
  assert.equal(health.database.configured, true);
  assert.equal(health.checks.narratedRenderAvailable, true);
  assert.equal(health.checks.baseUrlConfigured, true);

  const distributed = await fetch(`${server.baseUrl}/api/distribute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      videoUrl: "https://example.com/direct.mp4",
      platformConfigs: {
        instagram: {
          enabled: true,
          mode: "draft",
          caption: "IG caption",
          hashtags: ["reels"]
        }
      }
    })
  }).then((response) => response.json());

  assert.equal(distributed.results.length, 1);
  assert.equal(distributed.results[0].platform, "instagram");
  assert.equal(distributed.results[0].status, "success");
});

test("brands persist across restart using the SQLite-backed repository", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tiktok-pipeline-restart-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const first = await startTestServer({ root });
  await fetch(`${first.baseUrl}/api/brands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "restart-brand",
      name: "Restart Brand",
      category: "Haircare",
      voice: "Confident and clean",
      products: "Shampoo",
      targetAudience: "Adults",
      tone: "Helpful"
    })
  }).then((response) => response.json());
  await first.close();

  const second = await startTestServer({ root });
  t.after(() => second.close());

  const brands = await fetch(`${second.baseUrl}/api/brands`).then((response) => response.json());
  assert.equal(brands.some((brand) => brand.id === "restart-brand"), true);
});

test("deleting a stuck job clears it from the queue and lets the next job continue", async (t) => {
  let pollCount = 0;

  const server = await startTestServer({
    kieService: {
      async generateVideo() {
        return {
          taskId: `task-${Date.now()}-${Math.random()}`,
          status: "queueing",
          videoUrl: null
        };
      },
      async pollStatus(taskId) {
        pollCount += 1;
        if (pollCount < 3) {
          return {
            status: "generating",
            videoUrl: null,
            error: null
          };
        }

        return {
          status: "success",
          videoUrl: `https://example.com/${taskId}.mp4`,
          error: null
        };
      }
    }
  });

  t.after(() => server.close());

  const imageUrl = await uploadFixture(server.baseUrl, server.root);
  const first = await fetch(`${server.baseUrl}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "comedy",
      imageUrl,
      fields: {
        scenario: "First stuck clip"
      }
    })
  }).then((response) => response.json());

  const second = await fetch(`${server.baseUrl}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "comedy",
      imageUrl,
      fields: {
        scenario: "Second clip"
      }
    })
  }).then((response) => response.json());

  const firstPolling = await waitFor(async () => {
    const payload = await fetch(`${server.baseUrl}/api/jobs/${first.job.id}`).then((response) => response.json());
    return payload.job.status === "polling" ? payload.job : null;
  }, {
    message: "First job never entered polling."
  });

  assert.equal(firstPolling.status, "polling");

  const deleted = await fetch(`${server.baseUrl}/api/jobs/${first.job.id}`, {
    method: "DELETE"
  }).then((response) => response.json());

  assert.equal(deleted.job.id, first.job.id);

  const missing = await fetch(`${server.baseUrl}/api/jobs/${first.job.id}`);
  assert.equal(missing.status, 404);

  const readySecond = await waitFor(async () => {
    const payload = await fetch(`${server.baseUrl}/api/jobs/${second.job.id}`).then((response) => response.json());
    return payload.job.status === "ready" ? payload.job : null;
  }, {
    message: "Second job never continued after deleting the stuck first job."
  });

  assert.match(readySecond.videoUrl, /^https:\/\/example\.com\/task-/);
});

test("distribution retries only failed platforms for the same request payload", async (t) => {
  const distributionCalls = [];
  let attempt = 0;

  const server = await startTestServer({
    distributionService: {
      getRequestHash(videoUrl, platformConfigs) {
        return `hash:${videoUrl}:${JSON.stringify(platformConfigs)}`;
      },
      async distributeVideo(videoUrl, platformConfigs) {
        distributionCalls.push({ videoUrl, platformConfigs });
        attempt += 1;

        if (attempt === 1) {
          return {
            requestHash: this.getRequestHash(videoUrl, platformConfigs),
            results: [
              { platform: "tiktok", mode: "draft", status: "success", externalId: "tt-1", error: null },
              { platform: "youtube", mode: "draft", status: "failed", externalId: null, error: "temporary outage" }
            ]
          };
        }

        return {
          requestHash: this.getRequestHash(videoUrl, platformConfigs),
          results: [
            { platform: "youtube", mode: "draft", status: "success", externalId: "yt-2", error: null }
          ]
        };
      }
    }
  });

  t.after(() => server.close());

  const imageUrl = await uploadFixture(server.baseUrl, server.root);
  const created = await fetch(`${server.baseUrl}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "edu",
      imageUrl,
      fields: {
        topic: "Sweat smarter"
      }
    })
  }).then((response) => response.json());

  const readyJob = await waitFor(async () => {
    const payload = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}`).then((response) => response.json());
    return payload.job.status === "ready" ? payload.job : null;
  }, {
    message: "Job never reached ready state."
  });

  const platformConfigs = {
    tiktok: {
      enabled: true,
      mode: "draft",
      caption: "TikTok caption",
      hashtags: ["fitness"]
    },
    youtube: {
      enabled: true,
      mode: "draft",
      caption: "YouTube title",
      hashtags: ["shorts"]
    }
  };

  const firstDistribution = await fetch(`${server.baseUrl}/api/jobs/${readyJob.id}/distribute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platformConfigs })
  }).then((response) => response.json());

  assert.equal(firstDistribution.job.status, "ready");
  assert.equal(firstDistribution.job.distribution.attemptCount, 1);
  assert.equal(firstDistribution.results[0].status, "success");
  assert.equal(firstDistribution.results[1].status, "failed");

  const secondDistribution = await fetch(`${server.baseUrl}/api/jobs/${readyJob.id}/distribute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platformConfigs })
  }).then((response) => response.json());

  assert.equal(distributionCalls.length, 2);
  assert.deepEqual(Object.keys(distributionCalls[1].platformConfigs), ["youtube"]);
  assert.equal(secondDistribution.job.status, "distributed");
  assert.equal(secondDistribution.job.distribution.attemptCount, 2);
  assert.deepEqual(secondDistribution.results.map((result) => result.status), ["success", "success"]);
});

test("jobs automatically fail over to a fallback generation model", async (t) => {
  const generationAttempts = [];

  const server = await startTestServer({
    kieService: {
      async generateVideo(args) {
        generationAttempts.push(args);
        if (generationAttempts.length === 1) {
          throw new Error("primary model failed");
        }

        return {
          taskId: `task-${generationAttempts.length}`,
          status: "queueing",
          videoUrl: null
        };
      },
      async pollStatus(taskId) {
        return {
          status: "success",
          videoUrl: `https://example.com/${taskId}.mp4`,
          error: null
        };
      }
    }
  });

  t.after(() => server.close());

  const imageUrl = await uploadFixture(server.baseUrl, server.root);
  const created = await fetch(`${server.baseUrl}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "edu",
      imageUrl,
      imageUrls: [imageUrl],
      generationConfig: {
        profileId: "sora2_image",
        fallbackProfileId: "veo31_image",
        duration: "15"
      },
      fields: {
        topic: "Sweat smarter"
      }
    })
  }).then((response) => response.json());

  const readyJob = await waitFor(async () => {
    const payload = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}`).then((response) => response.json());
    return payload.job.status === "ready" ? payload.job : null;
  }, {
    message: "Fallback generation job never reached ready state."
  });

  assert.equal(generationAttempts.length, 2);
  assert.equal(generationAttempts[0].generationConfig.profileId, "sora2_image");
  assert.equal(generationAttempts[1].generationConfig.profileId, "veo31_image");
  assert.equal(readyJob.providerConfig.generationConfig.profileId, "veo31_image");
  assert.equal(readyJob.providerConfig.generationConfig.requestedProfileId, "sora2_image");
  assert.equal(readyJob.providerConfig.fallbackHistory.length, 1);
  assert.equal(readyJob.providerConfig.fallbackHistory[0].failedProfileId, "sora2_image");
  assert.equal(readyJob.providerConfig.fallbackHistory[0].fallbackProfileId, "veo31_image");
  assert.equal(readyJob.providerConfig.estimatedCostUsd, 0.625);
});

test("idea suggestions are available and missing fields are auto-filled", async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const imageUrl = await uploadFixture(server.baseUrl, server.root);
  const ideas = await fetch(`${server.baseUrl}/api/ideas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "comedy",
      imageUrl,
      count: 3,
      fields: {
        format: "POV skit",
        energy: "Overconfident"
      },
      sequenceOptions: {
        sequence: true,
        totalCount: 3,
        existingItems: []
      }
    })
  }).then((response) => response.json());

  assert.equal(ideas.suggestions.length, 3);
  assert.equal(ideas.suggestions[0].fields.scenario, "TNT Pro Series scenario 1");
  assert.equal(typeof ideas.suggestions[0].fields.hookAngle, "string");
  assert.equal(ideas.suggestions[0].fields.hookAngle.length > 0, true);
  assert.equal(ideas.suggestions[0].fields.sequenceCount, 3);
  assert.equal(ideas.suggestions[0].fields.sequenceIndex, 1);
  assert.match(ideas.analysis, /presenter/);

  const created = await fetch(`${server.baseUrl}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "comedy",
      imageUrl,
      fields: {
        format: "POV skit",
        energy: "Overconfident"
      }
    })
  }).then((response) => response.json());

  const prepared = await waitFor(async () => {
    const payload = await fetch(`${server.baseUrl}/api/jobs/${created.job.id}`).then((response) => response.json());
    return payload.job.fields.scenario ? payload.job : null;
  }, {
    message: "Job fields never received an auto-generated scenario."
  });

  assert.equal(prepared.fields.scenario, "TNT Pro Series scenario 1");
  assert.match(prepared.script, /TNT Pro Series scenario 1/);
});

test("generation profiles, spend summary, and brand updates are available", async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const models = await fetch(`${server.baseUrl}/api/models`).then((response) => response.json());
  const profiles = await fetch(`${server.baseUrl}/api/generation/profiles`).then((response) => response.json());
  assert.ok(Array.isArray(models.models));
  assert.equal(profiles.canonicalRoute, "/api/models");
  assert.equal(profiles.deprecated, true);
  assert.ok(Array.isArray(profiles.profiles));
  assert.deepEqual(profiles.profiles.map((profile) => profile.id), models.models.map((profile) => profile.id));
  assert.ok(profiles.profiles.some((profile) => profile.id === "sora2_image"));
  assert.ok(profiles.profiles.some((profile) => profile.id === "kling30"));
  assert.ok(profiles.profiles.some((profile) => profile.id === "seedance15pro"));
  assert.deepEqual(
    profiles.profiles.find((profile) => profile.id === "sora2_image")?.controls?.duration?.options,
    [
      { value: "10", label: "10 sec" },
      { value: "15", label: "15 sec" }
    ]
  );
  assert.deepEqual(
    profiles.profiles.find((profile) => profile.id === "kling30")?.controls?.duration?.options,
    [
      { value: "10", label: "10 sec" },
      { value: "15", label: "15 sec" }
    ]
  );
  assert.deepEqual(
    profiles.profiles.find((profile) => profile.id === "veo31_image")?.controls?.duration?.options,
    [{ value: "8", label: "8 sec" }]
  );
  assert.deepEqual(
    profiles.profiles.find((profile) => profile.id === "seedance15pro")?.controls?.duration?.options,
    [
      { value: "4", label: "4 sec" },
      { value: "8", label: "8 sec" },
      { value: "12", label: "12 sec" }
    ]
  );

  const updatedBrand = await fetch(`${server.baseUrl}/api/brands/tnt`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      socialAccounts: {
        ayrshareProfileKey: "profile-key-123",
        tiktokHandle: "@tnt",
        instagramHandle: "@tntpro",
        youtubeHandle: "@tntyt"
      }
    })
  }).then((response) => response.json());

  assert.equal(updatedBrand.socialAccounts.ayrshareProfileKey, "profile-key-123");

  const imageUrl = await uploadFixture(server.baseUrl, server.root);
  const created = await fetch(`${server.baseUrl}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "edu",
      imageUrl,
      imageUrls: [imageUrl],
      generationConfig: {
        profileId: "sora2_image",
        duration: "15"
      },
      fields: {
        topic: "Sweat smarter"
      }
    })
  }).then((response) => response.json());

  assert.equal(created.job.providerConfig.generationConfig.profileId, "sora2_image");
  assert.equal(created.job.providerConfig.estimatedCostUsd, 0.225);

  const summary = await fetch(`${server.baseUrl}/api/costs/summary`).then((response) => response.json());
  assert.equal(summary.summary.estimatedKnownJobs >= 1, true);
  assert.equal(summary.summary.estimatedTotalUsd >= 0.225, true);
});

test("brand product catalog imports ASINs and exposes products on the brand payload", async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const imported = await fetch(`${server.baseUrl}/api/brands/tnt/products/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rawText: "B0EXAMP123\nhttps://www.amazon.com/dp/B0EXAMP234"
    })
  }).then((response) => response.json());

  assert.equal(imported.importedCount, 2);
  assert.equal(imported.failureCount, 0);
  assert.equal(imported.products[0].brandId, "tnt");
  assert.match(imported.products[0].imageUrl, /^https:\/\/example\.com\//);
  assert.equal(imported.products[0].benefits[0], "Primary imported benefit");

  const brands = await fetch(`${server.baseUrl}/api/brands`).then((response) => response.json());
  const tnt = brands.find((brand) => brand.id === "tnt");
  assert.equal(tnt.productCatalog.length, 2);
  assert.equal(tnt.productCatalog[0].asin.length, 10);
});

test("spend summary skips legacy jobs without generation metadata", async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const db = new DatabaseSync(server.config.databasePath);
  t.after(() => db.close());

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO jobs (
      id, brand_id, pipeline, fields_json, source_image_url, status, analysis, script, video_prompt,
      provider_task_id, video_url, captions_json, distribution_json, error, provider_config_json,
      created_at, updated_at, started_at, completed_at
    ) VALUES (
      :id, :brandId, :pipeline, :fieldsJson, :sourceImageUrl, :status, :analysis, :script, :videoPrompt,
      :providerTaskId, :videoUrl, :captionsJson, :distributionJson, :error, :providerConfigJson,
      :createdAt, :updatedAt, :startedAt, :completedAt
    )
  `).run({
    id: "legacy-cost-job",
    brandId: "tnt",
    pipeline: "edu",
    fieldsJson: JSON.stringify({ topic: "Legacy topic" }),
    sourceImageUrl: "https://example.com/legacy.png",
    status: "ready",
    analysis: "Legacy analysis",
    script: "Legacy script",
    videoPrompt: "Legacy prompt",
    providerTaskId: null,
    videoUrl: "https://example.com/legacy.mp4",
    captionsJson: null,
    distributionJson: null,
    error: null,
    providerConfigJson: JSON.stringify({}),
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    completedAt: now
  });

  const summary = await fetch(`${server.baseUrl}/api/costs/summary`).then((response) => response.json());
  assert.equal(summary.summary.generatedJobs, 0);
  assert.equal(summary.summary.estimatedUnknownJobs, 0);
  assert.deepEqual(summary.summary.byProfile, []);
});

test("batch compile endpoint merges category clips and passes through single clips", async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const payload = await fetch(`${server.baseUrl}/api/batch/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      groups: [
        {
          pipeline: "edu",
          label: "Education reel",
          requestedSegments: 3,
          videoUrls: [
            "https://example.com/edu-1.mp4",
            "https://example.com/edu-2.mp4",
            "https://example.com/edu-3.mp4"
          ]
        },
        {
          pipeline: "product",
          label: "Product reel",
          requestedSegments: 1,
          videoUrls: [
            "https://example.com/product-1.mp4"
          ]
        }
      ]
    })
  }).then((response) => response.json());

  assert.equal(payload.results.length, 2);
  assert.equal(payload.results[0].pipeline, "edu");
  assert.equal(payload.results[0].merged, true);
  assert.match(payload.results[0].videoUrl, /merged-1\.mp4/);
  assert.equal(payload.results[1].pipeline, "product");
  assert.equal(payload.results[1].merged, false);
  assert.equal(payload.results[1].videoUrl, "https://example.com/product-1.mp4");
  assert.equal(server.calls.mergeCalls.length, 1);
  assert.deepEqual(server.calls.mergeCalls[0].videoUrls, [
    "https://example.com/edu-1.mp4",
    "https://example.com/edu-2.mp4",
    "https://example.com/edu-3.mp4"
  ]);
});

test("health and batch compile make missing FAL stitching visible", async (t) => {
  const server = await startTestServer({
    falApiKey: ""
  });
  t.after(() => server.close());

  const health = await fetch(`${server.baseUrl}/api/health`).then((response) => response.json());
  assert.equal(health.providers.fal.configured, false);

  const payload = await fetch(`${server.baseUrl}/api/batch/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      groups: [
        {
          pipeline: "edu",
          label: "Education reel",
          requestedSegments: 2,
          videoUrls: [
            "https://example.com/edu-1.mp4",
            "https://example.com/edu-2.mp4"
          ]
        }
      ]
    })
  }).then((response) => response.json());

  assert.equal(payload.results.length, 1);
  assert.equal(payload.results[0].status, "failed");
  assert.equal(payload.results[0].merged, false);
  assert.match(payload.results[0].error, /FAL_KEY is not configured/);
});

test("stale generation jobs time out so newer jobs can continue", async (t) => {
  const pollCalls = new Map();
  let submitCount = 0;

  const server = await startTestServer({
    pollIntervalMs: 25,
    generationTimeoutMs: 160,
    kieService: {
      async generateVideo() {
        submitCount += 1;
        if (submitCount === 2) {
          return {
            taskId: "task-2",
            status: "success",
            videoUrl: "https://example.com/task-2.mp4"
          };
        }

        return {
          taskId: `task-${submitCount}`,
          status: "queueing",
          videoUrl: null
        };
      },
      async pollStatus(taskId) {
        const current = (pollCalls.get(taskId) || 0) + 1;
        pollCalls.set(taskId, current);

        if (taskId === "task-1") {
          return {
            status: "generating",
            videoUrl: null,
            error: null
          };
        }

        return {
          status: "generating",
          videoUrl: null,
          error: null
        };
      }
    }
  });
  t.after(() => server.close());

  const imageUrl = await uploadFixture(server.baseUrl, server.root);

  const first = await fetch(`${server.baseUrl}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "comedy",
      imageUrl,
      fields: {
        scenario: "First queued clip"
      }
    })
  }).then((response) => response.json());

  const second = await fetch(`${server.baseUrl}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brandId: "tnt",
      pipeline: "comedy",
      imageUrl,
      fields: {
        scenario: "Second queued clip"
      }
    })
  }).then((response) => response.json());

  const failedFirst = await waitFor(async () => {
    const payload = await fetch(`${server.baseUrl}/api/jobs/${first.job.id}`).then((response) => response.json());
    return payload.job.status === "failed" ? payload.job : null;
  }, {
    timeoutMs: 4000,
    message: "The stale first job never timed out."
  });

  assert.match(failedFirst.error || "", /timeout/i);

  const readySecond = await waitFor(async () => {
    const payload = await fetch(`${server.baseUrl}/api/jobs/${second.job.id}`).then((response) => response.json());
    return payload.job.status === "ready" ? payload.job : null;
  }, {
    timeoutMs: 4000,
    message: "The second job never resumed after the stale timeout."
  });

  assert.equal(readySecond.videoUrl, "https://example.com/task-2.mp4");
  assert.equal(submitCount >= 2, true);
});

test("narrated outputs stay available from the configured output directory across restarts", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tiktok-pipeline-output-persist-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const createLocalComposeService = ({ config }) => ({
    isAvailable() {
      return true;
    },
    async compose(job) {
      const fileName = `narrated-${job.id}.mp4`;
      const thumbnailFileName = `narrated-${job.id}.png`;
      fs.writeFileSync(path.join(config.outputDir, fileName), "persisted output");
      fs.writeFileSync(path.join(config.outputDir, thumbnailFileName), "persisted thumbnail");
      return {
        videoUrl: `${config.baseUrl}/output/${fileName}`,
        thumbnailUrl: `${config.baseUrl}/output/${thumbnailFileName}`
      };
    }
  });

  let server = await startTestServer({
    root,
    pollIntervalMs: 25,
    narratedComposeService: createLocalComposeService
  });

  const composed = await createComposedNarratedJob(server);
  const outputPathname = new URL(composed.job.videoUrl).pathname;
  const thumbnailPathname = new URL(composed.job.thumbnailUrl).pathname;

  const initialFetch = await fetch(composed.job.videoUrl);
  assert.equal(initialFetch.status, 200);
  assert.equal(await initialFetch.text(), "persisted output");

  const initialThumbnailFetch = await fetch(composed.job.thumbnailUrl);
  assert.equal(initialThumbnailFetch.status, 200);
  assert.equal(await initialThumbnailFetch.text(), "persisted thumbnail");

  await server.close();

  server = await startTestServer({
    root,
    pollIntervalMs: 25,
    narratedComposeService: createLocalComposeService
  });
  t.after(() => server.close());

  const restartedFetch = await fetch(`${server.baseUrl}${outputPathname}`);
  assert.equal(restartedFetch.status, 200);
  assert.equal(await restartedFetch.text(), "persisted output");

  const restartedThumbnailFetch = await fetch(`${server.baseUrl}${thumbnailPathname}`);
  assert.equal(restartedThumbnailFetch.status, 200);
  assert.equal(await restartedThumbnailFetch.text(), "persisted thumbnail");
});

test("deleting a job removes local uploaded and rendered media files", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tiktok-pipeline-delete-cleanup-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const server = await startTestServer({
    root,
    pollIntervalMs: 25,
    narratedComposeService: ({ config }) => ({
      isAvailable() {
        return true;
      },
      async compose(job) {
        const fileName = `narrated-${job.id}.mp4`;
        const thumbnailFileName = `narrated-${job.id}.png`;
        fs.writeFileSync(path.join(config.outputDir, fileName), "cleanup output");
        fs.writeFileSync(path.join(config.outputDir, thumbnailFileName), "cleanup thumbnail");
        return {
          videoUrl: `${config.baseUrl}/output/${fileName}`,
          thumbnailUrl: `${config.baseUrl}/output/${thumbnailFileName}`
        };
      }
    })
  });
  t.after(() => server.close());

  const composed = await createComposedNarratedJob(server);
  const uploadPath = path.join(server.config.uploadsDir, path.basename(new URL(composed.imageUrl).pathname));
  const outputPath = path.join(server.config.outputDir, path.basename(new URL(composed.job.videoUrl).pathname));
  const thumbnailPath = path.join(server.config.outputDir, path.basename(new URL(composed.job.thumbnailUrl).pathname));

  assert.equal(fs.existsSync(uploadPath), true);
  assert.equal(fs.existsSync(outputPath), true);
  assert.equal(fs.existsSync(thumbnailPath), true);

  const deleted = await fetch(`${server.baseUrl}/api/jobs/${composed.job.id}`, {
    method: "DELETE"
  }).then((response) => response.json());

  assert.equal(deleted.job.id, composed.job.id);
  assert.equal(fs.existsSync(uploadPath), false);
  assert.equal(fs.existsSync(outputPath), false);
  assert.equal(fs.existsSync(thumbnailPath), false);

  const uploadFetch = await fetch(composed.imageUrl);
  assert.equal(uploadFetch.status, 404);

  const outputFetch = await fetch(composed.job.videoUrl);
  assert.equal(outputFetch.status, 404);

  const thumbnailFetch = await fetch(composed.job.thumbnailUrl);
  assert.equal(thumbnailFetch.status, 404);
});

test("deleting a slide job removes local uploaded and rendered media files", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tiktok-pipeline-slide-delete-cleanup-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const server = await startTestServer({
    root,
    slideComposeService: ({ config }) => ({
      isAvailable() {
        return true;
      },
      async compose(job) {
        const fileName = `slides-${job.id}.mp4`;
        const thumbnailFileName = `slides-${job.id}.png`;
        fs.writeFileSync(path.join(config.outputDir, fileName), "slide cleanup output");
        fs.writeFileSync(path.join(config.outputDir, thumbnailFileName), "slide cleanup thumbnail");
        return {
          videoUrl: `${config.baseUrl}/output/${fileName}`,
          thumbnailUrl: `${config.baseUrl}/output/${thumbnailFileName}`
        };
      }
    })
  });
  t.after(() => server.close());

  const rendered = await createRenderedSlideJob(server);
  const uploadPath = path.join(server.config.uploadsDir, path.basename(new URL(rendered.imageUrl).pathname));
  const outputPath = path.join(server.config.outputDir, path.basename(new URL(rendered.job.videoUrl).pathname));
  const thumbnailPath = path.join(server.config.outputDir, path.basename(new URL(rendered.job.thumbnailUrl).pathname));

  assert.equal(fs.existsSync(uploadPath), true);
  assert.equal(fs.existsSync(outputPath), true);
  assert.equal(fs.existsSync(thumbnailPath), true);

  const deleted = await fetch(`${server.baseUrl}/api/jobs/${rendered.job.id}`, {
    method: "DELETE"
  }).then((response) => response.json());

  assert.equal(deleted.job.id, rendered.job.id);
  assert.equal(fs.existsSync(uploadPath), false);
  assert.equal(fs.existsSync(outputPath), false);
  assert.equal(fs.existsSync(thumbnailPath), false);
});
