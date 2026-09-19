import { Router } from "express";
import { facebookUserAccessToken } from "./auth.js";
const router = Router();

export const pageAccessTokens: Record<string, string> = {};

export function clearPageAccessTokens() {
  for (const key of Object.keys(pageAccessTokens)) {
    delete pageAccessTokens[key];
  }
}

router.get("/", async (_req, res) => {
  if (facebookUserAccessToken) {
    try {
      const params = new URLSearchParams({
        fields: "id,name,access_token",
        access_token: facebookUserAccessToken
      });
      const response = await fetch(`https://graph.facebook.com/v23.0/me/accounts?${params}`);
      const data = await response.json() as { data?: Array<{ id: string; name: string; access_token: string }> };

      if (!response.ok) {
        res.status(502).json({ error: "Facebook Pages could not be loaded", details: data });
        return;
      }

      for (const page of data.data || []) {
        pageAccessTokens[page.id] = page.access_token;
      }

      res.json((data.data || []).map((page) => ({
        id: page.id,
        name: page.name,
        account: "Connected Facebook Account",
        accessToken: page.access_token,
        connected: true
      })));
      return;
    } catch {
      res.status(502).json({ error: "Facebook Pages request failed" });
      return;
    }
  }

  for (const key of Object.keys(pageAccessTokens)) {
    delete pageAccessTokens[key];
  }

  if (process.env.DEMO_MODE === "true") {
  const demoPages = Array.from({length: 40}, (_, i) => ({
    id: `demo-page-${i+1}`,
    name: `Facebook Page ${String(i+1).padStart(2, "0")}`,
    account: `Facebook Account ${Math.floor(i/8)+1}`,
    connected: true
  }));
  res.json(demoPages);
    return;
  }

  res.json([]);
});

export default router;
