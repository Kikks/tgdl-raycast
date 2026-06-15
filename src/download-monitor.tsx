import {
  Clipboard,
  Color,
  Icon,
  LaunchType,
  MenuBarExtra,
  launchCommand,
  open,
  showHUD,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import {
  cancelJob,
  listJobs,
  preferences,
  TgdlError,
  TgdlNotInstalled,
} from "./lib/tgdl";
import { formatEta, formatSpeed, phaseMeta, progressLabel } from "./lib/format";
import { ACTIVE_PHASES, type JobStatus } from "./lib/types";

export default function Command() {
  const { data, isLoading, error, revalidate } = usePromise(listJobs);

  const jobs = data ?? [];
  const active = jobs.filter((j) => ACTIVE_PHASES.has(j.phase));
  const recent = jobs.filter((j) => !ACTIVE_PHASES.has(j.phase)).slice(0, 5);
  const downloading = active.filter((j) => j.phase === "downloading");

  // Menu-bar title: speed for a single download, a count for several, else bare icon.
  let title: string | undefined;
  if (downloading.length === 1) title = formatSpeed(downloading[0].speed_bps);
  else if (active.length > 1) title = `${active.length}`;

  if (error) {
    return (
      <MenuBarExtra
        icon={{ source: Icon.Download, tintColor: Color.Red }}
        tooltip="Telegram Downloader"
      >
        <ErrorSection error={error} />
        <Footer revalidate={revalidate} />
      </MenuBarExtra>
    );
  }

  return (
    <MenuBarExtra
      icon={{
        source: Icon.Download,
        tintColor: active.length ? Color.Blue : Color.SecondaryText,
      }}
      title={title}
      isLoading={isLoading}
      tooltip="Telegram Downloader"
    >
      {active.length > 0 && (
        <MenuBarExtra.Section title="Active">
          {active.map((job) => (
            <JobSubmenu key={job.job_id} job={job} revalidate={revalidate} />
          ))}
        </MenuBarExtra.Section>
      )}

      {recent.length > 0 && (
        <MenuBarExtra.Section title="Recent">
          {recent.map((job) => {
            const meta = phaseMeta(job.phase);
            return (
              <MenuBarExtra.Item
                key={job.job_id}
                icon={{ source: meta.icon, tintColor: meta.color }}
                title={job.channel_name || job.channel}
                subtitle={`  ${meta.label} · ${job.progress.completed} files`}
                onAction={() => openManageJobs()}
              />
            );
          })}
        </MenuBarExtra.Section>
      )}

      {active.length === 0 && recent.length === 0 && (
        <MenuBarExtra.Item title="No downloads yet" icon={Icon.Tray} />
      )}

      <Footer revalidate={revalidate} />
    </MenuBarExtra>
  );
}

function JobSubmenu({
  job,
  revalidate,
}: {
  job: JobStatus;
  revalidate: () => void;
}) {
  const meta = phaseMeta(job.phase);
  const eta =
    job.phase === "downloading" ? ` · ETA ${formatEta(job.eta_seconds)}` : "";
  return (
    <MenuBarExtra.Submenu
      key={job.job_id}
      icon={{ source: meta.icon, tintColor: meta.color }}
      title={`${job.channel_name || job.channel}  —  ${progressLabel(job)}`}
    >
      <MenuBarExtra.Item title={`${meta.label}${eta}`} icon={meta.icon} />
      {job.current_file && (
        <MenuBarExtra.Item title={job.current_file.name} icon={Icon.Document} />
      )}
      <MenuBarExtra.Separator />
      <MenuBarExtra.Item
        title="Cancel Download"
        icon={Icon.XMarkCircle}
        onAction={async () => {
          try {
            await cancelJob(job.job_id);
            await showHUD("Download cancelled");
            revalidate();
          } catch (e) {
            await showHUD(e instanceof Error ? e.message : "Could not cancel");
          }
        }}
      />
      <MenuBarExtra.Item
        title="Copy Job ID"
        icon={Icon.Clipboard}
        onAction={() => Clipboard.copy(job.job_id)}
      />
      <MenuBarExtra.Item
        title="Open in Manage Jobs"
        icon={Icon.List}
        onAction={openManageJobs}
      />
    </MenuBarExtra.Submenu>
  );
}

function Footer({ revalidate }: { revalidate: () => void }) {
  const folder = preferences().defaultDownloadFolder;
  return (
    <MenuBarExtra.Section>
      <MenuBarExtra.Item
        title="New Download…"
        icon={Icon.Plus}
        onAction={() =>
          launchCommand({
            name: "new-download",
            type: LaunchType.UserInitiated,
          })
        }
      />
      <MenuBarExtra.Item
        title="Manage Jobs…"
        icon={Icon.List}
        onAction={openManageJobs}
      />
      {folder && (
        <MenuBarExtra.Item
          title="Open Download Folder"
          icon={Icon.Folder}
          onAction={() => open(folder)}
        />
      )}
      <MenuBarExtra.Item
        title="Refresh"
        icon={Icon.ArrowClockwise}
        onAction={revalidate}
      />
    </MenuBarExtra.Section>
  );
}

function ErrorSection({ error }: { error: Error }) {
  const notInstalled = error instanceof TgdlNotInstalled;
  const message =
    error instanceof TgdlError ? error.message : "Something went wrong.";
  return (
    <MenuBarExtra.Section title="Setup needed">
      <MenuBarExtra.Item
        icon={{ source: Icon.Warning, tintColor: Color.Red }}
        title={message}
        tooltip={message}
      />
      <MenuBarExtra.Item
        title="Set Up Telegram Downloader…"
        icon={Icon.Gear}
        onAction={() =>
          launchCommand({
            name: "new-download",
            type: LaunchType.UserInitiated,
          }).catch(() => undefined)
        }
      />
      {notInstalled && (
        <MenuBarExtra.Item
          title="Copy Install Command"
          icon={Icon.Clipboard}
          onAction={() => Clipboard.copy("pipx install tgdl")}
        />
      )}
    </MenuBarExtra.Section>
  );
}

function openManageJobs() {
  launchCommand({ name: "manage-jobs", type: LaunchType.UserInitiated }).catch(
    () => {
      // command may be disabled; ignore
    },
  );
}
