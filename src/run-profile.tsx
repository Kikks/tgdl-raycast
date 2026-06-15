import {
  Action,
  ActionPanel,
  Color,
  Detail,
  Icon,
  LaunchType,
  launchCommand,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { listProfiles, startJobFromProfile, TgdlError } from "./lib/tgdl";
import { TgdlGate } from "./lib/onboarding";
import type { ProfileSummary } from "./lib/types";

export default function Command() {
  return (
    <TgdlGate>
      <ProfileList />
    </TgdlGate>
  );
}

function ProfileList() {
  const { data, isLoading } = usePromise(listProfiles);
  const profiles = data ?? [];

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search profiles…">
      <List.EmptyView
        icon={Icon.Bookmark}
        title="No saved profiles"
        description="Save one from the tgdl wizard (`tgdl download`) by naming it when prompted."
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
      {profiles.map((p) => (
        <ProfileItem key={p.name} profile={p} />
      ))}
    </List>
  );
}

function ProfileItem({ profile }: { profile: ProfileSummary }) {
  async function run(dryRun: boolean) {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: dryRun ? "Starting dry run…" : "Starting download…",
    });
    try {
      const { job_id } = await startJobFromProfile(profile.name, { dryRun });
      toast.style = Toast.Style.Success;
      toast.title = dryRun ? "Dry run started" : "Download started";
      toast.message = job_id;
      await launchCommand({
        name: "download-monitor",
        type: LaunchType.UserInitiated,
      }).catch(() => undefined);
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = "Couldn't start";
      toast.message = e instanceof TgdlError ? e.message : String(e);
    }
  }

  return (
    <List.Item
      icon={{ source: Icon.Bookmark, tintColor: Color.Blue }}
      title={profile.name}
      subtitle={profile.channel}
      accessories={[
        {
          tag: {
            value: `${profile.media_types.length} types`,
            color: Color.Purple,
          },
        },
      ]}
      actions={
        <ActionPanel>
          <Action
            title="Run Download"
            icon={Icon.Download}
            onAction={() => run(false)}
          />
          <Action
            title="Run as Dry Run"
            icon={Icon.Eye}
            onAction={() => run(true)}
          />
          <Action
            title="Edit in New Download"
            icon={Icon.Pencil}
            onAction={() =>
              launchCommand({
                name: "new-download",
                type: LaunchType.UserInitiated,
                context: { profileName: profile.name },
              }).catch(() => undefined)
            }
          />
          <Action.Push
            title="Show Config"
            icon={Icon.Sidebar}
            target={<ProfileDetail profile={profile} />}
          />
          <Action.CopyToClipboard
            title="Copy Channel"
            content={profile.channel}
          />
        </ActionPanel>
      }
    />
  );
}

function ProfileDetail({ profile }: { profile: ProfileSummary }) {
  const md = [
    `# ${profile.name}`,
    "",
    `**Channel:** ${profile.channel || "—"}`,
    `**Media types:** ${profile.media_types.join(", ") || "all"}`,
    `**Output:** \`${profile.output_path || "default"}\``,
  ].join("\n");
  return <Detail markdown={md} />;
}
