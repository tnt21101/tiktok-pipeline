const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { startTestServer, waitFor, writeTinyPng } = require("../support/runtime-fixtures");

async function uploadFixture(baseUrl, root) {
  const imagePath = path.join(root, "tiny.png");
  writeTinyPng(imagePath);
  const form = new FormData();
  form.append("image", new Blob([fs.readFileSync(imagePath)], { type: "image/png" }), "tiny.png");

  const response = await fetch(`${baseUrl}/api/upload`, {
    method: "POST",
    body: form
  });

  const payload = await response.json();
  return payload.imageUrl;
}

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

  const profiles = await fetch(`${server.baseUrl}/api/generation/profiles`).then((response) => response.json());
  assert.ok(Array.isArray(profiles.profiles));
  assert.ok(profiles.profiles.some((profile) => profile.id === "sora2_image"));
  assert.ok(profiles.profiles.some((profile) => profile.id === "seedance15pro"));

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
  assert.match(health.warnings.join(" "), /FAL_KEY is not configured/);

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
