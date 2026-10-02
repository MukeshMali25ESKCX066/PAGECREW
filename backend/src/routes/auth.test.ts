import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { activateFacebookAccount, clearFacebookAccounts, listFacebookAccounts, resolveConnectedAccountProfile, storeFacebookAccount } from "./auth.js";
import postsRouter, { jobs, refreshScheduledJobs } from "./posts.js";
import pagesRouter, { pageAccessTokens } from "./pages.js";
import { publishToPage } from "../services/meta.js";

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

test("loads Facebook Pages using only the selected account token", async () => {
  clearFacebookAccounts();
  storeFacebookAccount({ id: "account-1", name: "First account", accessToken: "first-token" });
  storeFacebookAccount({ id: "account-2", name: "Second account", accessToken: "second-token" });
  const originalFetch = globalThis.fetch;
  const app = express();
  app.use("/api/pages", pagesRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/pages`;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    if (new URL(String(input)).hostname === "127.0.0.1") return originalFetch(input);
    const token = new URL(String(input)).searchParams.get("access_token") || "";
    const accountNumber = token === "second-token" ? 2 : 1;
    return new Response(JSON.stringify({data: [{
      id: `page-${accountNumber}`,
      name: `Page ${accountNumber}`,
      access_token: `page-token-${accountNumber}`
    }]}), {status: 200});
  };

  try {
    const response = await fetch(`${baseUrl}?accountId=account-2`);
    const pages = await response.json() as Array<{id: string; name: string; account: string; accountId: string}>;
    assert.equal(pages.length, 1);
    assert.equal(pages[0].id, "page-2");
    assert.equal(pages[0].name, "Page 2");
    assert.equal(pages[0].account, "Second account");
    assert.equal(pages[0].accountId, "account-2");
    assert.equal(pageAccessTokens["page-2"], "page-token-2");
  } finally {
    globalThis.fetch = originalFetch;
    clearFacebookAccounts();
    delete pageAccessTokens["page-1"];
    delete pageAccessTokens["page-2"];
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

test("publishes scheduled jobs when their time has arrived", async () => {
  jobs.length = 0;
  pageAccessTokens["page-1"] = "page-token";

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
      scheduledAt: new Date(Date.now() - 1000).toISOString(),
      status: "scheduled"
    });

    await refreshScheduledJobs();

    assert.equal(jobs[0].status, "published");
  } finally {
    globalThis.fetch = originalFetch;
    delete pageAccessTokens["page-1"];
  }
});

test("supports post draft, update, duplicate, and delete actions", async () => {
  jobs.length = 0;
  const app = express();
  app.use("/api/posts", postsRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/posts`;

  try {
    const draftForm = new FormData();
    draftForm.append("content", "Action menu test");
    draftForm.append("pageIds", "[]");
    const draftResponse = await fetch(`${baseUrl}/draft`, { method: "POST", body: draftForm });
    assert.equal(draftResponse.status, 201);
    const draft = await draftResponse.json() as { id: string; status: string };
    assert.equal(draft.status, "draft");

    const scheduleForm = new FormData();
    scheduleForm.append("content", "Updated action menu test");
    scheduleForm.append("pageIds", JSON.stringify(["page-1"]));
    scheduleForm.append("scheduledAt", new Date(Date.now() + 60_000).toISOString());
    scheduleForm.append("status", "scheduled");
    const scheduleResponse = await fetch(`${baseUrl}/${draft.id}`, { method: "PATCH", body: scheduleForm });
    assert.equal(scheduleResponse.status, 200);
    assert.equal((await scheduleResponse.json()).status, "scheduled");

    const moveToDraftForm = new FormData();
    moveToDraftForm.append("status", "draft");
    const moveToDraftResponse = await fetch(`${baseUrl}/${draft.id}`, { method: "PATCH", body: moveToDraftForm });
    assert.equal(moveToDraftResponse.status, 200);
    assert.equal((await moveToDraftResponse.json()).status, "draft");

    const duplicateResponse = await fetch(`${baseUrl}/${draft.id}/duplicate`, { method: "POST" });
    assert.equal(duplicateResponse.status, 201);
    const duplicate = await duplicateResponse.json() as { id: string; status: string };
    assert.equal(duplicate.status, "draft");

    const deleteResponse = await fetch(`${baseUrl}/${duplicate.id}`, { method: "DELETE" });
    assert.equal(deleteResponse.status, 204);
    assert.equal(jobs.some((job) => job.id === duplicate.id), false);
  } finally {
    jobs.length = 0;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("serves stored post media and rejects private link preview targets", async () => {
  jobs.length = 0;
  jobs.push({
    id: "media-preview-test",
    content: "Photo post",
    pageIds: [],
    scheduledAt: new Date().toISOString(),
    status: "draft",
    media: {
      path: resolve(process.cwd(), "uploads", ".gitignore"),
      mimeType: "image/png",
      originalName: "photo.png"
    }
  });
  const app = express();
  app.use("/api/posts", postsRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/posts`;

  try {
    const mediaResponse = await fetch(`${baseUrl}/media-preview-test/media`);
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
  pageAccessTokens["page-1"] = "page-token-1";
  pageAccessTokens["page-2"] = "page-token-2";

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
      scheduledAt: new Date(Date.now() - 1000).toISOString(),
      status: "scheduled"
    });

    await refreshScheduledJobs();

    assert.equal(jobs[0].status, "partial");
    assert.equal(jobs[0].pageErrors?.["page-2"], "page-2 failed");
  } finally {
    globalThis.fetch = originalFetch;
    delete pageAccessTokens["page-1"];
    delete pageAccessTokens["page-2"];
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
