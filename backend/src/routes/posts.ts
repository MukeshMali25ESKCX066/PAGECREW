import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { copyFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { extname, resolve } from "node:path";
import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { getWorkspaceScopeId } from "./auth.js";
import { pageAccessTokens, pageTokenKey } from "./pages.js";
import { PublishMedia, publishToPage } from "../services/meta.js";
const router = Router();

const mediaDirectory = resolve(__dirname, "../../uploads");
mkdirSync(mediaDirectory, { recursive: true });

const acceptedMediaTypes = new Set(["image/jpeg", "image/png", "video/mp4", "video/quicktime"]);
const mediaExtensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov"
};

const upload = multer({
  storage: multer.diskStorage({
    destination: mediaDirectory,
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${mediaExtensions[file.mimetype] || ""}`)
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!acceptedMediaTypes.has(file.mimetype)) {
      callback(new Error("Choose a JPG, PNG, MP4, or MOV file."));
      return;
    }
    callback(null, true);
  }
});

function handleMediaUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("media")(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    const isTooLarge = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE";
    res.status(isTooLarge ? 413 : 400).json({
      error: isTooLarge ? "Media files must be 50 MB or smaller." : error instanceof Error ? error.message : "Media upload failed."
    });
  });
}

type StoredMedia = PublishMedia & { originalName: string };
type Job = {
  id: string; content: string; pageIds: string[]; scheduledAt: string;
  ownerScopeId: string;
  status: "draft"|"scheduled"|"published"|"failed"|"partial";
  media?: StoredMedia;
  pageErrors?: Record<string, string>;
};

export const jobs: Job[] = [];

function publicJob({ media, ownerScopeId: _ownerScopeId, ...job }: Job) {
  return {
    ...job,
    ...(media ? { media: { mimeType: media.mimeType, originalName: media.originalName } } : {})
  };
}

function requireWorkspaceScope(req: Request, res: Response, next: NextFunction) {
  void getWorkspaceScopeId(req).then((workspaceScopeId) => {
    if (!workspaceScopeId) {
      res.status(401).json({ error: "Approved PageCrew login is required." });
      return;
    }
    res.locals.workspaceScopeId = workspaceScopeId;
    next();
  }).catch(next);
}

function getRequiredWorkspaceScope(res: Response) {
  return res.locals.workspaceScopeId as string;
}

async function removeUploadedMedia(media?: StoredMedia) {
  if (media) await unlink(media.path).catch(() => undefined);
}

function isPublicAddress(address: string) {
  const version = isIP(address);
  if (version === 4) {
    const [first, second, third] = address.split(".").map(Number);
    return !(first === 0 || first === 10 || first === 127 || first >= 224 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 192 && second === 0 && third === 0) ||
      (first === 198 && (second === 18 || second === 19 || second === 51)) ||
      (first === 203 && second === 0 && third === 113) ||
      (first === 100 && second >= 64 && second <= 127));
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    return !(normalized === "::" || normalized === "::1" || normalized.startsWith("::ffff:") ||
      normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") ||
      normalized.startsWith("ff") || normalized.startsWith("2001:db8:"));
  }
  return false;
}

async function isPublicHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (isIP(host)) return isPublicAddress(host);
  try {
    const addresses = await lookup(host, {all: true, verbatim: true});
    return addresses.length > 0 && addresses.every(({address}) => isPublicAddress(address));
  } catch {
    return false;
  }
}

async function fetchPreviewHtml(startUrl: URL) {
  let url = startUrl;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (!(url.protocol === "http:" || url.protocol === "https:") || url.username || url.password || !await isPublicHost(url.hostname)) {
      throw new Error("Only public web links can be previewed.");
    }
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(6000),
      headers: {accept: "text/html", "user-agent": "SocialPilotHubLinkPreview/1.0"}
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("The link redirected too many times.");
      url = new URL(location, url);
      continue;
    }
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
      throw new Error("This link does not provide a page preview.");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("The link preview is empty.");
    const chunks: Buffer[] = [];
    let size = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_000_000) {
        await reader.cancel();
        throw new Error("The page is too large to preview.");
      }
      chunks.push(Buffer.from(value));
    }
    return {html: Buffer.concat(chunks).toString("utf8"), url: url.toString()};
  }
  throw new Error("The link could not be previewed.");
}

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function readMetaValue(html: string, keys: string[]) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attributes = new Map<string, string>();
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attributes.set(match[1].toLowerCase(), decodeHtml(match[2] ?? match[3] ?? match[4] ?? ""));
    }
    const key = (attributes.get("property") || attributes.get("name") || "").toLowerCase();
    const value = attributes.get("content");
    if (value && keys.includes(key)) return value.slice(0, 500);
  }
  return "";
}

async function publishJob(job: Job) {
  let publishedCount = 0;
  const pageErrors: Record<string, string> = {};

  for (const pageId of job.pageIds) {
    const pageToken = pageAccessTokens[pageTokenKey(job.ownerScopeId, pageId)];
    if (!pageToken) {
      pageErrors[pageId] = "No Page access token. Reconnect Facebook and reload your Pages.";
      continue;
    }

    try {
      await publishToPage(pageId, pageToken, job.content, job.media);
      publishedCount += 1;
    } catch (error) {
      pageErrors[pageId] = error instanceof Error ? error.message : "Facebook publish failed.";
    }
  }

  job.pageErrors = pageErrors;
  if (publishedCount === job.pageIds.length) {
    job.status = "published";
  } else if (publishedCount > 0) {
    job.status = "partial";
  } else {
    job.status = "failed";
  }
}

export async function refreshScheduledJobs(ownerScopeId?: string) {
  const now = Date.now();

  for (const job of jobs) {
    if (ownerScopeId && job.ownerScopeId !== ownerScopeId) continue;
    if (job.status !== "scheduled" || new Date(job.scheduledAt).getTime() > now) continue;
    await publishJob(job);
  }
}

function readPageIds(value: unknown): string[] | null {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return Array.isArray(value) && value.every((id) => typeof id === "string") ? [...new Set(value)] : null;
}

function createJob(content: string, pageIds: string[], status: Job["status"], scheduledAt: string, ownerScopeId: string, file?: Express.Multer.File): Job {
  const media = file ? { path: file.path, mimeType: file.mimetype, originalName: file.originalname } : undefined;
  return {
    id: randomUUID(), content, pageIds, scheduledAt, ownerScopeId, status,
    ...(media ? { media } : {})
  };
}

router.get("/", requireWorkspaceScope, async (_req, res) => {
  const ownerScopeId = getRequiredWorkspaceScope(res);
  await refreshScheduledJobs(ownerScopeId);
  res.json(jobs.filter((job) => job.ownerScopeId === ownerScopeId).map(publicJob));
});

router.get("/link-preview", async (req, res) => {
  const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
  try {
    const {html, url} = await fetchPreviewHtml(new URL(rawUrl));
    const pageUrl = new URL(url);
    const title = readMetaValue(html, ["og:title", "twitter:title"]) || decodeHtml(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]*>/g, "").trim() || pageUrl.hostname).slice(0, 200);
    const description = readMetaValue(html, ["og:description", "twitter:description", "description"]);
    const siteName = readMetaValue(html, ["og:site_name"]) || pageUrl.hostname;
    const rawImage = readMetaValue(html, ["og:image", "twitter:image"]);
    let image = "";
    if (rawImage) {
      const imageUrl = new URL(rawImage, pageUrl);
      if ((imageUrl.protocol === "http:" || imageUrl.protocol === "https:") && await isPublicHost(imageUrl.hostname)) {
        image = imageUrl.toString();
      }
    }
    res.json({url, title, description, siteName, image});
  } catch (error) {
    res.status(400).json({error: error instanceof Error ? error.message : "The link could not be previewed."});
  }
});

router.get("/:id/media", requireWorkspaceScope, (req, res) => {
  const ownerScopeId = getRequiredWorkspaceScope(res);
  const job = jobs.find((entry) => entry.id === req.params.id && entry.ownerScopeId === ownerScopeId);
  if (!job?.media || !existsSync(job.media.path)) {
    res.status(404).json({error: "Post media not found"});
    return;
  }
  res.setHeader("Content-Type", job.media.mimeType);
  res.setHeader("Cache-Control", "private, max-age=3600");
  const mediaStream = createReadStream(job.media.path);
  mediaStream.on("error", () => {
    if (!res.headersSent) res.status(404).json({error: "Post media not found"});
    else res.destroy();
  });
  mediaStream.pipe(res);
});

router.post("/schedule", requireWorkspaceScope, handleMediaUpload, async (req, res) => {
  const ownerScopeId = getRequiredWorkspaceScope(res);
  const content = typeof req.body.content === "string" ? req.body.content : "";
  const scheduledAt = typeof req.body.scheduledAt === "string" ? req.body.scheduledAt : "";
  const pageIds = readPageIds(req.body.pageIds);

  if ((!content.trim() && !req.file) || !pageIds?.length || !scheduledAt) {
    if (req.file) await removeUploadedMedia({ path: req.file.path, mimeType: req.file.mimetype, originalName: req.file.originalname });
    return res.status(400).json({ error: "content or media, pageIds and scheduledAt are required" });
  }

  const parsedDate = new Date(scheduledAt);
  if (Number.isNaN(parsedDate.getTime())) {
    if (req.file) await removeUploadedMedia({ path: req.file.path, mimeType: req.file.mimetype, originalName: req.file.originalname });
    return res.status(400).json({ error: "scheduledAt must be a valid date" });
  }

  const job = createJob(content, pageIds, "scheduled", parsedDate.toISOString(), ownerScopeId, req.file);
  jobs.push(job);
  await refreshScheduledJobs(ownerScopeId);
  res.status(201).json(publicJob(job));
});

router.post("/draft", requireWorkspaceScope, handleMediaUpload, async (req, res) => {
  const ownerScopeId = getRequiredWorkspaceScope(res);
  const content = typeof req.body.content === "string" ? req.body.content : "";
  const pageIds = readPageIds(req.body.pageIds);
  if ((!content.trim() && !req.file) || !pageIds) {
    if (req.file) await removeUploadedMedia({ path: req.file.path, mimeType: req.file.mimetype, originalName: req.file.originalname });
    return res.status(400).json({ error: "content or media and valid pageIds are required" });
  }

  const job = createJob(content, pageIds, "draft", new Date().toISOString(), ownerScopeId, req.file);
  jobs.push(job);
  res.status(201).json(publicJob(job));
});

router.post("/publish", requireWorkspaceScope, handleMediaUpload, async (req, res) => {
  const ownerScopeId = getRequiredWorkspaceScope(res);
  const content = typeof req.body.content === "string" ? req.body.content : "";
  const pageIds = readPageIds(req.body.pageIds);
  if ((!content.trim() && !req.file) || !pageIds?.length) {
    if (req.file) await removeUploadedMedia({ path: req.file.path, mimeType: req.file.mimetype, originalName: req.file.originalname });
    return res.status(400).json({ error: "content or media and at least one pageId are required" });
  }

  const job = createJob(content, pageIds, "scheduled", new Date().toISOString(), ownerScopeId, req.file);
  jobs.push(job);
  await publishJob(job);
  res.status(201).json(publicJob(job));
});

router.patch("/:id", requireWorkspaceScope, handleMediaUpload, async (req, res) => {
  const ownerScopeId = getRequiredWorkspaceScope(res);
  const job = jobs.find((entry) => entry.id === req.params.id && entry.ownerScopeId === ownerScopeId);
  const status = req.body.status;
  if (!job || !["draft", "scheduled", "publish"].includes(status)) {
    if (req.file) await removeUploadedMedia({ path: req.file.path, mimeType: req.file.mimetype, originalName: req.file.originalname });
    return res.status(job ? 400 : 404).json({ error: job ? "Unsupported post action" : "Post not found" });
  }

  const content = typeof req.body.content === "string" ? req.body.content : job.content;
  const pageIds = req.body.pageIds === undefined ? job.pageIds : readPageIds(req.body.pageIds);
  const scheduledAt = status === "scheduled" ? req.body.scheduledAt : new Date().toISOString();
  const parsedDate = new Date(scheduledAt);
  if ((!content.trim() && !req.file && !job.media) || !pageIds || (status !== "draft" && !pageIds.length) || Number.isNaN(parsedDate.getTime())) {
    if (req.file) await removeUploadedMedia({ path: req.file.path, mimeType: req.file.mimetype, originalName: req.file.originalname });
    return res.status(400).json({ error: "Valid post content, pages, and schedule details are required" });
  }

  if (req.file) {
    await removeUploadedMedia(job.media);
    job.media = { path: req.file.path, mimeType: req.file.mimetype, originalName: req.file.originalname };
  }
  job.content = content;
  job.pageIds = pageIds;
  job.pageErrors = undefined;

  if (status === "draft") {
    job.status = "draft";
    job.scheduledAt = new Date().toISOString();
  } else {
    job.status = "scheduled";
    job.scheduledAt = status === "publish" ? new Date().toISOString() : parsedDate.toISOString();
    if (status === "publish") {
      await publishJob(job);
    } else {
      await refreshScheduledJobs(ownerScopeId);
    }
  }

  res.json(publicJob(job));
});

router.post("/:id/duplicate", requireWorkspaceScope, async (req, res) => {
  const ownerScopeId = getRequiredWorkspaceScope(res);
  const source = jobs.find((entry) => entry.id === req.params.id && entry.ownerScopeId === ownerScopeId);
  if (!source) return res.status(404).json({ error: "Post not found" });

  const duplicate = createJob(source.content, [...source.pageIds], "draft", new Date().toISOString(), ownerScopeId);
  if (source.media) {
    const mediaPath = resolve(mediaDirectory, `${randomUUID()}${extname(source.media.path)}`);
    try {
      await copyFile(source.media.path, mediaPath);
      duplicate.media = { ...source.media, path: mediaPath };
    } catch {}
  }
  jobs.push(duplicate);
  res.status(201).json(publicJob(duplicate));
});

router.delete("/:id", requireWorkspaceScope, async (req, res) => {
  const ownerScopeId = getRequiredWorkspaceScope(res);
  const index = jobs.findIndex((entry) => entry.id === req.params.id && entry.ownerScopeId === ownerScopeId);
  if (index < 0) return res.status(404).json({ error: "Post not found" });
  const [job] = jobs.splice(index, 1);
  await removeUploadedMedia(job.media);
  res.status(204).end();
});

export default router;
