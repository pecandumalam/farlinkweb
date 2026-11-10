import { NextResponse } from "next/server";
import { withDevice } from "@/lib/agent";

/** GET /api/agent/config — konfigurasi & parameter kerja untuk farlink_agent */
export async function GET(req: Request) {
  return withDevice(req, async (d) => {
    let parsed: Record<string, any> = {};
    try {
      parsed = JSON.parse(d.config || "{}");
    } catch {
      parsed = {};
    }

    const version = Number(parsed.version || 1);
    const heartbeatInterval = Number(parsed.heartbeatSeconds || parsed.heartbeat_interval || 60);

    const merged = {
      version,
      deviceId: d.id,
      name: d.name,
      type: d.type === "FARLINK_EDGE" ? "FarLink Edge" : "FarLink Go",
      mode: parsed.mode || (d.type === "FARLINK_EDGE" ? "Slave" : "Standalone"),
      master_ip: parsed.master_ip || parsed.masterIp || d.gatewayIp || null,
      heartbeat_interval: heartbeatInterval,
      sync_interval: Number(parsed.sync_interval || 60),
      iperf_duration: Number(parsed.iperf_duration || 10),
      iperf_streams: Number(parsed.iperf_streams || 1),
      test_mode: parsed.test_mode || "standalone",
      speed_server: parsed.speedServer || null,
      mtr_target: parsed.mtrTarget || "8.8.8.8",
      dig_target: parsed.digTarget || "google.com",
      curl_target: parsed.curlTarget || "https://example.com",
      tcp_port_target: parsed.tcp_portTarget || "1.1.1.1:443",
      schedule: {
        enabled: d.scheduleEnabled,
        intervalMinutes: d.scheduleInterval,
      },
      gatewayIp: d.gatewayIp,
      ...parsed,
    };

    return NextResponse.json(merged);
  });
}
