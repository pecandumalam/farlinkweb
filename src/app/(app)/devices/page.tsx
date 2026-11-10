import Link from "next/link";
import { prisma } from "@/lib/db";
import { deviceStatus, relTime } from "@/lib/constants";
import { AutoRefresh, Badge } from "@/components/ui";
import { ConnectedDevicesBanner } from "@/components/ConnectedDevicesBanner";
import { Terminal as TerminalIcon, Pencil } from "lucide-react";
import { DeviceTypeBadge } from "@/components/DeviceTypeBadge";
import { DeviceButton } from "@/components/Forms";
import { CheckConnectionButton } from "@/components/CheckConnectionButton";
import { TestMasterModalButton } from "@/components/MasterConnectionTest";
import { getDeviceRole } from "@/lib/device-utils";

import { requireSession } from "@/lib/auth";

export const metadata = { title: "Devices" };

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; role?: string }>;
}) {
  const { q = "", status = "", role = "" } = await searchParams;
  const s = await requireSession();
  const isAdmin = s.role === "ADMIN";
  const companyScope = !isAdmin && s.companyId ? { companyId: s.companyId } : undefined;

  const [devices, companies, discoveredDevices] = await Promise.all([
    prisma.device.findMany({
      where: {
        ...companyScope,
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { serialNumber: { contains: q } },
                { ipAddress: { contains: q } },
              ],
            }
          : {}),
      },
      include: { company: true, testResults: { orderBy: { startedAt: "desc" }, take: 1 } },
      orderBy: { name: "asc" },
    }),
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.discoveredDevice.findMany({
      where: { isRegistered: false },
      orderBy: { lastSeenAt: "desc" },
    }),
  ]);

  const registeredSns = new Set(devices.map((d) => d.serialNumber));
  const pendingDiscovered = discoveredDevices.filter((d) => !registeredSns.has(d.serialNumber));
  
  const allRows = devices.map((d) => {
    const roleInfo = getDeviceRole(d);
    return {
      ...d,
      st: deviceStatus(d),
      roleInfo,
    };
  });

  const rows = allRows
    .filter((d) => !status || d.st === status)
    .filter((d) => {
      if (!role) return true;
      if (role === "MASTER") return d.roleInfo.edgeMode === "Master";
      if (role === "STANDALONE") return d.roleInfo.edgeMode === "Standalone";
      if (role === "SLAVE") return d.roleInfo.edgeMode === "Slave";
      if (role === "GO") return !d.roleInfo.isEdge;
      return true;
    });

  const masterCount = allRows.filter((d) => d.roleInfo.edgeMode === "Master").length;
  const standaloneCount = allRows.filter((d) => d.roleInfo.edgeMode === "Standalone").length;
  const slaveCount = allRows.filter((d) => d.roleInfo.edgeMode === "Slave").length;
  const goCount = allRows.filter((d) => !d.roleInfo.isEdge).length;

  return (
    <>
      <AutoRefresh seconds={20} />
      <div className="page-head">
        <div>
          <h1>Devices</h1>
          <p>
            {allRows.length} registered · {masterCount} Edge Master · {standaloneCount} Stand Alone · {slaveCount} Edge Slave · {goCount} FarLink Go
          </p>
        </div>
      </div>

      {isAdmin && (
        <ConnectedDevicesBanner
          companies={companies}
          discovered={pendingDiscovered}
          isAdmin={isAdmin}
        />
      )}
      <div className="card">
        <div className="card-head">
          <form className="row" style={{ flex: 1, flexWrap: "wrap", gap: 10 }}>
            <input
              name="q"
              defaultValue={q}
              className="input"
              placeholder="Search name, serial, IP…"
              style={{ maxWidth: 260 }}
            />
            <select name="status" defaultValue={status} className="select" style={{ maxWidth: 140 }}>
              <option value="">All status</option>
              <option value="ONLINE">Online</option>
              <option value="WARNING">Warning</option>
              <option value="OFFLINE">Offline</option>
            </select>
            <select name="role" defaultValue={role} className="select" style={{ maxWidth: 190 }}>
              <option value="">All Types & Roles</option>
              <option value="MASTER">Edge · Master Hub</option>
              <option value="STANDALONE">Edge · Stand Alone</option>
              <option value="SLAVE">Edge · Slave Probe</option>
              <option value="GO">FarLink Go</option>
            </select>
            <button className="btn">Filter</button>
          </form>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Company</th>
                <th>Type / Role</th>
                <th>IP Address</th>
                <th>Gateway</th>
                <th>Latest Test</th>
                <th>Last Seen</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const r = d.testResults[0];
                const isSlave = d.roleInfo.edgeMode === "Slave";

                return (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/devices/${d.id}`} style={{ fontWeight: 600 }}>
                        {d.name}
                      </Link>
                      <div className="dim mono" style={{ fontSize: 11 }}>
                        {d.serialNumber}
                      </div>
                    </td>
                    <td>{d.company?.name ?? <span className="dim">Unassigned</span>}</td>
                    <td>
                      <DeviceTypeBadge device={d} />
                    </td>
                    <td className="mono">{d.ipAddress ?? "—"}</td>
                    <td>
                      <Badge value={d.gatewayStatus} dot={false} />
                    </td>
                    <td className="mono">
                      {r ? (
                        r.status === "FAILED" ? (
                          <span style={{ color: "var(--danger)" }}>FAILED</span>
                        ) : r.download != null ? (
                          `${r.download.toFixed(0)}/${r.upload?.toFixed(0)} Mbps`
                        ) : (
                          "OK"
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{relTime(d.lastSeenAt)}</td>
                    <td>
                      <Badge value={d.st} />
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <CheckConnectionButton
                          deviceId={d.id}
                          deviceName={d.name}
                          label="Ping"
                          className="btn btn-ghost btn-sm"
                        />
                        <DeviceButton
                          companies={companies}
                          device={d}
                          buttonClass="btn btn-ghost btn-sm"
                          label="Edit"
                          buttonIcon={<Pencil size={13} />}
                        />
                        {isSlave && (
                          <TestMasterModalButton
                            device={d}
                            buttonLabel="Test Master"
                            className="btn btn-ghost btn-sm"
                          />
                        )}
                        <Link
                          href={`/devices/${d.id}?tab=ssh`}
                          className="btn btn-ghost btn-sm"
                          title="Open remote SSH Console"
                        >
                          <TerminalIcon size={14} /> SSH
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <div className="empty">No devices found</div>}
        </div>
      </div>
    </>
  );
}
