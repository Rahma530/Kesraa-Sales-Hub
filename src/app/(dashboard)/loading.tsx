import DashboardShell from "@/components/DashboardShell";

export default function DashboardLoading() {
  return (
    <DashboardShell title="Loading...">
      <div className="flex flex-col gap-6 animate-pulse mt-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-white/5 border border-white/5" />
          ))}
        </div>
        
        <div className="h-96 rounded-3xl bg-white/5 border border-white/5 w-full mt-4" />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
          <div className="h-64 rounded-3xl bg-white/5 border border-white/5" />
          <div className="h-64 rounded-3xl bg-white/5 border border-white/5" />
        </div>
      </div>
    </DashboardShell>
  );
}
