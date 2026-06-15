// TypeScript mirrors of the tgdl JSON API (see docs/json-api.md in the CLI repo).
// These shapes are a contract — keep them in sync with the Python side.

export type JobPhase =
  | "queued"
  | "estimating"
  | "downloading"
  | "paused"
  | "done"
  | "failed"
  | "cancelled";

export const ACTIVE_PHASES: ReadonlySet<JobPhase> = new Set([
  "queued",
  "estimating",
  "downloading",
  "paused",
]);

export interface JobStatus {
  job_id: string;
  pid: number | null;
  phase: JobPhase;
  dry_run: boolean;
  channel: string;
  channel_name: string;
  started_at: string | null;
  updated_at: string | null;
  totals: { files: number | null; bytes: number };
  progress: {
    completed: number;
    skipped: number;
    failed: number;
    bytes_done: number;
  };
  current_file: {
    name: string;
    pct: number | null;
    active_count: number;
  } | null;
  speed_bps: number;
  eta_seconds: number | null;
  error: string | null;
}

export interface AuthStatus {
  authenticated: boolean;
  version?: string; // present on tgdl >= 0.3.0
  user?: { id: number; first_name: string; username: string | null };
}

export interface Dialog {
  id: string;
  name: string;
  username: string | null;
  is_channel: boolean;
  is_group: boolean;
  is_user: boolean;
}

export interface ChannelStats {
  channel_id: string;
  total: number;
  complete: number;
  partial: number;
  failed: number;
  skipped: number;
  total_bytes: number;
  total_bandwidth: number;
}

export interface Session {
  channel_id: string;
  session_date: string;
  bytes_downloaded: number;
  files_downloaded: number;
}

export interface HistoryResponse {
  channels: ChannelStats[];
  recent_sessions: Session[];
}

// The JSON DownloadConfig accepted by `tgdl job start --config`.
// Every field is optional — omit to take the CLI's default.
export type MediaType =
  | "photo"
  | "video"
  | "document"
  | "audio"
  | "voice"
  | "gif"
  | "sticker";

export type DateRangeType = "all" | "last_n_days" | "custom";
export type ResumeMode = "smart" | "skip" | "overwrite";

export interface DownloadConfig {
  channel: string;
  media_types?: MediaType[];
  date_range_type?: DateRangeType;
  last_n_days?: number | null;
  date_from?: string | null;
  date_to?: string | null;
  file_size?: { min_bytes?: number | null; max_bytes?: number | null };
  caption_keyword?: string | null;
  sender_filter?: string[];
  deduplicate?: boolean;
  output_path?: string;
  filename_template?: string;
  subfolders_by_type?: boolean;
  subfolders_by_date?: boolean;
  subfolders_by_sender?: boolean;
  json_sidecars?: boolean;
  resume_mode?: ResumeMode;
  concurrency?: number;
  disk_space_threshold_mb?: number;
}

export interface StartJobResponse {
  job_id: string;
  pid: number;
}

export interface ProfileSummary {
  name: string;
  channel: string;
  media_types: MediaType[];
  output_path: string;
}

export interface TgUser {
  id: number;
  first_name: string;
  username: string | null;
}

export interface LoginStartResult {
  ok?: boolean;
  phone_code_hash?: string;
  already_authorized?: boolean;
  user?: TgUser;
  error?: string;
  detail?: string;
}

export interface LoginFinishResult {
  ok?: boolean;
  needs_password?: boolean;
  user?: TgUser;
  error?: string;
  detail?: string;
}
