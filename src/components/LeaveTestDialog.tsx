import React, { useEffect, useRef } from "react";
export function LeaveTestDialog({
  onStay,
  onLeave,
}: {
  onStay: () => void;
  onLeave: () => void;
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
      onCancel={(e) => {
        e.preventDefault();
        onStay();
      }}
      aria-labelledby="leave-test-title"
    >
      <h2 id="leave-test-title">Leave this test?</h2>
      <p>
        Your saved answers stay on this device. You can use Forward to return to
        this session.
      </p>
      <div className="studio-actions">
        <button autoFocus className="studio-primary" onClick={onStay}>
          Keep working
        </button>
        <button className="studio-secondary" onClick={onLeave}>
          Save and leave
        </button>
      </div>
    </dialog>
  );
}
