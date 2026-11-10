"use client";

import { useState, useTransition } from "react";
import {
  Gauge,
  Route,
  Globe,
  Link2,
  Plug,
  RotateCcw,
  Power,
  Clock,
  FileText,
  Save,
  KeyRound,
  ShieldAlert,
  Layers,
  Crown,
  DownloadCloud,
} from "lucide-react";
import { regenerateToken, saveConfig, sendCommand, setSchedule } from "@/lib/actions";
import { INTERVALS } from "@/lib/constants";
import { useToast } from "./ui";
import { Modal } from "./Forms";

const TESTS = [
  { type: "SPEED", label: "Run Speed Test", icon: Gauge },
  { type: "MTR", label: "MTR", icon: Route },
  { type: "DIG", label: "DIG", icon: Globe },
  { type: "CURL", label: "CURL", icon: Link2 },
  { type: "TCP_PORT", label: "TCP Port", icon: Plug },
];

export function RunTestButtons({ deviceId, config }: { deviceId: string; config?: Record<string, any> }) {
  const [pending, start] = useTransition();
  const { toast, toastEl } = useToast();
  const run = (testType: string) =>
    start(async () => {
      const target = testType === "SPEED" ? undefined : config?.[`${testType.toLowerCase()}Target`];
      const r = await sendCommand(deviceId, "RUN_TEST", { testType, target });
      toast(r.ok ? r.message! : r.error!);
    });
  return (
    <div className="row">
      {TESTS.map((t, i) => (
        <button
          key={t.type}
          id={`run-${t.type.toLowerCase()}`}
          className={`btn ${i === 0 ? "btn-primary" : ""}`}
          disabled={pending}
          onClick={() => run(t.type)}
        >
          <t.icon size={15} /> {t.label}
        </button>
      ))}
      {toastEl}
    </div>
  );
}

export function SystemCommands({ deviceId, isAdmin = true }: { deviceId: string; isAdmin?: boolean }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const { toast, toastEl } = useToast();

  if (!isAdmin) {
    return (
      <div
        className="alert"
        style={{
          background: "rgba(245,158,11,0.08)",
          borderColor: "rgba(245,158,11,0.3)",
          color: "var(--warning)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <ShieldAlert size={18} />
        <span>System-level commands (Reboot, Restart Agent, Regenerate Token) are restricted to Administrator accounts.</span>
      </div>
    );
  }

  const exec = (type: string) =>
    start(async () => {
      const r = await sendCommand(deviceId, type);
      toast(r.ok ? r.message! : r.error!);
      setConfirm(null);
    });

  return (
    <div className="stack" style={{ gap: 8 }}>
      <button className="btn btn-primary" disabled={pending} onClick={() => exec("SYNC_DATA")}>
        <DownloadCloud size={15} /> Fetch / Sync Stored Data
      </button>
      <button className="btn" disabled={pending} onClick={() => exec("SYNC_TIME")}>
        <Clock size={15} /> Sync Time (NTP)
      </button>
      <button className="btn" disabled={pending} onClick={() => exec("GET_LOGS")}>
        <FileText size={15} /> Get Agent Logs
      </button>
      <button className="btn" disabled={pending} onClick={() => exec("RESTART_AGENT")}>
        <RotateCcw size={15} /> Restart Agent
      </button>
      <button className="btn btn-danger" disabled={pending} onClick={() => setConfirm("REBOOT")}>
        <Power size={15} /> Reboot Raspberry Pi
      </button>
      <button
        className="btn btn-ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await regenerateToken(deviceId);
            setToken(r.token ?? "");
          })
        }
      >
        <KeyRound size={15} /> Regenerate Device Token
      </button>
      {confirm && (
        <Modal title="Confirm Reboot" onClose={() => setConfirm(null)}>
          <p style={{ marginBottom: 18 }}>The probe will reboot and be temporarily offline. Proceed?</p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button className="btn btn-danger" disabled={pending} onClick={() => exec(confirm)}>
              Reboot
            </button>
          </div>
        </Modal>
      )}
      {token && (
        <Modal title="New Device Token" onClose={() => setToken("")}>
          <div className="stack">
            <div className="alert alert-ok">Previous token is invalidated. Save this token in your device agent configuration.</div>
            <input className="input mono" readOnly value={token} onFocus={(e) => e.target.select()} />
          </div>
        </Modal>
      )}
      {toastEl}
    </div>
  );
}

export function ScheduleControl({ deviceId, interval }: { deviceId: string; interval: number }) {
  const [val, setVal] = useState(interval);
  const [pending, start] = useTransition();
  const { toast, toastEl } = useToast();
  const change = (v: number) => {
    setVal(v);
    start(async () => {
      const r = await setSchedule(deviceId, v);
      toast(r.ok ? r.message! : r.error!);
    });
  };
  return (
    <div className="seg" aria-busy={pending}>
      {INTERVALS.map((i) => (
        <button
          key={i.value}
          id={`sched-${deviceId}-${i.value}`}
          className={val === i.value ? "on" : ""}
          disabled={pending}
          onClick={() => change(i.value)}
        >
          {i.label}
        </button>
      ))}
      {toastEl}
    </div>
  );
}

export function ConfigForm({
  deviceId,
  config,
  gatewayIp,
  deviceType = "FARLINK_GO",
}: {
  deviceId: string;
  config: Record<string, any>;
  gatewayIp: string | null;
  deviceType?: string;
}) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<Record<string, any> | null>(null);
  const { toast, toastEl } = useToast();

  const currentType = config.type || (deviceType === "FARLINK_EDGE" ? "FarLink Edge" : "FarLink Go");
  const currentMode = config.mode || (currentType === "FarLink Edge" ? "Slave" : "Standalone");

  const [selType, setSelType] = useState<string>(currentType);
  const [selMode, setSelMode] = useState<string>(currentMode);

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const data = Object.fromEntries(fd.entries());
        setConfirm(data);
      }}
    >
      <div
        className="card card-pad"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-2)",
          marginBottom: 10,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Layers size={16} className="text-primary" />
          <span>Device Profile & Operation Mode (FarLink Agent)</span>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>Device Model / Type</label>
            <select
              name="type"
              className="select"
              value={selType}
              onChange={(e) => {
                setSelType(e.target.value);
                if (e.target.value === "FarLink Go") setSelMode("Standalone");
              }}
            >
              <option value="FarLink Go">FarLink Go (Portable Network Probe)</option>
              <option value="FarLink Edge">FarLink Edge (Dual-Engine / Master-Slave)</option>
            </select>
          </div>

          <div className="field">
            <label>Operation Mode</label>
            <select
              name="mode"
              className="select"
              value={selMode}
              onChange={(e) => setSelMode(e.target.value)}
            >
              {selType === "FarLink Go" ? (
                <option value="Standalone">Standalone (Single Unit Testing)</option>
              ) : (
                <>
                  <option value="Master">Master (iPerf Server Hub & Dual Testing Target)</option>
                  <option value="Slave">Slave (Continuously Probes & Tests to FarLink Master)</option>
                  <option value="Standalone">Standalone</option>
                </>
              )}
            </select>
          </div>

          {selMode === "Slave" && (
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label style={{ color: "var(--info)", fontWeight: 600 }}>
                Master FarLink IP Address (Required for Slave mode)
              </label>
              <input
                name="master_ip"
                className="input mono"
                required
                defaultValue={config.master_ip || config.masterIp || "192.168.1.8"}
                placeholder="192.168.1.8"
              />
              <p className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                Slave probe continuously checks latency, jitter, throughput, and connectivity to this Master IP.
              </p>
            </div>
          )}

          {selMode === "Master" && (
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label style={{ color: "var(--info)", fontWeight: 600 }}>
                Slave Local IP Address (Optional)
              </label>
              <input
                name="slave_ip"
                className="input mono"
                defaultValue={
                  (config.slave_ip && !String(config.slave_ip).startsWith("192.168.99."))
                    ? config.slave_ip
                    : (config.slaveIp && !String(config.slaveIp).startsWith("192.168.99."))
                    ? config.slaveIp
                    : ""
                }
                placeholder="e.g. 192.168.2.50 (leave blank for auto-detection)"
              />
              <p className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                Local IP of the Slave device on the local network (do not use P2P). Leave empty to use auto-detection or company slave device.
              </p>
            </div>
          )}

          {selType === "FarLink Edge" && (
            <>
              <div className="field">
                <label>iPerf3 Test Duration (seconds)</label>
                <input
                  name="iperf_duration"
                  type="number"
                  className="input mono"
                  defaultValue={config.iperf_duration ?? 10}
                />
              </div>
              <div className="field">
                <label>iPerf3 Parallel Streams</label>
                <input
                  name="iperf_streams"
                  type="number"
                  className="input mono"
                  defaultValue={config.iperf_streams ?? 1}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="form-grid">
        <div className="field">
          <label>Gateway IP</label>
          <input name="gatewayIp" className="input mono" defaultValue={gatewayIp ?? "192.168.1.1"} />
        </div>
        <div className="field">
          <label>Speedtest Server ID (Optional)</label>
          <input name="speedServer" className="input mono" defaultValue={config.speedServer ?? ""} placeholder="Default (closest auto-select)" />
        </div>
        <div className="field">
          <label>MTR Target</label>
          <input name="mtrTarget" className="input mono" defaultValue={config.mtrTarget ?? "8.8.8.8"} />
        </div>
        <div className="field">
          <label>DIG Domain</label>
          <input name="digTarget" className="input mono" defaultValue={config.digTarget ?? "google.com"} />
        </div>
        <div className="field">
          <label>CURL URL Target</label>
          <input name="curlTarget" className="input mono" defaultValue={config.curlTarget ?? "https://example.com"} />
        </div>
        <div className="field">
          <label>TCP Host:Port</label>
          <input name="tcp_portTarget" className="input mono" defaultValue={config.tcp_portTarget ?? "1.1.1.1:443"} />
        </div>
        <div className="field">
          <label>Heartbeat Interval (seconds)</label>
          <input name="heartbeatSeconds" className="input mono" defaultValue={config.heartbeatSeconds ?? config.heartbeat_interval ?? "60"} />
        </div>
      </div>

      <div>
        <button className="btn btn-primary" disabled={pending}>
          <Save size={15} /> Save & Push to Device
        </button>
      </div>

      {confirm && (
        <Modal title="Push Configuration?" onClose={() => setConfirm(null)}>
          <p style={{ marginBottom: 18 }}>
            Configuration profile <strong>{confirm.type} ({confirm.mode})</strong> will be pushed remotely (SYNC_CONFIG) and applied to the agent. Proceed?
          </p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await saveConfig(deviceId, confirm);
                  toast(r.message ?? r.error ?? "");
                  setConfirm(null);
                })
              }
            >
              Push
            </button>
          </div>
        </Modal>
      )}
      {toastEl}
    </form>
  );
}
