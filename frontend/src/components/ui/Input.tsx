import {
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect,
  useRef,
  useState,
} from "react";
import { Maximize2, Minimize2 } from "lucide-react";

import { cn } from "../../lib/cn";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-white px-3 text-sm outline-none ring-offset-background transition focus:ring-2 focus:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  collapsedClassName?: string;
  defaultExpanded?: boolean;
  expandable?: boolean;
  expandedClassName?: string;
  textareaClassName?: string;
};

export function Textarea({
  className,
  collapsedClassName,
  defaultExpanded = false,
  disabled,
  expandable = true,
  expandedClassName,
  onKeyDown,
  rows,
  textareaClassName,
  ...props
}: TextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const expandedHeightRef = useRef("");
  const [expanded, setExpanded] = useState(defaultExpanded);
  const active = !expandable || expanded;

  useEffect(() => {
    const element = textareaRef.current;
    if (!element || !expandable) {
      return;
    }

    if (expanded) {
      if (expandedHeightRef.current) {
        element.style.height = expandedHeightRef.current;
      }
    } else {
      element.style.height = "";
    }
  }, [expandable, expanded]);

  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2",
        className,
      )}
    >
      <textarea
        ref={textareaRef}
        className={cn(
          "w-full min-w-0 rounded-md border border-input bg-white px-3 py-2 font-mono text-sm outline-none ring-offset-background transition focus:ring-2 focus:ring-ring",
          active
            ? cn("min-h-24 resize-y overflow-auto", expandedClassName)
            : cn("h-9 resize-none overflow-hidden", collapsedClassName),
          textareaClassName,
        )}
        disabled={disabled}
        onKeyDown={(event) => {
          if (expandable && !expanded && event.key === "Enter") {
            setExpanded(true);
          }
          onKeyDown?.(event);
        }}
        rows={active ? rows : 1}
        {...props}
      />
      {expandable ? (
        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-white text-foreground transition hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          aria-expanded={expanded}
          disabled={disabled}
          title={expanded ? "收起" : "展开"}
          aria-label={expanded ? "收起" : "展开"}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setExpanded((current) => {
              if (current && textareaRef.current) {
                expandedHeightRef.current = textareaRef.current.style.height;
              }
              return !current;
            });
          }}
        >
          {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      ) : null}
    </div>
  );
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-white px-3 text-sm outline-none ring-offset-background transition focus:ring-2 focus:ring-ring",
        className,
      )}
      {...props}
    />
  );
}
