"use client";

import { useState, useTransition } from "react";
import { Modal } from "./Forms";

export function ConfirmButton({ action, label, confirm, danger, small = true }: { action: () => Promise<unknown>; label: string; confirm: string; danger?: boolean; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <button className={`btn ${small ? "btn-sm" : ""} ${danger ? "btn-danger" : ""}`} onClick={() => setOpen(true)} disabled={pending}>{label}</button>
      {open && (
        <Modal title="Confirmation" onClose={() => setOpen(false)}>
          <p style={{ marginBottom: 18 }}>{confirm}</p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
            <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} disabled={pending} onClick={() => start(async () => { await action(); setOpen(false); })}>Yes, proceed</button>
          </div>
        </Modal>
      )}
    </>
  );
}
