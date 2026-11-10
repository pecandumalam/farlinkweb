import Link from "next/link";
import { Badge } from "./ui";
import { TEST_LABEL, fmtDateTime, resultSummary } from "@/lib/constants";

type Row = {
  id: string;
  testType: string;
  triggerType: string;
  status: string;
  startedAt: Date;
  download: number | null;
  upload: number | null;
  latency: number | null;
  errorMessage: string | null;
  device?: { id: string; name: string };
};

export function HistoryTable({ rows, showDevice }: { rows: Row[]; showDevice?: boolean }) {
  if (!rows.length) return <div className="empty">No test results recorded yet</div>;
  return (
    <div className="table-wrap">
      <table className="table compact">
        <thead>
          <tr>
            <th>Time</th>
            {showDevice && <th>Device</th>}
            <th>Trigger</th>
            <th>Type</th>
            <th>Result</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="mono">{fmtDateTime(r.startedAt)}</td>
              {showDevice && <td><Link href={`/devices/${r.device?.id}`}>{r.device?.name}</Link></td>}
              <td><Badge value={r.triggerType} dot={false} /></td>
              <td>{TEST_LABEL[r.testType] ?? r.testType}</td>
              <td className="mono" style={{ color: r.status === "FAILED" ? "var(--danger)" : undefined }} title={r.errorMessage ?? ""}>
                {r.status === "FAILED" ? r.errorMessage ?? "FAILED" : resultSummary(r)}
              </td>
              <td><Badge value={r.status} /></td>
              <td><Link className="btn btn-ghost btn-sm" href={`/history/${r.id}`}>Detail</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
