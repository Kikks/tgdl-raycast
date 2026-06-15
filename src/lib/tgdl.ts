// Thin, typed wrapper around the `tgdl` CLI. Every command talks to tgdl
// through here, so binary resolution, JSON parsing, and error mapping live in
// one place. See docs/json-api.md in the CLI repo for the contracts.

import { spawn } from "child_process";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getPreferenceValues } from "@raycast/api";
import type {
  AuthStatus,
  Dialog,
  DownloadConfig,
  HistoryResponse,
  JobStatus,
  LoginFinishResult,
  LoginStartResult,
  StartJobResponse,
} from "./types";

// Source for in-app install. Switch to "tgdl" once published to PyPI.
export const TGDL_PACKAGE = "git+https://github.com/Kikks/tgdl.git";

// Raycast runs with a slim environment; make sure pipx/Homebrew shims resolve.
function tgdlEnv(): NodeJS.ProcessEnv {
  const extra = `/opt/homebrew/bin:/usr/local/bin:${process.env.HOME}/.local/bin`;
  return { ...process.env, PATH: `${extra}:${process.env.PATH ?? ""}` };
}

// `Preferences` is the global type generated from package.json (raycast-env.d.ts).
export function preferences(): Preferences {
  return getPreferenceValues<Preferences>();
}

// ── errors ────────────────────────────────────────────────────────────────────

export class TgdlError extends Error {}
export class TgdlNotInstalled extends TgdlError {
  constructor(path: string) {
    super(
      `Could not run "${path}". Install the CLI with \`pipx install tgdl\`.`,
    );
  }
}
export class TgdlNotAuthenticated extends TgdlError {
  constructor() {
    super(
      "Not authenticated. Run `tgdl init` in a terminal to log in to Telegram.",
    );
  }
}

// ── core runner ───────────────────────────────────────────────────────────────

function exec(
  args: string[],
  input?: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const bin = preferences().tgdlPath || "tgdl";
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env: tgdlEnv() });
    let stdout = "";
    let stderr = "";
    child.on("error", reject); // e.g. ENOENT when the binary is missing
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 0 }));
    if (input != null) child.stdin.write(input);
    child.stdin.end();
  });
}

async function run(args: string[], input?: string): Promise<string> {
  let res: { stdout: string; stderr: string; code: number };
  try {
    res = await exec(args, input);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new TgdlNotInstalled(preferences().tgdlPath || "tgdl");
    }
    throw new TgdlError((err as Error).message);
  }
  if (res.code === 0) return res.stdout;
  // Non-zero exit: tgdl emits a JSON error object on stdout.
  const payload = parseMaybe<{ error?: string }>(res.stdout);
  if (payload?.error === "not_authenticated") throw new TgdlNotAuthenticated();
  throw new TgdlError(
    payload?.error ?? res.stderr.trim() ?? `tgdl exited with code ${res.code}`,
  );
}

async function runJson<T>(args: string[]): Promise<T> {
  const out = await run([...args, "--json"]);
  const parsed = parseMaybe<T & { error?: string }>(out);
  if (parsed == null)
    throw new TgdlError(`Unexpected output from tgdl: ${out.slice(0, 200)}`);
  if ((parsed as { error?: string }).error === "not_authenticated") {
    throw new TgdlNotAuthenticated();
  }
  return parsed;
}

function parseMaybe<T>(text?: string): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text.trim()) as T;
  } catch {
    return null;
  }
}

// ── API surface ───────────────────────────────────────────────────────────────

export function authStatus(): Promise<AuthStatus> {
  return runJson<AuthStatus>(["auth", "status"]);
}

export function listDialogs(limit = 50): Promise<Dialog[]> {
  return runJson<Dialog[]>(["dialogs", "-n", String(limit)]);
}

export function listJobs(): Promise<JobStatus[]> {
  return runJson<JobStatus[]>(["job", "list"]);
}

export function jobStatus(jobId: string): Promise<JobStatus> {
  return runJson<JobStatus>(["job", "status", jobId]);
}

export function cancelJob(
  jobId: string,
): Promise<{ ok: boolean; job_id: string }> {
  return runJson<{ ok: boolean; job_id: string }>(["job", "cancel", jobId]);
}

export function cleanJobs(): Promise<{ removed: number }> {
  return runJson<{ removed: number }>(["job", "clean"]);
}

export function history(): Promise<HistoryResponse> {
  return runJson<HistoryResponse>(["status"]);
}

/** Start a detached download from a full config (written to a temp file). */
export async function startJob(
  config: DownloadConfig,
  opts: { dryRun?: boolean } = {},
): Promise<StartJobResponse> {
  const dir = mkdtempSync(join(tmpdir(), "tgdl-"));
  const file = join(dir, "config.json");
  writeFileSync(file, JSON.stringify(config), "utf-8");
  const args = ["job", "start", "--config", file];
  if (opts.dryRun) args.push("--dry-run");
  // `job start` always emits JSON; no --json flag.
  const out = await run(args);
  const parsed = parseMaybe<StartJobResponse & { error?: string }>(out);
  if (!parsed) throw new TgdlError(`Unexpected output: ${out.slice(0, 200)}`);
  if (parsed.error === "not_authenticated") throw new TgdlNotAuthenticated();
  if (parsed.error) throw new TgdlError(parsed.error);
  return parsed;
}

// ── onboarding: install ────────────────────────────────────────────────────────

export type InstallStepId = "check" | "pipx" | "tgdl" | "verify";
export type StepStatus = "pending" | "active" | "done" | "skipped" | "error";

export const INSTALL_STEPS: { id: InstallStepId; label: string }[] = [
  { id: "check", label: "Checking your system" },
  { id: "pipx", label: "Setting up the installer" },
  { id: "tgdl", label: "Installing tgdl" },
  { id: "verify", label: "Finishing up" },
];

function bash(
  script: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn("/bin/bash", ["-c", script], {
      env: { ...tgdlEnv(), NONINTERACTIVE: "1", HOMEBREW_NO_AUTO_UPDATE: "1" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (e) =>
      resolve({ stdout, stderr: `${stderr}${e}`, code: 1 }),
    );
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

/**
 * Install tgdl as a sequence of discrete steps so the UI can show a clean
 * stepper instead of raw brew/pipx output. Reports each step's status through
 * `onStep`; combined output (for debugging) goes to `onLog`. Throws a
 * TgdlError on failure.
 */
export async function runInstall(
  onStep: (id: InstallStepId, status: StepStatus) => void,
  onLog?: (chunk: string) => void,
): Promise<void> {
  const log = (s: string) => {
    if (s) onLog?.(s);
  };

  onStep("check", "active");
  const hasPipx = (await bash("command -v pipx")).code === 0;
  const hasBrew = (await bash("command -v brew")).code === 0;
  onStep("check", "done");

  if (hasPipx) {
    onStep("pipx", "skipped");
  } else if (hasBrew) {
    onStep("pipx", "active");
    const r = await bash("brew install pipx");
    log(r.stdout + r.stderr);
    if (r.code !== 0) {
      onStep("pipx", "error");
      throw new TgdlError("Couldn't set up the installer (pipx) via Homebrew.");
    }
    onStep("pipx", "done");
  } else {
    onStep("pipx", "error");
    throw new TgdlError(
      "Need Homebrew or pipx. See https://pipx.pypa.io to install pipx.",
    );
  }

  onStep("tgdl", "active");
  const install = await bash(`pipx install --force "${TGDL_PACKAGE}"`);
  log(install.stdout + install.stderr);
  if (install.code !== 0) {
    onStep("tgdl", "error");
    throw new TgdlError(install.stderr.trim() || "Installing tgdl failed.");
  }
  onStep("tgdl", "done");

  onStep("verify", "active");
  const verify = await bash("command -v tgdl");
  if (verify.code !== 0) {
    onStep("verify", "error");
    throw new TgdlError(
      "tgdl installed but isn't on PATH. Set its full path in preferences.",
    );
  }
  onStep("verify", "done");
}

/** Headless login step 1 — request a verification code. */
export async function loginStart(
  apiId: string,
  apiHash: string,
  phone: string,
): Promise<LoginStartResult> {
  const out = await run([
    "auth",
    "login-start",
    "--api-id",
    apiId.trim(),
    "--api-hash",
    apiHash.trim(),
    "--phone",
    phone.trim(),
  ]);
  return parseOrThrow<LoginStartResult>(out);
}

/** Headless login step 2 — sign in with the code (and 2FA password via stdin). */
export async function loginFinish(
  phone: string,
  code: string,
  phoneCodeHash: string,
  password?: string,
): Promise<LoginFinishResult> {
  const args = [
    "auth",
    "login-finish",
    "--phone",
    phone.trim(),
    "--code",
    code.trim(),
    "--phone-code-hash",
    phoneCodeHash,
  ];
  if (password) args.push("--password-stdin");
  const out = await run(args, password ? password : undefined);
  return parseOrThrow<LoginFinishResult>(out);
}

export async function logout(): Promise<{ ok: boolean }> {
  return parseOrThrow(await run(["auth", "logout"]));
}

function parseOrThrow<T>(out: string): T {
  const parsed = parseMaybe<T>(out);
  if (parsed == null)
    throw new TgdlError(`Unexpected output: ${out.slice(0, 200)}`);
  return parsed;
}

/** Start a detached download from a saved profile. */
export async function startJobFromProfile(
  name: string,
  opts: { dryRun?: boolean; channel?: string } = {},
): Promise<StartJobResponse> {
  const args = ["job", "start", "--profile", name];
  if (opts.channel) args.push("--channel", opts.channel);
  if (opts.dryRun) args.push("--dry-run");
  const out = await run(args);
  const parsed = parseMaybe<StartJobResponse & { error?: string }>(out);
  if (!parsed) throw new TgdlError(`Unexpected output: ${out.slice(0, 200)}`);
  if (parsed.error) throw new TgdlError(parsed.error);
  return parsed;
}
