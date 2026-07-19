import { motion } from "framer-motion";
import {
  ArrowRight,
  Brain,
  Command,
  FileText,
  Link2,
  Mic,
  Plus,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { searchResults } from "../../data/mockData";
import type { MemoryInput } from "../../lib/supabase";
import type { SignedUploadOptions } from "../../lib/signedUpload";
import { formatFileSize, validateUpload } from "../../lib/uploads";

type CaptureModalProps = {
  onClose: () => void;
  onSave: (memory: MemoryInput, file?: File, uploadOptions?: SignedUploadOptions) => Promise<void>;
};

export function CaptureModal({ onClose, onSave }: CaptureModalProps) {
  const [mode, setMode] = useState<MemoryInput["kind"]>("Note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => () => uploadAbortRef.current?.abort(), []);
  const modes = [{ label: "Note" as const, icon: FileText }, { label: "Upload" as const, icon: UploadCloud }, { label: "Link" as const, icon: Link2 }, { label: "Voice" as const, icon: Mic }];
  const selectFile = (file: File | null) => {
    setCaptureError(null);
    if (!file) return setSelectedFile(null);
    try {
      validateUpload(file);
      setSelectedFile(file);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    } catch (error) {
      setSelectedFile(null);
      setCaptureError(error instanceof Error ? error.message : "This file cannot be uploaded.");
    }
  };
  const save = async () => {
    setCaptureError(null);
    if (mode === "Upload" && !selectedFile) return setCaptureError("Choose a file before saving this memory.");
    if (mode === "Link") {
      try {
        const url = new URL(body);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported URL protocol");
      } catch { return setCaptureError("Enter a complete URL beginning with http:// or https://."); }
    }
    setSaving(true);
    const uploadController = mode === "Upload" ? new AbortController() : null;
    uploadAbortRef.current = uploadController;
    setUploadProgress(uploadController ? 0 : null);
    try {
      await onSave(
        { title: title.trim() || selectedFile?.name || `${mode} memory`, content: mode === "Link" ? "" : body.trim(), kind: mode, sourceUrl: mode === "Link" ? body.trim() : undefined },
        selectedFile ?? undefined,
        uploadController ? { signal: uploadController.signal, onProgress: setUploadProgress } : undefined,
      );
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setCaptureError(error instanceof Error ? error.message : "This memory could not be saved.");
      }
    } finally {
      uploadAbortRef.current = null;
      setSaving(false);
      setUploadProgress(null);
    }
  };
  const close = () => {
    uploadAbortRef.current?.abort();
    onClose();
  };

  return (
    <motion.div className="modal-card capture-modal" initial={{ opacity: 0, scale: .96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97, y: 8 }} role="dialog" aria-modal="true">
      <div className="modal-header"><div><span className="card-kicker"><Plus size={14} /> Add to your brain</span><h2>Capture a memory</h2></div><button className="icon-button" onClick={close} aria-label="Close capture"><X size={19} /></button></div>
      <div className="capture-tabs">{modes.map(({ label, icon: Icon }) => <button type="button" key={label} disabled={saving} className={mode === label ? "active" : ""} onClick={() => { setMode(label); setCaptureError(null); }}><Icon size={17} />{label}</button>)}</div>
      {mode === "Note" ? (
        <div className="note-form"><input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Give this thought a title..." /><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Start typing. Neuron will organize, tag and connect it for you..." /><div className="ai-processing"><Sparkles size={15} /><span>Auto-summary, tags and connections are on</span></div></div>
      ) : mode === "Upload" ? (
        <div
          className={`drop-zone upload-drop-zone ${selectedFile ? "has-file" : ""} ${dragActive ? "drag-active" : ""}`}
          role={!selectedFile ? "button" : undefined}
          tabIndex={!selectedFile ? 0 : undefined}
          onClick={() => { if (!selectedFile) fileInputRef.current?.click(); }}
          onKeyDown={(event) => { if (!selectedFile && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); fileInputRef.current?.click(); } }}
          onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragActive(true); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }}
          onDrop={(event) => { event.preventDefault(); setDragActive(false); selectFile(event.dataTransfer.files[0] ?? null); }}
        >
          <input
            ref={fileInputRef}
            className="file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.jfif,.png,.webp,.txt,.md,.markdown,.docx,.pptx,.xlsx,.mp3,.mpeg,.m4a,.mp4,.wav,.webm"
            onChange={(event) => { selectFile(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }}
          />
          <span className="drop-icon"><UploadCloud /></span>
          {selectedFile ? <><h3>{selectedFile.name}</h3><p>{formatFileSize(selectedFile.size)} · {selectedFile.type || "Detected from extension"}</p><div className="file-actions"><button type="button" onClick={() => fileInputRef.current?.click()}>Browse another</button><button type="button" onClick={() => selectFile(null)}>Remove</button></div></> : <><h3>{dragActive ? "Drop the file now" : "Drop an image or file here"}</h3><p>Browse your Pictures or Documents folders · up to 10 MB</p><button type="button" className="file-picker" onClick={(event) => { event.stopPropagation(); fileInputRef.current?.click(); }}><UploadCloud size={15} /> Browse files</button><small>JPEG, PNG, WebP, PDF, Office, text, and audio</small></>}
        </div>
      ) : mode === "Link" ? (
        <div className="link-capture"><span className="drop-icon"><Link2 /></span><h3>Save a web memory</h3><p>Neuron will queue the page for extraction and enrichment.</p><input type="url" value={body} onChange={(event) => setBody(event.target.value)} placeholder="https://example.com/article" /><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional title" /></div>
      ) : (
        <div className="drop-zone"><span className="drop-icon"><Mic /></span><h3>Voice recording is next</h3><p>Audio file uploads work now. Live microphone capture arrives with the processing worker.</p><button onClick={() => setMode("Upload")}>Upload audio instead</button></div>
      )}
      {mode === "Upload" && saving && uploadProgress !== null && <div className="upload-progress" role="progressbar" aria-label="Private file upload" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}><div><span style={{ width: `${uploadProgress}%` }} /></div><p><span>Uploading securely</span><strong>{uploadProgress}%</strong></p></div>}
      {captureError && <div className="capture-error"><X size={15} />{captureError}</div>}
      <div className="modal-footer"><span><Command size={12} /> Enter to save</span><div><button className="cancel" onClick={close}>{saving && mode === "Upload" ? "Cancel upload" : "Cancel"}</button><button className="save" onClick={save} disabled={saving}>{saving ? uploadProgress !== null ? `Uploading ${uploadProgress}%` : "Saving…" : "Save memory"} <ArrowRight size={15} /></button></div></div>
    </motion.div>
  );
}

export function SearchModal({ query, onClose }: { query: string; onClose: () => void }) {
  const [value, setValue] = useState(query);
  return (
    <motion.div className="modal-card search-modal" initial={{ opacity: 0, scale: .97, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .98 }} role="dialog" aria-modal="true">
      <div className="modal-search"><Sparkles size={20} /><input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder="Ask your second brain..." /><button onClick={onClose}><span>ESC</span><X size={18} /></button></div>
      {value ? <div className="search-response"><div className="answer-summary"><span><Brain size={18} /></span><p>I found <strong>3 memories</strong> that match your intent, including context around when and why you saved them.</p></div><span className="results-label">Best matches</span>{searchResults.map(({ title, detail, match, icon: Icon }) => <button className="result-row" key={title}><span className="result-icon"><Icon size={18} /></span><span><strong>{title}</strong><small>{detail}</small></span><em>{match}</em></button>)}</div> : <div className="empty-search"><Brain size={34} /><h3>Search by meaning, not just words</h3><p>Try “What was that article I saved before demo day?”</p></div>}
      <div className="search-footer"><span><Sparkles size={13} /> Semantic search across 1,248 memories</span><span>↑↓ navigate · ↵ open</span></div>
    </motion.div>
  );
}

export function AssistantPanel({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <motion.aside className="assistant-panel" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 28, stiffness: 280 }}>
      <div className="assistant-head"><div><span className="assistant-logo"><Brain size={19} /></span><span><strong>Neuron</strong><small>Your personal thinking partner</small></span></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div>
      <div className="assistant-body"><div className="assistant-intro"><span><Sparkles size={18} /></span><h2>What are we thinking about?</h2><p>I can search, connect, summarize and build on everything you’ve saved.</p></div><div className="suggestions">{["Summarize what I learned this week", "Connect my notes about offline apps", "Turn recent notes into a project plan"].map((text) => <button key={text} onClick={() => setMessage(text)}>{text}<ArrowRight size={14} /></button>)}</div>{sent && <div className="chat-bubble"><p>{message}</p><span>Thinking across your memories…</span></div>}</div>
      <form className="assistant-input" onSubmit={(event) => { event.preventDefault(); if (message) setSent(true); }}><textarea value={message} onChange={(event) => { setMessage(event.target.value); setSent(false); }} placeholder="Ask Neuron..." /><div><button type="button"><Mic size={17} /></button><button className="send" type="submit"><ArrowRight size={17} /></button></div></form>
    </motion.aside>
  );
}
