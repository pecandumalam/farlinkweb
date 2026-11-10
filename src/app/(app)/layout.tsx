import { Shell } from "@/components/Shell";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  return <Shell user={{ name: s.name, email: s.email, role: s.role, companyId: s.companyId }}>{children}</Shell>;
}
