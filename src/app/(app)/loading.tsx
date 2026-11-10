export default function AppLoading() {
  return (
    <div className="fade-in" style={{ padding: "8px 0" }}>
      {/* Top Banner Loader */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            className="skeleton"
            style={{ width: 180, height: 32, borderRadius: "var(--radius-sm)" }}
          />
          <div
            className="skeleton"
            style={{ width: 280, height: 16, borderRadius: "var(--radius-sm)" }}
          />
        </div>
        <div
          className="skeleton"
          style={{ width: 120, height: 36, borderRadius: "var(--radius-sm)" }}
        />
      </div>

      {/* KPI Grid Skeleton */}
      <div className="grid g-4" style={{ marginBottom: 20 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="card kpi"
            style={{ minHeight: 104, position: "relative", overflow: "hidden" }}
          >
            <div
              className="skeleton"
              style={{ width: "45%", height: 14, marginBottom: 12, borderRadius: 4 }}
            />
            <div
              className="skeleton"
              style={{ width: "65%", height: 28, borderRadius: 6 }}
            />
          </div>
        ))}
      </div>

      {/* Main Content Skeleton */}
      <div className="grid g-main" style={{ gap: 16 }}>
        <div className="card" style={{ height: 380, padding: 20 }}>
          <div
            className="skeleton"
            style={{ width: 220, height: 20, marginBottom: 20, borderRadius: 4 }}
          />
          <div
            className="skeleton"
            style={{ width: "100%", height: 300, borderRadius: "var(--radius-sm)" }}
          />
        </div>
        <div className="card" style={{ height: 380, padding: 20 }}>
          <div
            className="skeleton"
            style={{ width: 150, height: 20, marginBottom: 20, borderRadius: 4 }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {Array.from({ length: 5 }).map((_, j) => (
              <div
                key={j}
                className="skeleton"
                style={{ width: "100%", height: 46, borderRadius: "var(--radius-sm)" }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
