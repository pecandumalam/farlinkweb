import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { NavigationProgressBar } from "@/components/NavigationProgressBar";

export const metadata: Metadata = {
  title: { default: "FarlinkOne", template: "%s · FarlinkOne" },
  description: "FarlinkOne — Device monitoring & remote control center for FarLink Go / Edge probes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body>
        <Suspense fallback={null}>
          <NavigationProgressBar />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
