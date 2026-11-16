import { languageName } from "./language";
import type { Scope } from "./protocol";

export const pauseScopeLabel = (scope: Scope, folderName?: string): string => {
  const destination =
    scope.target === "folder"
      ? `Folder: ${folderName ?? "Unavailable folder"}`
      : "Entire workspace";
  return scope.language
    ? `${destination} · ${languageName(scope.language)}`
    : destination;
};
