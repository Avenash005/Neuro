export type SignedUploadOptions = {
  cacheControl?: string;
  signal?: AbortSignal;
  onProgress?: (percentage: number) => void;
};

function uploadError(responseText: string) {
  try {
    const payload = JSON.parse(responseText) as { error?: string; message?: string };
    return new Error(payload.message || payload.error || "The signed upload failed.");
  } catch {
    return new Error(responseText || "The signed upload failed.");
  }
}

export function uploadToSignedUrlWithProgress(
  signedUrl: string,
  file: Blob,
  options: SignedUploadOptions = {},
  requestFactory: () => XMLHttpRequest = () => new XMLHttpRequest(),
) {
  return new Promise<void>((resolve, reject) => {
    const request = requestFactory();
    const abort = () => request.abort();
    const cleanup = () => options.signal?.removeEventListener("abort", abort);

    request.open("PUT", signedUrl);
    request.setRequestHeader("x-upsert", "false");
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      options.onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    request.onload = () => {
      cleanup();
      if (request.status >= 200 && request.status < 300) {
        options.onProgress?.(100);
        resolve();
      } else {
        reject(uploadError(request.responseText));
      }
    };
    request.onerror = () => {
      cleanup();
      reject(new Error("The upload connection failed."));
    };
    request.onabort = () => {
      cleanup();
      reject(new DOMException("Upload cancelled.", "AbortError"));
    };

    if (options.signal?.aborted) {
      cleanup();
      reject(new DOMException("Upload cancelled.", "AbortError"));
      return;
    }
    options.signal?.addEventListener("abort", abort, { once: true });

    const body = new FormData();
    body.append("cacheControl", options.cacheControl || "3600");
    body.append("", file);
    try {
      request.send(body);
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error("The upload could not start."));
    }
  });
}
