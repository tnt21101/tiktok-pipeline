const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
      fields: {
        productName: "TNT Sweat Cream",
        benefit: "Maximum sweat activation"
      }
    })
  }).then((response) => response.json());

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
