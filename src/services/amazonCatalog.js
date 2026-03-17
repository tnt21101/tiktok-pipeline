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

  async function importProduct({ brand, input }) {
    const asin = extractAsinFromInput(input);
    if (!asin) {
      throw new AppError(400, `Could not find a valid ASIN in "${input}".`, {
        code: "invalid_asin"
      });
    }

    const marketplace = inferMarketplace(input);
    const html = await readHtml({ asin, marketplace, input });
    const title = extractTitle(html);
    const galleryImages = extractImageUrls(html);
    const benefits = extractBulletList(html);
    const description = extractDescription(html);

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
      productUrl: `https://www.amazon.${marketplace === "com" ? "com" : marketplace}/dp/${asin}`,
      imageUrl: galleryImages[0] || "",
      galleryImages,
      benefits,
      description,
      sourceData: {
        source: "amazon_listing",
        importedFrom: String(input || ""),
        importedAt: new Date().toISOString()
      }
    };
  }

  return {
    splitImportInputs,
    importProduct
  };
}

module.exports = {
  createAmazonCatalogService,
  splitImportInputs,
  extractAsinFromInput
};
