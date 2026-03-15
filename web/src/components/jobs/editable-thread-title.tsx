import { useEffect, useState } from "react";

type EditableThreadTitleProps = {
  title: string;
  onSave: (title: string) => void;
};

export function EditableThreadTitle({
  title,
  onSave,
}: EditableThreadTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  useEffect(() => {
    if (!editing) {
      setDraft(title);
    }
  }, [editing, title]);

  if (!editing) {
    return (
      <h3
        className="cursor-pointer text-base font-bold transition-colors hover:text-primary"
        title="Click to rename"
        onClick={() => {
          setDraft(title);
          setEditing(true);
        }}
      >
        {title}
      </h3>
    );
  }

  return (
    <input
      type="text"
      autoFocus
      className="w-full border-b border-primary bg-transparent text-base font-bold outline-none"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        if (trimmed && trimmed !== title) {
          onSave(trimmed);
        }
        setEditing(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          (event.target as HTMLInputElement).blur();
        }
        if (event.key === "Escape") {
          setDraft(title);
          setEditing(false);
        }
      }}
    />
  );
}
