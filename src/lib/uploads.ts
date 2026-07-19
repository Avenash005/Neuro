export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_UPLOAD_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
]);

const ALLOWED_EXTENSIONS_BY_TYPE: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg", "jfif"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "text/plain": ["txt"],
  "text/markdown": ["md", "markdown"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "audio/mpeg": ["mp3", "mpeg"],
  "audio/mp4": ["m4a", "mp4"],
  "audio/wav": ["wav"],
  "audio/webm": ["webm"],
};

type UploadCandidate = Pick<File, "name" | "size" | "type">;

export function validateUpload(file: UploadCandidate) {
  if (file.size <= 0) throw new Error("The selected file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Files must be 10 MB or smaller for browser uploads.");
  if (!ALLOWED_UPLOAD_TYPES.has(file.type)) throw new Error("This file type is not supported yet.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !ALLOWED_EXTENSIONS_BY_TYPE[file.type]?.includes(extension)) {
    throw new Error("The file extension does not match its reported type.");
  }
}

export function sanitizeFilename(filename: string) {
  const cleaned = filename
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  return cleaned || "memory-file";
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
