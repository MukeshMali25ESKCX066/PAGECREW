import { Router } from "express";
import { pageAccessTokens } from "./pages.js";
import { publishToPage } from "../services/meta.js";
const router = Router();

type Job = {
  id: string; content: string; pageIds: string[]; scheduledAt: string;
  status: "scheduled"|"published"|"failed";
};

export const jobs: Job[] = [];

export async function refreshScheduledJobs() {
  const now = Date.now();

  for (const job of jobs) {
    if (job.status !== "scheduled") continue;
    if (new Date(job.scheduledAt).getTime() > now) continue;

    let failed = false;

    for (const pageId of job.pageIds) {
      const pageToken = pageAccessTokens[pageId];
      if (!pageToken) {
        failed = true;
        job.status = "failed";
        break;
      }

      try {
        const result = await publishToPage(pageId, pageToken, job.content);
        if (result?.error) {
          failed = true;
          job.status = "failed";
          break;
        }
      } catch {
        failed = true;
        job.status = "failed";
        break;
      }
    }

    if (!failed) {
      job.status = "published";
    }
  }
}

router.get("/", async (_req, res) => {
  await refreshScheduledJobs();
  res.json(jobs);
});

router.post("/schedule", async (req, res) => {
  const { content, pageIds, scheduledAt } = req.body;
  if (!content || !Array.isArray(pageIds) || !pageIds.length || !scheduledAt) {
    return res.status(400).json({ error: "content, pageIds and scheduledAt are required" });
  }
  const job: Job = {
    id: crypto.randomUUID(),
    content,
    pageIds,
    scheduledAt,
    status: "scheduled"
  };
  jobs.push(job);
  await refreshScheduledJobs();
  res.status(201).json(job);
});

export default router;
