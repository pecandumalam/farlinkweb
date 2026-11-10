"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { saveCompany, saveDevice } from "@/lib/actions";

type Company = { id: string; name: string; contact?: string | null; address?: string | null };

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="card-body">{children}</div>
      </div>
    </div>
  );
}

export function CompanyButton({ company, label }: { company?: Company; label?: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveCompany, null);
  useEffect(() => { if (state?.ok) setOpen(false); }, [state]);
  return (
    <>
      <button id={company ? "edit-company" : "add-company"} className={company ? "btn btn-sm" : "btn btn-primary"} onClick={() => setOpen(true)}>
        {!company && <Plus size={16} />} {label ?? (company ? "Edit" : "Add Company")}
      </button>
      {open && (
        <Modal title={company ? "Edit Company" : "New Company"} onClose={() => setOpen(false)}>
          <form action={action} className="stack">
            {state?.error && <div className="alert alert-error">{state.error}</div>}
            {company && <input type="hidden" name="id" value={company.id} />}
            <div className="field"><label>Company name</label><input name="name" className="input" required defaultValue={company?.name} /></div>
            <div className="field"><label>Contact</label><input name="contact" className="input" defaultValue={company?.contact ?? ""} /></div>
            <div className="field"><label>Address</label><input name="address" className="input" defaultValue={company?.address ?? ""} /></div>
            <button className="btn btn-primary" disabled={pending}>Save</button>
          </form>
        </Modal>
      )}
    </>
  );
}

type Device = {
  id: string;
  name: string;
  serialNumber: string;
  type: string;
  companyId: string | null;
  ipAddress?: string | null;
  gatewayIp: string | null;
  config?: string | null | Record<string, any>;
};

export function DeviceButton({
  companies,
  device,
  defaultCompany,
  fixedSerialNumber,
  prefillIp,
  prefillType,
  label,
  buttonClass,
  buttonIcon,
}: {
  companies: Company[];
  device?: Device;
  defaultCompany?: string;
  fixedSerialNumber?: string;
  prefillIp?: string;
  prefillType?: string;
  label?: React.ReactNode;
  buttonClass?: string;
  buttonIcon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(saveDevice, null);
  useEffect(() => { if (state?.ok && !state.token) setOpen(false); }, [state]);

  const activeSn = fixedSerialNumber || device?.serialNumber || "";
  const isSnLocked = !!fixedSerialNumber || !!device;

  const defaultName = device?.name ?? (fixedSerialNumber ? `FarLink-${fixedSerialNumber.replace(/^RPI-/, "").slice(0, 8)}` : "");

  const getInitialMode = () => {
    if (device?.config) {
      try {
        const cfg = typeof device.config === "string" ? JSON.parse(device.config) : device.config;
        if (cfg.mode || cfg.device_mode) return cfg.mode || cfg.device_mode;
      } catch {}
    }
    return device?.type === "FARLINK_EDGE" ? "Master" : "Standalone";
  };

  const getInitialType = () => {
    if (prefillType) return prefillType;
    if (device?.type) return device.type;
    if (device?.config) {
      try {
        const cfg = typeof device.config === "string" ? JSON.parse(device.config) : device.config;
        if (String(cfg.type || cfg.device_type || "").toUpperCase().includes("EDGE")) {
          return "FARLINK_EDGE";
        }
      } catch {}
    }
    return "FARLINK_GO";
  };

  const [devType, setDevType] = useState<string>(getInitialType());
  const [devMode, setDevMode] = useState<string>(getInitialMode());

  useEffect(() => {
    if (open) {
      setDevType(getInitialType());
      setDevMode(getInitialMode());
    }
  }, [open, device, prefillType]);

  return (
    <>
      <button
        id={device ? "edit-device" : fixedSerialNumber ? `register-${fixedSerialNumber}` : "add-device"}
        className={buttonClass ?? (device ? "btn btn-sm" : "btn btn-primary")}
        onClick={() => setOpen(true)}
      >
        {buttonIcon !== undefined ? buttonIcon : (!device && <Plus size={16} />)}{" "}
        {label ?? (device ? "Edit" : fixedSerialNumber ? `Register Device (${fixedSerialNumber})` : "Add Device")}
      </button>
      {open && (
        <Modal
          title={device ? "Edit Device" : fixedSerialNumber ? "Register Connected Device" : "Register Device"}
          onClose={() => setOpen(false)}
        >
          {state?.token ? (
            <div className="stack">
              <div className="alert alert-ok">{state.message}</div>
              <div className="field"><label>Device token</label><input className="input mono" readOnly value={state.token} onFocus={(e) => e.target.select()} /></div>
              <p className="muted" style={{ fontSize: 12.5 }}>The device is now registered and authenticated with FarLink Cloud.</p>
              <button className="btn btn-primary" onClick={() => setOpen(false)}>Done</button>
            </div>
          ) : (
            <form action={action} className="stack">
              {state?.error && <div className="alert alert-error">{state.error}</div>}
              {device && <input type="hidden" name="id" value={device.id} />}
              <div className="form-grid">
                <div className="field">
                  <label>Device Name</label>
                  <input name="name" className="input" required defaultValue={defaultName} placeholder="e.g. FarLink-001" />
                </div>
                <div className="field">
                  <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Serial Number</span>
                    {isSnLocked && (
                      <span className="badge b-online mono" style={{ fontSize: 10, padding: "2px 6px" }}>
                        Hardware Locked
                      </span>
                    )}
                  </label>
                  <input
                    name="serialNumber"
                    className="input mono"
                    required
                    readOnly={isSnLocked}
                    defaultValue={activeSn}
                    style={isSnLocked ? { background: "rgba(255,255,255,0.05)", cursor: "not-allowed" } : undefined}
                  />
                </div>
                <div className="field">
                  <label>Device Model / Type</label>
                  <select
                    name="type"
                    className="select"
                    value={devType}
                    onChange={(e) => {
                      const newType = e.target.value;
                      setDevType(newType);
                      if (newType === "FARLINK_EDGE" && devMode === "Standalone") {
                        setDevMode("Master");
                      }
                    }}
                  >
                    <option value="FARLINK_EDGE">FarLink Edge (Dual-Engine / Headless)</option>
                    <option value="FARLINK_GO">FarLink Go (Portable Network Probe)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Operating Mode (Stand Alone / Master)</label>
                  <select
                    name="mode"
                    className="select"
                    value={devMode}
                    onChange={(e) => setDevMode(e.target.value)}
                  >
                    <option value="Standalone">Stand Alone (Independent / Single Node)</option>
                    <option value="Master">Master (Central Hub)</option>
                    {devType === "FARLINK_EDGE" && (
                      <option value="Slave">Slave (Point-to-Point Probes to Master)</option>
                    )}
                  </select>
                  {devMode === "Standalone" && (
                    <p className="dim" style={{ fontSize: 11.5, color: "#38bdf8", marginTop: 4 }}>
                      Stand Alone: Beroperasi mandiri tanpa perlu link dedicated Master-Slave.
                    </p>
                  )}
                  {devMode === "Slave" && (
                    <p className="dim" style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 4 }}>
                      Slave: Terhubung ke Master via kabel USB-Ethernet dedicated point-to-point.
                    </p>
                  )}
                </div>
                <div className="field">
                  <label>Assign to Customer Company</label>
                  <select name="companyId" className="select" defaultValue={device?.companyId ?? defaultCompany ?? ""}>
                    <option value="">— Unassigned —</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>IP Address</label>
                  <input
                    name="ipAddress"
                    className="input mono"
                    defaultValue={device?.ipAddress ?? prefillIp ?? ""}
                    placeholder="192.168.1.8"
                  />
                </div>
                <div className="field">
                  <label>Gateway IP</label>
                  <input
                    name="gatewayIp"
                    className="input mono"
                    defaultValue={device?.gatewayIp ?? (prefillIp ? prefillIp.replace(/\.\d+$/, ".1") : "")}
                    placeholder="192.168.1.1"
                  />
                </div>
              </div>
              <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={pending}>
                  {fixedSerialNumber ? "Register & Activate Device" : "Save"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
