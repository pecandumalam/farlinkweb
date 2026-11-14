"use client";

import { useActionState, useEffect, useState } from "react";
import { generateDummyAction, clearDummy, createUser, toggleUser, changePassword } from "@/lib/actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { useToast } from "@/components/ui";
import { INTERVALS } from "@/lib/constants";

type TabId = "account" | "users" | "dummy" | "auditlog";

type User = { id: string; name: string; email: string; role: string; isActive: boolean; lastLoginAt: Date | null };
type AuditLog = { id: string; action: string; target: string | null; createdAt: Date; user: { name: string } | null };

/* ──────────── Password Change ──────────── */
function ChangePasswordForm({ force }: { force?: boolean }) {
  const [state, action, pending] = useActionState(changePassword, null);
  return (
    <form action={action} className="stack" style={{ maxWidth: 380 }}>
      {force && <div className="alert" style={{ border: "1px solid rgba(245,158,11,.3)", background: "rgba(245,158,11,.08)", color: "var(--warning)" }}>Please change your password before continuing.</div>}
      {state?.error && <div className="alert alert-error">{state.error}</div>}
      {state?.ok && <div className="alert alert-ok">{state.message}</div>}
      <div className="field"><label>Current password</label><input name="current" type="password" className="input" required autoComplete="current-password" /></div>
      <div className="field"><label>New password</label><input name="next" type="password" className="input" required minLength={8} autoComplete="new-password" /></div>
      <div className="field"><label>Confirm new password</label><input name="confirm" type="password" className="input" required autoComplete="new-password" /></div>
      <button className="btn btn-primary" disabled={pending}>Change Password</button>
    </form>
  );
}

/* ──────────── Create User ──────────── */
function CreateUserForm() {
  const [state, action, pending] = useActionState(createUser, null);
  return (
    <form action={action} className="stack">
      {state?.error && <div className="alert alert-error">{state.error}</div>}
      {state?.ok && <div className="alert alert-ok">{state.message}</div>}
      <div className="form-grid">
        <div className="field"><label>Full Name</label><input name="name" className="input" required /></div>
        <div className="field"><label>Email</label><input name="email" type="email" className="input" required /></div>
        <div className="field"><label>Password</label><input name="password" type="password" className="input" required minLength={8} /></div>
      </div>
      <button className="btn btn-primary" disabled={pending} style={{ width: "fit-content" }}>Create User</button>
    </form>
  );
}

/* ──────────── Dummy Generator ──────────── */
function DummyForm() {
  const [state, action, pending] = useActionState(generateDummyAction, null);
  const { toast, toastEl } = useToast();
  useEffect(() => { if (state?.ok) toast(state.message!); if (state?.error) toast(state.error!); }, [state]);
  return (
    <form action={action} className="stack" style={{ maxWidth: 560 }}>
      {toastEl}
      <div className="form-grid">
        <div className="field"><label>Company name</label><input name="company" className="input" defaultValue="Demo Company" /></div>
        <div className="field"><label>Number of devices</label><input name="devices" type="number" min={1} max={20} className="input" defaultValue={5} /></div>
        <div className="field"><label>Test type</label>
          <select name="testType" className="select">
            {["SPEED", "MTR", "DIG", "CURL", "TCP_PORT"].map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="field"><label>Interval (minutes)</label>
          <select name="interval" className="select">
            {INTERVALS.filter((i) => i.value > 0).map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
        </div>
        <div className="field"><label>Duration (hours)</label><input name="hours" type="number" min={1} max={168} className="input" defaultValue={24} /></div>
        <div className="field"><label>Fail rate (%)</label><input name="failRate" type="number" step="0.01" min={0} max={1} className="input" defaultValue={0.06} /></div>
      </div>
      <div className="row">
        <button id="generate-dummy" className="btn btn-primary" disabled={pending}>Generate Data</button>
        <ConfirmButton action={clearDummy} label="Clear All Dummy" danger confirm="Purge all demo devices and synthetic data?" />
      </div>
    </form>
  );
}

/* ──────────── Main ──────────── */
export function SettingsClient({ users, auditLogs, currentUserId, forceChange }: { users: User[]; auditLogs: AuditLog[]; currentUserId: string; forceChange: boolean }) {
  const [tab, setTab] = useState<TabId>(forceChange ? "account" : "account");
  const tabs: { k: TabId; l: string }[] = [
    { k: "account", l: "My Account" },
    { k: "users", l: "Users" },
    { k: "auditlog", l: "Audit Log" },
  ];

  return (
    <>
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.k} id={`settings-tab-${t.k}`} className={`tab ${tab === t.k ? "active" : ""}`} onClick={() => setTab(t.k)} style={{ background: "none", border: "none", cursor: "pointer" }}>{t.l}</button>
        ))}
      </div>

      {tab === "account" && (
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="card-head"><h2>Change Password</h2></div>
          <div className="card-body"><ChangePasswordForm force={forceChange} /></div>
        </div>
      )}

      {tab === "users" && (
        <div className="stack">
          <div className="card">
            <div className="card-head"><h2>Add User</h2></div>
            <div className="card-body"><CreateUserForm /></div>
          </div>
          <div className="card">
            <div className="card-head"><h2>User Directory</h2></div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last Login</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 500 }}>{u.name}</td>
                      <td className="mono">{u.email}</td>
                      <td>{u.role}</td>
                      <td className="dim">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("en-US") : "—"}</td>
                      <td>{u.isActive ? <span style={{ color: "var(--success)" }}>Active</span> : <span className="dim">Inactive</span>}</td>
                      <td>
                        {u.id !== currentUserId && (
                          <ConfirmButton action={toggleUser.bind(null, u.id)} label={u.isActive ? "Deactivate" : "Activate"} confirm={`${u.isActive ? "Deactivate" : "Activate"} user ${u.email}?`} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "dummy" && (
        <div className="card">
          <div className="card-head"><h2>Demo / Dummy Data Generator</h2></div>
          <div className="card-body stack">
            <p className="muted" style={{ maxWidth: 540 }}>
              Generate synthetic data for demonstrations and testing without physical probes. Data is populated directly into the database and visible on the dashboard.
            </p>
            <DummyForm />
          </div>
        </div>
      )}

      {tab === "auditlog" && (
        <div className="card">
          <div className="card-head"><h2>Audit Log</h2></div>
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Target</th></tr></thead>
              <tbody>
                {auditLogs.map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{new Date(a.createdAt).toLocaleString("en-US")}</td>
                    <td>{a.user?.name ?? <span className="dim">system</span>}</td>
                    <td className="mono">{a.action}</td>
                    <td className="dim">{a.target ?? "—"}</td>
                  </tr>
                ))}
                {!auditLogs.length && <tr><td colSpan={4} className="empty">No audit logs recorded yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
