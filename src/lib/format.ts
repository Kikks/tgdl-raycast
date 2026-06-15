// Shared formatting + presentation helpers used across commands.

import { Color, Icon } from "@raycast/api";
import type { JobPhase, JobStatus } from "./types";

export function formatBytes(n: number): string {
  if (!n || n < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!bytesPerSecond || bytesPerSecond < 1) return "—";
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatEta(seconds: number | null): string {
  if (seconds == null || seconds < 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

const PHASE_META: Record<
  JobPhase,
  { label: string; icon: Icon; color: Color }
> = {
  queued: { label: "Queued", icon: Icon.Clock, color: Color.SecondaryText },
  estimating: {
    label: "Estimating",
    icon: Icon.MagnifyingGlass,
    color: Color.Blue,
  },
  downloading: { label: "Downloading", icon: Icon.Download, color: Color.Blue },
  paused: { label: "Paused", icon: Icon.Pause, color: Color.Yellow },
  done: { label: "Done", icon: Icon.CheckCircle, color: Color.Green },
  failed: { label: "Failed", icon: Icon.XMarkCircle, color: Color.Red },
  cancelled: {
    label: "Cancelled",
    icon: Icon.MinusCircle,
    color: Color.SecondaryText,
  },
};

export function phaseMeta(phase: JobPhase) {
  return (
    PHASE_META[phase] ?? {
      label: phase,
      icon: Icon.Circle,
      color: Color.SecondaryText,
    }
  );
}

export function phaseIcon(phase: JobPhase) {
  const m = phaseMeta(phase);
  return { source: m.icon, tintColor: m.color };
}

/** A short progress string like "137/412 · 45 MB/s" for a job. */
export function progressLabel(job: JobStatus): string {
  const { completed } = job.progress;
  const total = job.totals.files;
  const count = total != null ? `${completed}/${total}` : `${completed}`;
  if (job.phase === "downloading" && job.speed_bps >= 1) {
    return `${count} · ${formatSpeed(job.speed_bps)}`;
  }
  return count;
}

/** Overall percent across files (0–100), or null if unknown. */
export function jobPercent(job: JobStatus): number | null {
  const total = job.totals.files;
  if (!total) return null;
  return Math.min(100, Math.round((job.progress.completed / total) * 100));
}
