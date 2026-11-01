"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, FileSpreadsheet, Trash2 } from "lucide-react";

type Batch = {
  id: string;
  fileName: string;
  totalLeads: number;
  createdAt: Date;
  uploadedBy: { name: string };
  _count: { leads: number };
};

export default function SheetsClient({ initialBatches }: { initialBatches: any[] }) {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>(initialBatches);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; type: "alert" | "confirm"; onConfirm?: () => void }>({ isOpen: false, title: "", message: "", type: "alert" });
  
  const showAlert = (title: string, message: string) => setModal({ isOpen: true, title, message, type: "alert" });
  const showConfirm = (title: string, message: string, onConfirm: () => void) => setModal({ isOpen: true, title, message, type: "confirm", onConfirm });

  const handleDelete = (id: string) => {
    showConfirm("Serious Warning", "Are you sure you want to delete this sheet completely? All associated leads and notes will be permanently deleted!", async () => {
      setDeletingId(id);
      try {
        const res = await fetch(`/api/admin/sheets/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await res.text());

        setBatches(batches.filter(b => b.id !== id));
        router.refresh();
        showAlert("Success", "The sheet and its leads were deleted successfully.");
      } catch (e: any) {
        showAlert("Error", "An error occurred while deleting: " + e.message);
      } finally {
        setDeletingId(null);
      }
    });
  };

  return (
    <div className="space-y-6 relative">
      {/* Custom Modal */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#182032] border border-white/10 p-6 rounded-2xl shadow-2xl max-w-md w-full transform transition-all scale-100 opacity-100">
            <h3 className={`text-xl font-bold mb-3 ${modal.title.includes("Error") || modal.title.includes("Warning") ? "text-rose-500" : modal.title.includes("Success") ? "text-emerald-500" : "text-white"}`}>
              {modal.title}
            </h3>
            <p className="text-slate-300 text-[15px] mb-8 leading-relaxed">
              {modal.message}
            </p>
            <div className="flex justify-end gap-3">
              {modal.type === "confirm" && (
                <button 
                  onClick={() => setModal({ ...modal, isOpen: false })}
                  className="px-5 py-2 rounded-xl text-sm font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
              )}
              <button 
                onClick={() => {
                  if (modal.type === "confirm" && modal.onConfirm) modal.onConfirm();
                  setModal({ ...modal, isOpen: false });
                }}
                className={`px-6 py-2 rounded-xl text-sm font-bold text-white transition-colors shadow-lg ${
                  modal.type === "confirm" ? "bg-rose-600 hover:bg-rose-500" : "bg-accent hover:bg-accent"
                }`}
              >
                {modal.type === "confirm" ? "Yes, I'm sure" : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-[#121826] p-6 rounded-3xl border border-white/5 shadow-xl">
        <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <FileText size={18} className="text-accent" /> Uploaded Excel Sheets Management
        </h2>
        <p className="text-slate-400 text-sm mb-6">
          Here you can see all previously uploaded sheets, and if you find an error in the data, you can delete the sheet completely with a single click.
        </p>

        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full text-sm text-right text-slate-300">
            <thead className="bg-[#0f1523] text-slate-400 font-semibold border-b border-white/5">
              <tr>
                <th className="px-6 py-4">File Name</th>
                <th className="px-6 py-4">Original Lead Count</th>
                <th className="px-6 py-4">Current Leads</th>
                <th className="px-6 py-4">Uploaded By</th>
                <th className="px-6 py-4">Upload Date</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-medium">
                    No sheets uploaded yet.
                  </td>
                </tr>
              ) : (
                batches.map((batch) => (
                  <tr key={batch.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-bold text-white flex items-center gap-2">
                      <FileSpreadsheet size={16} className="text-emerald-500" /> {batch.fileName}
                    </td>
                    <td className="px-6 py-4 text-slate-400">{batch.totalLeads} leads</td>
                    <td className="px-6 py-4 text-accent-soft font-bold">{batch._count.leads} leads</td>
                    <td className="px-6 py-4">
                      <span className="bg-accent/10 text-accent-soft px-3 py-1 rounded-full text-xs border border-accent/20">
                        {batch.uploadedBy.name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500" dir="ltr">
                      {new Date(batch.createdAt).toLocaleString("en-US")}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button 
                        onClick={() => handleDelete(batch.id)}
                        disabled={deletingId === batch.id}
                        className="bg-rose-600/10 hover:bg-rose-600 hover:text-white text-rose-500 px-4 py-2 rounded-lg text-xs font-bold transition-colors border border-rose-600/20 disabled:opacity-50"
                      >
                        {deletingId === batch.id ? "Deleting..." : <><Trash2 size={14} className="inline mb-0.5" /> Delete Sheet Completely</>}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
