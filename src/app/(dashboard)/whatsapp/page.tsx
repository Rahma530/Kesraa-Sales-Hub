"use client";

import { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";

type WaState = {
  status: "DISCONNECTED" | "INITIALIZING" | "QR_READY" | "CONNECTED";
  qrCodeBase64: string | null;
};

export default function WhatsAppSetupPage() {
  const [waState, setWaState] = useState<WaState>({ status: "DISCONNECTED", qrCodeBase64: null });
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/whatsapp/status?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setWaState(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll every 3 seconds to check for QR updates or connection changes
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleConnect = async () => {
    setLoading(true);
    try {
      await fetch("/api/whatsapp/status", { method: "POST" });
      await fetchStatus();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardShell title="WhatsApp Settings">
      <div className="max-w-2xl mx-auto glass-panel p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 text-green-500 mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Link WhatsApp Account (WhatsApp Web)</h2>
          <p className="text-slate-400">Link your phone to the system to send messages to leads directly with one click.</p>
        </div>

        <div className="bg-[#121927] border border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[300px]">
          
          {waState.status === "DISCONNECTED" && (
            <div className="text-center">
              <p className="text-slate-300 mb-6 font-medium">WhatsApp is not connected right now.</p>
              <button 
                onClick={handleConnect}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mx-auto"
              >
                {loading ? "Initializing connection..." : "Generate QR Code to Link"}
              </button>
            </div>
          )}

          {waState.status === "INITIALIZING" && (
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-green-400 font-bold">Preparing QR code... please wait</p>
              <p className="text-sm text-slate-400 mt-2">This may take a few seconds</p>
            </div>
          )}

          {waState.status === "QR_READY" && waState.qrCodeBase64 && (
            <div className="text-center">
              <h3 className="text-xl font-bold text-white mb-6">Scan to log in</h3>
              <div className="bg-white p-4 rounded-2xl inline-block mb-6 shadow-xl shadow-green-900/20 border-4 border-green-500/30">
                <Image src={waState.qrCodeBase64} alt="WhatsApp QR Code" width={256} height={256} />
              </div>
              <div className="text-right text-sm text-slate-300 space-y-3 max-w-sm mx-auto bg-white/5 p-4 rounded-xl border border-white/10">
                <p>1️⃣ Open the <strong>WhatsApp</strong> app on your phone</p>
                <p>2. Tap <strong>Menu</strong> (⋮) or <strong>Settings</strong> and choose <strong>Linked Devices</strong></p>
                <p>3️⃣ Tap <strong>Link a Device</strong> and point your camera at the code above</p>
              </div>
            </div>
          )}

          {waState.status === "CONNECTED" && (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/20 text-green-500 mb-6 border-2 border-green-500">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-green-400 mb-2 flex items-center justify-center gap-2"><CheckCircle2 size={24} /> Linked successfully!</h3>
              <p className="text-slate-300">The system is now connected to your WhatsApp account.</p>
              <p className="text-sm text-slate-500 mt-2">You can now go to the leads table and send messages with one click.</p>
            </div>
          )}
          
        </div>
      </div>
    </DashboardShell>
  );
}
