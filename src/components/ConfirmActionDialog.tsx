import React, { useEffect, useRef } from "react";
export function ConfirmActionDialog({
  title,
  children,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element?.showModal) element.showModal();
    else element?.setAttribute("open", "");
    return () => {
      if (element?.close) element.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="studio-modal leave-test-dialog"
      aria-labelledby="confirm-action-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id="confirm-action-title">{title}</h2>
      <p>{children}</p>
      <div className="studio-actions">
        <button className="studio-secondary" autoFocus onClick={onCancel}>
          Cancel
        </button>
        <button className="studio-primary" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
