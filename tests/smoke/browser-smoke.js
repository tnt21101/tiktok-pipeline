const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startTestServer, writeTinyPng } = require("../support/runtime-fixtures");

async function uploadFixture(baseUrl, imagePath, authHeader = "") {
  const form = new FormData();
  form.set("image", new Blob([fs.readFileSync(imagePath)], { type: "image/png" }), path.basename(imagePath));

  const response = await fetch(`${baseUrl}/api/upload`, {
    method: "POST",
    headers: authHeader ? { Authorization: authHeader } : {},
    body: form
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  return payload.imageUrl;
}

async function seedStoryboardFinalOutput(baseUrl, imageUrl, authHeader = "") {
  const headers = {
    "Content-Type": "application/json"
  };
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  const sequenceGroupId = "smoke-storyboard-group";
  const topic = "Smoke storyboard final output";
  const createClip = async (sequenceIndex) => {
    const response = await fetch(`${baseUrl}/api/jobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        brandId: "tnt",
        pipeline: "edu",
        imageUrl,
        fields: {
          topic,
          sequenceCount: 2,
          sequenceIndex,
          sequenceGroupId
        }
      })
    });
    const payload = await response.json();
    assert.equal(response.status, 201);
    return payload.job;
  };

  const first = await createClip(1);
  const second = await createClip(2);

  const finalizeResponse = await fetch(`${baseUrl}/api/jobs/sequence/finalize`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jobIds: [first.id, second.id],
      videoUrl: "https://example.com/final-storyboard-smoke.mp4",
      thumbnailUrl: "https://example.com/final-storyboard-smoke.png",
      requestedSegments: 2,
      sourceSegments: 2,
      merged: true
    })
  });
  const finalized = await finalizeResponse.json();
  assert.equal(finalizeResponse.status, 200);
  return {
    topic,
    job: finalized.job
  };
}

async function deleteAllJobs(baseUrl, authHeader = "") {
  const headers = authHeader ? { Authorization: authHeader } : {};
  const response = await fetch(`${baseUrl}/api/jobs?limit=100`, {
    headers
  });
  const payload = await response.json();
  assert.equal(response.status, 200);

  for (const job of payload.jobs || []) {
    const deleteResponse = await fetch(`${baseUrl}/api/jobs/${job.id}`, {
      method: "DELETE",
      headers
    });
    assert.ok(
      deleteResponse.status === 200 || deleteResponse.status === 404,
      `expected delete of ${job.id} to return 200 or 404, received ${deleteResponse.status}`
    );
  }
}

async function main() {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (error) {
    console.error("playwright is not installed. Run `npm install` before `npm run test:smoke`.");
    process.exit(1);
  }

  let smokePollCount = 0;
  const server = await startTestServer({
    useProjectPublicDir: true,
    basicAuthUser: "operator",
    basicAuthPassword: "secret",
    kieService: {
      speechCount: 0,
      videoCount: 0,
      async generateVideo() {
        this.videoCount += 1;
        return {
          taskId: `smoke-task-${this.videoCount}`,
          status: "queueing",
          videoUrl: null
        };
      },
      async pollStatus() {
        smokePollCount += 1;
        if (smokePollCount < 3) {
          return {
            status: "generating",
            videoUrl: null,
            error: null
          };
        }
        return {
          status: "success",
          videoUrl: `https://example.com/smoke-${smokePollCount}.mp4`,
          error: null
        };
      }
    },
    elevenLabsService: {
      speechCount: 0,
      async generateVoiceover() {
        this.speechCount += 1;
        return {
          taskId: `elevenlabs-${this.speechCount}`,
          status: "success",
          audioUrl: `https://example.com/audio-${this.speechCount}.mp3`,
          durationSeconds: 4.2
        };
      }
    }
  });

  const imagePath = path.join(server.root, "smoke.png");
  writeTinyPng(imagePath);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    httpCredentials: server.auth
  });
  const page = await context.newPage();

  try {
    await fetch(`${server.baseUrl}/api/brands/tnt/products/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: server.authHeader
      },
      body: JSON.stringify({
        rawText: "B0EXAMP123"
      })
    });

    await page.goto(server.baseUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => {
      return document.getElementById("overviewMode") && !document.getElementById("overviewMode").classList.contains("is-hidden");
    });
    await page.waitForFunction(() => {
      return document.documentElement.scrollWidth <= window.innerWidth + 1;
    });
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.waitForFunction(() => {
      return document.getElementById("singleMode") && !document.getElementById("singleMode").classList.contains("is-hidden");
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => {
      return document.documentElement.scrollWidth <= window.innerWidth + 1;
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const reducedMotionDuration = await page.evaluate(() => {
      return getComputedStyle(document.querySelector(".screen-card")).transitionDuration;
    });
    assert.match(reducedMotionDuration, /0\.001s|1ms/);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setInputFiles("#singleFileInput", imagePath);
    await page.waitForFunction(() => {
      return document.getElementById("singleUploadZone")?.classList.contains("has-image");
    });
    await page.waitForFunction(() => {
      return !document.getElementById("singleUploadRemoveButton")?.classList.contains("is-hidden");
    });
    assert.equal(await page.locator("#runButton").isDisabled(), false);
    await page.click("#singleUploadRemoveButton");
    await page.waitForFunction(() => {
      return !document.getElementById("singleUploadZone")?.classList.contains("has-image");
    });
    await page.waitForFunction(() => {
      return document.getElementById("singleUploadRemoveButton")?.classList.contains("is-hidden");
    });
    assert.equal(await page.locator("#runButton").isDisabled(), true);

    await page.click("#creationModeSlides");
    await page.selectOption("#slidesCount", "1");
    await page.fill("#edu-topic", "Smoke slide topic");
    await page.click("#runButton");
    await page.waitForFunction(() => {
      return document.getElementById("outputsMode") && !document.getElementById("outputsMode").classList.contains("is-hidden");
    });
    await page.waitForFunction(() => {
      const text = document.getElementById("status-video")?.textContent || "";
      return text.includes("Video ready") && Boolean(document.querySelector("#videoWrap video"));
    });

    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.click("#creationModeClip");
    await page.click("#pipeline-product");
    await page.click("#pipeline-edu");
    await page.click("#creationModeStoryboard");
    await page.waitForFunction(() => {
      const fields = document.getElementById("singleStoryboardFields");
      const count = document.getElementById("singleVideoCount");
      const hint = document.getElementById("singleSequenceHint")?.textContent || "";
      return fields && !fields.classList.contains("is-hidden") && count && count.value === "1" && hint.includes("one storyboard clip");
    });
    await page.selectOption("#singleVideoCount", "2");
    await page.click("#creationModeClip");
    await page.waitForFunction(() => {
      const fields = document.getElementById("singleStoryboardFields");
      return fields && fields.classList.contains("is-hidden");
    });
    await page.selectOption("#brandSelect", "tnt");
    await page.click("#pipeline-product");
    await page.waitForFunction(() => {
      return (document.getElementById("product-catalog-select")?.options?.length || 0) > 1;
    });
    await page.selectOption("#product-catalog-select", { index: 1 });
    await page.waitForFunction(() => {
      return !document.getElementById("runButton")?.disabled;
    });
    await page.click("#pipeline-edu");
    await page.setInputFiles("#singleFileInput", imagePath);
    await page.waitForFunction(() => {
      return document.getElementById("singleUploadZone")?.classList.contains("has-image");
    });
    await page.click("#creationModeStoryboard");
    await page.selectOption("#singleVideoCount", "2");
    await page.fill("#edu-topic", "Smoke storyboard topic");
    await page.click("#runButton");
    await page.waitForFunction(() => {
      const outputsVisible = document.getElementById("outputsMode") && !document.getElementById("outputsMode").classList.contains("is-hidden");
      const video = document.querySelector("#videoWrap video");
      const wrapText = document.getElementById("videoWrap")?.textContent || "";
      return outputsVisible && Boolean(video) && wrapText.toLowerCase().includes("stitched");
    });

    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.click("#creationModeNarrated");
    assert.equal(await page.locator("#narratedTargetLength").count(), 0);
    assert.equal(await page.locator("#eduLengthField").count(), 0);
    await page.waitForFunction(() => {
      return (document.getElementById("stepPromptTitle")?.textContent || "").includes("B-roll prompts");
    });
    await page.waitForFunction(() => {
      const promptCopy = document.getElementById("status-prompt")?.textContent || "";
      const scriptTitle = document.getElementById("stepScriptTitle")?.textContent || "";
      return promptCopy.includes("Waiting for narration draft") && scriptTitle.includes("Narration draft");
    });

    await page.selectOption("#generationFallbackProfile", "veo31_image");
    await page.fill("#edu-topic", "Smoke topic");
    await page.selectOption("#narratedSegmentCount", "1");
    await page.selectOption("#narratedTemplate", "did_you_know_quick_explainer");
    await page.fill("#narratedHookAngle", "why the small detail matters");
    await page.click("#runButton");
    await page.waitForFunction(() => {
      return document.getElementById("outputsMode") && !document.getElementById("outputsMode").classList.contains("is-hidden");
    });
    await page.waitForFunction(() => {
      const text = document.getElementById("status-video")?.textContent || "";
      return text.includes("Video ready");
    });
    await page.waitForFunction(() => {
      return Boolean(document.querySelector("#videoWrap video"));
    });

    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.click("#workspaceModeBatch");
    await page.selectOption("#batchGenerationProfile", "veo31_reference");
    await page.selectOption("#batchGenerationFallbackProfile", "seedance15pro");
    await page.waitForFunction(() => {
      return !document.getElementById("batchPresenterSecondaryWrap")?.classList.contains("is-hidden");
    });
    await page.setInputFiles("#batchPresenterInput", imagePath);
    await page.setInputFiles("#batchPresenterSecondaryInput", imagePath);
    await page.setInputFiles("#batchProductInput", imagePath);
    await page.setInputFiles("#batchProductSecondaryInput", imagePath);
    await page.fill("#batch-edu-count", "1");
    await page.fill("#batch-comedy-count", "1");
    await page.fill("#batch-product-count", "1");
    await page.getByRole("button", { name: "Generate topics", exact: true }).click();
    await page.waitForFunction(() => {
      return Boolean(document.getElementById("batch-edu-topics")?.value.trim());
    });
    await page.getByRole("button", { name: "Generate scenarios", exact: true }).click();
    await page.waitForFunction(() => {
      return Boolean(document.getElementById("batch-comedy-scenarios")?.value.trim());
    });
    await page.getByRole("button", { name: "Generate product angles", exact: true }).click();
    await page.waitForFunction(() => {
      return Boolean(document.getElementById("batch-products")?.value.trim());
    });
    await page.click("#batchRunButton");
    await page.waitForFunction(() => {
      return !document.getElementById("batchPauseButton")?.disabled;
    });
    await page.click("#batchPauseButton");
    await page.waitForFunction(() => {
      return document.getElementById("batchPauseButton")?.textContent?.includes("Resume");
    });
    await page.click("#batchPauseButton");
    await page.waitForFunction(() => {
      return document.getElementById("batchPauseButton")?.textContent?.includes("Pause");
    });

    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll(".status-chip")).some((element) =>
        (element.textContent || "").toLowerCase().includes("ready")
      );
    });

    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll("#batchCompiledOutputs a")).some((element) =>
        element.textContent.includes("Open final video")
      );
    });

    await page.getByRole("button", { name: "Queue", exact: true }).click();
    await page.fill("#queueSearchInput", "Smoke slide topic");
    await page.locator("#runsList .workspace-job").filter({ hasText: "Smoke slide topic" }).first()
      .getByRole("button", { name: "Open in Create" }).click();
    await page.waitForFunction(() => {
      return document.getElementById("creationModeSlides")?.classList.contains("is-active")
        && document.getElementById("slidesDeckTitleInput")?.value === "Smoke slide topic"
        && document.getElementById("edu-topic")?.value === "Smoke slide topic";
    });

    await deleteAllJobs(server.baseUrl, server.authHeader);
    const storyboardImageUrl = await uploadFixture(server.baseUrl, imagePath, server.authHeader);
    const storyboardSeed = await seedStoryboardFinalOutput(server.baseUrl, storyboardImageUrl, server.authHeader);

    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction((topic) => {
      const matches = Array.from(document.querySelectorAll("#historyList .workspace-job"))
        .filter((element) => (element.textContent || "").includes(topic));
      return matches.length === 1;
    }, storyboardSeed.topic);

    await page.getByRole("button", { name: "Queue", exact: true }).click();
    await page.waitForFunction((topic) => {
      const matches = Array.from(document.querySelectorAll("#runsList .workspace-job"))
        .filter((element) => (element.textContent || "").includes(topic));
      return matches.length === 1
        && matches[0].textContent.includes("stitched");
    }, storyboardSeed.topic);
  } finally {
    await context.close();
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
