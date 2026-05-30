import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number | string;
};

export function Modal({ title, onClose, children, footer, width }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="modalBackdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={width ? { width } : undefined}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal__head">
          <div className="modal__title">{title}</div>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
