import type { LucideIcon } from "lucide-react";

export type View = "Home" | "Library" | "Collections" | "Graph";

export type BackendStatus = "connecting" | "connected" | "local" | "error";

export type LibraryItem = {
  title: string;
  description: string;
  meta: string;
  tag: string;
  icon: LucideIcon;
  color: string;
};

export type Collection = {
  name: string;
  count: number;
  color: string;
  initials: string;
};
