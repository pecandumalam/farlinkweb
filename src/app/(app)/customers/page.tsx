import Link from "next/link";
import { Building2, Router, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { deviceStatus, relTime } from "@/lib/constants";
import { Badge } from "@/components/ui";
import { CompanyButton } from "@/components/Forms";
import { ConnectedDevicesBanner } from "@/components/ConnectedDevicesBanner";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Customers" };

export default async function CustomersPage() {
  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";

  if (!isAdmin && session.companyId) {
    redirect(`/customers/${session.companyId}`);
  }

  const [companies, unassigned, registeredDevices, discoveredDevices] = await Promise.all([
    prisma.company.findMany({ include: { devices: { orderBy: { name: "asc" } } }, orderBy: { name: "asc" } }),
    prisma.device.findMany({ where: { companyId: null } }),
    prisma.device.findMany({ select: { serialNumber: true } }),
    prisma.discoveredDevice.findMany({
      where: { isRegistered: false },
      orderBy: { lastSeenAt: "desc" },
    }),
  ]);

  const list = companies.map((c) => ({ id: c.id, name: c.name }));
  const registeredSns = new Set(registeredDevices.map((d) => d.serialNumber));
  const pendingDiscovered = discoveredDevices.filter((d) => !registeredSns.has(d.serialNumber));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Customers</h1>
          <p>Devices grouped by customer company.</p>
        </div>
        {isAdmin && (
          <div className="row">
            <CompanyButton />
          </div>
        )}
      </div>

      {isAdmin && (
        <ConnectedDevicesBanner
          companies={list}
          discovered={pendingDiscovered}
          isAdmin={isAdmin}
        />
      )}

      <div className="card">
        {companies.map((c) => {
          const st = c.devices.map(deviceStatus);
          const on = st.filter((s) => s !== "OFFLINE").length;
          return (
            <div key={c.id} className="tree-company">
              <div className="tree-head">
                <div className="kpi-icon tone-primary" style={{ position: "static" }}><Building2 size={18} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <Link href={`/customers/${c.id}`} style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</Link>
                    {!c.isActive && <Badge value="INACTIVE" dot={false} />}
                  </div>
                  <div className="dim" style={{ fontSize: 12.5 }}>
                    Devices: {c.devices.length} · <span style={{ color: "var(--success)" }}>Online: {on}</span> · <span style={{ color: "var(--danger)" }}>Offline: {c.devices.length - on}</span>
                  </div>
                </div>
                <div style={{ width: 140 }} className="progress" title="Online ratio">
                  <span style={{ width: `${c.devices.length ? (on / c.devices.length) * 100 : 0}%` }} />
                </div>
                <Link href={`/customers/${c.id}`} className="btn btn-ghost btn-sm">View Devices <ChevronRight size={14} /></Link>
              </div>
              {c.devices.length > 0 && (
                <div className="tree-devices">
                  {c.devices.map((d, i) => (
                    <Link key={d.id} href={`/devices/${d.id}`} className="tree-device">
                      <Router size={15} className="dim" />
                      <span style={{ fontWeight: 500, flex: 1 }}>{d.name}</span>
                      <span className="mono dim">{d.ipAddress ?? "—"}</span>
                      <span className="dim" style={{ fontSize: 12, width: 70, textAlign: "right" }}>{relTime(d.lastSeenAt)}</span>
                      <Badge value={st[i]} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!companies.length && <div className="empty">No companies registered yet. Click “Add Company”.</div>}
      </div>

      {unassigned.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head"><h3>Unassigned devices ({unassigned.length})</h3></div>
          <div className="card-body stack" style={{ gap: 6 }}>
            {unassigned.map((d) => (
              <Link key={d.id} href={`/devices/${d.id}`} className="tree-device">
                <Router size={15} className="dim" /><span style={{ flex: 1 }}>{d.name}</span><Badge value={deviceStatus(d)} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
