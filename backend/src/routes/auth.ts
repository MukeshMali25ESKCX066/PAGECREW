import { randomUUID } from "node:crypto";
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

export type FacebookAccount = {
  id: string;
  name: string;
  avatarUrl?: string;
  accessToken: string;
};

export let facebookUserAccessToken = "";
export let demoUserConnected = false;
export const facebookAccounts = new Map<string, FacebookAccount>();
export let activeFacebookAccountId = "";

const pendingOAuthStates = new Map<string, number>();

export function listFacebookAccounts() {
  return [...facebookAccounts.values()].map(({ accessToken: _accessToken, ...account }) => account);
}

export function getFacebookAccount(accountId?: string) {
  if (accountId) return facebookAccounts.get(accountId);
  return facebookAccounts.get(activeFacebookAccountId) || facebookAccounts.values().next().value as FacebookAccount | undefined;
}

export function activateFacebookAccount(accountId: string) {
  const account = facebookAccounts.get(accountId);
  if (!account) return false;
  activeFacebookAccountId = account.id;
  facebookUserAccessToken = account.accessToken;
  return true;
}

export function storeFacebookAccount(account: FacebookAccount) {
  facebookAccounts.set(account.id, account);
  activateFacebookAccount(account.id);
}

export function clearFacebookAccounts() {
  facebookAccounts.clear();
  activeFacebookAccountId = "";
  facebookUserAccessToken = "";
}

function ensureDemoAccounts() {
  for (let index = 1; index <= 5; index += 1) {
    const id = `demo-account-${index}`;
    if (!facebookAccounts.has(id)) {
      facebookAccounts.set(id, { id, name: `Facebook Account ${index}`, accessToken: "" });
    }
  }
  if (!activeFacebookAccountId) activateFacebookAccount("demo-account-1");
}

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

  if (process.env.DEMO_MODE === "true") {
    demoUserConnected = true;
    ensureDemoAccounts();
    activateFacebookAccount("demo-account-1");
    return res.redirect(`${frontendUrl}?connected=facebook`);
  }

  if (!appId || appId === "YOUR_META_APP_ID") {
    return res.status(500).json({ error: "Facebook app is not configured. Set META_APP_ID and valid redirect URI." });
  }

  const scope = encodeURIComponent(
    process.env.META_SCOPE || "public_profile,pages_show_list"
  );
  const state = randomUUID();
  pendingOAuthStates.set(state, Date.now());
  const url = `https://www.facebook.com/v23.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirect}&scope=${scope}&auth_type=rerequest&state=${state}`;
  res.redirect(url);
});

router.get("/me", (_req, res) => {
  if (process.env.DEMO_MODE === "true" && demoUserConnected && !facebookAccounts.size) {
    ensureDemoAccounts();
  }
  const account = getFacebookAccount();
  if (!account) {
    res.status(401).json({ connected: false, provider: "facebook", name: "", accounts: [] });
    return;
  }

  res.json({
    connected: true,
    provider: "facebook",
    name: account.name,
    avatarUrl: account.avatarUrl,
    accountId: account.id,
    activeAccountId: account.id,
    accounts: listFacebookAccounts()
  });
});

router.post("/active", (req, res) => {
  const accountId = typeof req.body.accountId === "string" ? req.body.accountId : "";
  if (!activateFacebookAccount(accountId)) {
    res.status(404).json({ error: "Facebook account not found" });
    return;
  }
  const account = getFacebookAccount(accountId)!;
  res.json({ activeAccountId: account.id, name: account.name, accounts: listFacebookAccounts() });
});

router.post("/logout", (_req, res) => {
  demoUserConnected = false;
  clearFacebookAccounts();
  pendingOAuthStates.clear();
  clearPageAccessTokens();
  res.json({ ok: true, connected: false, provider: "facebook" });
});

router.get("/facebook/callback", async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";

  if (!code) {
    res.redirect(`${frontendUrl}?connected=facebook&error=missing_code`);
    return;
  }
  const requestedAt = pendingOAuthStates.get(state);
  pendingOAuthStates.delete(state);
  if (!requestedAt || Date.now() - requestedAt > 10 * 60 * 1000) {
    res.redirect(`${frontendUrl}?connected=facebook&error=invalid_state`);
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

    const profileParams = new URLSearchParams({
      fields: "id,name,picture{url}",
      access_token: tokenData.access_token
    });
    const profileResponse = await fetch(`https://graph.facebook.com/v23.0/me?${profileParams}`);
    const profileData = await profileResponse.json() as {
      id?: string;
      name?: string;
      picture?: { data?: { url?: string } };
    };
    if (!profileResponse.ok || !profileData.id || !profileData.name) {
      res.redirect(`${frontendUrl}?connected=facebook&error=profile_fetch`);
      return;
    }

    storeFacebookAccount({
      id: profileData.id,
      name: profileData.name,
      avatarUrl: profileData.picture?.data?.url,
      accessToken: tokenData.access_token
    });
    res.redirect(`${frontendUrl}?connected=facebook`);
  } catch {
    res.redirect(`${frontendUrl}?connected=facebook&error=token_exchange`);
  }
});

export default router;
