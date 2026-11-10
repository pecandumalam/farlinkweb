"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import {
  Terminal as TerminalIcon,
  Play,
  RotateCw,
  Sliders,
  CheckCircle2,
  XCircle,
  Copy,
  Trash2,
  Cpu,
  Activity,
  HardDrive,
  Network,
  Power,
  KeyRound,
  ShieldAlert,
  Eye,
  EyeOff,
  Lock,
  User,
} from "lucide-react";
import { useToast } from "./ui";

interface SshTerminalProps {
  deviceId: string;
  deviceName: string;
  initialHost?: string | null;
  initialConfig?: Record<string, any>;
}

interface LogEntry {
  id: string;
  type: "input" | "stdout" | "stderr" | "system" | "error";
  text: string;
  timestamp: string;
  code?: number;
  latencyMs?: number;
}

export function SshTerminal({
  deviceId,
  deviceName,
  initialHost,
  initialConfig = {},
}: SshTerminalProps) {
  const savedSsh = initialConfig.ssh || {};
  const [host, setHost] = useState<string>(savedSsh.host || initialHost || "");
  const [port, setPort] = useState<number>(Number(savedSsh.port || 22));
  const [username, setUsername] = useState<string>(savedSsh.username || "farlink");
  const [password, setPassword] = useState<string>(savedSsh.password || "");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [command, setCommand] = useState<string>("");
  const [showConfig, setShowConfig] = useState<boolean>(!savedSsh.password);
  const [saveCreds, setSaveCreds] = useState<boolean>(true);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [connectionStatus, setConnectionStatus] = useState<"IDLE" | "TESTING" | "OK" | "FAILED">("IDLE");
  const [latency, setLatency] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const { toast, toastEl } = useToast();
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: "init",
      type: "system",
      text: `FarLink Remote Terminal — Cloud Queue Execution (Online Queue ⇄ Raspberry Pi Local Exec)\nCommands sent from this console are queued online in the cloud, retrieved by FarLink Agent, and executed locally on ${deviceName}.`,
      timestamp: new Date().toLocaleTimeString("en-US"),
    },
  ]);

  const scrollToBottom = () => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  const addLog = (entry: Omit<LogEntry, "id" | "timestamp">) => {
    setLogs((prev) => [
      ...prev,
      {
        ...entry,
        id: Math.random().toString(36).slice(2),
        timestamp: new Date().toLocaleTimeString("en-US"),
      },
    ]);
  };

  // Helper to poll queued command execution results
  const pollCommandResult = (commandId: string, cmdName: string) => {
    let attempts = 0;
    const intervalId = setInterval(async () => {
      attempts++;
      try {
        const pollRes = await fetch(`/api/devices/${deviceId}/ssh?commandId=${commandId}`);
        const pollData = await pollRes.json();

        if (!pollData.pending) {
          clearInterval(intervalId);
          if (pollData.ok) {
            setConnectionStatus("OK");
            setLatency(pollData.latencyMs);
            if (pollData.stdout) {
              addLog({ type: "stdout", text: pollData.stdout, code: pollData.code, latencyMs: pollData.latencyMs });
            }
            if (pollData.stderr) {
              addLog({ type: "stderr", text: pollData.stderr, code: pollData.code });
            }
            if (!pollData.stdout && !pollData.stderr) {
              addLog({
                type: "system",
                text: `[Process exited with return code ${pollData.code} (${pollData.latencyMs}ms)]`,
                code: pollData.code,
                latencyMs: pollData.latencyMs,
              });
            }
            toast(`Command "${cmdName}" executed successfully!`);
          } else {
            setConnectionStatus("FAILED");
            addLog({
              type: "error",
              text: pollData.stderr || pollData.error || `Command "${cmdName}" failed to execute.`,
            });
            toast("Command failed");
          }
        } else if (attempts >= 25) {
          clearInterval(intervalId);
          addLog({
            type: "system",
            text: `[PENDING] Command (ID: ${commandId.slice(-6)}) is still queued for execution on Raspberry Pi.`,
          });
        }
      } catch {
        clearInterval(intervalId);
      }
    }, 1200);
  };

  const handleTestConnection = () => {
    setConnectionStatus("TESTING");
    addLog({
      type: "system",
      text: `Testing Raspberry Pi connectivity via FarLink Cloud Command Queue...`,
    });

    startTransition(async () => {
      try {
        const res = await fetch(`/api/devices/${deviceId}/ssh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "test",
            host,
            port,
            username,
            password,
            saveCredentials: saveCreds,
          }),
        });
        const data = await res.json();

        if (data.ok) {
          setConnectionStatus("OK");
          setLatency(data.latencyMs);
          addLog({
            type: "system",
            text: `[OK] Connected to ${username}@${host || "device"} (${data.latencyMs}ms)\n${data.message || data.stdout || ""}`,
          });
          toast("Connection successful!");
        } else if (data.pending && data.commandId) {
          addLog({
            type: "system",
            text: `[QUEUED] Test command queued in cloud (ID: ${data.commandId.slice(-6)}). Awaiting response from Raspberry Pi...`,
          });
          pollCommandResult(data.commandId, "test");
        } else {
          setConnectionStatus("FAILED");
          setLatency(null);
          addLog({
            type: "error",
            text: `[FAIL] Error: ${data.error}`,
          });
          toast(data.error || "Failed to test connection");
        }
      } catch (err: any) {
        setConnectionStatus("FAILED");
        addLog({ type: "error", text: `[ERROR] Network issue: ${err.message}` });
      }
    });
  };

  const executeCommand = (cmdToRun?: string) => {
    const cmd = (cmdToRun !== undefined ? cmdToRun : command).trim();
    if (!cmd) return;

    if (!history.includes(cmd)) {
      setHistory((prev) => [...prev, cmd]);
    }
    setHistoryIndex(-1);

    addLog({
      type: "input",
      text: `${username}@${host || "farlink"}:~$ ${cmd}`,
    });

    if (cmdToRun === undefined) {
      setCommand("");
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/devices/${deviceId}/ssh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "exec",
            command: cmd,
            host,
            port,
            username,
            password,
            saveCredentials: saveCreds,
          }),
        });
        const data = await res.json();

        if (data.ok) {
          setConnectionStatus("OK");
          if (data.stdout) {
            addLog({ type: "stdout", text: data.stdout, code: data.code, latencyMs: data.latencyMs });
          }
          if (data.stderr) {
            addLog({ type: "stderr", text: data.stderr, code: data.code });
          }
          if (!data.stdout && !data.stderr) {
            addLog({
              type: "system",
              text: `[Process exited with return code ${data.code} (${data.latencyMs}ms)]`,
              code: data.code,
              latencyMs: data.latencyMs,
            });
          }
        } else if (data.pending && data.commandId) {
          addLog({
            type: "system",
            text: `[QUEUED] Command queued in cloud (ID: ${data.commandId.slice(-6)}). Awaiting response from Raspberry Pi...`,
          });
          pollCommandResult(data.commandId, cmd);
        } else {
          setConnectionStatus("FAILED");
          addLog({ type: "error", text: data.error || "Failed to execute command." });
        }
      } catch (err: any) {
        addLog({ type: "error", text: `Failed to dispatch request: ${err.message}` });
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      executeCommand();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length > 0) {
        const nextIdx = historyIndex + 1 < history.length ? historyIndex + 1 : historyIndex;
        setHistoryIndex(nextIdx);
        setCommand(history[history.length - 1 - nextIdx] || "");
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setCommand(history[history.length - 1 - nextIdx] || "");
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommand("");
      }
    }
  };

  const clearScreen = () => {
    setLogs([
      {
        id: "cleared",
        type: "system",
        text: `Terminal cleared — Active SSH session to ${deviceName}`,
        timestamp: new Date().toLocaleTimeString("en-US"),
      },
    ]);
  };

  const copyTerminalOutput = () => {
    const text = logs.map((l) => l.text).join("\n");
    navigator.clipboard.writeText(text);
    toast("Terminal output copied to clipboard!");
  };

  const presets = [
    {
      label: "Agent Status",
      icon: Activity,
      cmd: "systemctl status farlink-agent || ps aux | grep farlink",
    },
    {
      label: "CPU & Temp",
      icon: Cpu,
      cmd: "echo '=== CPU & TEMP ==='; (vcgencmd measure_temp 2>/dev/null || cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || uptime); uname -a",
    },
    {
      label: "Memory & Disk",
      icon: HardDrive,
      cmd: "free -h; echo '--- DISK ---'; df -h /",
    },
    {
      label: "Latest Logs",
      icon: TerminalIcon,
      cmd: "tail -n 35 farlink_agent.log 2>/dev/null || journalctl -u farlink-agent -n 35 --no-pager",
    },
    {
      label: "Network Interfaces",
      icon: Network,
      cmd: "ip -br a; echo '--- GATEWAY ---'; ip route",
    },
    {
      label: "Restart Agent",
      icon: RotateCw,
      cmd: "sudo systemctl restart farlink-agent 2>/dev/null || echo 'Requires root/sudo privileges'",
    },
  ];

  return (
    <div className="card fade-in" style={{ overflow: "hidden", border: "1px solid var(--border-2)" }}>
      {/* Terminal Toolbar */}
      <div
        className="card-head"
        style={{
          background: "linear-gradient(180deg, var(--surface-2) 0%, var(--surface) 100%)",
          padding: "12px 18px",
        }}
      >
        <div className="row" style={{ gap: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: "-0.01em",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "rgba(59, 130, 246, 0.16)",
                color: "var(--primary)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <TerminalIcon size={16} />
            </div>
            <span>Terminal / SSH Console</span>
            <span className="badge b-online" style={{ fontSize: 10, padding: "2px 6px" }}>
              Cloud Queue Mode
            </span>
          </div>

          <div className="row" style={{ gap: 6 }}>
            <span className="badge b-unknown mono" style={{ fontSize: 11 }}>
              {username}@{host || "device"}:{port}
            </span>
            {connectionStatus === "OK" && (
              <span className="badge b-online">
                <span className="dot" /> Ready {latency ? `(${latency}ms)` : ""}
              </span>
            )}
            {connectionStatus === "FAILED" && (
              <span className="badge b-offline">
                <span className="dot" /> Disconnected
              </span>
            )}
            {connectionStatus === "TESTING" && (
              <span className="badge b-pending spin">
                <RotateCw size={10} className="spin" /> Testing...
              </span>
            )}
          </div>
        </div>

        <div className="row" style={{ gap: 8 }}>
          <button
            className={`btn btn-sm ${showConfig ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setShowConfig(!showConfig)}
            title="SSH Connection Settings"
            style={{ position: "relative" }}
          >
            <Sliders size={14} /> Connection Credentials
            {!password && (
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#ef4444",
                  marginLeft: 4,
                  display: "inline-block",
                }}
                title="Password not set"
              />
            )}
          </button>
          <button
            className="btn btn-sm"
            onClick={handleTestConnection}
            disabled={isPending}
            title="Test SSH Connection"
          >
            <RotateCw size={14} className={isPending ? "spin" : ""} /> Test Connection
          </button>
          <button className="btn btn-ghost btn-sm" onClick={copyTerminalOutput} title="Copy Output">
            <Copy size={14} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={clearScreen} title="Clear Screen">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Config Drawer / Panel */}
      {showConfig && (
        <div
          style={{
            padding: "16px 20px",
            background: "rgba(11, 18, 32, 0.65)",
            borderBottom: "1px solid var(--border)",
            backdropFilter: "blur(8px)",
          }}
        >
          {!password && (
            <div
              style={{
                marginBottom: 12,
                padding: "8px 12px",
                borderRadius: 6,
                background: "rgba(245, 158, 11, 0.12)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                color: "#fbbf24",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <KeyRound size={15} />
              <span>
                Enter <strong>Username</strong> and <strong>Password</strong> for your Raspberry Pi account. Check &quot;Remember credentials&quot; to save automatically.
              </span>
            </div>
          )}
          <div className="grid g-4" style={{ gap: 12, marginBottom: 12 }}>
            <div className="field">
              <label style={{ fontSize: 11.5 }}>Device Host / IP</label>
              <input
                className="input mono"
                placeholder="192.168.1.50 or localhost"
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
            </div>
            <div className="field">
              <label style={{ fontSize: 11.5 }}>SSH Port</label>
              <input
                type="number"
                className="input mono"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label style={{ fontSize: 11.5 }}>Username</label>
              <input
                className="input mono"
                placeholder="farlink / pi"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="field">
              <label style={{ fontSize: 11.5, display: "flex", justifyContent: "space-between" }}>
                <span>Password / Passphrase <span style={{ color: "#ef4444" }}>*</span></span>
              </label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  ref={passwordInputRef}
                  type={showPassword ? "text" : "password"}
                  className="input mono"
                  style={{ paddingRight: 36, width: "100%" }}
                  placeholder="Enter SSH Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleTestConnection();
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: 8,
                    background: "none",
                    border: "none",
                    color: "var(--dim, #94a3b8)",
                    cursor: "pointer",
                    padding: 4,
                    display: "flex",
                    alignItems: "center",
                  }}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <label className="check" style={{ fontSize: 12 }}>
              <input
                type="checkbox"
                checked={saveCreds}
                onChange={(e) => setSaveCreds(e.target.checked)}
              />
              <span>Remember credentials for this device</span>
            </label>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-sm btn-primary" onClick={handleTestConnection} disabled={isPending}>
                Save & Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diagnostics Quick Chips */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "10px 18px",
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          overflowX: "auto",
        }}
      >
        <span
          className="dim"
          style={{
            fontSize: 11,
            alignSelf: "center",
            marginRight: 6,
            textTransform: "uppercase",
            fontWeight: 600,
            letterSpacing: "0.05em",
          }}
        >
          Quick Diagnostics:
        </span>
        {presets.map((p) => (
          <button
            key={p.label}
            className="btn btn-sm"
            style={{
              padding: "4px 10px",
              fontSize: 11.5,
              borderRadius: "999px",
              background: "var(--surface-2)",
            }}
            disabled={isPending}
            onClick={() => executeCommand(p.cmd)}
          >
            <p.icon size={12} /> {p.label}
          </button>
        ))}
      </div>

      {/* Terminal Viewport */}
      <div
        style={{
          background: "#050913",
          padding: "18px 20px",
          minHeight: 380,
          maxHeight: 520,
          overflowY: "auto",
          fontFamily: "var(--mono)",
          fontSize: 13,
          lineHeight: 1.6,
          boxShadow: "inset 0 2px 10px rgba(0,0,0,0.5)",
        }}
      >
        {logs.map((log) => {
          if (log.type === "input") {
            return (
              <div key={log.id} style={{ color: "#38bdf8", marginTop: 8, fontWeight: 600 }}>
                {log.text}
              </div>
            );
          }
          if (log.type === "stdout") {
            return (
              <pre
                key={log.id}
                style={{
                  color: "#e2e8f0",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  margin: "4px 0",
                  fontFamily: "inherit",
                }}
              >
                {log.text}
              </pre>
            );
          }
          if (log.type === "stderr") {
            return (
              <pre
                key={log.id}
                style={{
                  color: "#f87171",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  margin: "4px 0",
                  fontFamily: "inherit",
                }}
              >
                {log.text}
              </pre>
            );
          }
          if (log.type === "error") {
            return (
              <div
                key={log.id}
                style={{
                  color: "#ef4444",
                  background: "rgba(239, 68, 68, 0.1)",
                  padding: "6px 10px",
                  borderRadius: 6,
                  margin: "6px 0",
                  borderLeft: "3px solid #ef4444",
                }}
              >
                {log.text}
              </div>
            );
          }
          return (
            <div key={log.id} style={{ color: "#94a3b8", fontStyle: "italic", margin: "4px 0" }}>
              {log.text}
            </div>
          );
        })}
        {isPending && (
          <div style={{ color: "#38bdf8", display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <RotateCw size={14} className="spin" />
            <span>Executing command on {deviceName}...</span>
          </div>
        )}
        <div ref={terminalEndRef} />
      </div>

      {/* Terminal Input Prompt */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 18px",
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
        }}
      >
        <div
          className="mono"
          style={{
            color: "#38bdf8",
            fontWeight: 700,
            whiteSpace: "nowrap",
            fontSize: 13,
          }}
        >
          {username}@{host || "device"}:~$
        </div>
        <input
          ref={inputRef}
          type="text"
          className="input mono"
          placeholder="Type shell command (e.g. uptime, uname -a, ip a)..."
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isPending}
          style={{
            flex: 1,
            background: "#080f20",
            border: "1px solid var(--border-2)",
            color: "#f8fafc",
          }}
        />
        <button
          className="btn btn-primary"
          onClick={() => executeCommand()}
          disabled={isPending || !command.trim()}
        >
          <Play size={14} /> Run
        </button>
      </div>

      {toastEl}
    </div>
  );
}
