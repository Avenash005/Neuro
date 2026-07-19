import { Code2, FileText, Globe2, Headphones } from "lucide-react";
import type { Collection, LibraryItem } from "../types/app";

export const recentItems: LibraryItem[] = [
  {
    title: "Scaling React without losing your mind",
    description: "Rendering patterns, profiling notes, and practical rules for large component trees.",
    meta: "Article · 14 min read",
    tag: "React",
    icon: Globe2,
    color: "violet",
  },
  {
    title: "Q3 product thinking",
    description: "Voice memo from the walk home — activation, retention loops, and a simpler onboarding idea.",
    meta: "Voice note · 08:42",
    tag: "Neuron",
    icon: Headphones,
    color: "orange",
  },
  {
    title: "The Mom Test — highlights",
    description: "How to talk to customers and learn if your business is a good idea when everyone is lying.",
    meta: "PDF · 24 highlights",
    tag: "Research",
    icon: FileText,
    color: "blue",
  },
];

export const searchResults = [
  {
    title: "Scaling React without losing your mind",
    detail: "You saved this 3 days before Buildspace Demo Day. It covers memoization and virtualization.",
    match: "96% match",
    icon: Globe2,
  },
  {
    title: "Frontend performance checklist",
    detail: "A code note from Project Atlas with related React profiling steps.",
    match: "89% match",
    icon: Code2,
  },
  {
    title: "Demo Day preparation notes",
    detail: "Mentions the optimization article and your plan to test the dashboard render path.",
    match: "84% match",
    icon: FileText,
  },
];

export const collections: Collection[] = [
  { name: "Neuron", count: 42, color: "#6657d9", initials: "NE" },
  { name: "Web development", count: 128, color: "#168c75", initials: "WD" },
  { name: "Startup library", count: 76, color: "#de793d", initials: "SL" },
  { name: "Design references", count: 51, color: "#b45079", initials: "DR" },
];
