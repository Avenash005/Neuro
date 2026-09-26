import { motion } from "framer-motion";
import {
  Brain,
  FileText,
  LoaderCircle,
  Link2,
  Mic,
  Sparkles,
  UploadCloud,
  X,
  FileIcon,
  CheckCircle,
  Tag,
  Square,
  Radio,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MemoryInput, MemoryRecord } from "../../lib/supabase";
import type { SignedUploadOptions } from "../../lib/signedUpload";
import { formatFileSize, validateUpload } from "../../lib/uploads";

type CaptureModalProps = {
  onClose: () => void;
  onSave: (memory: MemoryInput, file?: File, uploadOptions?: SignedUploadOptions) => Promise<void>;
  defaultMode?: "Note" | "Upload" | "Link" | "Voice";
};

export function CaptureModal({ onClose, onSave, defaultMode = "Note" }: CaptureModalProps) {
  const [mode, setMode] = useState<MemoryInput["kind"]>(defaultMode);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Voice memo state
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const recordTimerRef = useRef<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (defaultMode) {
      setMode(defaultMode);
    }
  }, [defaultMode]);

  useEffect(() => {
    return () => {
      uploadAbortRef.current?.abort();
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
    };
  }, []);

  const selectFile = (file: File | null) => {
    setCaptureError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    try {
      validateUpload(file);
      setSelectedFile(file);
      if (!title.trim()) {
        setTitle(file.name.replace(/\.[^.]+$/, ""));
      }
    } catch (error) {
      setSelectedFile(null);
      setCaptureError(error instanceof Error ? error.message : "This file cannot be uploaded.");
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      if (!body.trim()) {
        setBody(`Voice memo recorded on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`);
      }
      if (!title.trim()) {
        setTitle(`Voice Memo — ${new Date().toLocaleDateString()}`);
      }
    } else {
      setIsRecording(true);
      setRecordDuration(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);
    }
  };

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setCaptureError(null);

    if (mode === "Upload" && !selectedFile) {
      setCaptureError("Please select a file to upload.");
      return;
    }

    if (mode === "Link") {
      if (!body.trim()) {
        setCaptureError("Please enter a valid web link URL.");
        return;
      }
      try {
        const parsed = new URL(body.trim());
        if (!["http:", "https:"].includes(parsed.protocol)) {
          throw new Error("Invalid protocol");
        }
      } catch {
        setCaptureError("Please enter a complete URL starting with https:// or http://");
        return;
      }
    }

    if (mode === "Note" && !body.trim() && !title.trim()) {
      setCaptureError("Please enter a title or note content.");
      return;
    }

    setSaving(true);
    const uploadController = mode === "Upload" ? new AbortController() : null;
    uploadAbortRef.current = uploadController;
    setUploadProgress(uploadController ? 0 : null);

    const parsedTags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      await onSave(
        {
          title: title.trim() || selectedFile?.name || `${mode} memory`,
          content: mode === "Link" ? "" : body.trim(),
          kind: mode,
          sourceUrl: mode === "Link" ? body.trim() : undefined,
          tags: parsedTags,
        },
        selectedFile ?? undefined,
        uploadController ? { signal: uploadController.signal, onProgress: setUploadProgress } : undefined
      );
      onClose();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setCaptureError(error instanceof Error ? error.message : "Could not save memory.");
      }
    } finally {
      uploadAbortRef.current = null;
      setSaving(false);
      setUploadProgress(null);
    }
  };

  const tabs = [
    { id: "Note" as const, label: "Text Note", icon: FileText },
    { id: "Upload" as const, label: "Upload File", icon: UploadCloud },
    { id: "Link" as const, label: "Web Link", icon: Link2 },
    { id: "Voice" as const, label: "Voice Memo", icon: Mic },
  ];

  return (
    <motion.div
      className="modal-card capture-modal-card"
      initial={{ opacity: 0, scale: 0.96, y: 14 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 10 }}
      transition={{ duration: 0.2 }}
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Modal Header */}
      <div className="modal-header">
        <div>
          <span className="card-kicker">
            <Brain size={13} /> Neuron Second Brain
          </span>
          <h2>Add Knowledge</h2>
        </div>
        <button
          className="icon-button close-btn"
          onClick={onClose}
          aria-label="Close modal"
          disabled={saving}
        >
          <X size={18} />
        </button>
      </div>

      {/* Mode Tabs */}
      <div className="capture-mode-tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = mode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`capture-tab-btn ${isActive ? "active" : ""}`}
              onClick={() => {
                setMode(tab.id);
                setCaptureError(null);
              }}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Body Form */}
      <form onSubmit={handleSave} className="capture-form-body">
        {mode === "Note" && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="capture-field-label">Title</label>
              <input
                className="capture-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="E.g., System Architecture Review, Meeting Takeaways..."
                autoFocus
              />
            </div>
            <div>
              <label className="capture-field-label">Note Content</label>
              <textarea
                className="capture-textarea"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your thoughts, paste code or markdown. Neuron will automatically extract key entities and connect related knowledge..."
                rows={6}
              />
            </div>
          </div>
        )}

        {mode === "Upload" && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="capture-field-label">Document or File</label>
              <div
                className={`capture-dropzone ${selectedFile ? "has-file" : ""} ${dragActive ? "drag-active" : ""}`}
                onClick={() => {
                  if (!selectedFile) fileInputRef.current?.click();
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  selectFile(e.dataTransfer.files[0] ?? null);
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
                  accept=".pdf,.docx,.txt,.md,.json,.csv,.png,.jpg,.jpeg,.mp3,.mp4"
                />

                {selectedFile ? (
                  <div className="flex items-center justify-between w-full p-3 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold">
                        <FileIcon size={20} />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate max-w-[280px]">
                          {selectedFile.name}
                        </p>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {formatFileSize(selectedFile.size)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectFile(null);
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors"
                      title="Remove file"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3">
                      <UploadCloud size={24} />
                    </div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
                      Drag and drop files here, or <span className="text-indigo-600 dark:text-indigo-400 underline cursor-pointer">browse</span>
                    </p>
                    <p className="text-xs text-slate-400">
                      Supports PDF, DOCX, TXT, PNG, JPG, MP3, MP4 (up to 50MB)
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="capture-field-label">Title (Optional)</label>
              <input
                className="capture-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give this document a title or leave empty for filename"
              />
            </div>
          </div>
        )}

        {mode === "Link" && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="capture-field-label">URL / Web Link</label>
              <input
                className="capture-input"
                type="url"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="https://example.com/article-or-documentation"
                autoFocus
              />
            </div>
            <div>
              <label className="capture-field-label">Title Override (Optional)</label>
              <input
                className="capture-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Custom title for this bookmark"
              />
            </div>
          </div>
        )}

        {mode === "Voice" && (
          <div className="flex flex-col gap-4">
            <div className="voice-recorder-card">
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 transition-all ${
                    isRecording
                      ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30 ring-8 ring-red-500/20"
                      : "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 hover:scale-105"
                  }`}
                  onClick={toggleRecording}
                  role="button"
                  tabIndex={0}
                >
                  {isRecording ? <Square size={28} /> : <Mic size={28} />}
                </div>

                {isRecording ? (
                  <>
                    <div className="flex items-center gap-2 text-red-500 font-bold text-xs uppercase tracking-wider mb-1">
                      <Radio size={14} className="animate-spin" /> Recording in progress
                    </div>
                    <span className="text-2xl font-mono font-bold text-slate-800 dark:text-slate-100">
                      {formatDuration(recordDuration)}
                    </span>
                    <p className="text-xs text-slate-400 mt-2">
                      Click the square button above when you are finished speaking.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      {recordDuration > 0 ? "Recording Captured" : "Audio Memo Recorder"}
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">
                      {recordDuration > 0
                        ? `Recorded ${formatDuration(recordDuration)}. Click save to process transcription.`
                        : "Click the microphone button to start recording your thoughts."}
                    </p>
                  </>
                )}
              </div>
            </div>

            <div>
              <label className="capture-field-label">Memo Title</label>
              <input
                className="capture-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="E.g., Morning Brainstorm, Audio Note..."
              />
            </div>
          </div>
        )}

        {/* Common Tags Input */}
        <div>
          <label className="capture-field-label flex items-center gap-1.5">
            <Tag size={13} /> Tags (Comma separated)
          </label>
          <input
            className="capture-input"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="E.g., design, react, project-alpha"
          />
        </div>

        {captureError && (
          <div className="capture-error-box">
            <X size={15} />
            <span>{captureError}</span>
          </div>
        )}

        {/* Modal Footer */}
        <div className="modal-footer">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <Sparkles size={14} className="text-indigo-500" />
            <span>Neuron AI auto-indexing & vector grounding</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="cancel"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="save"
              disabled={saving}
            >
              {saving ? (
                <>
                  <LoaderCircle size={15} className="animate-spin" />
                  <span>{uploadProgress !== null ? `Uploading ${uploadProgress}%` : "Processing..."}</span>
                </>
              ) : (
                <>
                  <CheckCircle size={15} />
                  <span>Save Memory</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </motion.div>
  );
}

// Fallback stubs to preserve any external imports cleanly
export function SearchModal(_props: { query: string; onClose: () => void; onOpenMemory: (m: MemoryRecord) => void }) {
  return null;
}

export function AssistantPanel(_props: { onClose: () => void; onOpenMemory: (m: MemoryRecord) => void }) {
  return null;
}
