"use client";

import { useState } from "react";
import { MessageCircle, Send, Loader2 } from "lucide-react";

interface QAEntry {
  question: string;
  answer: string;
}

// Lets the Sales employee ask free-form questions about one specific
// meeting ("إيه اللي قاله عن السعر؟") and get an answer grounded in that
// meeting's saved transcript, instead of re-reading the whole transcript
// themselves. Keeps its own small Q&A history so follow-up questions
// ("و بعدين؟") have context, sent along with each new question.
export default function MeetingAskPanel({ meetingId }: { meetingId: string }) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<QAEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "حصل خطأ، حاولي تاني");
        return;
      }
      setHistory((prev) => [...prev, { question: q, answer: data.answer }]);
      setQuestion("");
    } catch {
      setError("مش قادرة أوصل للسيرفر دلوقتي");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div dir="rtl" className="border-t border-white/5 pt-3 mt-3">
      <p className="text-[10px] text-slate-400 mb-2 flex items-center gap-1.5">
        <MessageCircle size={13} /> اسألي عن أي نقطة في الاجتماع
      </p>

      {history.length > 0 && (
        <div className="space-y-2 mb-2 max-h-56 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
          {history.map((qa, i) => (
            <div key={i} className="space-y-1">
              <p className="text-[11px] font-bold text-accent-soft bg-accent/10 px-2.5 py-1.5 rounded-lg inline-block">
                {qa.question}
              </p>
              <p className="text-[12px] text-slate-300 leading-relaxed bg-[#0b101a] p-2.5 rounded-lg border border-white/5 whitespace-pre-wrap">
                {qa.answer}
              </p>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-[11px] text-rose-400 mb-2">{error}</p>}

      <form onSubmit={handleAsk} className="flex items-center gap-2">
        <input
          type="text"
          className="input-field text-xs py-2"
          placeholder="مثلاً: قال إمتى عايز يبدأ؟"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="shrink-0 bg-accent/20 hover:bg-accent/30 text-accent-soft rounded-lg w-9 h-9 flex items-center justify-center transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </form>
    </div>
  );
}
