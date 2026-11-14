import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui";
import { fmtDateTime, TEST_LABEL, resultSummary } from "@/lib/constants";
import { getDeviceRole } from "@/lib/device-utils";

export default async function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await prisma.testResult.findUnique({
    where: { id },
    include: { device: { select: { id: true, name: true, type: true, config: true, companyId: true } } },
  });
  if (!r) notFound();

  const roleInfo = getDeviceRole(r.device);
  let resolvedTarget = r.target;
  if (roleInfo.edgeMode === "Slave") {
    const lower = (r.target || "").trim().toLowerCase();
    if (!r.target || lower === "speedtest.net" || lower === "speedtest server" || r.testType === "SPEED" || r.testType === "IPERF") {
      const masterDev = await prisma.device.findFirst({
        where: {
          id: { not: r.device.id },
          OR: [
            { config: { contains: '"mode":"Master"' } },
            { config: { contains: '"mode": "Master"' } },
            { name: { contains: "Master" } },
          ],
        },
        select: { ipAddress: true },
        orderBy: { createdAt: "asc" },
      });
      let cfg: Record<string, any> = {};
      try {
        cfg = JSON.parse(r.device.config || "{}");
      } catch {}
      resolvedTarget = masterDev?.ipAddress || cfg.master_ip || cfg.masterIp || cfg.systemInfo?.masterIp || "192.168.2.38";
    }
  }

  const rd = (() => { try { return JSON.parse(r.resultData) as Record<string, unknown>; } catch { return {}; } })();

  return (
    <>
      <div className="page-head">
        <div>
          <p className="dim" style={{ marginBottom: 4 }}>
            <Link href="/history">Test History</Link> / {r.id.slice(0, 8)}…
          </p>
          <h1>Test Detail</h1>
        </div>
        <Link href={`/devices/${r.device.id}`} className="btn">← {r.device.name}</Link>
      </div>

      <div className="grid g-2" style={{ maxWidth: 900 }}>
        <div className="card">
          <div className="card-head"><h2>Result</h2></div>
          <div className="card-body">
            <dl className="kv">
              <dt>Device</dt><dd><Link href={`/devices/${r.device.id}`}>{r.device.name}</Link></dd>
              <dt>Test type</dt><dd>{TEST_LABEL[r.testType] ?? r.testType}</dd>
              <dt>Trigger</dt><dd><Badge value={r.triggerType} dot={false} /></dd>
              <dt>Status</dt><dd><Badge value={r.status} /></dd>
              {resolvedTarget && <><dt>Target</dt><dd className="mono">{resolvedTarget}</dd></>}
              {r.download != null && <><dt>Download</dt><dd className="mono">{r.download} Mbps</dd></>}
              {r.upload != null && <><dt>Upload</dt><dd className="mono">{r.upload} Mbps</dd></>}
              {r.latency != null && <><dt>Latency</dt><dd className="mono">{r.latency} ms</dd></>}
              {r.jitter != null && <><dt>Jitter</dt><dd className="mono">{r.jitter} ms</dd></>}
              {r.packetLoss != null && <><dt>Packet Loss</dt><dd className="mono">{r.packetLoss}%</dd></>}
              <dt>Summary</dt><dd className="mono">{resultSummary(r)}</dd>
              <dt>Started</dt><dd className="mono">{fmtDateTime(r.startedAt)}</dd>
              <dt>Completed</dt><dd className="mono">{fmtDateTime(r.completedAt)}</dd>
              <dt>Duration</dt><dd className="mono">{r.duration ?? "—"} s</dd>
            </dl>
            {r.status === "FAILED" && r.errorMessage && (
              <div className="alert alert-error" style={{ marginTop: 14 }}><strong>Error:</strong> {r.errorMessage}</div>
            )}
          </div>
        </div>

        {Object.keys(rd).length > 0 && (
          <div className="card">
            <div className="card-head"><h2>Raw result data</h2></div>
            <div className="card-body">
              <pre className="mono" style={{ fontSize: 12.5, whiteSpace: "pre-wrap", color: "var(--muted)" }}>
                {JSON.stringify(rd, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
