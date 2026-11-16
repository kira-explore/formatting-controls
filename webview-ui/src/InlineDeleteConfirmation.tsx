import type { Ref } from "react";

export const InlineDeleteConfirmation = ({
  noteId,
  note,
  label,
  cancelRef,
  disabled,
  respond,
}: {
  noteId: string;
  note: string;
  label: string;
  cancelRef: Ref<HTMLButtonElement>;
  disabled?: boolean;
  respond: (accepted: boolean) => void;
}) => (
  <div className="profile-picker-actions">
    <p id={noteId} className="picker-delete-note">
      {note}
    </p>
    <div className="button-row">
      <button
        type="button"
        ref={cancelRef}
        aria-describedby={noteId}
        disabled={disabled}
        onClick={() => respond(false)}
      >
        Cancel
      </button>
      <button
        type="button"
        className="primary"
        aria-label={label}
        aria-describedby={noteId}
        disabled={disabled}
        onClick={() => respond(true)}
      >
        Delete
      </button>
    </div>
  </div>
);
