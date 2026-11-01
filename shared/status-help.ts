export const statusHelp = {
  pause: "Pause automatic formatting until you resume.",
  resume: "Restore your previous formatting settings.",
  file: [
    "This summary is based on the active file.",
    "Settings may differ by language or workspace folder.",
  ].join("\n"),
  formatting: [
    "Automatic formatting settings for save, paste and type.",
    "1. Enabled: All three are on.",
    "2. Disabled: All three are off.",
    "3. Mixed: Some are on; others are off.",
  ].join("\n"),
} as const;

export const issueUrl =
  "https://github.com/kira-explore/formatting-controls/issues/new";
