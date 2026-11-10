"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Building2, Router, FlaskConical, History, CalendarClock, Settings,
  PanelLeftClose, PanelLeftOpen, Menu, Moon, Sun, LogOut, Search,
} from "lucide-react";

const NAV = [
  { section: "Overview" },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { section: "Inventory" },
  { href: "/customers", label: "Customers", icon: Building2 },
  { href: "/devices", label: "Devices", icon: Router },
  { section: "Operations" },
  { href: "/tests", label: "Tests", icon: FlaskConical },
  { href: "/history", label: "Test History", icon: History },
  { href: "/schedules", label: "Schedules", icon: CalendarClock },
  { section: "System" },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Shell({
  user,
  children,
}: {
  user: { name: string; email: string; role?: string; companyId?: string | null };
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [q, setQ] = useState("");

  const isAdmin = user.role === "ADMIN";
  const companyId = user.companyId;

  const navItems = isAdmin
    ? [
        { section: "Overview" },
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { section: "Inventory" },
        { href: "/customers", label: "Customers", icon: Building2 },
        { href: "/devices", label: "Devices", icon: Router },
        { section: "Operations" },
        { href: "/tests", label: "Tests", icon: FlaskConical },
        { href: "/history", label: "Test History", icon: History },
        { href: "/schedules", label: "Schedules", icon: CalendarClock },
        { section: "System" },
        { href: "/settings", label: "Settings", icon: Settings },
      ]
    : [
        { section: "Overview" },
        { href: companyId ? `/customers/${companyId}` : "/devices", label: "Company Overview", icon: Building2 },
        { href: "/devices", label: "My Devices", icon: Router },
        { section: "Reports & Quality" },
        { href: companyId ? `/customers/${companyId}?tab=daily-report` : "/history", label: "24h Daily Report", icon: History },
        { href: companyId ? `/customers/${companyId}?tab=graph` : "/history", label: "Performance Graphs", icon: LayoutDashboard },
        { section: "Remote Operations" },
        { href: "/tests", label: "Remote Tests", icon: FlaskConical },
        { href: "/schedules", label: "Periodic Collection", icon: CalendarClock },
        { href: "/history", label: "Test History", icon: History },
      ];

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme || "dark");
    setCollapsed(localStorage.getItem("sb") === "1");
  }, []);
  useEffect(() => setOpen(false), [path]);

  const toggleTheme = () => {
    const t = theme === "dark" ? "light" : "dark";
    setTheme(t);
    document.documentElement.dataset.theme = t;
    localStorage.setItem("theme", t);
  };
  const toggleSb = () => {
    localStorage.setItem("sb", collapsed ? "0" : "1");
    setCollapsed(!collapsed);
  };

  const current = navItems.find(
    (n): n is { href: string; label: string; icon: any } => "href" in n && !!n.href && path.startsWith(n.href.split("?")[0]),
  );
  const initials = user.name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="shell">
      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${open ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-logo">F1</div>
          <div className="brand-text">
            <b>FarlinkOne</b>
            <span>Device Control Center</span>
          </div>
        </div>
        <nav className="nav">
          {navItems.map((n, i) =>
            "section" in n ? (
              <div key={i} className="nav-section">{n.section}</div>
            ) : (
              <Link
                key={n.href}
                id={`nav-${n.href.split("?")[0].slice(1).replace(/\//g, "-")}`}
                href={n.href}
                className={`nav-item ${path === n.href || (n.href !== "/" && path.startsWith(n.href.split("?")[0])) ? "active" : ""}`}
                title={n.label}
              >
                <n.icon size={18} />
                <span className="nav-label">{n.label}</span>
              </Link>
            ),
          )}
        </nav>
        <div className="sidebar-foot">
          <button className="btn btn-ghost btn-block" onClick={toggleSb} title="Collapse sidebar">
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            <span className="nav-label">Collapse</span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost only-mobile" onClick={() => setOpen(!open)} aria-label="Menu"><Menu size={18} /></button>
          <div className="crumbs">
            <span>FarlinkOne</span>/<b>{current && "label" in current ? current.label : ""}</b>
          </div>
          <div className="topbar-right">
            <form className="search" onSubmit={(e) => { e.preventDefault(); router.push(`/devices?q=${encodeURIComponent(q)}`); }}>
              <Search size={15} />
              <input id="global-search" placeholder="Search devices…" value={q} onChange={(e) => setQ(e.target.value)} />
            </form>
            <button id="theme-toggle" className="btn btn-ghost" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <div className="row" style={{ gap: 10 }}>
              <div className="avatar" title={user.email}>{initials}</div>
            </div>
            <form action="/api/auth/logout" method="post">
              <button id="logout" className="btn btn-ghost" title="Logout"><LogOut size={17} /></button>
            </form>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
