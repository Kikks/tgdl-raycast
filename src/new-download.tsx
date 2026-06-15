import { useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Form,
  Icon,
  LaunchProps,
  LaunchType,
  Toast,
  launchCommand,
  popToRoot,
  showToast,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import {
  listDialogs,
  listProfiles,
  preferences,
  profileSave,
  profileShow,
  startJob,
  TgdlError,
} from "./lib/tgdl";
import { TgdlGate } from "./lib/onboarding";
import { formatBytes } from "./lib/format";
import {
  ALL_MEDIA_TYPES,
  CONCURRENCY_OPTIONS,
  MEDIA_TYPE_OPTIONS,
  RESUME_OPTIONS,
  TEMPLATE_PRESETS,
  parseSize,
} from "./lib/options";
import type { DownloadConfig } from "./lib/types";

interface FormValues {
  channel: string;
  mediaTypes: string[];
  days: string;
  dateFrom: Date | null;
  dateTo: Date | null;
  minSize: string;
  maxSize: string;
  caption: string;
  senders: string;
  dedup: boolean;
  output: string[];
  subfolders: string[];
  sidecars: boolean;
  resume: string;
  concurrency: string;
  profileName: string;
}

export default function Command(
  props: LaunchProps<{ launchContext: { profileName?: string } }>,
) {
  return (
    <TgdlGate>
      <NewDownloadHost initialProfile={props.launchContext?.profileName} />
    </TgdlGate>
  );
}

function NewDownloadHost({ initialProfile }: { initialProfile?: string }) {
  const { data: profiles } = usePromise(listProfiles);
  const [initial, setInitial] = useState<DownloadConfig | undefined>(undefined);
  const [formKey, setFormKey] = useState(0);

  async function loadProfile(name: string) {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Loading “${name}”…`,
    });
    try {
      const cfg = await profileShow(name);
      setInitial(cfg);
      setFormKey((k) => k + 1); // remount the form with the profile's values
      toast.style = Toast.Style.Success;
      toast.title = `Loaded “${name}”`;
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = "Couldn't load profile";
      toast.message = e instanceof TgdlError ? e.message : String(e);
    }
  }

  // Preload when opened from Run Profile's "Edit & Run".
  useEffect(() => {
    if (initialProfile) loadProfile(initialProfile);
  }, [initialProfile]);

  return (
    <DownloadForm
      key={formKey}
      initial={initial}
      profiles={(profiles ?? []).map((p) => p.name)}
      onLoadProfile={loadProfile}
    />
  );
}

function DownloadForm({
  initial,
  profiles,
  onLoadProfile,
}: {
  initial?: DownloadConfig;
  profiles: string[];
  onLoadProfile: (name: string) => void;
}) {
  const prefs = preferences();
  const { data: dialogs } = usePromise(listDialogs, [40]);

  const [channel, setChannel] = useState(initial?.channel ?? "");
  const [dateRange, setDateRange] = useState<string>(
    initial?.date_range_type ?? "all",
  );
  const [template, setTemplate] = useState(
    initial?.filename_template ?? TEMPLATE_PRESETS[0].value,
  );

  const subDefaults = [
    initial?.subfolders_by_type && "type",
    initial?.subfolders_by_date && "date",
    initial?.subfolders_by_sender && "sender",
  ].filter(Boolean) as string[];

  const outputDefault = initial?.output_path
    ? [initial.output_path]
    : prefs.defaultDownloadFolder
      ? [prefs.defaultDownloadFolder]
      : [];

  function buildConfig(values: FormValues): DownloadConfig | null {
    if (!channel.trim()) {
      showToast({ style: Toast.Style.Failure, title: "Channel is required" });
      return null;
    }
    if (values.mediaTypes.length === 0) {
      showToast({
        style: Toast.Style.Failure,
        title: "Pick at least one media type",
      });
      return null;
    }

    const config: DownloadConfig = {
      channel: channel.trim(),
      media_types: values.mediaTypes as DownloadConfig["media_types"],
      date_range_type: dateRange as DownloadConfig["date_range_type"],
      deduplicate: values.dedup,
      json_sidecars: values.sidecars,
      filename_template: template,
      resume_mode: values.resume as DownloadConfig["resume_mode"],
      concurrency: Number(values.concurrency),
      subfolders_by_type: values.subfolders.includes("type"),
      subfolders_by_date: values.subfolders.includes("date"),
      subfolders_by_sender: values.subfolders.includes("sender"),
    };
    if (dateRange === "last_n_days")
      config.last_n_days = Number(values.days) || 30;
    if (dateRange === "custom") {
      config.date_from = values.dateFrom ? values.dateFrom.toISOString() : null;
      config.date_to = values.dateTo ? values.dateTo.toISOString() : null;
    }
    const min = parseSize(values.minSize);
    const max = parseSize(values.maxSize);
    if (min != null || max != null)
      config.file_size = { min_bytes: min, max_bytes: max };
    if (values.caption.trim()) config.caption_keyword = values.caption.trim();
    const senders = values.senders
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (senders.length) config.sender_filter = senders;
    if (values.output[0]) config.output_path = values.output[0];
    return config;
  }

  async function start(values: FormValues, dryRun: boolean) {
    const config = buildConfig(values);
    if (!config) return;

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Starting download…",
    });
    try {
      if (values.profileName.trim())
        await profileSave(values.profileName.trim(), config);
      const { job_id } = await startJob(config, { dryRun });
      toast.style = Toast.Style.Success;
      toast.title = dryRun ? "Dry run started" : "Download started";
      toast.message = job_id;
      await launchCommand({
        name: "download-monitor",
        type: LaunchType.UserInitiated,
      }).catch(() => undefined);
      await popToRoot();
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = "Could not start";
      toast.message = e instanceof TgdlError ? e.message : String(e);
    }
  }

  async function saveProfileOnly(values: FormValues) {
    const config = buildConfig(values);
    if (!config) return;
    if (!values.profileName.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Enter a profile name first",
      });
      return;
    }
    try {
      await profileSave(values.profileName.trim(), config);
      await showToast({
        style: Toast.Style.Success,
        title: `Saved profile “${values.profileName.trim()}”`,
      });
    } catch (e) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Couldn't save profile",
        message: e instanceof TgdlError ? e.message : String(e),
      });
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Start Download"
            icon={Icon.Download}
            onSubmit={(v: FormValues) => start(v, false)}
          />
          <Action.SubmitForm
            title="Dry Run (Preview)"
            icon={Icon.Eye}
            onSubmit={(v: FormValues) => start(v, true)}
          />
          <Action.SubmitForm
            title="Save as Profile"
            icon={Icon.SaveDocument}
            shortcut={{ modifiers: ["cmd"], key: "s" }}
            onSubmit={saveProfileOnly}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Configure a background download. It keeps running after you close Raycast — track it from the Download Monitor menu bar." />

      {profiles.length > 0 && (
        <Form.Dropdown
          id="loadProfile"
          title="Load Profile"
          info="Pre-fill this form from a saved profile, then tweak and run."
          value=""
          onChange={(v) => {
            if (v) onLoadProfile(v);
          }}
        >
          <Form.Dropdown.Item value="" title="— none —" />
          {profiles.map((name) => (
            <Form.Dropdown.Item key={name} value={name} title={name} />
          ))}
        </Form.Dropdown>
      )}

      {dialogs && dialogs.length > 0 && (
        <Form.Dropdown
          id="recentChat"
          title="Recent Chat"
          info="Pick a recent chat to fill the channel field, or type one manually below."
          value=""
          onChange={(v) => {
            if (v) setChannel(v);
          }}
        >
          <Form.Dropdown.Item value="" title="— choose —" />
          {dialogs.map((d) => (
            <Form.Dropdown.Item
              key={d.id}
              value={d.username ? `@${d.username}` : d.id}
              title={d.name + (d.username ? ` (@${d.username})` : "")}
            />
          ))}
        </Form.Dropdown>
      )}

      <Form.TextField
        id="channel"
        title="Channel"
        placeholder="@username, t.me link, or numeric ID"
        info="@username is the most reliable. Numeric IDs only resolve if cached in your session."
        value={channel}
        onChange={setChannel}
      />

      <Form.TagPicker
        id="mediaTypes"
        title="Media Types"
        defaultValue={initial?.media_types ?? ALL_MEDIA_TYPES}
      >
        {MEDIA_TYPE_OPTIONS.map((m) => (
          <Form.TagPicker.Item key={m.value} value={m.value} title={m.label} />
        ))}
      </Form.TagPicker>

      <Form.Separator />

      <Form.Dropdown
        id="dateRange"
        title="Date Range"
        value={dateRange}
        onChange={setDateRange}
      >
        <Form.Dropdown.Item value="all" title="Entire history" />
        <Form.Dropdown.Item value="last_n_days" title="Last N days" />
        <Form.Dropdown.Item value="custom" title="Custom range" />
      </Form.Dropdown>

      {dateRange === "last_n_days" && (
        <Form.TextField
          id="days"
          title="Days back"
          defaultValue={String(initial?.last_n_days ?? 30)}
          placeholder="30"
        />
      )}
      {dateRange === "custom" && (
        <>
          <Form.DatePicker
            id="dateFrom"
            title="From"
            type={Form.DatePicker.Type.Date}
          />
          <Form.DatePicker
            id="dateTo"
            title="To"
            type={Form.DatePicker.Type.Date}
          />
        </>
      )}

      <Form.Separator />

      <Form.TextField
        id="minSize"
        title="Min Size"
        defaultValue={
          initial?.file_size?.min_bytes
            ? formatBytes(initial.file_size.min_bytes)
            : ""
        }
        placeholder="e.g. 100KB (optional)"
      />
      <Form.TextField
        id="maxSize"
        title="Max Size"
        defaultValue={
          initial?.file_size?.max_bytes
            ? formatBytes(initial.file_size.max_bytes)
            : ""
        }
        placeholder="e.g. 500MB (optional)"
      />
      <Form.TextField
        id="caption"
        title="Caption Filter"
        defaultValue={initial?.caption_keyword ?? ""}
        placeholder="text or /regex/ (optional)"
      />
      <Form.TextField
        id="senders"
        title="Senders"
        defaultValue={(initial?.sender_filter ?? []).join(", ")}
        placeholder="@user1, @user2 (optional, comma-separated)"
      />
      <Form.Checkbox
        id="dedup"
        label="Skip duplicate files (same content)"
        defaultValue={initial?.deduplicate ?? true}
      />

      <Form.Separator />

      <Form.FilePicker
        id="output"
        title="Output Folder"
        allowMultipleSelection={false}
        canChooseDirectories
        canChooseFiles={false}
        defaultValue={outputDefault}
      />
      <Form.Dropdown
        id="template"
        title="Filename Template"
        value={template}
        onChange={setTemplate}
      >
        {TEMPLATE_PRESETS.map((t) => (
          <Form.Dropdown.Item key={t.value} value={t.value} title={t.title} />
        ))}
      </Form.Dropdown>
      <Form.TagPicker
        id="subfolders"
        title="Subfolders By"
        defaultValue={subDefaults}
      >
        <Form.TagPicker.Item value="type" title="Media type" />
        <Form.TagPicker.Item value="date" title="Year-month" />
        <Form.TagPicker.Item value="sender" title="Sender" />
      </Form.TagPicker>
      <Form.Checkbox
        id="sidecars"
        label="Save .json metadata sidecars"
        defaultValue={initial?.json_sidecars ?? false}
      />

      <Form.Separator />

      <Form.Dropdown
        id="resume"
        title="Resume Mode"
        defaultValue={initial?.resume_mode ?? "smart"}
      >
        {RESUME_OPTIONS.map((r) => (
          <Form.Dropdown.Item key={r.value} value={r.value} title={r.label} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown
        id="concurrency"
        title="Concurrency"
        defaultValue={String(
          initial?.concurrency ?? prefs.defaultConcurrency ?? "3",
        )}
      >
        {CONCURRENCY_OPTIONS.map((c) => (
          <Form.Dropdown.Item key={c} value={c} title={c} />
        ))}
      </Form.Dropdown>

      <Form.Separator />

      <Form.TextField
        id="profileName"
        title="Save as Profile"
        defaultValue=""
        placeholder="optional — name to save these settings (⌘S)"
        info="Give a name to save these settings as a reusable profile. Leave blank to just download."
      />
    </Form>
  );
}
