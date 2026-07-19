import { describe, expect, it } from "vitest";
import { canonicalizeMemoryUrl, createFileFingerprint, createLinkFingerprint } from "./deduplication";

describe("memory deduplication", () => {
  it("canonicalizes equivalent links before fingerprinting", async () => {
    const first = await createLinkFingerprint("HTTPS://Example.com/article?b=2&utm_source=newsletter&a=1#section");
    const second = await createLinkFingerprint("https://example.com/article?a=1&b=2");

    expect(first.canonicalUrl).toBe("https://example.com/article?a=1&b=2");
    expect(first.fingerprint).toBe(second.fingerprint);
  });

  it("rejects links that cannot be safely fetched", () => {
    expect(() => canonicalizeMemoryUrl("file:///private/note.txt")).toThrow("http:// or https://");
  });

  it("fingerprints file contents rather than filenames", async () => {
    const first = await createFileFingerprint(new Blob(["same bytes"]));
    const renamed = await createFileFingerprint(new Blob(["same bytes"]));
    const changed = await createFileFingerprint(new Blob(["different bytes"]));

    expect(first).toMatch(/^file:[a-f0-9]{64}$/);
    expect(renamed).toBe(first);
    expect(changed).not.toBe(first);
  });
});
