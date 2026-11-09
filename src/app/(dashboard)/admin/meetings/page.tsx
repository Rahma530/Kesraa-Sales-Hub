import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import DashboardShell from "@/components/DashboardShell";
import { ClipboardList, Calendar } from "lucide-react";

export const dynamic = 'force-dynamic';

function formatDateTime(date: Date) {
  return date.toLocaleString("en-US", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function MeetingsReportPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!can(session.user.role, "VIEW_MEETINGS_REPORT")) redirect("/unauthorized");

  const completedMeetings = await prisma.meeting.findMany({
    where: {
      status: "DONE",
    },
    orderBy: {
      updatedAt: "desc",
    },
    include: {
      owner: { select: { name: true } },
      lead: { select: { id: true, name: true, phone: true } },
    },
    take: 100, // Fetch the last 100 meetings
  });

  return (
    <DashboardShell title="Post-Meeting Report">
      <div className="glass-panel p-6">
        <h2 className="mb-6 text-xl font-bold text-white">Completed Meetings Log</h2>

        {completedMeetings.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <ClipboardList size={32} className="mx-auto mb-2 text-slate-400" />
            No meeting reports recorded yet
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {completedMeetings.map((meeting) => (
              <Link
                key={meeting.id}
                href={meeting.lead ? `/leads/${meeting.lead.id}` : "#"}
                className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 hover:border-accent/30 hover:bg-white/[0.04] transition-colors flex flex-col h-full relative overflow-hidden group cursor-pointer"
              >
                {/* clicking a card goes to that lead's full dashboard page */}
                <div className="absolute top-0 right-0 w-1.5 h-full bg-emerald-500/50"></div>
                
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-white text-base truncate pr-2">{meeting.lead?.name || "No Name"}</h3>
                    <p className="text-xs text-slate-400 mt-1 pr-2" dir="ltr">{meeting.lead?.phone}</p>
                  </div>
                  <div className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-[10px] font-bold whitespace-nowrap">
                    Meeting Done
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-accent/20 text-accent-soft flex items-center justify-center text-xs font-bold shrink-0">
                    {meeting.owner?.name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-sm text-slate-300 font-medium truncate">
                    By: {meeting.owner?.name || "Unknown Employee"}
                  </div>
                </div>

                <div className="bg-[#0b101a] border border-white/5 rounded-xl p-4 flex-1 mb-3">
                  <p className="text-xs text-slate-500 font-semibold mb-2">Report / Meeting Outcome:</p>
                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {meeting.result || "No details were written."}
                  </p>
                </div>

                <div className="mt-auto pt-3 border-t border-white/5 text-[11px] text-slate-500 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Calendar size={14} /> Original Meeting Time:</span>
                  <span className="text-slate-400">{formatDateTime(meeting.scheduledAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
