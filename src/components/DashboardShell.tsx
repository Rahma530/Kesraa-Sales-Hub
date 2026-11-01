import Image from "next/image";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import SignOutButton from "@/components/SignOutButton";
import DashboardNav from "@/components/DashboardNav";
import NotificationBell from "@/components/NotificationBell";
import OnlineUsers from "@/components/OnlineUsers";
import ChatBox from "@/components/ChatBox";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "مدير النظام",
  HEAD_OF_SALES: "رئيس المبيعات",
  TELE_SALES: "موظف Tele-Sales",
  SALES: "موظف Sales",
};

export default async function DashboardShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  const session = await getServerSession(authOptions);
  const role = session?.user.role ?? "";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-[#b98cf0]/15 bg-[#151318]/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[96%] items-center justify-between px-6 pt-3 pb-1">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 border-l border-[#b98cf0]/15 pl-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white font-bold text-xl shadow-inner">
                {session?.user.name?.charAt(0).toUpperCase()}
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-base font-bold text-white">{session?.user.name}</p>
                <p className="text-sm text-[#a89bb8] mt-1">{ROLE_LABELS[role] ?? role}</p>
              </div>
            </div>

            <div className="hidden sm:flex items-center">
              <ChatBox />
              <OnlineUsers currentUserRole={role} />
              <NotificationBell />
            </div>
          </div>

          <div className="flex items-center gap-5">
            <SignOutButton />
            <div className="flex h-14 w-20 items-center justify-center">
              <Image
                src="/branding/kesra-logo.png"
                alt="Kesra CRM"
                width={200}
                height={70}
                className="kesra-logo h-auto w-full"
              />
            </div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[96%] px-6 pb-2">
          <DashboardNav role={role} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[96%] px-6 py-8 flex-1 min-w-0">{children}</main>
    </div>
  );
}
