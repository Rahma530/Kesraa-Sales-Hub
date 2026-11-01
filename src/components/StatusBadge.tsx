const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  NEW: { label: "New", className: "badge-new" },
  CONTACTED: { label: "Contacted", className: "badge-new" },
  NO_ANSWER: { label: "No Answer", className: "badge-lost" },
  NEEDS_FOLLOWUP: { label: "Needs Follow-up", className: "badge-gold" },
  INTERESTED: { label: "Interested", className: "badge-won" },
  NOT_INTERESTED: { label: "Not Interested", className: "badge-lost" },
  HOT: { label: "Hot", className: "badge-hot" },
  COLD: { label: "Cold", className: "badge-gold" },
  MEETING_SCHEDULED: { label: "Meeting Scheduled", className: "badge-new" },
  TRANSFERRED_TO_SALES: { label: "Transferred to Sales", className: "badge-won" },
  CLOSED_WON: { label: "Closed (Won)", className: "badge-won" },
  CLOSED_LOST: { label: "Closed (Lost)", className: "badge-lost" },
};

export default function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_LABELS[status] ?? { label: status, className: "badge-new" };
  return <span className={cfg.className}>{cfg.label}</span>;
}
