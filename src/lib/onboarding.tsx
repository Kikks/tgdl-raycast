// Onboarding gate: ensures tgdl is installed and authenticated before a command
// renders its real UI. Users install + sign in entirely inside Raycast.

import { ReactNode, useState } from "react";
import {
  Action,
  ActionPanel,
  Detail,
  Form,
  Icon,
  Toast,
  showToast,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import {
  authStatus,
  INSTALL_STEPS,
  type InstallStepId,
  loginFinish,
  loginStart,
  MIN_TGDL_VERSION,
  runInstall,
  type StepStatus,
  TgdlNotInstalled,
  TGDL_PACKAGE,
  versionAtLeast,
} from "./tgdl";

export type TgdlState =
  | "loading"
  | "not_installed"
  | "outdated"
  | "not_authed"
  | "ready"
  | "error";

export function useTgdlStatus() {
  const { data, isLoading, error, revalidate } = usePromise(authStatus);

  let state: TgdlState = "loading";
  if (!isLoading) {
    if (error instanceof TgdlNotInstalled) state = "not_installed";
    else if (error) state = "error";
    else if (!versionAtLeast(data?.version, MIN_TGDL_VERSION))
      state = "outdated";
    else state = data?.authenticated ? "ready" : "not_authed";
  }
  return { state, isLoading, error, revalidate, version: data?.version };
}

/** Wrap a command's UI; renders onboarding until tgdl is installed + signed in. */
export function TgdlGate({ children }: { children: ReactNode }) {
  const { state, error, revalidate, version } = useTgdlStatus();

  if (state === "loading")
    return <Detail isLoading markdown="Checking tgdl…" />;
  if (state === "not_installed") return <InstallView onDone={revalidate} />;
  if (state === "outdated")
    return <InstallView onDone={revalidate} mode="update" version={version} />;
  if (state === "error")
    return <ErrorView message={error?.message} onRetry={revalidate} />;
  if (state === "not_authed") return <LoginView onDone={revalidate} />;
  return <>{children}</>;
}

const INSTALL_INTRO = [
  "# Welcome to Telegram Downloader",
  "",
  "Download photos, videos, and files from any Telegram chat — right from Raycast,",
  "running quietly in the background.",
  "",
  "First, let's get you set up. It takes about a minute and only happens once.",
  "",
  "Press **⏎** to begin.",
].join("\n");

const updateIntro = (version?: string) =>
  [
    "# Update available",
    "",
    `Your installed \`tgdl\` (${version ?? "unknown"}) is older than this extension needs`,
    `(**${MIN_TGDL_VERSION}+**). Some features won't work until you update.`,
    "",
    "Press **⏎** to update now — it only takes a moment.",
  ].join("\n");

const STEP_HYPE: Record<InstallStepId, string> = {
  check: "Taking a look around…",
  pipx: "Gathering the essentials…",
  tgdl: "Almost there — installing tgdl…",
  verify: "Putting on the finishing touches…",
};

const STATUS_ICON: Record<StepStatus, string> = {
  pending: "⬜️",
  active: "⏳",
  done: "✅",
  skipped: "✅",
  error: "❌",
};

type Phase = "intro" | "running" | "error";

function stepper(
  statuses: Record<InstallStepId, StepStatus>,
  title: string,
): string {
  const active = INSTALL_STEPS.find((s) => statuses[s.id] === "active");
  const hype = active ? STEP_HYPE[active.id] : "All set! 🎉";
  const rows = INSTALL_STEPS.map((s) => {
    const icon = STATUS_ICON[statuses[s.id]];
    const label = statuses[s.id] === "active" ? `**${s.label}**` : s.label;
    return `${icon}&nbsp;&nbsp;${label}`;
  }).join("  \n");
  return `# ${title}\n\n_${hype}_\n\n&nbsp;\n\n${rows}`;
}

function InstallView({
  onDone,
  mode = "install",
  version,
}: {
  onDone: () => void;
  mode?: "install" | "update";
  version?: string;
}) {
  const isUpdate = mode === "update";
  const initial = Object.fromEntries(
    INSTALL_STEPS.map((s) => [s.id, "pending"]),
  ) as Record<InstallStepId, StepStatus>;

  const [phase, setPhase] = useState<Phase>("intro");
  const [statuses, setStatuses] = useState(initial);
  const [errorMsg, setErrorMsg] = useState("");
  const [log, setLog] = useState("");

  async function start() {
    setPhase("running");
    setStatuses(initial);
    setLog("");
    try {
      await runInstall(
        (id, status) => setStatuses((prev) => ({ ...prev, [id]: status })),
        (chunk) => setLog((prev) => prev + chunk),
      );
      await showToast({
        style: Toast.Style.Success,
        title: isUpdate ? "tgdl updated" : "You're all set",
      });
      onDone();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase("error");
      await showToast({
        style: Toast.Style.Failure,
        title: isUpdate ? "Update didn't finish" : "Setup didn't finish",
      });
    }
  }

  const runTitle = isUpdate ? "Updating tgdl" : "Setting things up";
  let markdown: string;
  if (phase === "intro")
    markdown = isUpdate ? updateIntro(version) : INSTALL_INTRO;
  else if (phase === "error")
    markdown = `# ${isUpdate ? "Update" : "Setup"} didn't finish\n\n${errorMsg}\n\n${stepper(statuses, runTitle)}`;
  else markdown = stepper(statuses, runTitle);

  return (
    <Detail
      isLoading={phase === "running"}
      markdown={markdown}
      actions={
        <ActionPanel>
          {phase === "intro" && (
            <Action
              title={isUpdate ? "Update Now" : "Get Started"}
              icon={Icon.Download}
              onAction={start}
            />
          )}
          {phase === "error" && (
            <Action
              title="Try Again"
              icon={Icon.ArrowClockwise}
              onAction={start}
            />
          )}
          {phase === "error" && log.trim() !== "" && (
            <Action.CopyToClipboard title="Copy Logs" content={log} />
          )}
          {phase === "error" && (
            <Action.CopyToClipboard
              title="Copy Manual Install Command"
              content={`pipx install ${TGDL_PACKAGE}`}
            />
          )}
        </ActionPanel>
      }
    />
  );
}

function ErrorView({
  message,
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <Detail
      markdown={`# Something went wrong\n\n\`\`\`\n${message ?? "Unknown error"}\n\`\`\``}
      actions={
        <ActionPanel>
          <Action title="Retry" icon={Icon.ArrowClockwise} onAction={onRetry} />
        </ActionPanel>
      }
    />
  );
}

const LOGIN_ERRORS: Record<string, string> = {
  invalid_code: "That code didn't work — check it and try again.",
  code_expired: "The code expired. Start over to get a new one.",
  invalid_phone: "That phone number wasn't accepted.",
  invalid_password: "Incorrect 2FA password.",
  invalid_api: "Invalid API ID / hash.",
  flood_wait: "Too many attempts. Wait a while before trying again.",
  no_credentials: "Credentials missing — start over.",
};

function loginError(code: string): string {
  return LOGIN_ERRORS[code] ?? "Sign-in failed. Please try again.";
}

function LoginView({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<"creds" | "code">("creds");
  const [phone, setPhone] = useState("");
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitCreds(v: {
    apiId: string;
    apiHash: string;
    phone: string;
  }) {
    if (!v.apiId.trim() || !v.apiHash.trim() || !v.phone.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "All fields are required",
      });
      return;
    }
    setBusy(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Requesting code…",
    });
    try {
      const r = await loginStart(v.apiId, v.apiHash, v.phone);
      if (r.error) {
        toast.style = Toast.Style.Failure;
        toast.title = loginError(r.error);
        return;
      }
      if (r.already_authorized) {
        toast.style = Toast.Style.Success;
        toast.title = "Already signed in";
        onDone();
        return;
      }
      setPhone(v.phone.trim());
      setHash(r.phone_code_hash ?? "");
      setStep("code");
      toast.style = Toast.Style.Success;
      toast.title = "Code sent";
      toast.message = "Check your Telegram app";
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = e instanceof Error ? e.message : "Could not request code";
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(v: { code: string; password: string }) {
    setBusy(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Signing in…",
    });
    try {
      const r = await loginFinish(phone, v.code, hash, v.password || undefined);
      if (r.needs_password && !v.password) {
        toast.style = Toast.Style.Failure;
        toast.title = "This account has 2FA";
        toast.message =
          "Enter your Telegram password above, then sign in again";
        return;
      }
      if (r.error) {
        toast.style = Toast.Style.Failure;
        toast.title = loginError(r.error);
        return;
      }
      if (r.ok) {
        toast.style = Toast.Style.Success;
        toast.title = `Signed in as ${r.user?.first_name ?? "you"}`;
        onDone();
        return;
      }
      toast.style = Toast.Style.Failure;
      toast.title = "Sign-in failed";
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = e instanceof Error ? e.message : "Sign-in failed";
    } finally {
      setBusy(false);
    }
  }

  if (step === "creds") {
    return (
      <Form
        isLoading={busy}
        actions={
          <ActionPanel>
            <Action.SubmitForm
              title="Send Code"
              icon={Icon.Mobile}
              onSubmit={submitCreds}
            />
            <Action.OpenInBrowser
              title="Get API Credentials"
              url="https://my.telegram.org"
            />
          </ActionPanel>
        }
      >
        <Form.Description text="Sign in to Telegram. Get your API ID and hash from my.telegram.org → API Development Tools (one-time)." />
        <Form.TextField id="apiId" title="API ID" placeholder="1234567" />
        <Form.PasswordField
          id="apiHash"
          title="API Hash"
          placeholder="32-character hash"
        />
        <Form.TextField id="phone" title="Phone" placeholder="+15551234567" />
      </Form>
    );
  }

  return (
    <Form
      isLoading={busy}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Sign in"
            icon={Icon.Check}
            onSubmit={submitCode}
          />
          <Action
            title="Start over"
            icon={Icon.ArrowCounterClockwise}
            onAction={() => setStep("creds")}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        text={`Enter the code Telegram sent to ${phone}. If your account has 2FA, also enter your password.`}
      />
      <Form.TextField id="code" title="Code" placeholder="12345" />
      <Form.PasswordField
        id="password"
        title="2FA Password"
        placeholder="Only if your account has one"
      />
    </Form>
  );
}
