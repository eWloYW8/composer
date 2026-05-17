import type { HTMLAttributes } from "react";

import { cn } from "../../lib/cn";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-sm bg-accent px-2 text-xs font-medium text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}
