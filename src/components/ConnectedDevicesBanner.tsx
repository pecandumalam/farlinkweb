"use client";

import { Cpu, Plus } from "lucide-react";
import { DeviceButton } from "./Forms";
import { useToast } from "./ui";

type Company = { id: string; name: string };

export type DiscoveredDevice = {
  id: string;
  serialNumber: string;
  macAddress?: string | null;
  ipAddress?: string | null;
  deviceType: string;
  agentVersion?: string | null;
  lastSeenAt: Date | string;
};

export function ConnectedDevicesBanner({
  companies,
  discovered = [],
  isAdmin: _isAdmin = true,
}: {
  companies: Company[];
  discovered: DiscoveredDevice[];
  isAdmin?: boolean;
}) {
  const { toastEl } = useToast();

  if (!discovered.length) return null;

  return (
    <div
      className="card card-pad fade-in"
      style={{
        background: "linear-gradient(135deg, rgba(30, 58, 138, 0.15) 0%, rgba(15, 23, 42, 0.7) 100%)",
        border: "1px solid rgba(59, 130, 246, 0.4)",
        boxShadow: "0 0 20px rgba(59, 130, 246, 0.12)",
        marginBottom: 20,
      }}
    >
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--info)", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            <span className="dot" style={{ background: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
            <span>Connected Probes Awaiting Registration</span>
          </div>
          <h3 style={{ margin: "4px 0 2px 0", fontSize: 16 }}>
            {discovered.length} New Raspberry Pi Device{discovered.length > 1 ? "s" : ""} Connected
          </h3>
          <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>
            Devices automatically announce their unique hardware serial numbers upon connection. Click “Register Device” to assign them to a customer company.
          </p>
        </div>
      </div>

      <div className="stack" style={{ gap: 10 }}>
        {discovered.map((d) => (
          <div
            key={d.id}
            className="card"
            style={{
              padding: "12px 16px",
              background: "rgba(15, 23, 42, 0.8)",
              border: "1px solid var(--border-2)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div className="row" style={{ gap: 12 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: "rgba(59, 130, 246, 0.15)",
                  color: "var(--primary)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <Cpu size={20} />
              </div>
              <div>
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <span className="mono" style={{ fontWeight: 700, fontSize: 15, color: "#f8fafc" }}>
                    {d.serialNumber}
                  </span>
                  <span className="badge b-online" style={{ fontSize: 10 }}>
                    Connected
                  </span>
                  <span className="badge b-unknown" style={{ fontSize: 10 }}>
                    {d.deviceType === "FARLINK_EDGE" ? "FarLink Edge" : "FarLink Go"}
                  </span>
                </div>
                <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
                  IP: <span className="mono">{d.ipAddress || "DHCP Assigned"}</span>
                  {d.macAddress ? ` · MAC: ${d.macAddress}` : ""}
                  {d.agentVersion ? ` · Agent v${d.agentVersion}` : ""}
                </div>
              </div>
            </div>

            <div>
              <DeviceButton
                companies={companies}
                fixedSerialNumber={d.serialNumber}
                prefillIp={d.ipAddress || undefined}
                prefillType={d.deviceType}
                label="Register Device"
                buttonClass="btn btn-primary"
                buttonIcon={<Plus size={15} />}
              />
            </div>
          </div>
        ))}
      </div>
      {toastEl}
    </div>
  );
}
