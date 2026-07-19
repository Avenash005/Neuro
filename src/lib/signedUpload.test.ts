import { describe, expect, it, vi } from "vitest";
import { uploadToSignedUrlWithProgress } from "./signedUpload";

class FakeRequest {
  status = 200;
  responseText = "";
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn((_body: unknown) => {
    this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
    this.onload?.();
  });
  abort = vi.fn(() => this.onabort?.());
}

describe("signed upload transport", () => {
  it("uploads multipart content and reports real progress", async () => {
    const request = new FakeRequest();
    const progress = vi.fn();

    await uploadToSignedUrlWithProgress(
      "https://example.supabase.co/storage/v1/object/upload/sign/bucket/file?token=test",
      new Blob(["content"]),
      { onProgress: progress },
      () => request as unknown as XMLHttpRequest,
    );

    expect(request.open).toHaveBeenCalledWith("PUT", expect.stringContaining("token=test"));
    expect(request.setRequestHeader).toHaveBeenCalledWith("x-upsert", "false");
    expect(request.send.mock.calls[0][0]).toBeInstanceOf(FormData);
    expect(progress.mock.calls.map(([value]) => value)).toEqual([50, 100]);
  });

  it("surfaces storage errors", async () => {
    const request = new FakeRequest();
    request.status = 413;
    request.responseText = JSON.stringify({ message: "File is too large" });

    await expect(uploadToSignedUrlWithProgress(
      "https://example.test/signed",
      new Blob(["content"]),
      {},
      () => request as unknown as XMLHttpRequest,
    )).rejects.toThrow("File is too large");
  });

  it("aborts when the caller cancels", async () => {
    const request = new FakeRequest();
    request.send = vi.fn((_body: unknown) => undefined);
    const controller = new AbortController();
    const pending = uploadToSignedUrlWithProgress(
      "https://example.test/signed",
      new Blob(["content"]),
      { signal: controller.signal },
      () => request as unknown as XMLHttpRequest,
    );

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(request.abort).toHaveBeenCalledOnce();
  });

  it("does not start a request when already cancelled", async () => {
    const request = new FakeRequest();
    const controller = new AbortController();
    controller.abort();

    await expect(uploadToSignedUrlWithProgress(
      "https://example.test/signed",
      new Blob(["content"]),
      { signal: controller.signal },
      () => request as unknown as XMLHttpRequest,
    )).rejects.toMatchObject({ name: "AbortError" });

    expect(request.send).not.toHaveBeenCalled();
  });
});
