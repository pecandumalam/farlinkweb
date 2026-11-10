"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function Badge({ value, dot }: { value: string; dot?: boolean }) {
  return (
    <span className={`badge b-${value.toLowerCase()}`}>
      {dot !== false && <span className="dot" />}
      {value}
    </span>
  );
}

/** Refresh server data periodically (status device). */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

export function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className="toast">{msg}</div>;
}

export function PrintButton({ label = "Print / Save PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn btn-sm" onClick={() => window.print()}>
      {label}
    </button>
  );
}

export function useToast() {
  const [msg, setMsg] = useState("");
  const el = msg ? <Toast msg={msg} onDone={() => setMsg("")} /> : null;
  return { toast: setMsg, toastEl: el };
}

