import { languageName } from "../../shared/language";
import type { Change, Slot } from "../../shared/workflows";
import { detailedActionNames, display, labels } from "./catalog";

function reviewValue(slot: Slot, saveAction: boolean) {
  if (!slot.present) return "Inherited";
  if (saveAction) {
    if (slot.value === "never" || slot.value === false) return "Never";
    if (slot.value === "always") return "Always";
    if (slot.value === "explicit" || slot.value === true) return "Manual save";
  }
  if (typeof slot.value === "boolean") return slot.value ? "On" : "Off";
  return display(slot.value);
}

function reviewLabel(
  { key, language, action }: Change,
  friendlyActions: boolean,
) {
  const name =
    friendlyActions && action && Object.hasOwn(detailedActionNames, action)
      ? detailedActionNames[action]
      : `${labels[key]}${action ? ` · ${action}` : ""}`;
  return language ? `${languageName(language)} · ${name}` : name;
}

export const ChangeReview = ({
  changes,
  friendlyActions = false,
}: {
  changes: readonly Change[];
  friendlyActions?: boolean;
}) => (
  <table>
    <thead>
      <tr>
        <th scope="col">Setting</th>
        <th scope="col">Current at scope</th>
        <th scope="col">Proposed</th>
      </tr>
    </thead>
    <tbody>
      {changes.map((change) => (
        <tr key={JSON.stringify([change.key, change.language, change.action])}>
          <th scope="row">{reviewLabel(change, friendlyActions)}</th>
          <td>
            {reviewValue(change.before, friendlyActions && !!change.action)}
          </td>
          <td>
            {reviewValue(change.after, friendlyActions && !!change.action)}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);
