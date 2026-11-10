"use client";

import { useState } from "react";
import { Activity, Gauge, Lock, Mail, Router, ShieldCheck, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, remember }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Login failed");
      setLoading(false);
      return;
    }
    const next = new URLSearchParams(location.search).get("next");
    location.href = data.mustChangePassword ? "/settings?tab=account&force=1" : next || "/dashboard";
  }

  return (
    <main className="login">
      <section className="login-brand">
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-logo">F1</div>
          <div className="brand-text">
            <b>FarlinkOne</b>
            <span>Device Control Center</span>
          </div>
        </div>
        <div>
          <h2>
            Monitor & control all your <span>FarLink</span> devices from a single dashboard.
          </h2>
          <div className="login-feats">
            <div><Router size={18} /> Realtime status for FarLink Go & Edge probes</div>
            <div><Gauge size={18} /> Speed, MTR, DIG, CURL & TCP Port diagnostics</div>
            <div><Activity size={18} /> Automated schedules & remote commands</div>
            <div><ShieldCheck size={18} /> Secure access with authentication & audit logging</div>
          </div>
        </div>
        <p style={{ color: "#64748b", fontSize: 12 }}>© {new Date().getFullYear()} FarLink · v1.1</p>
      </section>

      <section className="login-form">
        <form className="login-card fade-in" onSubmit={submit}>
          <h1>Sign in</h1>
          <p className="muted" style={{ marginTop: 6, marginBottom: 28 }}>Sign in to access FarlinkOne Control Center.</p>

          <div className="stack">
            {error && <div className="alert alert-error">{error}</div>}
            <div className="field">
              <label htmlFor="email">Email</label>
              <div style={{ position: "relative" }}>
                <Mail size={16} className="dim" style={{ position: "absolute", left: 12, top: 12 }} />
                <input id="email" className="input" style={{ paddingLeft: 36 }} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@farlink.local" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <div style={{ position: "relative" }}>
                <Lock size={16} className="dim" style={{ position: "absolute", left: 12, top: 12 }} />
                <input id="password" className="input" style={{ paddingLeft: 36 }} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
            </div>
            <label className="check">
              <input id="remember" type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me
            </label>
            <button id="login-submit" className="btn btn-primary btn-block" style={{ padding: "11px 14px" }} disabled={loading}>
              {loading ? <Loader2 size={16} className="spin" /> : null} Sign In
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
