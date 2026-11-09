"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function DashboardNav({ role }: { role: string }) {
  const pathname = usePathname();

  const links: { href: string; label: string }[] = [];

  if (role === "ADMIN" || role === "HEAD_OF_SALES" || role === "HEAD_OF_TELE_SALES") {
    links.push({ href: "/admin", label: "Dashboard" });
    links.push({ href: "/admin/customers", label: "Lead Management" });
    links.push({ href: "/admin/sheets", label: "Sheets Management" });
    links.push({ href: "/admin/activity", label: "Employee Monitoring" });
  }
  // Post-Meeting Report is Sales-only content (Tele-Sales never holds
  // meetings), so Head of Tele-Sales doesn't get this link.
  if (role === "ADMIN" || role === "HEAD_OF_SALES") {
    links.push({ href: "/admin/meetings", label: "Post-Meeting Report" });
  }
  if (role === "ADMIN" || role === "HEAD_OF_SALES" || role === "HEAD_OF_TELE_SALES") {
    links.push({ href: "/admin/users", label: "Employees" });
  }
  if (role === "TELE_SALES") {
    links.push({ href: "/tele-sales", label: "My Dashboard" });
  }
  if (role === "SALES") {
    links.push({ href: "/sales", label: "My Dashboard" });
  }
  if (role === "ADMIN") {
    links.push({ href: "/account", label: "My Account" });
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
