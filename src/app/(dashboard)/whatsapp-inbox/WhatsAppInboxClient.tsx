"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { MessageCircle, Users, CheckCheck, X } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
type Chat = {
  id: string;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessage: { body: string; fromMe: boolean; timestamp: number } | null;
  timestamp: number;
};

type Message = {
  id: string;
  body: string;
  fromMe: boolean;
  timestamp: number;
  type: string;
};

type WaStatus = "DISCONNECTED" | "INITIALIZING" | "QR_READY" | "CONNECTED";

type SlotInfo = {
  id: string;      // "slot1", "slot2", ...
  label: string;   // "WhatsApp 1", "WhatsApp 2", ...
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
function formatChatTime(ts: number) {
  const d = new Date(ts * 1000);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
const COLORS = ["bg-accent", "bg-emerald-500", "bg-rose-500", "bg-amber-500", "bg-sky-500", "bg-purple-500"];
function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}

const MAX_SLOTS = 5;

// ─── Single WhatsApp Session Panel ───────────────────────────────────────────
function WhatsAppPanel({ slotId, phoneQuery }: { slotId: string; phoneQuery: string | null }) {
  const [waStatus, setWaStatus] = useState<WaStatus>("DISCONNECTED");
  const [waQr, setWaQr] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [search, setSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const qs = `slotId=${slotId}`;

  // Initial load
  useEffect(() => {
    const init = async () => {
      try {
        const r = await fetch(`/api/whatsapp/status?${qs}`);
        if (r.ok) { const d = await r.json(); setWaStatus(d.status); setWaQr(d.qrCodeBase64); }
      } catch {}
    };
    init();
  }, [qs]);

  // Load chats
  const loadChats = useCallback(async () => {
    if (waStatus !== "CONNECTED") return;
    setLoadingChats(true);
    try {
      const r = await fetch(`/api/whatsapp/chats?${qs}`);
      if (r.ok) { const d = await r.json(); setChats(d.chats || []); }
    } catch {} finally { setLoadingChats(false); }
  }, [waStatus, qs]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // Auto-select from URL phone param
  useEffect(() => {
    if (phoneQuery && chats.length > 0 && !selectedChat) {
      let formatted = phoneQuery.replace(/[^0-9]/g, "");
      if (formatted.startsWith("00")) formatted = formatted.substring(2);
      if (formatted.startsWith("01") && formatted.length === 11) formatted = "2" + formatted;
      else if (formatted.startsWith("05") && formatted.length === 10) formatted = "966" + formatted.substring(1);
      else if (formatted.startsWith("5") && formatted.length === 9) formatted = "966" + formatted;
      const matchingChat = chats.find((c) => c.id.includes(formatted));
      if (matchingChat) {
        setSelectedChat(matchingChat);
      } else {
        setSelectedChat({ id: `${formatted}@c.us`, name: phoneQuery, isGroup: false, unreadCount: 0, lastMessage: null, timestamp: Math.floor(Date.now() / 1000) });
      }
    }
  }, [phoneQuery, chats, selectedChat]);

  // Load messages
  const loadMessages = useCallback(async () => {
    if (!selectedChat) return;
    try {
      const r = await fetch(`/api/whatsapp/chats/${encodeURIComponent(selectedChat.id)}?${qs}`);
      if (r.ok) { const d = await r.json(); setMessages(d.messages || []); }
    } catch {}
  }, [selectedChat, qs]);

  useEffect(() => {
    if (!selectedChat) return;
    loadMessages();
  }, [loadMessages, selectedChat]);

  // SSE (Server-Sent Events) for real-time updates without polling
  useEffect(() => {
    const eventSource = new EventSource(`/api/whatsapp/events?${qs}`);
    
    eventSource.addEventListener("status", (e) => {
      const data = JSON.parse(e.data);
      setWaStatus(data.status);
      if (data.qrCodeBase64) setWaQr(data.qrCodeBase64);
    });

    eventSource.addEventListener("chats_update", () => {
      loadChats();
    });

    eventSource.addEventListener("message", (e) => {
      const data = JSON.parse(e.data);
      setSelectedChat(prevSelected => {
        if (prevSelected && data.chatId === prevSelected.id) {
          setMessages(prev => {
            // Prevent duplicates
            if (prev.some(m => m.id === data.id)) return prev;
            return [...prev, data];
          });
        }
        return prevSelected;
      });
    });

    return () => eventSource.close();
  }, [qs, loadChats]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleLogout = async () => {
    if (!confirm("Are you sure you want to log out of WhatsApp?")) return;
    try {
      setWaStatus("INITIALIZING");
      await fetch(`/api/whatsapp/logout?${qs}`, { method: "POST" });
      setWaStatus("DISCONNECTED");
      setWaQr(null);
      setChats([]);
      setSelectedChat(null);
      setMessages([]);
    } catch { alert("An error occurred while logging out"); }
  };

  const handleSend = async () => {
    if (!selectedChat || !newMsg.trim()) return;
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: Message = { id: tempId, body: newMsg, fromMe: true, timestamp: Math.floor(Date.now() / 1000), type: "chat" };
    setMessages((prev) => [...prev, optimisticMsg]);
    const messageToSend = newMsg;
    setNewMsg("");
    setSending(true);
    try {
      await fetch(`/api/whatsapp/chats/${encodeURIComponent(selectedChat.id)}?${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageToSend }),
      });
      await loadMessages();
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally { setSending(false); }
  };

  const filtered = chats.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  // ── NOT CONNECTED ──
  if (waStatus !== "CONNECTED") {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-[#121927] border border-white/10 rounded-2xl p-8 text-center shadow-2xl">
          {waStatus === "DISCONNECTED" && (
            <>
              <MessageCircle size={56} className="mb-4 text-slate-500" />
              <h2 className="text-xl font-bold text-white mb-2">WhatsApp Not Linked</h2>
              <p className="text-slate-400 mb-6">Click to generate a QR code and link your account</p>
              <button
                id={`btn-generate-qr-${slotId}`}
                onClick={() => fetch(`/api/whatsapp/status?${qs}`, { method: "POST" })}
                className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-8 rounded-xl transition-all duration-200 shadow-lg hover:shadow-green-500/30 hover:scale-105"
              >
                Generate QR Code
              </button>
            </>
          )}
          {waStatus === "INITIALIZING" && (
            <>
              <div className="w-14 h-14 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-green-400 font-bold text-lg">Preparing QR code...</p>
              <p className="text-sm text-slate-400 mt-2">Please wait a few seconds</p>
            </>
          )}
          {waStatus === "QR_READY" && waQr && (
            <>
              <h2 className="text-xl font-bold text-white mb-4">Scan the code from your phone</h2>
              <div className="bg-white p-3 rounded-2xl inline-block mb-4 shadow-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={waQr} alt="QR" width={240} height={240} />
              </div>
              <div className="text-right text-sm text-slate-300 space-y-2 bg-white/5 p-4 rounded-xl border border-white/10">
                <p>1️⃣ Open <strong>WhatsApp</strong> on your phone</p>
                <p>2. Settings → <strong>Linked Devices</strong></p>
                <p>3️⃣ Tap <strong>Link a Device</strong> and scan the code</p>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── CONNECTED INBOX ──
  return (
    <div className="flex gap-0 rounded-b-2xl overflow-hidden border border-t-0 border-white/10 shadow-2xl w-full flex-1 bg-[#121927] min-h-0" style={{ height: "calc(100vh - 220px)" }}>
      {/* Sidebar */}
      <div className="w-80 min-w-[300px] bg-[#0f1523] border-l border-white/10 flex flex-col z-10 flex-shrink-0 h-full">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <span className="text-white font-bold flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse inline-block" />
            Chats
          </span>
          <div className="flex items-center gap-3">
            <button onClick={loadChats} className="text-slate-400 hover:text-white text-xs transition-colors">
              {loadingChats ? "⟳ Loading..." : "⟳ Refresh"}
            </button>
            <button onClick={handleLogout} className="text-rose-400 hover:text-rose-300 text-xs transition-colors border border-rose-500/30 px-2 py-1 rounded-md bg-rose-500/10">
              Log out
            </button>
          </div>
        </div>
        <div className="p-3 border-b border-white/5">
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full bg-[#182032] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent/50 transition-colors"
          />
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filtered.length === 0
            ? <p className="text-center text-slate-500 text-sm py-8">No chats found</p>
            : filtered.map((chat) => (
              <button key={chat.id} onClick={() => { setSelectedChat(chat); setMessages([]); }}
                className={`w-full flex items-center gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors text-right ${selectedChat?.id === chat.id ? "bg-white/10 border-r-2 border-r-green-500" : ""}`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${avatarColor(chat.id)}`}>
                  {chat.isGroup ? <Users size={18} /> : getInitials(chat.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white text-[15px] font-semibold truncate">{chat.name}</span>
                    {chat.timestamp > 0 && <span className="text-slate-500 text-[11px] flex-shrink-0 mr-2">{formatChatTime(chat.timestamp)}</span>}
                  </div>
                  {chat.lastMessage && (
                    <p className="text-slate-400 text-xs truncate flex items-center gap-1">
                      {chat.lastMessage.fromMe && <CheckCheck size={12} className="text-green-400" />}
                      {chat.lastMessage.body}
                    </p>
                  )}
                </div>
                {chat.unreadCount > 0 && <span className="bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-full">{chat.unreadCount}</span>}
              </button>
            ))
          }
        </div>
      </div>

      {/* Messages Area */}
      {!selectedChat ? (
        <div className="flex-1 bg-[#121927] flex items-center justify-center min-w-0 h-full">
          <div className="text-center text-slate-500">
            <MessageCircle size={56} className="mb-4 text-slate-500" />
            <p className="text-xl font-bold text-white mb-2">WhatsApp Web</p>
            <p className="text-sm">Select a chat to start messaging</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col bg-[#121927] relative min-w-0 overflow-hidden h-full min-h-0">
          {/* Chat Header */}
          <div className="h-[72px] min-h-[72px] p-4 border-b border-white/10 flex items-center gap-4 bg-[#0f1523] z-10 flex-shrink-0">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${avatarColor(selectedChat.id)}`}>
              {selectedChat.isGroup ? <Users size={18} /> : getInitials(selectedChat.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white font-bold text-[15px] truncate">{selectedChat.name}</p>
              <p className="text-slate-400 text-[11px]" dir="ltr">{selectedChat.id.split("@")[0]}</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-4 bg-[#121927] custom-scrollbar w-full min-h-0">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.fromMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] sm:max-w-[75%] px-4 py-2.5 rounded-2xl text-sm shadow-md break-words ${msg.fromMe ? "bg-[#005c4b] text-white rounded-br-sm" : "bg-[#202c33] text-white rounded-bl-sm"}`}>
                  <p className="whitespace-pre-wrap leading-relaxed mb-1 break-words">{msg.body || <em className="opacity-50">[Media]</em>}</p>
                  <div className="flex items-center justify-end gap-1">
                    <p className={`text-[10px] ${msg.fromMe ? "text-green-200" : "text-slate-400"}`}>{formatTime(msg.timestamp)}</p>
                    {msg.fromMe && <CheckCheck size={12} className="text-blue-400" />}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-white/10 bg-[#0f1523] z-10 flex-shrink-0">
            <div className="flex gap-3 items-center">
              <input
                type="text" value={newMsg} onChange={(e) => setNewMsg(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSend(); } }}
                placeholder="Type a message..."
                className="flex-1 bg-[#182032] border border-white/10 rounded-xl px-4 py-3.5 text-white text-[15px] placeholder-slate-500 focus:outline-none focus:border-[#00a884] transition-colors shadow-inner"
              />
              <button onClick={handleSend} disabled={sending || !newMsg.trim()}
                className="bg-[#00a884] hover:bg-[#008f6f] text-white p-3.5 rounded-xl font-bold transition-all duration-200 disabled:opacity-50 flex items-center justify-center shadow-lg hover:scale-105"
              >
                {sending ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                    <path d="M1.101 21.757 23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WhatsAppInboxClient() {
  const searchParams = useSearchParams();
  const phoneQuery = searchParams.get("phone");

  const [mounted, setMounted] = useState(false);
  const [slots, setSlots] = useState<SlotInfo[]>([{ id: "slot1", label: "WhatsApp 1" }]);
  const [activeSlot, setActiveSlot] = useState("slot1");

  useEffect(() => { setMounted(true); }, []);

  const addSlot = () => {
    if (slots.length >= MAX_SLOTS) return;
    const newIndex = slots.length + 1;
    const newSlot: SlotInfo = { id: `slot${newIndex}`, label: `WhatsApp ${newIndex}` };
    setSlots((prev) => [...prev, newSlot]);
    setActiveSlot(newSlot.id);
  };

  const removeSlot = (slotId: string) => {
    if (slots.length === 1) return; // keep at least one
    const updated = slots.filter((s) => s.id !== slotId);
    if (updated.length === 0) return; // safety guard
    setSlots(updated);
    if (activeSlot === slotId) setActiveSlot(updated[0].id);
  };

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-full w-full max-w-6xl mx-auto" style={{ minHeight: "calc(100vh - 160px)" }}>
      {/* Tabs Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {slots.map((slot) => (
          <div key={slot.id} className="flex items-center">
            <button
              id={`tab-${slot.id}`}
              onClick={() => setActiveSlot(slot.id)}
              className={`flex items-center gap-2 px-5 py-3 rounded-t-xl text-sm font-semibold transition-all duration-200 border border-b-0
                ${activeSlot === slot.id
                  ? "bg-[#121927] border-white/20 text-white shadow-lg"
                  : "bg-[#0a0f1a] border-transparent text-slate-500 hover:text-slate-300 hover:bg-[#0f1523]"
                }`}
            >
              <MessageCircle size={14} />
              <span>{slot.label}</span>
              {slots.length > 1 && (
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); removeSlot(slot.id); }}
                  className="ml-1 text-slate-500 hover:text-rose-400 transition-colors text-xs leading-none"
                  title="Remove"
                >
                  <X size={12} />
                </span>
              )}
            </button>
          </div>
        ))}

        {/* Add new slot button */}
        {slots.length < MAX_SLOTS && (
          <button
            id="btn-add-whatsapp-slot"
            onClick={addSlot}
            className="flex items-center gap-2 px-4 py-3 rounded-t-xl text-sm font-semibold text-slate-400 hover:text-white border border-transparent hover:border-white/10 hover:bg-[#0f1523] transition-all duration-200"
            title="Add a new WhatsApp number"
          >
            <span className="text-lg leading-none">+</span>
            <span>Add Number</span>
          </button>
        )}
      </div>

      {/* Active Panel */}
      <div className="flex-1 flex flex-col min-h-0">
        {slots.map((slot) => (
          <div key={slot.id} className={activeSlot === slot.id ? "flex flex-col flex-1 min-h-0" : "hidden"}>
            <WhatsAppPanel slotId={slot.id} phoneQuery={activeSlot === slot.id ? phoneQuery : null} />
          </div>
        ))}
      </div>
    </div>
  );
}
