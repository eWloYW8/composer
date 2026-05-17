import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "grid min-w-0 gap-1.5 text-sm font-medium text-foreground",
        className,
      )}
    >
      <span>{label}</span>
      {children}
    </label>
  );
}

export function CheckField({
  className,
  label,
  checked,
  onChange,
}: {
  className?: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "inline-flex h-9 min-w-0 items-center self-end rounded-md border border-input bg-white px-3 text-sm font-medium text-foreground",
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <input
          className="h-4 w-4 shrink-0 accent-primary"
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="truncate">{label}</span>
      </span>
    </label>
  );
}
