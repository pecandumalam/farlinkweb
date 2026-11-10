"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function NavigationProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  // When route or searchParams change, complete the progress bar
  useEffect(() => {
    setProgress(100);
    const timer = setTimeout(() => {
      setLoading(false);
      setProgress(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [pathname, searchParams]);

  // Intercept click on internal links to start progress bar immediately
  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || target.target === "_blank") {
        return;
      }

      // Check if same origin and different path/query
      try {
        const url = new URL(href, window.location.href);
        if (url.origin === window.location.origin) {
          const currentUrl = window.location.pathname + window.location.search;
          const targetUrl = url.pathname + url.search;
          if (currentUrl !== targetUrl) {
            setLoading(true);
            setProgress(30);

            const interval = setInterval(() => {
              setProgress((prev) => {
                if (prev >= 85) {
                  clearInterval(interval);
                  return prev;
                }
                return prev + Math.floor(Math.random() * 15 + 5);
              });
            }, 150);

            setTimeout(() => clearInterval(interval), 5000);
          }
        }
      } catch {}
    };

    document.addEventListener("click", handleAnchorClick, true);
    return () => document.removeEventListener("click", handleAnchorClick, true);
  }, []);

  if (!loading && progress === 0) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 999999,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          background: "linear-gradient(90deg, #38bdf8 0%, #6366f1 50%, #ec4899 100%)",
          boxShadow: "0 0 12px rgba(56, 189, 248, 0.85), 0 0 4px rgba(99, 102, 241, 0.9)",
          transition: "width 0.22s ease-out, opacity 0.3s ease",
          opacity: progress === 100 ? 0 : 1,
          borderRadius: "0 2px 2px 0",
        }}
      />
      {loading && progress < 100 && (
        <div
          style={{
            position: "fixed",
            top: 14,
            right: 18,
            zIndex: 999999,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 12px",
            background: "rgba(14, 22, 40, 0.9)",
            border: "1px solid rgba(56, 189, 248, 0.4)",
            borderRadius: 999,
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
            backdropFilter: "blur(8px)",
            fontSize: 11.5,
            fontWeight: 600,
            color: "#38bdf8",
            letterSpacing: "0.02em",
            animation: "pulse 1.2s infinite ease-in-out",
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#38bdf8",
              boxShadow: "0 0 8px #38bdf8",
            }}
          />
          <span>Loading page...</span>
        </div>
      )}
    </div>
  );
}
