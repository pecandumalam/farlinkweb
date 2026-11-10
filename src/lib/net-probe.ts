import net from "net";
import { execFile } from "child_process";
import os from "os";

export function probeHostPort(host: string, port: number, timeoutMs = 2000): Promise<{ reachable: boolean; latencyMs: number }> {
  return new Promise((resolve) => {
    const start = performance.now();
    const socket = new net.Socket();
    let settled = false;

    const finish = (reachable: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      const elapsed = Math.max(1, Math.round(performance.now() - start));
      resolve({ reachable, latencyMs: elapsed });
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", (err: any) => {
      // ECONNREFUSED means the target machine is UP and returned a TCP RST packet
      if (err && err.code === "ECONNREFUSED") {
        finish(true);
      } else {
        finish(false);
      }
    });

    try {
      socket.connect(port, host);
    } catch {
      finish(false);
    }
  });
}

export function pingHost(host: string, timeoutMs = 2000): Promise<{ reachable: boolean; latencyMs: number }> {
  return new Promise((resolve) => {
    const start = performance.now();
    const isWin = os.platform() === "win32";
    const cmd = "ping";
    const args = isWin ? ["-n", "1", "-w", String(timeoutMs), host] : ["-c", "1", "-W", "2", host];

    execFile(cmd, args, { timeout: timeoutMs + 1000 }, (err, stdout) => {
      const elapsed = Math.max(1, Math.round(performance.now() - start));
      if (err) {
        return resolve({ reachable: false, latencyMs: elapsed });
      }
      const out = (stdout || "").toLowerCase();
      const isOk =
        (isWin && (out.includes("bytes=") || out.includes("reply from"))) ||
        (!isWin && (out.includes("1 received") || out.includes("1 packets received") || out.includes("0% packet loss")));
      resolve({ reachable: isOk, latencyMs: elapsed });
    });
  });
}
