import { ShieldAlert } from "lucide-react";

export default function Unauthorized() {
  return (
    <div className="flex min-h-screen items-center justify-center text-center">
      <div className="glass-panel p-10">
        <ShieldAlert size={40} className="mx-auto mb-3 text-rose-400" />
        <h1 className="text-lg font-bold text-white">You are not authorized to access this page</h1>
        <p className="mt-1 text-sm text-slate-400">Contact admin if you need additional access</p>
      </div>
    </div>
  );
}
