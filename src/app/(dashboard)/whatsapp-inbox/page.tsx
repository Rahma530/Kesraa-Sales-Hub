import DashboardShell from "@/components/DashboardShell";
import dynamic from "next/dynamic";

const WhatsAppInboxClient = dynamic(() => import("./WhatsAppInboxClient"), { 
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full min-h-[60vh]">
      <div className="w-10 h-10 border-4 border-accent/20 border-t-accent rounded-full animate-spin"></div>
    </div>
  )
});

export default function WhatsAppInboxPage() {
  return (
    <DashboardShell title="WhatsApp Inbox">
      <WhatsAppInboxClient />
    </DashboardShell>
  );
}
