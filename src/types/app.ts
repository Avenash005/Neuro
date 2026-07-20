import type { LucideIcon } from "lucide-react";

export type View = "Home" | "Library" | "Tasks" | "Activity" | "Collections" | "Graph";

export type BackendStatus = "connecting" | "connected" | "local" | "error";

export type LibraryItem = {
  id?: string;
  title: string;
  description: string;
  meta: string;
  tag: string;
  icon: LucideIcon;
  color: string;
  processingStatus?: "pending" | "processing" | "ready" | "failed";
  storagePath?: string;
  originalFilename?: string;
};

export type Collection = {
  name: string;
  count: number;
  color: string;
  initials: string;
};
