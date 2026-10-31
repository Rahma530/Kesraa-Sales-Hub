"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function DashboardNav({ role }: { role: string }) {
  const pathname = usePathname();

  const links: { href: string; label: string }[] = [];

  if (role === "ADMIN" || role === "HEAD_OF_SALES") {
    links.push({ href: "/admin", label: "لوحة التحكم" });
    links.push({ href: "/admin/customers", label: "إدارة العملاء" });
    links.push({ href: "/admin/sheets", label: "إدارة الشيتات" });
    links.push({ href: "/admin/activity", label: "متابعة الموظفين" });
    links.push({ href: "/admin/meetings", label: "تقرير بعد ميتنج" });
  }
  if (role === "ADMIN") {
    links.push({ href: "/admin/users", label: "الموظفين" });
  }
  if (role === "TELE_SALES") {
    links.push({ href: "/tele-sales", label: "لوحتي" });
  }
  if (role === "SALES") {
    links.push({ href: "/sales", label: "لوحتي" });
  }
  if (role === "ADMIN") {
    links.push({ href: "/account", label: "حسابي" });
  }
  // WhatsApp temporarily disabled: this host can't run the persistent
  // Chrome/Puppeteer session whatsapp-web.js needs (confirmed with
  // Hostinger support). Hidden here rather than removed so it's a one-line
  // revert once a VPS or the official WhatsApp Cloud API is wired in.
  // links.push({ href: "/whatsapp-inbox", label: "💬 واتساب ويب" });

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {links.map((link) => {
        const active = link.href === pathname;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
              active
                ? "bg-accent/20 text-accent-soft"
                : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
