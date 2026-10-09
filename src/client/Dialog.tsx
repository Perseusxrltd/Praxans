import React, { useEffect, useId, useRef } from "react";
import { Sprout, X } from "lucide-react";

export function Dialog({
  title,
  close,
  children,
  wide = false,
  eyebrow = "A LITTLE CARE GOES A LONG WAY",
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
  eyebrow?: string;
}) {
  const ref = useRef<HTMLDivElement>(null),
    titleId = useId();
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key === "Tab") {
        const focusable = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea,a[href],[tabindex="0"]',
        );
        if (!focusable?.length) return;
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className={`dialog ${wide ? "dialog-wide" : ""}`}
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={19} />
        </button>
        <span className="eyebrow">
          <Sprout size={14} />
          {eyebrow}
        </span>
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
