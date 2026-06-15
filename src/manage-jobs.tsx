import { useEffect } from "react";
import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Detail,
  Icon,
  Keyboard,
  LaunchType,
  launchCommand,
  List,
  open,
  showToast,
  Toast,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import {
  cancelJob,
  cleanJobs,
  jobStatus,
  listJobs,
  preferences,
} from "./lib/tgdl";
import { TgdlGate } from "./lib/onboarding";
import { formatBytes, formatEta, phaseMeta, progressLabel } from "./lib/format";
import { ACTIVE_PHASES, type JobStatus } from "./lib/types";

export default function Command() {
  return (
    <TgdlGate>
      <JobsList />
    </TgdlGate>
  );
}

function JobsList() {
  const { data, isLoading, revalidate } = usePromise(listJobs);
  const jobs = data ?? [];
  const active = jobs.filter((j) => ACTIVE_PHASES.has(j.phase));
  const recent = jobs.filter((j) => !ACTIVE_PHASES.has(j.phase));

  // Live-refresh while anything is in flight.
  useEffect(() => {
    if (active.length === 0) return;
    const t = setInterval(revalidate, 1500);
    return () => clearInterval(t);
  }, [active.length, revalidate]);

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search downloads…">
      <List.EmptyView
        icon={Icon.Tray}
        title="No downloads yet"
        description="Start one with New Download."
        actions={
          <ActionPanel>
            <Action
              title="New Download"
              icon={Icon.Plus}
              onAction={() =>
                launchCommand({
                  name: "new-download",
                  type: LaunchType.UserInitiated,
                })
              }
            />
          </ActionPanel>
        }
      />

      {active.length > 0 && (
        <List.Section title="Active" subtitle={`${active.length}`}>
          {active.map((job) => (
            <JobItem key={job.job_id} job={job} revalidate={revalidate} />
          ))}
        </List.Section>
      )}

      {recent.length > 0 && (
        <List.Section title="Recent" subtitle={`${recent.length}`}>
          {recent.map((job) => (
            <JobItem key={job.job_id} job={job} revalidate={revalidate} />
          ))}
        </List.Section>
      )}
    </List>
  );
}

function JobItem({
  job,
  revalidate,
}: {
  job: JobStatus;
  revalidate: () => void;
}) {
  const meta = phaseMeta(job.phase);
  const isActive = ACTIVE_PHASES.has(job.phase);

  const accessories: List.Item.Accessory[] = [];
  if (job.phase === "downloading" && job.eta_seconds != null) {
    accessories.push({
      tag: { value: `ETA ${formatEta(job.eta_seconds)}`, color: Color.Blue },
    });
  }
  accessories.push({ tag: { value: meta.label, color: meta.color } });

  return (
    <List.Item
      icon={{ source: meta.icon, tintColor: meta.color }}
      title={job.channel_name || job.channel}
      subtitle={progressLabel(job)}
      accessories={accessories}
      actions={
        <ActionPanel>
          <Action.Push
            title="Show Details"
            icon={Icon.Sidebar}
            target={<JobDetail jobId={job.job_id} />}
          />
          {isActive && (
            <Action
              title="Cancel Download"
              icon={Icon.XMarkCircle}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["ctrl"], key: "x" }}
              onAction={async () => {
                await cancelJob(job.job_id).catch(() => undefined);
                await showToast({
                  style: Toast.Style.Success,
                  title: "Cancelled",
                });
                revalidate();
              }}
            />
          )}
          <OpenFolderAction />
          <Action.CopyToClipboard
            title="Copy Job ID"
            content={job.job_id}
            shortcut={Keyboard.Shortcut.Common.Copy}
          />
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            shortcut={Keyboard.Shortcut.Common.Refresh}
            onAction={revalidate}
          />
          <CleanAction revalidate={revalidate} />
        </ActionPanel>
      }
    />
  );
}

function JobDetail({ jobId }: { jobId: string }) {
  const { data: job, isLoading, revalidate } = usePromise(jobStatus, [jobId]);

  useEffect(() => {
    if (!job || !ACTIVE_PHASES.has(job.phase)) return;
    const t = setInterval(revalidate, 1500);
    return () => clearInterval(t);
  }, [job, revalidate]);

  const meta = job ? phaseMeta(job.phase) : undefined;
  const p = job?.progress;
  const md = job
    ? [
        `# ${job.channel_name || job.channel}`,
        "",
        job.current_file ? `**Now:** ${job.current_file.name}` : "",
        job.error ? `\n> ⚠️ ${job.error}` : "",
      ].join("\n")
    : "Loading…";

  return (
    <Detail
      isLoading={isLoading}
      markdown={md}
      metadata={
        job && meta ? (
          <Detail.Metadata>
            <Detail.Metadata.TagList title="Status">
              <Detail.Metadata.TagList.Item
                text={meta.label}
                color={meta.color}
              />
            </Detail.Metadata.TagList>
            <Detail.Metadata.Label
              title="Progress"
              text={`${p?.completed ?? 0} / ${job.totals.files ?? "?"} files`}
            />
            <Detail.Metadata.Label
              title="Downloaded"
              text={formatBytes(p?.bytes_done ?? 0)}
            />
            <Detail.Metadata.Label
              title="Skipped"
              text={`${p?.skipped ?? 0}`}
            />
            <Detail.Metadata.Label title="Failed" text={`${p?.failed ?? 0}`} />
            {job.phase === "downloading" && (
              <Detail.Metadata.Label
                title="ETA"
                text={formatEta(job.eta_seconds)}
              />
            )}
            <Detail.Metadata.Separator />
            <Detail.Metadata.Label title="Job ID" text={job.job_id} />
          </Detail.Metadata>
        ) : undefined
      }
      actions={
        <ActionPanel>
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            onAction={revalidate}
          />
          {job && (
            <Action.CopyToClipboard title="Copy Job ID" content={job.job_id} />
          )}
        </ActionPanel>
      }
    />
  );
}

function OpenFolderAction() {
  const folder = preferences().defaultDownloadFolder;
  if (!folder) return null;
  return (
    <Action
      title="Open Download Folder"
      icon={Icon.Folder}
      shortcut={{ modifiers: ["cmd"], key: "o" }}
      onAction={() => open(folder)}
    />
  );
}

function CleanAction({ revalidate }: { revalidate: () => void }) {
  return (
    <Action
      title="Clear Finished Jobs"
      icon={Icon.Trash}
      style={Action.Style.Destructive}
      shortcut={{ modifiers: ["cmd", "shift"], key: "x" }}
      onAction={async () => {
        const ok = await confirmAlert({
          title: "Clear finished jobs?",
          message:
            "Removes done, failed, and cancelled jobs from the list. Files on disk are kept.",
          primaryAction: {
            title: "Clear",
            style: Alert.ActionStyle.Destructive,
          },
        });
        if (!ok) return;
        const { removed } = await cleanJobs();
        await showToast({
          style: Toast.Style.Success,
          title: `Cleared ${removed} job(s)`,
        });
        revalidate();
      }}
    />
  );
}
