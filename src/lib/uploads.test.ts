import { describe, expect, it } from "vitest";
import { formatFileSize, MAX_UPLOAD_BYTES, sanitizeFilename, validateUpload } from "./uploads";

describe("upload validation", () => {
  it("accepts a supported file within the size limit", () => {
    expect(() => validateUpload({ name: "notes.pdf", size: 1024, type: "application/pdf" })).not.toThrow();
    expect(() => validateUpload({ name: "photo.jfif", size: 1024, type: "image/jpeg" })).not.toThrow();
  });

  it("rejects oversized and unsupported files", () => {
    expect(() => validateUpload({ name: "large.pdf", size: MAX_UPLOAD_BYTES + 1, type: "application/pdf" })).toThrow("10 MB");
    expect(() => validateUpload({ name: "app.exe", size: 100, type: "application/x-msdownload" })).toThrow("not supported");
  });

  it("rejects mismatched file extensions", () => {
    expect(() => validateUpload({ name: "photo.pdf", size: 10, type: "image/png" })).toThrow("does not match");
  });
});

describe("upload helpers", () => {
  it("creates storage-safe filenames", () => {
    expect(sanitizeFilename("  Résumé / final (2).PDF ")).toBe("Resume-final-2-.PDF");
  });

  it("formats useful file sizes", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});
