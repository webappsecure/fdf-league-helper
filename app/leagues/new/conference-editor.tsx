import type { FieldError } from "@/lib/league-setup";
import { DivisionRows } from "./division-rows";
import {
  FieldMessage,
  LabeledInput,
  SECONDARY_BUTTON,
  newConferenceRow,
  type ConferenceRow,
} from "./form-fields";

export function ConferenceEditor({
  conferences,
  errors,
  onChange,
  onRowCountChange,
}: {
  conferences: ConferenceRow[];
  errors: FieldError[];
  onChange: (conferences: ConferenceRow[]) => void;
  onRowCountChange: () => void;
}) {
  const update = (key: number, patch: Partial<ConferenceRow>) =>
    onChange(
      conferences.map((conference) =>
        conference.key === key ? { ...conference, ...patch } : conference,
      ),
    );

  function resize(next: ConferenceRow[]) {
    onRowCountChange();
    onChange(next);
  }

  return (
    <div className="mt-4 space-y-4">
      {conferences.map((conference, index) => {
        const divisionsField = `conferences.${index}.divisions`;
        return (
          <div
            key={conference.key}
            id={`field-${divisionsField}`}
            tabIndex={-1}
            className="space-y-3 rounded border border-border p-4"
          >
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-48 flex-1">
                <LabeledInput
                  field={`conferences.${index}.name`}
                  label="Conference name"
                  errors={errors}
                  compact
                  type="text"
                  value={conference.name}
                  onChange={(event) => update(conference.key, { name: event.target.value })}
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  resize(conferences.filter((other) => other.key !== conference.key))
                }
                className={`${SECONDARY_BUTTON} mt-6`}
                aria-label={`Remove conference ${conference.name || index + 1}`}
              >
                Remove conference
              </button>
            </div>
            <FieldMessage field={divisionsField} errors={errors} />
            <DivisionRows
              rows={conference.divisions}
              prefix={divisionsField}
              errors={errors}
              onChange={(divisions) => update(conference.key, { divisions })}
              onRowCountChange={onRowCountChange}
            />
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => resize([...conferences, newConferenceRow()])}
        className={SECONDARY_BUTTON}
      >
        Add conference
      </button>
    </div>
  );
}
