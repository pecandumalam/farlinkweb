"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";

export type Point = { t: number; download: number | null; upload: number | null; latency: number | null; trigger: string; status: string };

const TRIG = ["MANUAL", "REMOTE", "SCHEDULED"] as const;
const RANGES = [
  { h: 6, l: "6H" },
  { h: 24, l: "24H" },
  { h: 48, l: "48H" },
  { h: 168, l: "7D" },
];

export function CombinedChart({ data, height = 300, metric = "speed" }: { data: Point[]; height?: number; metric?: "speed" | "latency" }) {
  const [trig, setTrig] = useState<Record<string, boolean>>({ MANUAL: true, REMOTE: true, SCHEDULED: true });
  const [range, setRange] = useState(24);

  const rows = useMemo(() => {
    const min = Date.now() - range * 3600_000;
    return data
      .filter((p) => p.t >= min && trig[p.trigger] && p.status === "SUCCESS")
      .sort((a, b) => a.t - b.t);
  }, [data, trig, range]);

  const fmt = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const fmtFull = (t: number) => new Date(t).toLocaleString("en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}>
        <div className="seg">
          <button className={TRIG.every((k) => trig[k]) ? "on" : ""} onClick={() => setTrig({ MANUAL: true, REMOTE: true, SCHEDULED: true })}>All</button>
        </div>
        {TRIG.map((k) => (
          <label key={k} className="check" style={{ fontSize: 12.5 }}>
            <input id={`filter-${k.toLowerCase()}`} type="checkbox" checked={trig[k]} onChange={(e) => setTrig({ ...trig, [k]: e.target.checked })} />
            {k[0] + k.slice(1).toLowerCase()}
          </label>
        ))}
        <div className="spacer" />
        <div className="seg">
          {RANGES.map((r) => (
            <button key={r.h} className={range === r.h ? "on" : ""} onClick={() => setRange(r.h)}>{r.l}</button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty" style={{ height }}>No data available for this filter</div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={rows} margin={{ left: -12, right: 8, top: 4 }}>
            <defs>
              <linearGradient id="gd" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gu" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={fmt} stroke="var(--dim)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--dim)" fontSize={11} tickLine={false} axisLine={false} unit={metric === "speed" ? "" : "ms"} />
            <Tooltip
              contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 8, fontSize: 12 }}
              labelFormatter={(t) => fmtFull(Number(t))}
              formatter={(v, n, p) => [`${v} ${metric === "speed" ? "Mbps" : "ms"}`, `${n} · ${(p.payload as Point).trigger}`]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {metric === "speed" ? (
              <>
                <Area type="monotone" dataKey="download" name="Download" stroke="#3b82f6" strokeWidth={2} fill="url(#gd)" dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="upload" name="Upload" stroke="#22c55e" strokeWidth={2} fill="url(#gu)" dot={false} activeDot={{ r: 4 }} />
              </>
            ) : (
              <Area type="monotone" dataKey="latency" name="Latency" stroke="#f59e0b" strokeWidth={2} fill="url(#gd)" dot={false} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
