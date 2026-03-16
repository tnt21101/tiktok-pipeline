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
    await page.goto(server.baseUrl, { waitUntil: "networkidle" });

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
    await page.setInputFiles("#batchPresenterInput", imagePath);
    await page.setInputFiles("#batchProductInput", imagePath);
    await page.fill("#batch-edu-count", "1");
    await page.fill("#batch-comedy-count", "0");
    await page.fill("#batch-product-count", "1");
    await page.click("#batchRunButton");

    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll(".status-chip")).some((element) =>
        element.textContent.includes("ready")
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
