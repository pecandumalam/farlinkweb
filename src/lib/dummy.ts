import type { PrismaClient } from "@prisma/client";

const ERRORS = ["Connection timeout", "DNS resolution failed", "Network unreachable", "Server not responding"];

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export function fakeResult(testType: string, ok: boolean, masterTargetIp?: string | null) {
  const base = { download: null as number | null, upload: null as number | null, latency: null as number | null, jitter: null as number | null, packetLoss: null as number | null, target: null as string | null, resultData: {} as Record<string, unknown> };
  if (!ok) return base;
  switch (testType) {
    case "SPEED":
    case "IPERF":
      return { ...base, download: +rand(70, 100).toFixed(2), upload: +rand(15, 25).toFixed(2), latency: +rand(8, 25).toFixed(1), jitter: +rand(0.5, 4).toFixed(2), packetLoss: 0.0, target: masterTargetIp || "speedtest.net" };
    case "MTR":
      return { ...base, latency: +rand(10, 40).toFixed(1), packetLoss: 0.0, target: "8.8.8.8", resultData: { hops: Math.round(rand(6, 14)) } };
    case "DIG":
      return { ...base, latency: +rand(5, 60).toFixed(1), target: "google.com", resultData: { answer: "142.250.4.100" } };
    case "CURL":
      return { ...base, latency: +rand(80, 300).toFixed(0), target: "https://example.com", resultData: { httpCode: 200 } };
    case "TCP_PORT":
      return { ...base, latency: +rand(2, 30).toFixed(1), target: masterTargetIp ? `${masterTargetIp}:5201` : "1.1.1.1:443", resultData: { open: true } };
  }
  return base;
}

export async function generateDummy(
  prisma: PrismaClient,
  opts: { companyName: string; devices: number; testType: string; intervalMin: number; hours: number; failRate: number },
) {
  const company = await prisma.company.upsert({
    where: { name: opts.companyName },
    update: {},
    create: { name: opts.companyName, contact: "demo@farlink.local", address: "Jakarta" },
  });

  const existingMaster = await prisma.device.findFirst({
    where: {
      OR: [
        { config: { contains: '"mode":"Master"' } },
        { config: { contains: '"mode": "Master"' } },
        { name: { contains: "Master" } },
      ],
    },
    select: { ipAddress: true },
    orderBy: { createdAt: "asc" },
  });
  const masterIpForSlave = existingMaster?.ipAddress || "192.168.2.38";

  const devices = [];
  for (let i = 1; i <= opts.devices; i++) {
    const n = String(i).padStart(3, "0");
    const isEdgeSlave = i % 2 === 0;
    const d = await prisma.device.upsert({
      where: { serialNumber: `DEMO-${n}` },
      update: { lastSeenAt: new Date(), companyId: company.id },
      create: {
        name: `FarLink Demo ${n}`,
        serialNumber: `DEMO-${n}`,
        type: isEdgeSlave ? "FARLINK_EDGE" : "FARLINK_GO",
        companyId: company.id,
        ipAddress: `192.168.1.${20 + i}`,
        macAddress: `DC:A6:32:00:00:${n.slice(1)}`,
        firmwareVersion: "1.2.0",
        agentVersion: "1.0.3",
        gatewayIp: "192.168.1.1",
        gatewayStatus: i === 4 ? "UNREACHABLE" : "REACHABLE",
        gatewayLatency: +rand(0.8, 2.5).toFixed(2),
        gatewayCheckedAt: new Date(),
        internetStatus: "CONNECTED",
        lastSeenAt: i === 5 ? new Date(Date.now() - 3600_000) : new Date(),
        scheduleEnabled: true,
        scheduleInterval: opts.intervalMin,
        config: JSON.stringify(
          isEdgeSlave
            ? { type: "FarLink Edge", mode: "Slave", master_ip: masterIpForSlave }
            : { type: "FarLink Go", mode: "Standalone" }
        ),
        isDemo: true,
      },
    });
    devices.push(d);
  }

  const now = Date.now();
  const step = opts.intervalMin * 60_000;
  const count = Math.floor((opts.hours * 60) / opts.intervalMin);
  const rows = [];
  for (const d of devices) {
    const isSlaveDevice = d.type === "FARLINK_EDGE";
    for (let k = count; k >= 0; k--) {
      const t = new Date(now - k * step);
      const r = Math.random();
      const trigger = r < 0.08 ? "MANUAL" : r < 0.16 ? "REMOTE" : "SCHEDULED";
      const ok = Math.random() > opts.failRate;
      const f = fakeResult(opts.testType, ok, isSlaveDevice ? masterIpForSlave : null);
      const dur = +rand(1, opts.testType === "SPEED" ? 25 : 3).toFixed(1);
      rows.push({
        deviceId: d.id,
        testType: opts.testType,
        triggerType: trigger,
        status: ok ? "SUCCESS" : "FAILED",
        target: isSlaveDevice ? masterIpForSlave : f.target,
        download: f.download,
        upload: f.upload,
        latency: f.latency,
        jitter: f.jitter,
        packetLoss: f.packetLoss,
        resultData: JSON.stringify(f.resultData),
        errorMessage: ok ? null : ERRORS[Math.floor(Math.random() * ERRORS.length)],
        startedAt: t,
        completedAt: new Date(t.getTime() + dur * 1000),
        duration: dur,
      });
    }
  }
  for (let i = 0; i < rows.length; i += 500) {
    await prisma.testResult.createMany({ data: rows.slice(i, i + 500) });
  }
  return { company: company.name, devices: devices.length, results: rows.length };
}
