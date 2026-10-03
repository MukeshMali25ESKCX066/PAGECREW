import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import authRouter, { activateFacebookAccount, clearFacebookAccounts, getFacebookAccount, listFacebookAccounts, resolveConnectedAccountProfile, storeFacebookAccount } from "./auth.js";
import postsRouter, { jobs, refreshScheduledJobs } from "./posts.js";
import pagesRouter, { pageAccessTokens, pageTokenKey } from "./pages.js";
import { publishToPage } from "../services/meta.js";

function sessionCookie(response: Response) {
  const cookieHeader = response.headers.get("set-cookie") || "";
  const sessionId = cookieHeader.match(/(?:^|,\s*)pagecrew_session_id=([^;,]+)/)?.[1];
  return sessionId ? `pagecrew_session_id=${sessionId}` : "";
}

async function loginAsAdmin(apiRoot: string) {
  const response = await fetch(`${apiRoot}/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@pagecrew.local", password: "Admin@123" })
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  const cookie = sessionCookie(response);
  assert.ok(cookie, `Admin login did not issue a session cookie: ${response.headers.get("set-cookie") || "none"}`);
  const sessionId = cookie.slice("pagecrew_session_id=".length);
  return { cookie, scopeId: `${sessionId}:${payload.user.id}`, user: payload.user };
}

function totpForTest(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const key: number[] = [];
  for (const character of secret) {
    value = (value << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      key.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", Buffer.from(key)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 1_000_000).padStart(6, "0");
}

test("returns a demo profile when demo mode is on and the session is connected", () => {
  const profile = resolveConnectedAccountProfile({
    demoMode: true,
    accessToken: "",
    connected: true
  });

  assert.equal(profile.connected, true);
  assert.equal(profile.name, "Demo Facebook User");
  assert.ok(profile.avatarUrl?.includes("facebook"));
});

test("keeps existing Facebook accounts when another account is connected", () => {
  clearFacebookAccounts();
  try {
    storeFacebookAccount({ id: "account-1", name: "First account", accessToken: "first-token" });
    storeFacebookAccount({ id: "account-2", name: "Second account", accessToken: "second-token" });

    assert.deepEqual(listFacebookAccounts().map((account) => account.id), ["account-1", "account-2"]);
    assert.equal(activateFacebookAccount("account-1"), true);
    assert.equal(listFacebookAccounts()[0].name, "First account");
    assert.equal("accessToken" in listFacebookAccounts()[0], false);
  } finally {
    clearFacebookAccounts();
  }
});

test("keeps Facebook connections isolated per browser session", () => {
  clearFacebookAccounts("browser-a");
  clearFacebookAccounts("browser-b");
  try {
    storeFacebookAccount({ id: "browser-a-account", name: "Browser A Account", accessToken: "token-a" }, "browser-a");
    storeFacebookAccount({ id: "browser-b-account", name: "Browser B Account", accessToken: "token-b" }, "browser-b");

    assert.deepEqual(listFacebookAccounts("browser-a").map((account) => account.id), ["browser-a-account"]);
    assert.deepEqual(listFacebookAccounts("browser-b").map((account) => account.id), ["browser-b-account"]);
    assert.equal(getFacebookAccount(undefined, "browser-a")?.id, "browser-a-account");
    assert.equal(getFacebookAccount(undefined, "browser-b")?.id, "browser-b-account");
  } finally {
    clearFacebookAccounts("browser-a");
    clearFacebookAccounts("browser-b");
  }
});

test("loads Facebook Pages using only the selected account token", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use("/api/pages", pagesRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const apiRoot = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const baseUrl = `${apiRoot}/pages`;
  const admin = await loginAsAdmin(apiRoot);
  clearFacebookAccounts(admin.scopeId);
  storeFacebookAccount({ id: "account-1", name: "First account", accessToken: "first-token" }, admin.scopeId);
  storeFacebookAccount({ id: "account-2", name: "Second account", accessToken: "second-token" }, admin.scopeId);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (new URL(String(input)).hostname === "127.0.0.1") return originalFetch(input, init);
    const token = new URL(String(input)).searchParams.get("access_token") || "";
    const accountNumber = token === "second-token" ? 2 : 1;
    return new Response(JSON.stringify({data: [{
      id: `page-${accountNumber}`,
      name: `Page ${accountNumber}`,
      access_token: `page-token-${accountNumber}`
    }]}), {status: 200});
  };

  try {
    const response = await fetch(`${baseUrl}?accountId=account-2`, { headers: { Cookie: admin.cookie } });
    assert.equal(response.status, 200, `Unexpected Pages response: ${await response.clone().text()}`);
    const pages = await response.json() as Array<{id: string; name: string; account: string; accountId: string}>;
    assert.equal(pages.length, 1);
    assert.equal(pages[0].id, "page-2");
    assert.equal(pages[0].name, "Page 2");
    assert.equal(pages[0].account, "Second account");
    assert.equal(pages[0].accountId, "account-2");
    assert.equal(pageAccessTokens[pageTokenKey(admin.scopeId, "page-2")], "page-token-2");
  } finally {
    globalThis.fetch = originalFetch;
    clearFacebookAccounts(admin.scopeId);
    delete pageAccessTokens[pageTokenKey(admin.scopeId, "page-1")];
    delete pageAccessTokens[pageTokenKey(admin.scopeId, "page-2")];
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("returns not connected when no token and demo mode is off", () => {
  const profile = resolveConnectedAccountProfile({ demoMode: false, accessToken: "" });
  assert.equal(profile.connected, false);
  assert.equal(profile.name, "");
});

test("returns not connected in demo mode until a demo session is established", () => {
  const profile = resolveConnectedAccountProfile({ demoMode: true, accessToken: "", connected: false });
  assert.equal(profile.connected, false);
  assert.equal(profile.name, "");
});

test("returns connected profile when the account is authenticated", () => {
  const profile = resolveConnectedAccountProfile({
    demoMode: false,
    accessToken: "facebook-token",
    connected: true
  });

  assert.equal(profile.connected, true);
  assert.equal(profile.provider, "facebook");
  assert.equal(profile.name, "Connected Facebook Account");
});

test("blocks unapproved users from workspace access until a super admin approves them", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", (await import("./auth.js")).default);

  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth`;

  try {
    const registerResponse = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Pending User",
        email: "pending@example.com",
        password: "StrongPass!1",
        country: "IN",
        accountType: "creator",
        termsAccepted: true
      })
    });

    assert.equal(registerResponse.status, 201);

    const loginResponse = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "pending@example.com",
        password: "StrongPass!1"
      })
    });

    assert.equal(loginResponse.status, 200);
    assert.equal((await loginResponse.json()).user.status, "pending");

    const userCookie = sessionCookie(registerResponse);
    const chooseDemoResponse = await fetch(`${baseUrl}/payment/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ planId: "demo" })
    });
    assert.equal(chooseDemoResponse.status, 200);
    const submitDemoResponse = await fetch(`${baseUrl}/payment/demo-submit`, {
      method: "POST",
      headers: { Cookie: userCookie }
    });
    assert.equal(submitDemoResponse.status, 200);

    const adminLoginResponse = await fetch(`${baseUrl}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@pagecrew.local",
        password: "Admin@123"
      })
    });

    assert.equal(adminLoginResponse.status, 200);
    const adminPayload = await adminLoginResponse.json();
    const adminCookie = sessionCookie(adminLoginResponse);
    assert.equal(adminPayload.user.role, "admin");

    const pendingResponse = await fetch(`${baseUrl}/admin/users`, {
      headers: { Cookie: adminCookie }
    });

    assert.equal(pendingResponse.status, 200);
    const pendingUsers = await pendingResponse.json();
    assert.ok(pendingUsers.some((user: { email: string }) => user.email === "pending@example.com"));

    const approveResponse = await fetch(`${baseUrl}/admin/approve-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ userId: pendingUsers.find((user: { email: string }) => user.email === "pending@example.com").id })
    });

    assert.equal(approveResponse.status, 200);

    const approvedLoginResponse = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "pending@example.com",
        password: "StrongPass!1"
      })
    });

    assert.equal(approvedLoginResponse.status, 200);
    const approvedPayload = await approvedLoginResponse.json();
    assert.equal(approvedPayload.user.status, "approved");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("registers the full profile only with a strong password and accepted terms", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", (await import("./auth.js")).default);
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth`;
  const email = `full-profile-${Date.now()}@example.com`;

  try {
    const missingTermsResponse = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: "Full Profile", email, password: "StrongPass!1" })
    });
    assert.equal(missingTermsResponse.status, 400);

    const registerResponse = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Full Profile",
        email,
        phone: "+91 98765 43210",
        country: "IN",
        password: "StrongPass!1",
        accountType: "creator",
        company: "PageCrew Studio",
        termsAccepted: true
      })
    });

    assert.equal(registerResponse.status, 201);
    const payload = await registerResponse.json();
    assert.equal(payload.user.name, "Full Profile");
    assert.equal(payload.user.phone, "+91 98765 43210");
    assert.equal(payload.user.country, "IN");
    assert.equal(payload.user.accountType, "creator");
    assert.equal(payload.user.company, "PageCrew Studio");
    assert.equal(payload.user.status, "pending");

    const availabilityResponse = await fetch(`${baseUrl}/check-email?email=${encodeURIComponent(email)}`);
    assert.equal((await availabilityResponse.json()).available, false);

    const duplicateResponse = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Another User",
        email,
        country: "IN",
        password: "StrongPass!1",
        accountType: "creator",
        termsAccepted: true
      })
    });
    assert.equal(duplicateResponse.status, 409);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("requires payment proof before admin approval and lets the admin review the submitted payment", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const apiRoot = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const admin = await loginAsAdmin(apiRoot);
  const email = `payment-user-${Date.now()}@example.com`;
  const uploadsDirectory = resolve(__dirname, "../../uploads/payments");
  const existingUploads = new Set(await readdir(uploadsDirectory));

  try {
    const anonymousQrUpload = new FormData();
    anonymousQrUpload.append("qrCode", new Blob(["qr"], { type: "image/png" }), "qr.png");
    const deniedQrUpload = await fetch(`${apiRoot}/auth/admin/payment-qr`, { method: "POST", body: anonymousQrUpload });
    assert.equal(deniedQrUpload.status, 403);

    const qrUpload = new FormData();
    qrUpload.append("qrCode", new Blob(["test-qr-image"], { type: "image/png" }), "qr.png");
    const qrResponse = await fetch(`${apiRoot}/auth/admin/payment-qr`, {
      method: "POST",
      headers: { Cookie: admin.cookie },
      body: qrUpload
    });
    assert.equal(qrResponse.status, 200, await qrResponse.clone().text());
    const qrImageResponse = await fetch(`${apiRoot}/auth/payment/qr`, { headers: { Cookie: admin.cookie } });
    assert.equal(qrImageResponse.status, 200);
    assert.match(qrImageResponse.headers.get("content-type") || "", /image\/png/);

    const registerResponse = await fetch(`${apiRoot}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Payment User",
        email,
        country: "IN",
        password: "StrongPass!1",
        accountType: "creator",
        termsAccepted: true
      })
    });
    assert.equal(registerResponse.status, 201);
    const registeredUser = (await registerResponse.json()).user;
    const userCookie = sessionCookie(registerResponse);

    const choosePlanResponse = await fetch(`${apiRoot}/auth/payment/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userCookie },
      body: JSON.stringify({ planId: "pro" })
    });
    assert.equal(choosePlanResponse.status, 200);

    const prematureApproval = await fetch(`${apiRoot}/auth/admin/approve-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ userId: registeredUser.id })
    });
    assert.equal(prematureApproval.status, 400);

    const paymentProof = new FormData();
    paymentProof.append("payerName", "Payment User");
    paymentProof.append("reference", "UTR123456789");
    paymentProof.append("screenshot", new Blob(["payment-proof-image"], { type: "image/png" }), "proof.png");
    const paymentResponse = await fetch(`${apiRoot}/auth/payment/submit`, {
      method: "POST",
      headers: { Cookie: userCookie },
      body: paymentProof
    });
    assert.equal(paymentResponse.status, 200, await paymentResponse.clone().text());
    assert.equal((await paymentResponse.json()).user.paymentStatus, "pending");

    const listResponse = await fetch(`${apiRoot}/auth/admin/users`, { headers: { Cookie: admin.cookie } });
    assert.equal(listResponse.status, 200);
    const users = await listResponse.json();
    const submittedUser = users.find((user: { id: string }) => user.id === registeredUser.id);
    assert.equal(submittedUser.paymentReference, "UTR123456789");
    assert.equal(submittedUser.paymentPayerName, "Payment User");
    assert.equal(submittedUser.planName, "Pro");
    assert.equal(submittedUser.planPrice, 2999);
    assert.equal(submittedUser.paymentProofAvailable, true);

    const deniedProof = await fetch(`${apiRoot}/auth/admin/payment-proof/${registeredUser.id}`, { headers: { Cookie: userCookie } });
    assert.equal(deniedProof.status, 403);
    const proofResponse = await fetch(`${apiRoot}/auth/admin/payment-proof/${registeredUser.id}`, { headers: { Cookie: admin.cookie } });
    assert.equal(proofResponse.status, 200);
    assert.match(proofResponse.headers.get("content-type") || "", /image\/png/);

    const approveResponse = await fetch(`${apiRoot}/auth/admin/approve-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ userId: registeredUser.id })
    });
    assert.equal(approveResponse.status, 200);
  } finally {
    const clearQr = await fetch(`${apiRoot}/auth/admin/payment-qr`, { method: "DELETE", headers: { Cookie: admin.cookie } });
    assert.equal(clearQr.status, 200);
    const uploadsAfterTest = await readdir(uploadsDirectory);
    await Promise.all(uploadsAfterTest.filter((fileName) => !existingUploads.has(fileName)).map((fileName) => unlink(resolve(uploadsDirectory, fileName))));
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("requires a Google Authenticator code for super admin sign-in when enabled", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const apiRoot = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const admin = await loginAsAdmin(apiRoot);
  const preExistingAdminSession = await loginAsAdmin(apiRoot);
  let setupSecret = "";
  let enabled = false;

  try {
    const setupResponse = await fetch(`${apiRoot}/auth/admin/totp/setup`, {
      method: "POST",
      headers: { Cookie: admin.cookie }
    });
    assert.equal(setupResponse.status, 200);
    const setup = await setupResponse.json();
    assert.match(setup.qrCode, /^data:image\/png;base64,/);
    assert.match(setup.manualEntryKey, /^[A-Z2-7]+$/);

    const resumedSetupResponse = await fetch(`${apiRoot}/auth/admin/totp/setup`, { headers: { Cookie: admin.cookie } });
    assert.equal(resumedSetupResponse.status, 200);
    const resumedSetup = await resumedSetupResponse.json();
    assert.equal(resumedSetup.manualEntryKey, setup.manualEntryKey);

    const cancelSetupResponse = await fetch(`${apiRoot}/auth/admin/totp/setup`, {
      method: "DELETE",
      headers: { Cookie: admin.cookie }
    });
    assert.equal(cancelSetupResponse.status, 200);
    const missingSetup = await fetch(`${apiRoot}/auth/admin/totp/setup`, { headers: { Cookie: admin.cookie } });
    assert.equal(missingSetup.status, 404);

    const renewedSetupResponse = await fetch(`${apiRoot}/auth/admin/totp/setup`, {
      method: "POST",
      headers: { Cookie: admin.cookie }
    });
    assert.equal(renewedSetupResponse.status, 200);
    setupSecret = (await renewedSetupResponse.json()).manualEntryKey;

    const enableResponse = await fetch(`${apiRoot}/auth/admin/totp/enable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ code: totpForTest(setupSecret) })
    });
    assert.equal(enableResponse.status, 200, await enableResponse.clone().text());
    enabled = true;

    const staleAdminAccess = await fetch(`${apiRoot}/auth/admin/users`, { headers: { Cookie: preExistingAdminSession.cookie } });
    assert.equal(staleAdminAccess.status, 403);

    const passwordOnlyLogin = await fetch(`${apiRoot}/auth/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@pagecrew.local", password: "Admin@123" })
    });
    assert.equal(passwordOnlyLogin.status, 200);
    const challenge = await passwordOnlyLogin.json();
    assert.equal(challenge.requiresTotp, true);
    assert.equal(Boolean(passwordOnlyLogin.headers.get("set-cookie")), false);

    const regularLogin = await fetch(`${apiRoot}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@pagecrew.local", password: "Admin@123" })
    });
    assert.equal(regularLogin.status, 403);

    const validCode = totpForTest(setupSecret);
    const invalidCode = validCode === "000000" ? "000001" : "000000";
    const wrongCode = await fetch(`${apiRoot}/auth/admin/login/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeToken: challenge.challengeToken, code: invalidCode })
    });
    assert.equal(wrongCode.status, 401);

    const verifiedLogin = await fetch(`${apiRoot}/auth/admin/login/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeToken: challenge.challengeToken, code: validCode })
    });
    assert.equal(verifiedLogin.status, 200, await verifiedLogin.clone().text());
    const verifiedCookie = sessionCookie(verifiedLogin);
    assert.ok(verifiedCookie);
    const protectedUsers = await fetch(`${apiRoot}/auth/admin/users`, { headers: { Cookie: verifiedCookie } });
    assert.equal(protectedUsers.status, 200);

    const disableResponse = await fetch(`${apiRoot}/auth/admin/totp/disable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: verifiedCookie },
      body: JSON.stringify({ code: totpForTest(setupSecret) })
    });
    assert.equal(disableResponse.status, 200);
    enabled = false;

    const passwordOnlyAfterDisable = await fetch(`${apiRoot}/auth/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@pagecrew.local", password: "Admin@123" })
    });
    assert.equal(passwordOnlyAfterDisable.status, 200);
    assert.equal((await passwordOnlyAfterDisable.json()).requiresTotp, undefined);
  } finally {
    if (enabled && setupSecret) {
      await fetch(`${apiRoot}/auth/admin/totp/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: admin.cookie },
        body: JSON.stringify({ code: totpForTest(setupSecret) })
      });
    }
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("publishes scheduled jobs when their time has arrived", async () => {
  jobs.length = 0;
  const ownerScopeId = "scheduler-test";
  pageAccessTokens[pageTokenKey(ownerScopeId, "page-1")] = "page-token";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ id: "post-1" })
  }) as Response;

  try {
    jobs.push({
      id: "job-1",
      content: "Hello",
      pageIds: ["page-1"],
      ownerScopeId,
      scheduledAt: new Date(Date.now() - 1000).toISOString(),
      status: "scheduled"
    });

    await refreshScheduledJobs();

    assert.equal(jobs[0].status, "published");
  } finally {
    globalThis.fetch = originalFetch;
    delete pageAccessTokens[pageTokenKey(ownerScopeId, "page-1")];
  }
});

test("supports post draft, update, duplicate, and delete actions", async () => {
  jobs.length = 0;
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use("/api/posts", postsRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const apiRoot = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const baseUrl = `${apiRoot}/posts`;

  try {
    const admin = await loginAsAdmin(apiRoot);
    const draftForm = new FormData();
    draftForm.append("content", "Action menu test");
    draftForm.append("pageIds", "[]");
    const draftResponse = await fetch(`${baseUrl}/draft`, { method: "POST", headers: { Cookie: admin.cookie }, body: draftForm });
    assert.equal(draftResponse.status, 201);
    const draft = await draftResponse.json() as { id: string; status: string };
    assert.equal(draft.status, "draft");

    const scheduleForm = new FormData();
    scheduleForm.append("content", "Updated action menu test");
    scheduleForm.append("pageIds", JSON.stringify(["page-1"]));
    scheduleForm.append("scheduledAt", new Date(Date.now() + 60_000).toISOString());
    scheduleForm.append("status", "scheduled");
    const scheduleResponse = await fetch(`${baseUrl}/${draft.id}`, { method: "PATCH", headers: { Cookie: admin.cookie }, body: scheduleForm });
    assert.equal(scheduleResponse.status, 200);
    assert.equal((await scheduleResponse.json()).status, "scheduled");

    const moveToDraftForm = new FormData();
    moveToDraftForm.append("status", "draft");
    const moveToDraftResponse = await fetch(`${baseUrl}/${draft.id}`, { method: "PATCH", headers: { Cookie: admin.cookie }, body: moveToDraftForm });
    assert.equal(moveToDraftResponse.status, 200);
    assert.equal((await moveToDraftResponse.json()).status, "draft");

    const duplicateResponse = await fetch(`${baseUrl}/${draft.id}/duplicate`, { method: "POST", headers: { Cookie: admin.cookie } });
    assert.equal(duplicateResponse.status, 201);
    const duplicate = await duplicateResponse.json() as { id: string; status: string };
    assert.equal(duplicate.status, "draft");

    const deleteResponse = await fetch(`${baseUrl}/${duplicate.id}`, { method: "DELETE", headers: { Cookie: admin.cookie } });
    assert.equal(deleteResponse.status, 204);
    assert.equal(jobs.some((job) => job.id === duplicate.id), false);
  } finally {
    jobs.length = 0;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("isolates posts between browsers and switched users and rejects anonymous access", async () => {
  jobs.length = 0;
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use("/api/posts", postsRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const apiRoot = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const postsUrl = `${apiRoot}/posts`;

  try {
    const browserA = await loginAsAdmin(apiRoot);
    const browserB = await loginAsAdmin(apiRoot);
    assert.notEqual(browserA.cookie, browserB.cookie);

    const anonymousResponse = await fetch(postsUrl);
    assert.equal(anonymousResponse.status, 401);

    const adminDraftForm = new FormData();
    adminDraftForm.append("content", "Private admin post");
    adminDraftForm.append("pageIds", "[]");
    const adminDraftResponse = await fetch(`${postsUrl}/draft`, {
      method: "POST",
      headers: { Cookie: browserA.cookie },
      body: adminDraftForm
    });
    assert.equal(adminDraftResponse.status, 201);
    const adminDraft = await adminDraftResponse.json();

    const browserBPosts = await fetch(postsUrl, { headers: { Cookie: browserB.cookie } });
    assert.deepEqual(await browserBPosts.json(), []);
    const crossBrowserDelete = await fetch(`${postsUrl}/${adminDraft.id}`, {
      method: "DELETE",
      headers: { Cookie: browserB.cookie }
    });
    assert.equal(crossBrowserDelete.status, 404);

    const email = `isolated-user-${Date.now()}@example.com`;
    const registerResponse = await fetch(`${apiRoot}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: browserA.cookie },
      body: JSON.stringify({
        fullName: "Isolated User",
        email,
        country: "IN",
        password: "StrongPass!1",
        accountType: "creator",
        termsAccepted: true
      })
    });
    assert.equal(registerResponse.status, 201);
    const registeredUser = (await registerResponse.json()).user;
    const registrationCookie = sessionCookie(registerResponse) || browserA.cookie;

    const chooseDemoResponse = await fetch(`${apiRoot}/auth/payment/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: registrationCookie },
      body: JSON.stringify({ planId: "demo" })
    });
    assert.equal(chooseDemoResponse.status, 200);
    const submitDemoResponse = await fetch(`${apiRoot}/auth/payment/demo-submit`, {
      method: "POST",
      headers: { Cookie: registrationCookie }
    });
    assert.equal(submitDemoResponse.status, 200);

    const approveResponse = await fetch(`${apiRoot}/auth/admin/approve-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: browserB.cookie },
      body: JSON.stringify({ userId: registeredUser.id })
    });
    assert.equal(approveResponse.status, 200);

    const userDraftForm = new FormData();
    userDraftForm.append("content", "Private switched-user post");
    userDraftForm.append("pageIds", "[]");
    const userDraftResponse = await fetch(`${postsUrl}/draft`, {
      method: "POST",
      headers: { Cookie: browserA.cookie },
      body: userDraftForm
    });
    assert.equal(userDraftResponse.status, 201);
    const userDraft = await userDraftResponse.json();

    const switchToAdmin = await fetch(`${apiRoot}/auth/switch-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: browserA.cookie },
      body: JSON.stringify({ userId: browserA.user.id })
    });
    assert.equal(switchToAdmin.status, 200);
    const adminPosts = await fetch(postsUrl, { headers: { Cookie: browserA.cookie } });
    const adminPostList = await adminPosts.json();
    assert.deepEqual(adminPostList.map((post: { id: string }) => post.id), [adminDraft.id]);

    const switchToUser = await fetch(`${apiRoot}/auth/switch-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: browserA.cookie },
      body: JSON.stringify({ userId: registeredUser.id })
    });
    assert.equal(switchToUser.status, 200);
    const switchedUserPosts = await fetch(postsUrl, { headers: { Cookie: browserA.cookie } });
    const switchedUserPostList = await switchedUserPosts.json();
    assert.deepEqual(switchedUserPostList.map((post: { id: string }) => post.id), [userDraft.id]);
  } finally {
    jobs.length = 0;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("serves stored post media and rejects private link preview targets", async () => {
  jobs.length = 0;
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use("/api/posts", postsRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const apiRoot = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const baseUrl = `${apiRoot}/posts`;

  try {
    const admin = await loginAsAdmin(apiRoot);
    jobs.push({
      id: "media-preview-test",
      content: "Photo post",
      pageIds: [],
      ownerScopeId: admin.scopeId,
      scheduledAt: new Date().toISOString(),
      status: "draft",
      media: {
        path: resolve(process.cwd(), "uploads", ".gitignore"),
        mimeType: "image/png",
        originalName: "photo.png"
      }
    });

    const mediaResponse = await fetch(`${baseUrl}/media-preview-test/media`, { headers: { Cookie: admin.cookie } });
    assert.equal(mediaResponse.status, 200);
    assert.equal(mediaResponse.headers.get("content-type"), "image/png");
    assert.ok((await mediaResponse.arrayBuffer()).byteLength > 0);

    const previewResponse = await fetch(`${baseUrl}/link-preview?url=${encodeURIComponent("http://127.0.0.1/")}`);
    assert.equal(previewResponse.status, 400);
  } finally {
    jobs.length = 0;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("keeps multi-page jobs alive when one page fails but another succeeds", async () => {
  jobs.length = 0;
  const ownerScopeId = "multi-page-test";
  pageAccessTokens[pageTokenKey(ownerScopeId, "page-1")] = "page-token-1";
  pageAccessTokens[pageTokenKey(ownerScopeId, "page-2")] = "page-token-2";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("page-1")) {
      return { ok: true, json: async () => ({ id: "post-1" }) } as Response;
    }

    throw new Error("page-2 failed");
  };

  try {
    jobs.push({
      id: "job-2",
      content: "Hello multi-page",
      pageIds: ["page-1", "page-2"],
      ownerScopeId,
      scheduledAt: new Date(Date.now() - 1000).toISOString(),
      status: "scheduled"
    });

    await refreshScheduledJobs();

    assert.equal(jobs[0].status, "partial");
    assert.equal(jobs[0].pageErrors?.["page-2"], "page-2 failed");
  } finally {
    globalThis.fetch = originalFetch;
    delete pageAccessTokens[pageTokenKey(ownerScopeId, "page-1")];
    delete pageAccessTokens[pageTokenKey(ownerScopeId, "page-2")];
  }
});

test("publishes images and videos through the matching Page Graph API endpoints", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: FormData }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), body: init?.body as FormData });
    return new Response(JSON.stringify({ id: "media-post" }), { status: 200 });
  };

  try {
    const mediaPath = resolve(process.cwd(), "uploads", ".gitignore");
    const imagePostId = await publishToPage("page-1", "page-token", "Photo caption", {
      path: mediaPath,
      mimeType: "image/png",
      originalName: "photo.png"
    });
    const videoPostId = await publishToPage("page-1", "page-token", "Video caption", {
      path: mediaPath,
      mimeType: "video/mp4",
      originalName: "video.mp4"
    });

    assert.equal(imagePostId, "media-post");
    assert.equal(videoPostId, "media-post");
    assert.match(requests[0].url, /page-1\/photos$/);
    assert.equal(requests[0].body.get("caption"), "Photo caption");
    assert.equal(requests[0].body.get("access_token"), "page-token");
    assert.match(requests[1].url, /page-1\/videos$/);
    assert.equal(requests[1].body.get("description"), "Video caption");
    assert.equal(requests[1].body.get("access_token"), "page-token");

    globalThis.fetch = async () => new Response(JSON.stringify({
      error: { message: "Permissions error", code: 200, error_subcode: 1815045 }
    }), { status: 400 });
    await assert.rejects(
      publishToPage("page-1", "page-token", "Denied"),
      /Permissions error \(code 200, subcode 1815045\)/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
