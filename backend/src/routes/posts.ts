import { mkdirSync } from "node:fs";
import { copyFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { extname, resolve } from "node:path";
import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { pageAccessTokens } from "./pages.js";
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
  status: "draft"|"scheduled"|"published"|"failed"|"partial";
  media?: StoredMedia;
  pageErrors?: Record<string, string>;
};

export const jobs: Job[] = [];

function publicJob({ media, ...job }: Job) {
  return {
    ...job,
    ...(media ? { media: { mimeType: media.mimeType, originalName: media.originalName } } : {})
  };
}

async function removeUploadedMedia(media?: StoredMedia) {
  if (media) await unlink(media.path).catch(() => undefined);
}

async function publishJob(job: Job) {
  let publishedCount = 0;
  const pageErrors: Record<string, string> = {};

  for (const pageId of job.pageIds) {
    const pageToken = pageAccessTokens[pageId];
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

export async function refreshScheduledJobs() {
  const now = Date.now();

  for (const job of jobs) {
    if (job.status !== "scheduled" || new Date(job.scheduledAt).getTime() > now) continue;
    await publishJob(job);
    await removeUploadedMedia(job.media);
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

function createJob(content: string, pageIds: string[], status: Job["status"], scheduledAt: string, file?: Express.Multer.File): Job {
  const media = file ? { path: file.path, mimeType: file.mimetype, originalName: file.originalname } : undefined;
  return {
    id: randomUUID(), content, pageIds, scheduledAt, status,
    ...(media ? { media } : {})
  };
}

router.get("/", async (_req, res) => {
  await refreshScheduledJobs();
  res.json(jobs.map(publicJob));
});

router.post("/schedule", handleMediaUpload, async (req, res) => {
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

  const job = createJob(content, pageIds, "scheduled", parsedDate.toISOString(), req.file);
  jobs.push(job);
  await refreshScheduledJobs();
  res.status(201).json(publicJob(job));
});

router.post("/draft", handleMediaUpload, async (req, res) => {
  const content = typeof req.body.content === "string" ? req.body.content : "";
  const pageIds = readPageIds(req.body.pageIds);
  if ((!content.trim() && !req.file) || !pageIds) {
    if (req.file) await removeUploadedMedia({ path: req.file.path, mimeType: req.file.mimetype, originalName: req.file.originalname });
    return res.status(400).json({ error: "content or media and valid pageIds are required" });
  }

  const job = createJob(content, pageIds, "draft", new Date().toISOString(), req.file);
  jobs.push(job);
  res.status(201).json(publicJob(job));
});

router.post("/publish", handleMediaUpload, async (req, res) => {
  const content = typeof req.body.content === "string" ? req.body.content : "";
  const pageIds = readPageIds(req.body.pageIds);
  if ((!content.trim() && !req.file) || !pageIds?.length) {
    if (req.file) await removeUploadedMedia({ path: req.file.path, mimeType: req.file.mimetype, originalName: req.file.originalname });
    return res.status(400).json({ error: "content or media and at least one pageId are required" });
  }

  const job = createJob(content, pageIds, "scheduled", new Date().toISOString(), req.file);
  jobs.push(job);
  await publishJob(job);
  await removeUploadedMedia(job.media);
  res.status(201).json(publicJob(job));
});

router.patch("/:id", handleMediaUpload, async (req, res) => {
  const job = jobs.find((entry) => entry.id === req.params.id);
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
      await removeUploadedMedia(job.media);
    } else {
      await refreshScheduledJobs();
    }
  }

  res.json(publicJob(job));
});

router.post("/:id/duplicate", async (req, res) => {
  const source = jobs.find((entry) => entry.id === req.params.id);
  if (!source) return res.status(404).json({ error: "Post not found" });

  const duplicate = createJob(source.content, [...source.pageIds], "draft", new Date().toISOString());
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

router.delete("/:id", async (req, res) => {
  const index = jobs.findIndex((entry) => entry.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: "Post not found" });
  const [job] = jobs.splice(index, 1);
  await removeUploadedMedia(job.media);
  res.status(204).end();
});

export default router;
