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
    kieService: {
      async generateVideo() {
        return {
          taskId: "smoke-task",
          status: "success",
          videoUrl: "https://example.com/smoke.mp4"
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
          videoUrl: "https://example.com/smoke.mp4",
          error: null
        };
      }
    }
  });

  const imagePath = path.join(server.root, "smoke.png");
  writeTinyPng(imagePath);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await fetch(`${server.baseUrl}/api/brands/tnt/products/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawText: "B0EXAMP123"
      })
    });

    await page.goto(server.baseUrl, { waitUntil: "networkidle" });
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

    await page.selectOption("#generationFallbackProfile", "veo31_image");
    await page.setInputFiles("#singleFileInput", imagePath);
    await page.fill("#edu-topic", "Smoke topic");
    await page.click("#runButton");

    await page.waitForFunction(() => {
      const text = document.getElementById("status-video")?.textContent || "";
      return text.includes("Video ready");
    });

    const scriptText = await page.locator("#content-script").textContent();
    assert.match(scriptText || "", /HOOK:/);

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
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
