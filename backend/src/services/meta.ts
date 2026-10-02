import { openAsBlob } from "node:fs";

/**
 * Meta API integration boundary.
 *
 * Production implementation should:
 * 1. Exchange OAuth code for a user access token.
 * 2. Obtain Page access tokens using the official Meta Graph API.
 * 3. Store encrypted tokens server-side.
 * 4. Publish/schedule only where the authorized Page permissions allow it.
 *
 * Never collect or store Facebook account passwords.
 */
export type PublishMedia = {
  path: string;
  mimeType: string;
  originalName: string;
};

export async function publishToPage(pageId: string, pageToken: string, message: string, media?: PublishMedia) {
  let res: Response;

  if (media) {
    const isVideo = media.mimeType.startsWith("video/");
    const body = new FormData();
    body.append("source", await openAsBlob(media.path, { type: media.mimeType }), media.originalName);
    body.append(isVideo ? "description" : "caption", message);
    body.append("access_token", pageToken);
    res = await fetch(`https://graph.facebook.com/v23.0/${pageId}/${isVideo ? "videos" : "photos"}`, {
      method: "POST",
      body
    });
  } else {
    res = await fetch(`https://graph.facebook.com/v23.0/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, access_token: pageToken })
    });
  }

  const data = await res.json().catch(() => ({})) as {
    id?: string;
    error?: { message?: string; code?: number; error_subcode?: number };
  };

  if (!res.ok || !data.id) {
    const code = data.error?.code;
    const subcode = data.error?.error_subcode;
    const errorCode = code === undefined ? "" : ` (code ${code}${subcode === undefined ? "" : `, subcode ${subcode}`})`;
    throw new Error(`${data.error?.message || "Facebook publish failed"}${errorCode}`);
  }

  return data.id;
}
