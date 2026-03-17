const test = require("node:test");
const assert = require("node:assert/strict");
const { createAmazonCatalogService } = require("../../src/services/amazonCatalog");

test("amazon catalog imports always fetch the canonical Amazon product URL", async () => {
  const requestedUrls = [];
  const service = createAmazonCatalogService({
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      return {
        ok: true,
        async text() {
          return `
            <html>
              <title>Example Product - Amazon.com</title>
              <span id="productTitle">Example Product</span>
              <div id="feature-bullets">
                <li><span class="a-list-item">Primary benefit</span></li>
              </div>
              <meta name="description" content="Example description" />
              <img src="https://example.com/product.jpg" />
            </html>
          `;
        }
      };
    }
  });

  const imported = await service.importProduct({
    brand: { id: "tnt", name: "TNT" },
    input: "https://internal.example.com/redirect?asin=B0EXAMP123"
  });

  assert.equal(requestedUrls[0], "https://www.amazon.com/dp/B0EXAMP123");
  assert.equal(imported.asin, "B0EXAMP123");
  assert.equal(imported.productUrl, "https://www.amazon.com/dp/B0EXAMP123");
});
