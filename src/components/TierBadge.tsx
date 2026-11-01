import { Flame, Snowflake } from "lucide-react";

export default function TierBadge({ tier }: { tier: string }) {
  if (tier === "HOT") {
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.2)]">
        <Flame size={13} /> Hot
      </span>
    );
  }
  if (tier === "WARM" || tier === "LEAD") {
    return <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.2)]">Warm</span>;
  }
  if (tier === "COLD") {
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-[0_0_10px_rgba(14,165,233,0.2)]">
        <Snowflake size={13} /> Cold
      </span>
    );
  }
  return null;
}
