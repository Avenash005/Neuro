const TRACKING_PARAMETERS = new Set([
  "dclid",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "msclkid",
]);

async function sha256Hex(data: BufferSource) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function canonicalizeMemoryUrl(input: string) {
  const url = new URL(input.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Links must use http:// or https://.");
  }

  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMETERS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  return url.toString();
}

export async function createLinkFingerprint(input: string) {
  const canonicalUrl = canonicalizeMemoryUrl(input);
  const hash = await sha256Hex(new TextEncoder().encode(canonicalUrl));
  return { canonicalUrl, fingerprint: `link:${hash}` };
}

export async function createFileFingerprint(file: Blob) {
  const hash = await sha256Hex(await file.arrayBuffer());
  return `file:${hash}`;
}
