import { LaunchProps, showHUD } from "@raycast/api";

// TODO(cook): read target from args/clipboard and call startJob with defaults.
export default async function Command(
  props: LaunchProps<{ arguments: { target?: string } }>,
) {
  await showHUD(
    `Quick Download — coming soon${props.arguments.target ? `: ${props.arguments.target}` : ""}`,
  );
}
