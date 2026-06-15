// Static option lists + parsing for the New Download form. These mirror the
// CLI's config.py (MEDIA_TYPE_LABELS, TEMPLATE_PRESETS) so the form offers the
// same choices the wizard does.

import type { MediaType, ResumeMode } from "./types";

export const MEDIA_TYPE_OPTIONS: { value: MediaType; label: string }[] = [
  { value: "photo", label: "Photos" },
  { value: "video", label: "Videos" },
  { value: "document", label: "Documents" },
  { value: "audio", label: "Audio" },
  { value: "voice", label: "Voice messages" },
  { value: "gif", label: "GIFs / Animations" },
  { value: "sticker", label: "Stickers" },
];

export const ALL_MEDIA_TYPES: MediaType[] = MEDIA_TYPE_OPTIONS.map(
  (o) => o.value,
);

export const TEMPLATE_PRESETS: { title: string; value: string }[] = [
  {
    title: "Default (date + ID + name)",
    value: "{year}-{month}-{day}_{message_id}_{filename}",
  },
  { title: "Flat (ID only)", value: "{message_id}_{filename}" },
  {
    title: "By type / date / name",
    value: "{type}/{year}-{month}/{message_id}_{filename}",
  },
  {
    title: "By sender / date",
    value: "{sender}/{year}-{month}/{message_id}_{filename}",
  },
  {
    title: "By year-month / name",
    value: "{year}/{month}/{message_id}_{filename}",
  },
];

export const RESUME_OPTIONS: { value: ResumeMode; label: string }[] = [
  { value: "smart", label: "Smart — skip complete, resume partial" },
  { value: "skip", label: "Skip — skip any file that exists on disk" },
  { value: "overwrite", label: "Overwrite — re-download everything" },
];

export const CONCURRENCY_OPTIONS = ["1", "2", "3", "5", "8", "10"];

/** Parse a human size like "100KB", "2.5MB", "1GB", or "512" into bytes. */
export function parseSize(input: string): number | null {
  const s = input.trim().toUpperCase();
  if (!s) return null;
  const m = s.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)?$/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (isNaN(num)) return null;
  const mult: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  };
  return Math.round(num * (mult[m[2] ?? "B"] ?? 1));
}
