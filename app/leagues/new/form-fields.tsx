import type { InputHTMLAttributes } from "react";
import type { FieldError } from "@/lib/league-setup";

export type DivisionRow = { key: number; name: string; teamCount: string };
export type ConferenceRow = { key: number; name: string; divisions: DivisionRow[] };
export type StructureKind = "none" | "divisions" | "conferences";

export const INPUT_CLASS =
  "w-full rounded border border-border-strong px-3 py-2 aria-[invalid=true]:border-danger";
export const SECONDARY_BUTTON =
  "rounded border border-border-strong px-3 py-1.5 text-sm font-medium hover:bg-hover";

// Rows are keyed by a counter, not their position, so React keeps each row's
// inputs when another row is removed.
let nextKey = 0;

export function newDivisionRow(): DivisionRow {
  return { key: nextKey++, name: "", teamCount: "" };
}

export function newConferenceRow(): ConferenceRow {
  return { key: nextKey++, name: "", divisions: [newDivisionRow()] };
}

export function errorFor(errors: FieldError[], field: string): string | undefined {
  return errors.find((error) => error.field === field)?.message;
}

export function fieldProps(errors: FieldError[], field: string) {
  const invalid = errorFor(errors, field) !== undefined;
  return {
    id: `field-${field}`,
    "aria-invalid": invalid,
    "aria-describedby": invalid ? `error-${field}` : undefined,
  };
}

export function FieldMessage({ field, errors }: { field: string; errors: FieldError[] }) {
  const message = errorFor(errors, field);
  if (!message) return null;
  return (
    <p id={`error-${field}`} className="mt-1 text-sm text-danger">
      {message}
    </p>
  );
}

type LabeledInputProps = {
  field: string;
  label: string;
  errors: FieldError[];
  hint?: string;
  // Rows inside the structure use a smaller label than the top-level fields.
  compact?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id">;

export function LabeledInput({
  field,
  label,
  errors,
  hint,
  compact = false,
  className = INPUT_CLASS,
  ...input
}: LabeledInputProps) {
  return (
    <>
      <label
        htmlFor={`field-${field}`}
        className={compact ? "block text-sm font-medium" : "block font-medium"}
      >
        {label}
      </label>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      <input {...input} {...fieldProps(errors, field)} className={className} />
      <FieldMessage field={field} errors={errors} />
    </>
  );
}
