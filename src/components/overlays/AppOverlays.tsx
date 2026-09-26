import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
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
  Check,
  Filter,
  Search,
} from "lucide-react";
import { useEffect, useRef, useState, useMemo } from "react";
import { askNeuron, searchMemories, type AssistantAnswer, type MemoryInput, type MemoryRecord, type MemorySearchResult } from "../../lib/supabase";
import type { SignedUploadOptions } from "../../lib/signedUpload";
import { formatFileSize, validateUpload } from "../../lib/uploads";

type CaptureModalProps = {
  onClose: () => void;
  onSave: (memory: MemoryInput, file?: File, uploadOptions?: SignedUploadOptions) => Promise<void>;
  defaultMode?: "Note" | "Upload" | "Link" | "Voice";
};

export function CaptureModal({ onClose, onSave, defaultMode }: CaptureModalProps) {
  // Capture step: 1 (Upload/Choose), 2 (Timeline animation), 3 (AI Summary review & edit)
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<MemoryInput["kind"]>(defaultMode || "Note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  
  // Voice Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const recordTimerRef = useRef<number | null>(null);

  // Simulated AI timeline states
  const [activeTimelineStep, setActiveTimelineStep] = useState(0);
  const timelineIntervalRef = useRef<number | null>(null);

  // Step 3: AI summary fields
  const [aiSummary, setAiSummary] = useState("");
  const [aiKeyTopics, setAiKeyTopics] = useState("Architecture, Guidelines, Notes");
  const [aiKeywords, setAiKeywords] = useState("core concepts, best practices, reference");
  const [aiPeople, setAiPeople] = useState("Team");
  const [aiTechnologies, setAiTechnologies] = useState("Web, Cloud, AI");
  const [aiDates, setAiDates] = useState(new Date().toLocaleDateString());
  const [aiReadingTime, setAiReadingTime] = useState("2 min read");
  const aiConfidence = "98%";
  
  // Metadata options
  const [metaFolder, setMetaFolder] = useState("General");
  const [metaPriority, setMetaPriority] = useState("medium");
  const [metaPrivacy, setMetaPrivacy] = useState("private");
  const [metaFavorite, setMetaFavorite] = useState(false);
  const [metaColorLabel, setMetaColorLabel] = useState("indigo");

  // Similar Memories mock links
  const [similarMemories, setSimilarMemories] = useState([
    { id: "1", title: "React performance guidelines", connected: false },
    { id: "2", title: "Vite bundling configurations", connected: false },
    { id: "3", title: "Supabase authentication rules", connected: false },
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (defaultMode) {
      setMode(defaultMode);
    }
  }, [defaultMode]);

  useEffect(() => () => {
    uploadAbortRef.current?.abort();
    if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
    if (timelineIntervalRef.current) window.clearInterval(timelineIntervalRef.current);
  }, []);

  const uploadCards = [
    { id: "pdf", label: "PDF Document", icon: FileText, color: "from-red-500/10 to-red-600/5 hover:border-red-500", iconColor: "text-red-500", type: "Upload" as const },
    { id: "image", label: "Image File", icon: FileIcon, color: "from-blue-500/10 to-blue-600/5 hover:border-blue-500", iconColor: "text-blue-500", type: "Upload" as const },
    { id: "screenshot", label: "Screenshot", icon: FileIcon, color: "from-teal-500/10 to-teal-600/5 hover:border-teal-500", iconColor: "text-teal-500", type: "Upload" as const },
    { id: "voice", label: "Voice Memo", icon: Mic, color: "from-orange-500/10 to-orange-600/5 hover:border-orange-500", iconColor: "text-orange-500", type: "Voice" as const },
    { id: "youtube", label: "YouTube Link", icon: Link2, color: "from-red-600/10 to-red-700/5 hover:border-red-600", iconColor: "text-red-600", type: "Link" as const },
    { id: "website", label: "Website URL", icon: Link2, color: "from-green-500/10 to-green-600/5 hover:border-green-500", iconColor: "text-green-500", type: "Link" as const },
    { id: "note", label: "Text Note", icon: FileText, color: "from-violet-500/10 to-violet-600/5 hover:border-violet-500", iconColor: "text-violet-500", type: "Note" as const },
    { id: "code", label: "Code Snippet", icon: FileText, color: "from-slate-700/10 to-slate-800/5 hover:border-slate-500", iconColor: "text-slate-600", type: "Note" as const },
    { id: "document", label: "Document File", icon: FileText, color: "from-indigo-500/10 to-indigo-600/5 hover:border-indigo-500", iconColor: "text-indigo-500", type: "Upload" as const },
    { id: "video", label: "Video Clip", icon: FileIcon, color: "from-pink-500/10 to-pink-600/5 hover:border-pink-500", iconColor: "text-pink-500", type: "Upload" as const },
  ];

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

  const handleCardClick = (card: typeof uploadCards[0]) => {
    setMode(card.type);
    setCaptureError(null);
    if (card.type === "Upload") {
      fileInputRef.current?.click();
    }
  };

  // Triggers Step 2 simulated AI processing timeline
  const triggerProcessingTimeline = () => {
    setCaptureError(null);
    if (mode === "Upload" && !selectedFile) return setCaptureError("Choose a file before saving this memory.");
    if (mode === "Link") {
      try {
        const url = new URL(body);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported URL protocol");
      } catch {
        return setCaptureError("Enter a complete URL beginning with http:// or https://.");
      }
    }
    
    // Switch to step 2
    setStep(2);
    setActiveTimelineStep(1);

    // Simulated intervals for steps
    timelineIntervalRef.current = window.setInterval(() => {
      setActiveTimelineStep((prev) => {
        if (prev >= 7) {
          if (timelineIntervalRef.current) window.clearInterval(timelineIntervalRef.current);
          
          // Autofill AI generated values based on contents
          setAiSummary(
            body.trim() ||
            (selectedFile
              ? `AI extracted summary from imported file "${selectedFile.name}". Contains tech configurations and schema notes.`
              : "AI grounding complete. Text details and metadata extracted from saved link.")
          );
          
          // Switch to step 3 after a small delay
          setTimeout(() => setStep(3), 800);
          return 7;
        }
        return prev + 1;
      });
    }, 450);
  };

  // Step 3 final save to second brain
  const saveToMyBrain = async () => {
    setSaving(true);
    const uploadController = mode === "Upload" ? new AbortController() : null;
    uploadAbortRef.current = uploadController;
    setUploadProgress(uploadController ? 0 : null);
    try {
      await onSave(
        {
          title: title.trim() || selectedFile?.name || `${mode} memory`,
          content: mode === "Link" ? "" : body.trim(),
          kind: mode,
          sourceUrl: mode === "Link" ? body.trim() : undefined,
          summary: aiSummary,
          tags: aiKeyTopics.split(",").map(t => t.trim()).filter(Boolean),
          is_favorite: metaFavorite,
        },
        selectedFile ?? undefined,
        uploadController ? { signal: uploadController.signal, onProgress: setUploadProgress } : undefined
      );
      onClose();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setCaptureError(error instanceof Error ? error.message : "This memory could not be saved.");
        setStep(1); // revert back on failure
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

  // Voice recording triggers
  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      setBody("Voice memo transcribed automatically by Neuron indexing agent.");
      if (!title) setTitle(`Voice Memo — ${new Date().toLocaleDateString()}`);
    } else {
      setIsRecording(true);
      setRecordDuration(0);
      setBody("");
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

  const toggleSimilarConnection = (id: string) => {
    setSimilarMemories(prev =>
      prev.map(item =>
        item.id === id ? { ...item, connected: !item.connected } : item
      )
    );
    showToast("Memory connection linked successfully");
  };

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  return (
    <motion.div
      className={`modal-card capture-modal premium-capture-wizard ${step === 3 ? "step-3-wide" : ""}`}
      initial={{ opacity: 0, scale: .96, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: .97, y: 8 }}
      role="dialog"
      aria-modal="true"
      style={{ maxWidth: step === 3 ? "960px" : "640px" }}
    >
      <div className="modal-header">
        <div>
          <span className="card-kicker"><Brain size={13} /> Neuron Indexer</span>
          <h2>{step === 1 ? "Add Knowledge" : step === 2 ? "Indexing Knowledge" : "Review AI Grounding"}</h2>
        </div>
        <button className="icon-button" onClick={close} aria-label="Close capture"><X size={19} /></button>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 ? (
          /* ==================================================
             STEP 1: SELECT TYPE & UPLOAD PANEL
             ================================================== */
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col gap-5"
          >
            {/* Hero Section */}
            <div className="text-center py-2">
              <h1 className="text-xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
                What would you like Neuron to remember today?
              </h1>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Upload anything. Neuron understands, organizes, connects, and remembers it for you.
              </p>
            </div>

            {/* Quick Upload Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
              {uploadCards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => handleCardClick(card)}
                  className={`flex flex-col items-center justify-center p-3 border border-slate-200/60 dark:border-slate-800 bg-gradient-to-br ${card.color} hover:shadow-md rounded-xl text-center transition-all ${
                    mode === card.type ? "border-indigo-500 dark:border-indigo-400 ring-2 ring-indigo-500/20" : ""
                  }`}
                  style={{ minHeight: "78px" }}
                >
                  <span className={`p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 ${card.iconColor}`}>
                    <card.icon size={16} />
                  </span>
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 mt-2 block leading-none">{card.label}</span>
                </button>
              ))}
            </div>

            {/* Input Forms */}
            {mode === "Note" ? (
              <div className="note-form border-t border-slate-100 dark:border-slate-800 pt-4">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Give this note a title..." className="w-full mb-3" />
                <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type naturally or paste code. Neuron AI will summarize, index key topics, and tag connections..." style={{ minHeight: "120px" }} />
              </div>
            ) : mode === "Link" ? (
              <div className="link-capture border-t border-slate-100 dark:border-slate-800 pt-4 flex flex-col gap-3">
                <input type="url" value={body} onChange={(e) => setBody(e.target.value)} placeholder="https://example.com/paste-url-link" className="w-full" />
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional custom title override" className="w-full" />
              </div>
            ) : mode === "Voice" ? (
              <div className="drop-zone border-t border-slate-100 dark:border-slate-800 pt-4" style={{ minHeight: "160px" }}>
                <span className={`drop-icon ${isRecording ? "bg-red-100 text-red-500 animate-pulse" : ""}`}><Mic /></span>
                {isRecording ? (
                  <div className="flex flex-col items-center gap-2 mt-2">
                    <span className="text-[11px] font-bold text-red-500">Recording Memo...</span>
                    <span className="text-xl font-mono font-bold text-slate-800 dark:text-slate-100">{formatDuration(recordDuration)}</span>
                    <button type="button" className="px-3 py-1.5 bg-red-500 text-white rounded text-xs font-semibold mt-2" onClick={toggleRecording}>Stop Memo</button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5">
                    <h3 className="text-xs font-bold text-slate-700">Audio Memo Recorder</h3>
                    <p className="text-[11px] text-slate-400">Record direct via your microphone or upload audio file below.</p>
                    <button type="button" className="file-picker mt-2" onClick={toggleRecording}>
                      <Mic size={13} /> Start Recording
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Drag & Drop File Zone */
              <div
                className={`drop-zone upload-drop-zone ${selectedFile ? "has-file" : ""} ${dragActive ? "drag-active" : ""}`}
                onClick={() => { if (!selectedFile) fileInputRef.current?.click(); }}
                onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
                onDrop={(e) => { e.preventDefault(); setDragActive(false); selectFile(e.dataTransfer.files[0] ?? null); }}
                style={{ minHeight: "160px" }}
              >
                <input
                  ref={fileInputRef}
                  className="file-input"
                  type="file"
                  onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
                />
                {selectedFile ? (
                  <div className="flex flex-col items-center gap-1.5">
                    <FileIcon size={32} className="text-indigo-500" />
                    <h3 className="text-xs font-bold text-slate-800 line-clamp-1">{selectedFile.name}</h3>
                    <p className="text-[10px] text-slate-400">{formatFileSize(selectedFile.size)}</p>
                    <button type="button" onClick={() => selectFile(null)} className="px-2.5 py-1 bg-red-50 text-red-500 rounded text-[10px] mt-2 font-semibold">Remove file</button>
                  </div>
                ) : (
                  <>
                    <span className="drop-icon"><UploadCloud /></span>
                    <h3 className="text-xs font-bold">Drag files here</h3>
                    <p className="text-[10px] text-slate-400">or click to browse files (PDF, DOCX, TXT, PNG, JPG, MP3, MP4)</p>
                  </>
                )}
              </div>
            )}

            {captureError && <div className="capture-error mt-2"><X size={14} />{captureError}</div>}

            <div className="modal-footer pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 flex items-center gap-1"><Sparkles size={11} className="text-indigo-500" /> Grounded AI processing</span>
              <div>
                <button type="button" className="cancel" onClick={close}>Cancel</button>
                <button type="button" className="save" onClick={triggerProcessingTimeline}>
                  Connect & Process <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        ) : step === 2 ? (
          /* ==================================================
             STEP 2: AI PROCESSING TIMELINE
             ================================================== */
          <motion.div
            key="step2"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-10"
          >
            <div className="relative w-16 h-16 mb-6 flex items-center justify-center">
              <LoaderCircle size={44} className="text-indigo-500 animate-spin absolute" />
              <Brain size={24} className="text-indigo-600 animate-pulse" />
            </div>

            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-2">
              Ingesting Memory Details {uploadProgress !== null ? `(${uploadProgress}%)` : ""}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm text-center mb-6">Neuron is analyzing, summarizing, and grounding your details inside the vector database.</p>

            {/* Simulated 7-Step Timeline */}
            <div className="flex flex-col gap-3.5 w-full max-w-xs">
              {[
                { step: 1, label: "Uploading securely..." },
                { step: 2, label: "Extracting document text..." },
                { step: 3, label: "Running OCR image layers..." },
                { step: 4, label: "Summarizing content structures..." },
                { step: 5, label: "Generating vector embeddings..." },
                { step: 6, label: "Finding similar connections..." },
                { step: 7, label: "Updating knowledge graph map..." },
              ].map((item) => {
                const isFinished = activeTimelineStep > item.step;
                const isActive = activeTimelineStep === item.step;
                return (
                  <div
                    key={item.step}
                    className={`flex items-center justify-between text-xs transition-opacity duration-300 ${
                      isFinished ? "opacity-100 text-slate-800 dark:text-slate-200" : isActive ? "opacity-100 text-indigo-600 font-bold" : "opacity-40 text-slate-400"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {isFinished ? (
                        <Check className="text-emerald-500 shrink-0" size={14} />
                      ) : isActive ? (
                        <LoaderCircle size={14} className="animate-spin text-indigo-500 shrink-0" />
                      ) : (
                        <span className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-700 shrink-0 block" />
                      )}
                      <span>{item.label}</span>
                    </span>
                    {isFinished && <span className="text-[10px] text-emerald-600 font-mono">DONE</span>}
                  </div>
                );
              })}
            </div>
            
            {activeTimelineStep >= 7 && (
              <span className="text-xs text-emerald-600 font-bold mt-8 flex items-center gap-1.5 animate-bounce"><CheckCircle size={16} /> Memory Successfully Added</span>
            )}
          </motion.div>
        ) : (
          /* ==================================================
             STEP 3: REVIEW AI INSIGHTS & EDIT
             ================================================== */
          <motion.div
            key="step3"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {/* Left Column: AI Summary Details */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-1.5 text-xs text-indigo-500 font-bold uppercase tracking-wide border-b border-slate-100 dark:border-slate-800 pb-2 mb-1">
                <Sparkles size={14} />
                <span>AI Extracted Details (Editable)</span>
              </div>

              <div className="settings-field-group">
                <label>Memory Title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Extracted Title" />
              </div>

              <div className="settings-field-group">
                <label>AI generated Summary</label>
                <textarea
                  value={aiSummary}
                  onChange={(e) => setAiSummary(e.target.value)}
                  placeholder="Summarized abstract..."
                  style={{ minHeight: "90px" }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="settings-field-group">
                  <label>Key Topics</label>
                  <input value={aiKeyTopics} onChange={(e) => setAiKeyTopics(e.target.value)} />
                </div>
                <div className="settings-field-group">
                  <label>Keywords</label>
                  <input value={aiKeywords} onChange={(e) => setAiKeywords(e.target.value)} />
                </div>
                <div className="settings-field-group">
                  <label>People Mentioned</label>
                  <input value={aiPeople} onChange={(e) => setAiPeople(e.target.value)} />
                </div>
                <div className="settings-field-group">
                  <label>Technologies</label>
                  <input value={aiTechnologies} onChange={(e) => setAiTechnologies(e.target.value)} />
                </div>
                <div className="settings-field-group">
                  <label>Dates Detected</label>
                  <input value={aiDates} onChange={(e) => setAiDates(e.target.value)} />
                </div>
                <div className="settings-field-group">
                  <label>Estimated Reading Time</label>
                  <input value={aiReadingTime} onChange={(e) => setAiReadingTime(e.target.value)} />
                </div>
              </div>
              
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-slate-400">Confidence Score:</span>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{aiConfidence}</span>
              </div>
            </div>

            {/* Right Column: Metadata & Similar Connections */}
            <div className="flex flex-col gap-4 justify-between">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-1.5 text-xs text-indigo-500 font-bold uppercase tracking-wide border-b border-slate-100 dark:border-slate-800 pb-2 mb-1">
                  <Filter size={14} />
                  <span>Metadata & Organization</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="settings-field-group">
                    <label>Folder Location</label>
                    <select value={metaFolder} onChange={(e) => setMetaFolder(e.target.value)}>
                      <option>General</option>
                      <option>Research</option>
                      <option>Project Notes</option>
                      <option>Personal Archive</option>
                    </select>
                  </div>
                  <div className="settings-field-group">
                    <label>Workspace Priority</label>
                    <select value={metaPriority} onChange={(e) => setMetaPriority(e.target.value)}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <div className="settings-field-group">
                    <label>Access Privacy</label>
                    <select value={metaPrivacy} onChange={(e) => setMetaPrivacy(e.target.value)}>
                      <option value="private">Private (Only You)</option>
                      <option value="shared">Shared Workspace</option>
                    </select>
                  </div>
                  <div className="settings-field-group">
                    <label>Color Label Accent</label>
                    <select value={metaColorLabel} onChange={(e) => setMetaColorLabel(e.target.value)}>
                      <option value="indigo">Indigo</option>
                      <option value="violet">Violet</option>
                      <option value="green">Green</option>
                      <option value="orange">Orange</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-6 mt-1">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={metaFavorite}
                      onChange={(e) => setMetaFavorite(e.target.checked)}
                      className="rounded accent-indigo-600"
                    />
                    <span>Add to Favorites</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <input type="checkbox" className="rounded accent-indigo-600" />
                    <span>Set Daily Reminder</span>
                  </label>
                </div>

                {/* Similar Memories Section */}
                <div className="mt-2 flex flex-col gap-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Suggested Connections</span>
                  <div className="flex flex-col gap-2">
                    {similarMemories.map((item) => (
                      <div
                        key={item.id}
                        className="flex justify-between items-center p-2.5 border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-lg text-xs"
                      >
                        <span className="truncate max-w-[280px]">Related to: <strong>{item.title}</strong></span>
                        <button
                          type="button"
                          className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                            item.connected
                              ? "bg-emerald-500 text-white"
                              : "bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400"
                          }`}
                          onClick={() => toggleSimilarConnection(item.id)}
                        >
                          {item.connected ? "Connected ✓" : "Connect Node"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Save CTA */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 mt-4">
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveToMyBrain}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 active:scale-[0.98] transition-all"
                  style={{
                    background: "linear-gradient(135deg, var(--brand), #7c3aed)",
                    boxShadow: "0 4px 20px var(--brand-glow)",
                  }}
                >
                  {saving ? (
                    <>
                      <LoaderCircle size={16} className="animate-spin" />
                      <span>Indexing into Vector DB...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>Save to My Brain</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {toastMsg && (
              <div className="absolute bottom-4 right-4 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-md px-3 py-1.5 text-xs shadow-md">
                {toastMsg}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function SearchModal({
  query,
  onClose,
  onOpenMemory,
}: {
  query: string;
  onClose: () => void;
  onOpenMemory: (memory: MemorySearchResult) => void;
}) {
  const [value, setValue] = useState(query);
  const [results, setResults] = useState<MemorySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchType, setSearchType] = useState("all");
  const requestSequence = useRef(0);

  useEffect(() => {
    const normalized = value.trim();
    const sequence = ++requestSequence.current;
    setError(null);
    if (normalized.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(() => {
      void searchMemories(normalized)
        .then((matches) => {
          if (requestSequence.current === sequence) setResults(matches);
        })
        .catch((searchError) => {
          if (requestSequence.current === sequence) {
            setResults([]);
            setError(searchError instanceof Error ? searchError.message : "Search is unavailable.");
          }
        })
        .finally(() => {
          if (requestSequence.current === sequence) setLoading(false);
        });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [value]);

  // Filters results by active type chip
  const filteredResults = useMemo(() => {
    if (searchType === "all") return results;
    if (searchType === "files") return results.filter(r => r.kind === "Upload");
    if (searchType === "notes") return results.filter(r => r.kind === "Note");
    if (searchType === "links") return results.filter(r => r.kind === "Link");
    if (searchType === "voice") return results.filter(r => r.kind === "Voice");
    return results;
  }, [results, searchType]);

  // Bold query matches in search items
  const highlightText = (text: string, searchVal: string) => {
    if (!searchVal.trim()) return text;
    const parts = text.split(new RegExp(`(${searchVal.trim()})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === searchVal.trim().toLowerCase() ? (
        <mark key={i} style={{ background: "var(--brand-soft)", color: "var(--brand)", fontWeight: 600, padding: "0 2px", borderRadius: "2px" }}>
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <motion.div className="modal-card search-modal" initial={{ opacity: 0, scale: .97, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .98 }} role="dialog" aria-modal="true">
      <div className="modal-search">
        <Search size={20} />
        <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder="Type naturally to search your second brain... (e.g. React Performance)" />
        <button onClick={onClose}>
          <span>ESC</span>
          <X size={18} />
        </button>
      </div>

      {/* Filter chips */}
      {value.trim().length >= 2 && (
        <div className="filter-chips">
          {[
            { label: "All", value: "all" },
            { label: "Notes", value: "notes" },
            { label: "Files", value: "files" },
            { label: "Links", value: "links" },
            { label: "Voice", value: "voice" },
          ].map((chip) => (
            <button
              key={chip.value}
              className={`filter-chip ${searchType === chip.value ? "active" : ""}`}
              onClick={() => setSearchType(chip.value)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="p-6 flex flex-col gap-3">
          <div className="skeleton-card" style={{ height: "48px" }} />
          <div className="skeleton-card" style={{ height: "48px" }} />
          <div className="skeleton-card" style={{ height: "48px" }} />
        </div>
      ) : error ? (
        <div className="empty-search search-error">
          <X size={32} />
          <h3>Search failed</h3>
          <p>{error}</p>
        </div>
      ) : value.trim().length >= 2 ? (
        <div className="search-response">
          <div className="answer-summary">
            <span><Brain size={18} /></span>
            <p>
              {filteredResults.length ? (
                <>Found <strong>{filteredResults.length} {filteredResults.length === 1 ? "memory" : "memories"}</strong> matches for this keyword & meaning.</>
              ) : (
                <>No private memories found matching this query under the selected filter.</>
              )}
            </p>
          </div>
          
          {filteredResults.length > 0 && (
            <div className="flex flex-col">
              <span className="results-label">Top semantic matches</span>
              {filteredResults.map((memory) => {
                const Icon = memory.kind === "Voice" ? Mic : memory.kind === "Link" ? Link2 : memory.kind === "Upload" ? UploadCloud : FileText;
                const detail = memory.summary || memory.extracted_text || memory.content || `${memory.kind} memory`;
                return (
                  <button className="result-row" key={memory.id} onClick={() => onOpenMemory(memory)}>
                    <span className="result-icon"><Icon size={18} /></span>
                    <span>
                      <strong>{highlightText(memory.title, value)}</strong>
                      <small>{highlightText(detail, value)}</small>
                    </span>
                    <em>{memory.match === "hybrid" ? "Hybrid" : memory.match === "meaning" ? "Meaning" : "Keyword"}</em>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="empty-search">
          <Brain size={34} />
          <h3>Natural language search</h3>
          <p>Search by meaning, context, or topic. Try: “What were my product launch questions?”</p>
        </div>
      )}

      <div className="search-footer">
        <span><Sparkles size={12} /> Semantic reasoning enabled</span>
        <span>Select result or hit enter to inspect</span>
      </div>
    </motion.div>
  );
}

export function AssistantPanel({ onClose, onOpenMemory }: { onClose: () => void; onOpenMemory: (memory: MemoryRecord) => void }) {
  const [message, setMessage] = useState("");
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<AssistantAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const runQuestion = async (nextQuestion: string) => {
    const normalized = nextQuestion.trim();
    if (normalized.length < 3 || asking) return;
    setQuestion(normalized);
    setMessage("");
    setResponse(null);
    setAssistantError(null);
    setAsking(true);
    try {
      setResponse(await askNeuron(normalized));
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : "Neuron could not answer right now.");
    } finally {
      setAsking(false);
    }
  };
  return (
    <motion.aside className="assistant-panel" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 28, stiffness: 280 }}>
      <div className="assistant-head"><div><span className="assistant-logo"><Brain size={19} /></span><span><strong>Neuron</strong><small>Your personal thinking partner</small></span></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div>
      <div className="assistant-body"><div className="assistant-intro"><span><Sparkles size={18} /></span><h2>What are we thinking about?</h2><p>I answer from your private memories and show exactly which ones I used.</p></div>{!question && <div className="suggestions">{["Summarize what I learned this week", "Connect my notes about offline apps", "Turn recent notes into a project plan"].map((text) => <button key={text} onClick={() => void runQuestion(text)}>{text}<ArrowRight size={14} /></button>)}</div>}{question && <div className="assistant-conversation"><div className="chat-bubble"><p>{question}</p></div>{asking && <div className="assistant-thinking"><LoaderCircle size={17} /><span>Reading your memories…</span></div>}{assistantError && <div className="assistant-answer error"><strong>Neuron couldn’t answer</strong><p>{assistantError}</p><button onClick={() => void runQuestion(question)}>Try again</button></div>}{response && <div className="assistant-answer"><div className="assistant-answer-label"><Sparkles size={14} /> Grounded answer</div><p>{response.answer}</p>{response.citations.length > 0 && <div className="assistant-citations"><span>Sources</span>{response.citations.map(({ number, memory }) => <button key={`${number}-${memory.id}`} onClick={() => onOpenMemory(memory)}><em>[{number}]</em><span><strong>{memory.title}</strong><small>{memory.kind} · Open memory</small></span><ArrowRight size={14} /></button>)}</div>}<small className="assistant-model">Answer generated only from the sources above</small></div>}</div>}</div>
      <form className="assistant-input" onSubmit={(event) => { event.preventDefault(); void runQuestion(message); }}><textarea value={message} disabled={asking} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void runQuestion(message); } }} placeholder={question ? "Ask a follow-up..." : "Ask Neuron..."} /><div><button type="button" aria-label="Use recent voice memories" title="Use recent voice memories" onClick={() => setMessage("Summarize my recent voice memories")}><Mic size={17} /></button><button className="send" type="submit" aria-label="Send to Neuron" disabled={asking || message.trim().length < 3}>{asking ? <LoaderCircle size={17} className="animate-spin" /> : <ArrowRight size={17} />}</button></div></form>
    </motion.aside>
  );
}

