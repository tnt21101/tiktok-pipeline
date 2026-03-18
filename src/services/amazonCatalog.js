const { AppError } = require("../utils/errors");

function decodeHtml(value) {
  return String(value || "")
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\"/g, "\"")
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}

function stripHtml(value) {
  return decodeHtml(String(value || ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function maybeImageUrl(value) {
  if (!value) {
    return null;
  }

  const normalized = decodeHtml(value).trim();
  if (!/^https?:\/\//i.test(normalized)) {
    return null;
  }

  if (!/\.(jpg|jpeg|png|webp)(\?|$)/i.test(normalized)) {
    return null;
  }

  return normalized;
}

function extractAsinFromInput(input) {
  const value = String(input || "").trim();
  if (!value) {
    return "";
  }

  const direct = value.toUpperCase().match(/\b[A-Z0-9]{10}\b/);
  if (direct) {
    return direct[0];
  }

  return "";
}

function inferMarketplace(input) {
  const value = String(input || "").toLowerCase();
  const match = value.match(/amazon\.([a-z.]{2,10})/i);
  if (!match) {
    return "com";
  }

  return match[1].replace(/^co\./, "");
}

function extractImageUrls(html) {
  const urls = new Set();

  const dynamicAttrRegex = /data-a-dynamic-image="([^"]+)"/g;
  for (const match of html.matchAll(dynamicAttrRegex)) {
    const raw = decodeHtml(match[1]);
    try {
      const parsed = JSON.parse(raw);
      Object.keys(parsed || {}).forEach((key) => {
        const url = maybeImageUrl(key);
        if (url) {
          urls.add(url);
        }
      });
    } catch {
      // ignore invalid embedded JSON
    }
  }

  const keyRegexes = [
    /"hiRes"\s*:\s*"([^"]+)"/g,
    /"large"\s*:\s*"([^"]+)"/g,
    /"mainUrl"\s*:\s*"([^"]+)"/g,
    /"landingImageUrl"\s*:\s*"([^"]+)"/g,
    /"thumb"\s*:\s*"([^"]+)"/g
  ];

  for (const regex of keyRegexes) {
    for (const match of html.matchAll(regex)) {
      const url = maybeImageUrl(match[1]);
      if (url) {
        urls.add(url);
      }
    }
  }

  const broadRegex = /(https?:\\\/\\\/[^"'\\s]+\.(?:jpg|jpeg|png|webp)[^"'\\s]*)/gi;
  for (const match of html.matchAll(broadRegex)) {
    const url = maybeImageUrl(match[1]);
    if (url) {
      urls.add(url);
    }
  }

  return Array.from(urls);
}

function extractTitle(html) {
  const patterns = [
    /<span[^>]+id="productTitle"[^>]*>([\s\S]*?)<\/span>/i,
    /<title>([\s\S]*?)<\/title>/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      const title = stripHtml(match[1]).replace(/\s+-\s+Amazon.*$/i, "").trim();
      if (title) {
        return title;
      }
    }
  }

  return "";
}

function extractBulletList(html) {
  const bulletsBlock = html.match(/<div[^>]+id="feature-bullets"[^>]*>([\s\S]*?)<\/div>/i);
  const source = bulletsBlock ? bulletsBlock[1] : html;
  const results = [];

  for (const match of source.matchAll(/<li[\s\S]*?<span[^>]*class="a-list-item"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/li>/gi)) {
    const text = stripHtml(match[1]);
    if (text && !text.toLowerCase().includes("make sure this fits")) {
      results.push(text);
    }
  }

  return Array.from(new Set(results)).slice(0, 8);
}

function extractDescription(html) {
  const patterns = [
    /<div[^>]+id="productDescription"[^>]*>([\s\S]*?)<\/div>/i,
    /<meta\s+name="description"\s+content="([^"]+)"/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      const text = stripHtml(match[1]);
      if (text) {
        return text;
      }
    }
  }

  return "";
}

function extractCategory(html) {
  const breadcrumbsBlock = html.match(/<div[^>]+id="wayfinding-breadcrumbs_feature_div"[^>]*>([\s\S]*?)<\/div>/i);
  const source = breadcrumbsBlock ? breadcrumbsBlock[1] : html;
  const values = [];

  for (const match of source.matchAll(/<a[^>]*class="[^"]*a-link-normal[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = stripHtml(match[1]);
    if (text && !/^visit/i.test(text)) {
      values.push(text);
    }
  }

  if (values.length > 0) {
    return Array.from(new Set(values)).slice(0, 4).join(" > ");
  }

  const metaMatch = html.match(/"category"\s*:\s*"([^"]+)"/i);
  return metaMatch ? stripHtml(metaMatch[1]) : "";
}

function extractBrandName(html) {
  const patterns = [
    /<a[^>]+id="bylineInfo"[^>]*>([\s\S]*?)<\/a>/i,
    /<span[^>]+id="brand"[^>]*>([\s\S]*?)<\/span>/i,
    /<meta\s+name="brand"\s+content="([^"]+)"/i,
    /"brand"\s*:\s*"([^"]+)"/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) {
      continue;
    }

    const value = stripHtml(match[1])
      .replace(/^Visit the\s+/i, "")
      .replace(/\s+Store$/i, "")
      .replace(/^Brand:\s*/i, "")
      .trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function summarizeReviewText(value) {
  const text = stripHtml(value);
  if (!text) {
    return "";
  }

  const firstSentence = text.split(/[.!?]/)[0] || text;
  return firstSentence
    .split(/\s+/)
    .slice(0, 10)
    .join(" ")
    .trim();
}

function extractReviewThemes(html) {
  const reviews = [];
  const patterns = [
    /data-hook="review-body"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/gi,
    /"reviewText"\s*:\s*"([^"]+)"/gi
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const summary = summarizeReviewText(match[1]);
      if (summary) {
        reviews.push(summary);
      }
    }
  }

  return Array.from(new Set(reviews)).slice(0, 5);
}

function inferImageryHints(details = {}) {
  const source = `${details.title || ""} ${(details.bullets || []).join(" ")} ${details.description || ""}`.toLowerCase();
  const hints = [];

  if (/gym|fitness|workout|training|recovery/.test(source)) {
    hints.push("Active lifestyle routine");
    hints.push("Close-up action demo");
  }
  if (/skin|hair|beauty|serum|cleanser|moistur|groom/.test(source)) {
    hints.push("Mirror-side personal care setup");
    hints.push("Texture or application close-up");
  }
  if (/kitchen|household|clean|laundry|home/.test(source)) {
    hints.push("Everyday home environment");
    hints.push("Before-and-after practical use case");
  }
  if (/travel|portable|bag|desk|office|commute/.test(source)) {
    hints.push("On-the-go lifestyle setting");
    hints.push("Desk, bag, or counter placement shot");
  }
  if (Array.isArray(details.galleryImages) && details.galleryImages.length > 1) {
    hints.push("Multiple product-angle stills");
  }

  return Array.from(new Set(hints)).slice(0, 4);
}

function splitImportInputs(input) {
  if (Array.isArray(input)) {
    return input.map((value) => String(value || "").trim()).filter(Boolean);
  }

  return String(input || "")
    .split(/\r?\n|,/)
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function createAmazonCatalogService(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const logger = options.logger || { warn() {}, info() {} };

  async function readHtml({ asin, marketplace, input }) {
    const domain = marketplace && marketplace !== "com" ? `amazon.${marketplace}` : "amazon.com";
    const inputValue = String(input || "").trim();
    const url = `https://www.${domain}/dp/${encodeURIComponent(asin)}`;

    if (/^https?:\/\//i.test(inputValue) && !/amazon\./i.test(inputValue)) {
      logger.warn("amazon_import_non_amazon_url_normalized", {
        asin,
        input: inputValue,
        normalizedUrl: url
      });
    }

    const response = await fetchImpl(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml"
      }
    });

    if (!response.ok) {
      throw new AppError(502, `Amazon import failed for ${asin} (${response.status}).`, {
        code: "amazon_import_failed"
      });
    }

    return response.text();
  }

  async function fetchListingData({ asin: providedAsin, productUrl = "", input = "" } = {}) {
    const seed = String(productUrl || input || providedAsin || "").trim();
    const asin = extractAsinFromInput(seed || providedAsin);
    if (!asin) {
      throw new AppError(400, `Could not find a valid ASIN in "${seed || providedAsin || ""}".`, {
        code: "invalid_asin"
      });
    }

    const marketplace = inferMarketplace(seed || providedAsin);
    const html = await readHtml({ asin, marketplace, input: seed || providedAsin });
    const title = extractTitle(html);
    const galleryImages = extractImageUrls(html);
    const bullets = extractBulletList(html);
    const description = extractDescription(html);
    const category = extractCategory(html);
    const brandName = extractBrandName(html);
    const reviewThemes = extractReviewThemes(html);

    return {
      asin,
      marketplace,
      title,
      productUrl: `https://www.amazon.${marketplace === "com" ? "com" : marketplace}/dp/${asin}`,
      imageUrl: galleryImages[0] || "",
      galleryImages,
      bullets,
      benefits: bullets,
      description,
      category,
      brandName,
      reviewThemes,
      imageryHints: inferImageryHints({
        title,
        bullets,
        description,
        galleryImages
      }),
      sourceData: {
        source: "amazon_listing",
        importedFrom: seed || asin,
        importedAt: new Date().toISOString()
      }
    };
  }

  async function importProduct({ brand, input }) {
    const details = await fetchListingData({ input });
    const {
      asin,
      marketplace,
      title,
      productUrl,
      imageUrl,
      galleryImages,
      benefits,
      description,
      sourceData
    } = details;

    if (!title && galleryImages.length === 0) {
      logger.warn("amazon_product_import_empty", {
        asin,
        brandId: brand?.id || "",
        input: String(input || "")
      });
    }

    return {
      asin,
      marketplace,
      title: title || `${brand?.name || "Brand"} product ${asin}`,
      productUrl,
      imageUrl: imageUrl || "",
      galleryImages,
      benefits,
      description,
      sourceData
    };
  }

  return {
    fetchListingData,
    splitImportInputs,
    importProduct
  };
}

module.exports = {
  createAmazonCatalogService,
  splitImportInputs,
  extractAsinFromInput
};
