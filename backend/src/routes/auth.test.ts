import test from "node:test";
import assert from "node:assert/strict";
import { resolveConnectedAccountProfile } from "./auth.js";
import { jobs, refreshScheduledJobs } from "./posts.js";
import { pageAccessTokens } from "./pages.js";

test("returns a demo profile when demo mode is on and the session is connected", () => {
  const profile = resolveConnectedAccountProfile({
    demoMode: true,
    accessToken: "",
    connected: true
  });

  assert.equal(profile.connected, true);
  assert.equal(profile.name, "Demo Facebook User");
  assert.ok(profile.avatarUrl.includes("facebook"));
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
