const assert = require("node:assert/strict");
const path = require("node:path");
const { startTestServer, writeTinyPng } = require("../support/runtime-fixtures");

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
      },
      async generateSpeech() {
        this.speechCount += 1;
        return {
          taskId: `speech-${this.speechCount}`
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
    await page.click("#creationModeSlides");
    await page.fill("#edu-topic", "Smoke slide topic");
    await page.click("#runButton");
    await page.waitForFunction(() => {
      return (document.getElementById("slidesDraftList")?.textContent || "").includes("Slide 1");
    });
    await page.fill("#slidesDeckTitleInput", "Smoke Slides Deck");
    await page.locator('[id^="slide-headline-"]').first().fill("Smoke slide headline");
    await page.click("#saveSlidesButton");
    await page.waitForFunction(() => {
      return (document.getElementById("createSummaryMeta")?.textContent || "").includes("Slides");
    });
    await page.click("#renderSlidesVideoButton");
    await page.waitForFunction(() => {
      return Boolean(document.querySelector("#videoWrap video"));
    });
    await page.click("#creationModeClip");
    await page.click("#pipeline-product");
    await page.locator("#historyList .history-item").first().getByRole("button", { name: "View details" }).click();
    await page.waitForFunction(() => {
      return document.getElementById("creationModeSlides")?.classList.contains("is-active")
        && document.getElementById("slidesDeckTitleInput")?.value === "Smoke Slides Deck"
        && document.getElementById("edu-topic")?.value === "Smoke slide topic";
    });
    await page.click("#pipeline-edu");
    await page.click("#creationModeStoryboard");
    await page.waitForFunction(() => {
      const fields = document.getElementById("singleStoryboardFields");
      const count = document.getElementById("singleVideoCount");
      return fields && !fields.classList.contains("is-hidden") && count && count.value === "3";
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
    await page.click("#creationModeNarrated");

    await page.selectOption("#generationFallbackProfile", "veo31_image");
    await page.fill("#edu-topic", "Smoke topic");
    await page.selectOption("#narratedTemplate", "did_you_know_quick_explainer");
    await page.fill("#narratedHookAngle", "why the small detail matters");
    await page.click("#runButton");

    await page.waitForFunction(() => {
      return (document.getElementById("narratedSegmentsList")?.textContent || "").includes("Part 1");
    });

    const scriptText = await page.locator("#content-script").textContent();
    assert.match(scriptText || "", /Part 1/);

    await page.click("#generateNarratedVoiceButton");
    await page.waitForFunction(() => {
      return (document.getElementById("narratedSegmentsStatus")?.textContent || "").includes("Voice-over is ready");
    });

    await page.setInputFiles("#singleFileInput", imagePath);
    await page.waitForFunction(() => {
      return !document.getElementById("generateNarratedBrollPromptsButton")?.disabled;
    });
    await page.click("#generateNarratedBrollPromptsButton");
    await page.waitForFunction(() => {
      return (document.getElementById("narratedSegmentsList")?.textContent || "").includes("Vertical 9:16");
    });

    await page.click("#renderNarratedBrollButton");
    await page.waitForFunction(() => {
      return (document.getElementById("narratedSegmentsStatus")?.textContent || "").includes("Compose");
    });

    await page.click("#composeNarratedVideoButton");
    await page.waitForFunction(() => {
      const text = document.getElementById("status-video")?.textContent || "";
      return text.includes("Video ready");
    });
    await page.waitForSelector('img[alt="Cover preview"]');

    await page.getByRole("button", { name: "Batch" }).click();
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
