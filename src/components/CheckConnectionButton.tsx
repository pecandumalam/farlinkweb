"use client";

import { useTransition } from "react";
import { Activity, Loader2 } from "lucide-react";
import { checkDeviceRealtime } from "@/lib/actions";
import { useToast } from "./ui";

export function CheckConnectionButton({
  deviceId,
  deviceName,
  className = "btn btn-ghost btn-sm",
  label = "Check Connection",
  showIcon = true,
}: {
  deviceId: string;
  deviceName?: string;
  className?: string;
  label?: string;
  showIcon?: boolean;
}) {
  const [pending, start] = useTransition();
  const { toast, toastEl } = useToast();

  const handleCheck = () => {
    start(async () => {
      try {
        const res = await checkDeviceRealtime(deviceId);
        if (res.ok) {
          toast(res.message || "Raspberry Pi ONLINE! Status updated.");
        } else {
          toast(res.error || "Failed to reach Raspberry Pi.");
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Connection failed";
        toast(`Connection check error: ${errorMsg}`);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={handleCheck}
        title={pending ? "Pinging Raspberry Pi..." : `Check real-time connection status for ${deviceName || "device"}`}
        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        {pending ? (
          <Loader2 size={13} className="spin" style={{ color: "#38bdf8" }} />
        ) : (
          showIcon && <Activity size={13} style={{ color: "#22c55e" }} />
        )}
        <span>{pending ? "Pinging..." : label}</span>
      </button>
      {toastEl}
    </>
  );
}
