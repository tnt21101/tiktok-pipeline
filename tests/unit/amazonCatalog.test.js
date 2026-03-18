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

test("amazon catalog fetchListingData extracts category, brand, review themes, and imagery hints", async () => {
  const service = createAmazonCatalogService({
    fetchImpl: async () => ({
      ok: true,
      async text() {
        return `
          <html>
            <title>Velocity Recovery Tool - Amazon.com</title>
            <a id="bylineInfo">Visit the Velocity Labs Store</a>
            <div id="wayfinding-breadcrumbs_feature_div">
              <ul>
                <li><a class="a-link-normal a-color-tertiary">Sports &amp; Outdoors</a></li>
                <li><a class="a-link-normal a-color-tertiary">Fitness</a></li>
              </ul>
            </div>
            <span id="productTitle">Velocity Recovery Tool</span>
            <div id="feature-bullets">
              <li><span class="a-list-item">Portable workout recovery</span></li>
              <li><span class="a-list-item">Quick setup for busy mornings</span></li>
            </div>
            <div id="productDescription">Designed for fitness recovery at home or after the gym.</div>
            <div data-hook="review-body"><span>Easy to use after training and fits in my gym bag.</span></div>
            <img src="https://example.com/recovery-tool.jpg" />
          </html>
        `;
      }
    })
  });

  const listing = await service.fetchListingData({
    input: "https://www.amazon.com/dp/B0REVIEW12"
  });

  assert.equal(listing.brandName, "Velocity Labs");
  assert.equal(listing.category, "Sports & Outdoors > Fitness");
  assert.match(listing.reviewThemes[0], /Easy to use/i);
  assert.ok(listing.imageryHints.length > 0);
});
