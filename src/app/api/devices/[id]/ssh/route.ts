import { NextResponse } from "next/server";
import { Client } from "ssh2";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { relTime } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SshParams {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  privateKey?: string;
  command?: string;
  action?: "test" | "exec";
  mode?: "queue" | "direct";
  saveCredentials?: boolean;
}

function runDirectSshCommand(
  config: { host: string; port: number; username: string; password?: string; privateKey?: string },
  command: string,
  timeoutMs: number = 5000,
): Promise<{ stdout: string; stderr: string; code: number; latencyMs: number }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = "";
    let stderr = "";
    const start = performance.now();
    let timer: NodeJS.Timeout;

    const cleanup = () => {
      clearTimeout(timer);
      try {
        conn.end();
      } catch {}
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Direct SSH timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            cleanup();
            return reject(err);
          }
          stream
            .on("close", (code: number) => {
              const latencyMs = Math.round(performance.now() - start);
              cleanup();
              resolve({ stdout, stderr, code: code ?? 0, latencyMs });
            })
            .on("data", (data: Buffer) => {
              stdout += data.toString("utf-8");
            })
            .stderr.on("data", (data: Buffer) => {
              stderr += data.toString("utf-8");
            });
        });
      })
      .on("keyboard-interactive", (_name, _instructions, _lang, prompts, finish) => {
        if (prompts.length > 0 && config.password) {
          finish([config.password]);
        } else {
          finish([]);
        }
      })
      .on("error", (err: any) => {
        cleanup();
        reject(err);
      })
      .connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password || undefined,
        privateKey: config.privateKey || undefined,
        tryKeyboard: true,
        readyTimeout: timeoutMs,
      });
  });
}

/** GET /api/devices/[id]/ssh?commandId=... — Cek status eksekusi perintah antrean */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
    const { id } = await params;
    const url = new URL(req.url);
    const commandId = url.searchParams.get("commandId");

    if (!commandId) {
      return NextResponse.json({ error: "Missing commandId parameter" }, { status: 400 });
    }

    const cmd = await prisma.deviceCommand.findFirst({
      where: { id: commandId, deviceId: id },
    });

    if (!cmd) {
      return NextResponse.json({ error: "Command not found" }, { status: 404 });
    }

    if (cmd.status === "PENDING" || cmd.status === "SENT" || cmd.status === "RUNNING") {
      return NextResponse.json({
        ok: false,
        pending: true,
        status: cmd.status,
      });
    }

    let parsedResult: any = {};
    try {
      parsedResult = JSON.parse(cmd.result || "{}");
    } catch {
      parsedResult = { stdout: cmd.result || "" };
    }

    const latencyMs =
      parsedResult.latency_ms ??
      (cmd.completedAt && cmd.createdAt ? cmd.completedAt.getTime() - cmd.createdAt.getTime() : 0);

    return NextResponse.json({
      ok: cmd.status === "SUCCESS",
      status: cmd.status,
      stdout: parsedResult.stdout || "",
      stderr: parsedResult.stderr || cmd.errorMessage || "",
      code: parsedResult.code ?? (cmd.status === "SUCCESS" ? 0 : 1),
      latencyMs,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

/** POST /api/devices/[id]/ssh — Eksekusi perintah via Online Command Queue (FarLink Agent) */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireSession();
    const { id } = await params;
    const body: SshParams = await req.json().catch(() => ({}));

    const device = await prisma.device.findUnique({ where: { id } });
    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    let devConfig: Record<string, any> = {};
    try {
      devConfig = JSON.parse(device.config || "{}");
    } catch {}

    const savedSsh = devConfig.ssh || {};
    const host = (body.host || savedSsh.host || device.ipAddress || "").trim();
    const port = Number(body.port || savedSsh.port || 22);
    const username = (body.username || savedSsh.username || "farlink").trim();
    const password = body.password !== undefined ? body.password : (savedSsh.password || "");
    const privateKey = body.privateKey !== undefined ? body.privateKey : (savedSsh.privateKey || "");

    // Simpan kredensial jika diminta
    if (body.saveCredentials) {
      const updatedConfig = JSON.stringify({
        ...devConfig,
        ssh: {
          host,
          port,
          username,
          password: password || savedSsh.password,
          privateKey: privateKey || savedSsh.privateKey,
          savedAt: new Date().toISOString(),
        },
      });
      await prisma.device.update({
        where: { id },
        data: { config: updatedConfig },
      });
    }

    // Tentukan perintah yang akan dieksekusi
    const isTest = body.action === "test";
    const commandToRun = isTest ? "uptime && uname -a" : (body.command || "uname -a").trim();

    if (!commandToRun) {
      return NextResponse.json({ error: "SSH command cannot be empty." }, { status: 400 });
    }

    // Opsi: Jika diminta direct SSH secara eksplisit dan memiliki password
    if (body.mode === "direct" && (password || privateKey)) {
      try {
        const directRes = await runDirectSshCommand(
          { host, port, username, password, privateKey },
          commandToRun,
          4000
        );
        return NextResponse.json({
          ok: directRes.code === 0,
          action: body.action || "exec",
          command: commandToRun,
          host,
          port,
          username,
          stdout: directRes.stdout,
          stderr: directRes.stderr,
          code: directRes.code,
          latencyMs: directRes.latencyMs,
          mode: "direct",
        });
      } catch {
        // Fallback ke agent queue di bawah
      }
    }

    // ARSITEKTUR SESUAI PERMINTAAN: Simpan perintah online di database (DeviceCommand)
    // Kemudian FarLink Agent di Raspberry Pi mengambil dan mengeksekusi secara lokal
    const startTime = Date.now();
    const cmd = await prisma.deviceCommand.create({
      data: {
        deviceId: device.id,
        type: "EXEC_SHELL",
        payload: JSON.stringify({
          command: commandToRun,
          action: body.action || "exec",
          username,
          host,
        }),
        status: "PENDING",
        createdById: s.sub,
      },
    });

    // Catat ke Audit Log
    await prisma.auditLog.create({
      data: {
        userId: s.sub,
        action: "DEVICE_COMMAND_QUEUE",
        target: device.name,
        detail: JSON.stringify({
          commandId: cmd.id,
          command: commandToRun.slice(0, 150),
          action: body.action,
        }),
      },
    }).catch(() => {});

    // Tunggu eksekusi lokal dari Raspberry Pi (polling DB selama maks 12 detik)
    let finishedCmd: any = null;
    while (Date.now() - startTime < 12000) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      finishedCmd = await prisma.deviceCommand.findUnique({
        where: { id: cmd.id },
      });

      if (finishedCmd && ["SUCCESS", "FAILED", "TIMEOUT"].includes(finishedCmd.status)) {
        break;
      }
    }

    // 1. Selesai dieksekusi oleh Raspberry Pi
    if (finishedCmd && ["SUCCESS", "FAILED"].includes(finishedCmd.status)) {
      let parsedResult: any = {};
      try {
        parsedResult = JSON.parse(finishedCmd.result || "{}");
      } catch {
        parsedResult = { stdout: finishedCmd.result || "" };
      }

      const totalLatency = parsedResult.latency_ms ?? Math.round(Date.now() - startTime);

      if (isTest) {
        return NextResponse.json({
          ok: finishedCmd.status === "SUCCESS",
          action: "test",
          command: commandToRun,
          host,
          port,
          username,
          latencyMs: totalLatency,
          banner: "Linux (FarLink Agent Remote Queue)",
          message: `Connection successful! Raspberry Pi is online and responding via Agent Queue (${totalLatency}ms)\n${parsedResult.stdout || ""}`,
          stdout: parsedResult.stdout || "",
          stderr: parsedResult.stderr || "",
          code: parsedResult.code ?? 0,
          mode: "agent_queue",
        });
      }

      return NextResponse.json({
        ok: finishedCmd.status === "SUCCESS",
        action: "exec",
        command: commandToRun,
        host,
        port,
        username,
        stdout: parsedResult.stdout || "",
        stderr: parsedResult.stderr || finishedCmd.errorMessage || "",
        code: parsedResult.code ?? (finishedCmd.status === "SUCCESS" ? 0 : 1),
        latencyMs: totalLatency,
        mode: "agent_queue",
      });
    }

    // 2. Not finished within 12s timeout limit
    const lastSeenAge = device.lastSeenAt
      ? (Date.now() - new Date(device.lastSeenAt).getTime()) / 1000
      : null;
    const isDeviceOffline = lastSeenAge === null || lastSeenAge > 120;

    if (isDeviceOffline) {
      return NextResponse.json({
        ok: false,
        pending: true,
        commandId: cmd.id,
        error: `Command queued online (ID: ${cmd.id.slice(-6)}), but Raspberry Pi is currently OFFLINE (last active ${relTime(device.lastSeenAt)}). Command will execute automatically when agent reconnects.`,
        mode: "agent_queue",
      });
    }

    return NextResponse.json({
      ok: false,
      pending: true,
      commandId: cmd.id,
      error: `Command queued in cloud (ID: ${cmd.id.slice(-6)}). Raspberry Pi is currently processing... Please wait.`,
      mode: "agent_queue",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
