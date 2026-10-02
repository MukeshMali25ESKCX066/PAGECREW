import { Router } from "express";
import { getFacebookAccount } from "./auth.js";
const router = Router();

export const pageAccessTokens: Record<string, string> = {};

export function clearPageAccessTokens() {
  for (const key of Object.keys(pageAccessTokens)) {
    delete pageAccessTokens[key];
  }
}

router.get("/", async (req, res) => {
  const accountId = typeof req.query.accountId === "string" ? req.query.accountId : undefined;
  if (process.env.DEMO_MODE === "true") {
    const demoPages = Array.from({length: 40}, (_, i) => {
      const accountNumber = Math.floor(i / 8) + 1;
      return {
        id: `demo-page-${i+1}`,
        name: `Facebook Page ${String(i+1).padStart(2, "0")}`,
        account: `Facebook Account ${accountNumber}`,
        accountId: `demo-account-${accountNumber}`,
        connected: true
      };
    });
    res.json(demoPages.filter((page) => !accountId || page.accountId === accountId));
    return;
  }

  const account = getFacebookAccount(accountId);
  if (account?.accessToken) {
    try {
      const params = new URLSearchParams({
        fields: "id,name,access_token,picture",
        access_token: account.accessToken
      });
      const response = await fetch(`https://graph.facebook.com/v23.0/me/accounts?${params}`);
      const data = await response.json() as { data?: Array<{ id: string; name: string; access_token: string; picture?: { data?: { url?: string } } }> };

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
        account: account.name,
        accountId: account.id,
        pictureUrl: page.picture?.data?.url,
        connected: true
      })));
      return;
    } catch {
      res.status(502).json({ error: "Facebook Pages request failed" });
      return;
    }
  }

  if (accountId && !account) {
    res.status(404).json({ error: "Facebook account not found" });
    return;
  }
  res.json([]);
});

export default router;
