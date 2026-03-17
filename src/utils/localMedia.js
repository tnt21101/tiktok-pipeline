const fs = require("node:fs");
const path = require("node:path");

function resolveWithinDirectory(rootDir, relativePath) {
  const normalizedRoot = path.resolve(rootDir);
  const targetPath = path.resolve(normalizedRoot, relativePath);
  const relativeToRoot = path.relative(normalizedRoot, targetPath);
  if (!relativeToRoot || relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    return null;
  }

  return targetPath;
}

function resolveLocalMediaPath(mediaUrl, options = {}) {
  const raw = String(mediaUrl || "").trim();
  if (!raw || !options.baseUrl) {
    return null;
  }

  try {
    const baseUrl = new URL(options.baseUrl);
    const parsed = new URL(raw, baseUrl);
    if (parsed.origin !== baseUrl.origin) {
      return null;
    }

    if (parsed.pathname === "/uploads" || parsed.pathname.startsWith("/uploads/")) {
      const relativePath = decodeURIComponent(parsed.pathname.replace(/^\/uploads\/?/, ""));
      return resolveWithinDirectory(options.uploadsDir, relativePath);
    }

    if (parsed.pathname === "/output" || parsed.pathname.startsWith("/output/")) {
      const relativePath = decodeURIComponent(parsed.pathname.replace(/^\/output\/?/, ""));
      return resolveWithinDirectory(options.outputDir, relativePath);
    }

    return null;
  } catch {
    return null;
  }
}

function collectJobMediaUrls(job = {}, segments = [], slides = []) {
  const urls = new Set();

  if (job.sourceImageUrl) {
    urls.add(job.sourceImageUrl);
  }

  if (job.videoUrl) {
    urls.add(job.videoUrl);
  }

  if (job.thumbnailUrl) {
    urls.add(job.thumbnailUrl);
  }

  const imageUrls = Array.isArray(job.providerConfig?.generationConfig?.imageUrls)
    ? job.providerConfig.generationConfig.imageUrls
    : [];
  for (const imageUrl of imageUrls) {
    if (imageUrl) {
      urls.add(imageUrl);
    }
  }

  for (const segment of segments) {
    if (segment?.audioUrl) {
      urls.add(segment.audioUrl);
    }

    if (segment?.videoUrl) {
      urls.add(segment.videoUrl);
    }
  }

  for (const slide of slides) {
    if (slide?.imageUrl) {
      urls.add(slide.imageUrl);
    }
  }

  return Array.from(urls);
}

function collectReferencedLocalMediaPaths(options = {}) {
  const paths = new Set();
  const jobs = Array.isArray(options.jobs) ? options.jobs : [];
  const segmentsByJobId = options.segmentsByJobId || new Map();
  const slidesByJobId = options.slidesByJobId || new Map();

  for (const job of jobs) {
    const segments = Array.isArray(segmentsByJobId.get(job.id)) ? segmentsByJobId.get(job.id) : [];
    const slides = Array.isArray(slidesByJobId.get(job.id)) ? slidesByJobId.get(job.id) : [];
    for (const mediaUrl of collectJobMediaUrls(job, segments, slides)) {
      const mediaPath = resolveLocalMediaPath(mediaUrl, options);
      if (mediaPath) {
        paths.add(mediaPath);
      }
    }
  }

  return paths;
}

function removeLocalMediaFiles(filePaths = []) {
  for (const filePath of filePaths) {
    if (!filePath) {
      continue;
    }

    try {
      fs.rmSync(filePath, { force: true });
    } catch {
      // Best-effort cleanup only.
    }
  }
}

module.exports = {
  resolveLocalMediaPath,
  collectJobMediaUrls,
  collectReferencedLocalMediaPaths,
  removeLocalMediaFiles
};
