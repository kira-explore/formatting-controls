import type { Snapshot } from "./protocol";

export const diagnosticScopeLabel = ({
  scope,
  folders,
}: Pick<Snapshot, "scope" | "folders">): string => {
  if (scope.target === "user") return "User settings";
  if (scope.target === "workspace") return "Workspace";
  const name = folders.find((folder) => folder.uri === scope.folder)?.name;
  return name ? `Folder: ${name}` : "Workspace folder";
};
