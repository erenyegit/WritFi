"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const ALIGN = { left: "left-0", right: "right-0", center: "left-1/2 -translate-x-1/2" } as const;

/** A button that opens a panel below it; closes on outside click and Escape. */
export function Popover({
  trigger,
  children,
  align = "right",
  panelClassName = "w-72",
}: {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right" | "center";
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {trigger(open, () => setOpen((v) => !v))}
      {open && (
        <div
          className={`sheet absolute z-40 mt-2 p-4 ${ALIGN[align]} ${panelClassName}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
