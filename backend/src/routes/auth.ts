import { Router } from "express";
import { clearPageAccessTokens } from "./pages.js";
const router = Router();

export type ConnectedAccountProfile = {
  connected: boolean;
  provider: "facebook";
  name: string;
  avatarUrl?: string;
  accountId?: string;
};

export let facebookUserAccessToken = "";
export let demoUserConnected = false;

export function resolveConnectedAccountProfile({
  demoMode,
  accessToken,
  connected = false
}: {
  demoMode: boolean;
  accessToken: string;
  connected?: boolean;
}): ConnectedAccountProfile {
  const isConnected = demoMode
    ? Boolean(demoUserConnected || connected || accessToken)
    : Boolean(connected || accessToken);

  if (isConnected) {
    return {
      connected: true,
      provider: "facebook",
      name: demoMode ? "Demo Facebook User" : "Connected Facebook Account",
      avatarUrl: demoMode
        ? "https://graph.facebook.com/100000000001/picture?type=square"
        : undefined,
      accountId: demoMode ? "demo-user" : undefined
    };
  }

  return { connected: false, provider: "facebook", name: "" };
}

router.get("/facebook", (_req, res) => {
  const appId = process.env.META_APP_ID;
  const redirect = encodeURIComponent(process.env.META_REDIRECT_URI || "");
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  demoUserConnected = false;

  if (process.env.DEMO_MODE === "true") {
    demoUserConnected = true;
    return res.redirect(`${frontendUrl}?connected=facebook`);
  }

  if (!appId || appId === "YOUR_META_APP_ID") {
    return res.status(500).json({ error: "Facebook app is not configured. Set META_APP_ID and valid redirect URI." });
  }

  const scope = encodeURIComponent(process.env.META_SCOPE || "public_profile,pages_show_list");
  const url = `https://www.facebook.com/v23.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirect}&scope=${scope}`;
  res.redirect(url);
});

router.get("/me", async (_req, res) => {
  if (process.env.DEMO_MODE === "true") {
    res.json(resolveConnectedAccountProfile({
      demoMode: true,
      accessToken: facebookUserAccessToken,
      connected: demoUserConnected
    }));
    return;
  }

  if (!facebookUserAccessToken) {
    res.status(401).json({ connected: false, provider: "facebook", name: "" });
    return;
  }

  try {
    const params = new URLSearchParams({
      fields: "id,name,picture{url}",
      access_token: facebookUserAccessToken
    });
    const response = await fetch(`https://graph.facebook.com/v23.0/me?${params}`);
    const data = await response.json() as {
      id?: string;
      name?: string;
      picture?: { data?: { url?: string } };
    };

    if (!response.ok || !data.name) {
      res.status(502).json({ connected: false, provider: "facebook", name: "" });
      return;
    }

    res.json({
      connected: true,
      provider: "facebook",
      name: data.name,
      avatarUrl: data.picture?.data?.url,
      accountId: data.id
    });
  } catch {
    res.status(502).json({ connected: false, provider: "facebook", name: "" });
  }
});

router.post("/logout", (_req, res) => {
  facebookUserAccessToken = "";
  demoUserConnected = false;
  clearPageAccessTokens();
  res.json({ ok: true, connected: false, provider: "facebook" });
});

router.get("/facebook/callback", async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const code = typeof req.query.code === "string" ? req.query.code : "";

  if (!code) {
    res.redirect(`${frontendUrl}?connected=facebook&error=missing_code`);
    return;
  }

  try {
    const tokenParams = new URLSearchParams({
      client_id: process.env.META_APP_ID || "",
      client_secret: process.env.META_APP_SECRET || "",
      redirect_uri: process.env.META_REDIRECT_URI || "",
      code
    });
    const tokenResponse = await fetch(`https://graph.facebook.com/v23.0/oauth/access_token?${tokenParams}`);
    const tokenData = await tokenResponse.json() as { access_token?: string };

    if (!tokenResponse.ok || !tokenData.access_token) {
      res.redirect(`${frontendUrl}?connected=facebook&error=token_exchange`);
      return;
    }

    facebookUserAccessToken = tokenData.access_token;
    res.redirect(`${frontendUrl}?connected=facebook`);
  } catch {
    res.redirect(`${frontendUrl}?connected=facebook&error=token_exchange`);
  }
});

export default router;
