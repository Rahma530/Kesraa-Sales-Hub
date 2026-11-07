"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { playNotificationSound } from "@/lib/audio";
import dynamic from "next/dynamic";
import { Users, MessageCircle, X, Check, CheckCheck } from "lucide-react";

const EmojiPicker = dynamic(
  () => {
    return import("emoji-picker-react");
  },
  { ssr: false }
);

export type ChatMessage = {
  id: string;
  content: string;
  createdAt: string;
  isRead: boolean;
  sender: {
    id: string;
    name: string;
    role: string;
  };
};

export type Conversation = {
  isGroup: boolean;
  user?: {
    id: string;
    name: string;
    role: string;
    lastActiveAt: string | null;
  };
  group?: {
    id: string;
    name: string;
    _count: { members: number };
  };
  latestMessage: {
    content: string;
    createdAt: string;
    senderId: string;
    isRead: boolean;
  } | null;
};

export type SelectedChat = {
  id: string;
  name: string;
  isGroup: boolean;
  role?: string;
  lastActiveAt?: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  HEAD_OF_SALES: "Head of Sales",
  HEAD_OF_TELE_SALES: "Head of Tele-Sales",
  TELE_SALES: "Tele-Sales",
  SALES: "Sales",
};

export default function ChatBox() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedChat, setSelectedChat] = useState<SelectedChat | null>(null);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"users" | "groups">("users");
  const [pinnedChats, setPinnedChats] = useState<string[]>([]);

  useEffect(() => {
    const savedPins = localStorage.getItem("pinnedChats");
    if (savedPins) {
      try { setPinnedChats(JSON.parse(savedPins)); } catch (e) {}
    }
  }, []);

  const togglePin = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setPinnedChats(prev => {
      const isPinned = prev.includes(id);
      const newPins = isPinned ? prev.filter(p => p !== id) : [...prev, id];
      localStorage.setItem("pinnedChats", JSON.stringify(newPins));
      return newPins;
    });
  };
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Message Options State
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  
  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Emoji Picker State
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const prevLatestMessageIds = useRef<Record<string, string>>({});

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (!selectedChat) fetchConversations();
      else fetchMessages();
      
      const interval = setInterval(() => {
        if (!selectedChat) fetchConversations();
        else fetchMessages();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen, selectedChat]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, selectedChat]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cleanup audio timer
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isRecording]);

  const fetchConversations = async () => {
    try {
      const res = await fetch(`/api/chat?t=${new Date().getTime()}`);
      if (res.ok) {
        const data = await res.json();
        const convs = data.conversations || [];
        
        let hasNewMessages = false;
        convs.forEach((c: any) => {
          if (c.latestMessage) {
            const lastId = prevLatestMessageIds.current[c.id || (c.user?.id) || (c.group?.id)];
            if (lastId && lastId !== c.latestMessage.id && c.latestMessage.senderId !== session?.user?.id) {
              hasNewMessages = true;
            }
            prevLatestMessageIds.current[c.id || (c.user?.id) || (c.group?.id)] = c.latestMessage.id;
          }
        });
        
        if (hasNewMessages) {
          playNotificationSound();
        }
        
        setConversations(convs);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMessages = async () => {
    if (!selectedChat) return;
    try {
      const queryParam = selectedChat.isGroup ? `groupId=${selectedChat.id}` : `userId=${selectedChat.id}`;
      const res = await fetch(`/api/chat?${queryParam}&t=${new Date().getTime()}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const sendMessage = async (e?: React.FormEvent, customContent?: string) => {
    if (e) e.preventDefault();
    
    const contentToSend = customContent || newMessage;
    if (!contentToSend.trim() || !selectedChat) return;

    setIsLoading(true);
    try {
      const bodyData: any = { content: contentToSend };
      if (selectedChat.isGroup) bodyData.groupId = selectedChat.id;
      else bodyData.receiverId = selectedChat.id;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });
      if (res.ok) {
        if (!customContent) setNewMessage("");
        setShowEmojiPicker(false);
        fetchMessages();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e as unknown as React.FormEvent);
    }
  };

  const isOnline = (lastActive: string | null) => {
    if (!lastActive) return false;
    const diff = Date.now() - new Date(lastActive).getTime();
    return diff < 3 * 60 * 1000; // 3 minutes
  };

  const deleteMessage = async (msgId: string) => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    try {
      const res = await fetch(`/api/chat?messageId=${msgId}`, { method: "DELETE" });
      if (res.ok) {
        fetchMessages();
      } else {
        alert("An error occurred while deleting");
      }
    } catch (e) {
      console.error(e);
      alert("Could not connect to the server");
    }
  };

  const updateMessage = async (msgId: string) => {
    if (!editContent.trim()) {
      alert("Message is empty!");
      return;
    }
    try {
      const res = await fetch("/api/chat", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: msgId, content: editContent }),
      });
      if (res.ok) {
        setEditingMessageId(null);
        fetchMessages();
      } else {
        const errorData = await res.json().catch(() => null);
        console.error("Update error:", errorData);
        alert("An error occurred while editing. Please try again.");
      }
    } catch (e) {
      console.error(e);
      alert("Could not connect to the server");
    }
  };

  const copyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
    setActiveMenuId(null);
  };

  // Recording Logic
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64String = reader.result as string;
          sendMessage(undefined, base64String);
        };
        // Stop microphone access
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Please allow microphone access in your browser so you can send voice messages.");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("File size must not exceed 5 MB");
      return;
    }

    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(selectedChat.isGroup ? { groupId: selectedChat.id } : { receiverId: selectedChat.id }),
            content: "Attachment",
            file: { name: file.name, base64 }
          }),
        });
        if (res.ok) fetchMessages();
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsDataURL(file);
    // Reset the input value so the same file can be uploaded again if needed
    e.target.value = "";
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null; // Prevent sending
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div 
        className="cursor-pointer hover:bg-white/5 p-2 rounded-xl transition-colors relative flex items-center justify-center"
        onClick={() => setIsOpen(!isOpen)}
        title="Team Chats"
      >
        <svg width="34" height="34" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-lg">
          <defs>
            <radialGradient id="grad-purple" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#d946ef" />
              <stop offset="100%" stopColor="#7e22ce" />
            </radialGradient>
            <radialGradient id="grad-blue" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </radialGradient>
            <filter id="shadow-blue" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000000" floodOpacity="0.4" />
            </filter>
          </defs>
          
          <path d="M44 14C32.95 14 24 21.16 24 30C24 32.68 24.82 35.2 26.22 37.34C26.06 39.66 24.68 42.52 22.5 44.5C27.5 44.5 31.4 41.5 33.54 39.4C36.06 40.38 38.94 41 42 41C52 41 60 33.84 60 25C60 16.16 53.05 14 44 14Z" fill="url(#grad-purple)"/>
          <path d="M26 26C14.95 26 6 33.87 6 43.58C6 46.52 7.02 49.28 8.78 51.64C8.42 54.2 6.64 57.36 4 59.54C9.52 59.54 13.92 56.24 16.28 53.92C19.18 54.98 22.46 55.66 26 55.66C37.05 55.66 46 47.79 46 38.08C46 28.37 37.05 26 26 26Z" fill="url(#grad-blue)" filter="url(#shadow-blue)" />
          
          <circle cx="16" cy="42" r="2.5" fill="white" opacity="0.9" />
          <circle cx="26" cy="42" r="2.5" fill="white" opacity="0.9" />
          <circle cx="36" cy="42" r="2.5" fill="white" opacity="0.9" />
        </svg>
      </div>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-[350px] sm:w-[400px] h-[550px] bg-[#0b1120] border border-white/10 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
          
          {/* Header */}
          <div className="p-4 border-b border-white/5 bg-[#121927] flex justify-between items-start shrink-0 relative">
            {selectedChat ? (
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setSelectedChat(null)}
                  className="text-slate-400 hover:text-white p-1 ml-1"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 18l-6-6 6-6"/>
                  </svg>
                </button>
                <div className="relative">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full text-white font-bold text-sm ${selectedChat.isGroup ? 'bg-emerald-600' : 'bg-accent'}`}>
                    {selectedChat.isGroup ? <Users size={16} /> : selectedChat.name.charAt(0)}
                  </div>
                  {!selectedChat.isGroup && <span className={`absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-[#121927] ${isOnline(selectedChat.lastActiveAt || null) ? 'bg-green-500' : 'bg-slate-500'}`} />}
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm">{selectedChat.name}</h3>
                  <p className="text-[10px] text-slate-400">{selectedChat.isGroup ? 'Group' : (ROLE_LABELS[selectedChat.role!] || selectedChat.role)}</p>
                </div>
              </div>
            ) : isCreatingGroup ? (
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsCreatingGroup(false)}
                  className="text-slate-400 hover:text-white p-1 ml-1"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 18l-6-6 6-6"/>
                  </svg>
                </button>
                <h3 className="text-white font-bold text-sm">Create New Group</h3>
              </div>
            ) : (
              <div className="flex flex-col w-full gap-3 mt-1">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <MessageCircle size={20} className="text-slate-200" />
                    <h3 className="text-white font-bold text-sm">Messages & Chats</h3>
                  </div>
                  {activeTab === "groups" && (
                    <button onClick={() => setIsCreatingGroup(true)} className="text-xs bg-accent hover:bg-accent text-white px-2 py-1 rounded">
                      + Group
                    </button>
                  )}
                </div>
                <div className="flex bg-[#0b1120] rounded-lg p-1 border border-white/5">
                  <button
                    onClick={() => setActiveTab("users")}
                    className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-colors ${activeTab === "users" ? "bg-accent text-white" : "text-slate-400 hover:text-white"}`}
                  >
                    Employees
                  </button>
                  <button
                    onClick={() => setActiveTab("groups")}
                    className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-colors ${activeTab === "groups" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"}`}
                  >
                    Groups
                  </button>
                </div>
              </div>
            )}
            
            <button onClick={() => setIsOpen(false)} className="absolute top-4 left-4 text-red-500 hover:text-red-400 hover:scale-110 transition-transform p-1">
              <X size={18} />
            </button>
          </div>
          
          {!selectedChat ? (
            isCreatingGroup ? (
              <div className="flex-1 overflow-y-auto bg-[#0b1120] p-4 flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Group Name</label>
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    className="w-full bg-[#121927] border border-white/10 rounded-lg p-2 text-white text-sm"
                    placeholder="e.g. Sales Team"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Select Members</label>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {conversations.filter(c => !c.isGroup && c.user).map(c => (
                      <label key={c.user!.id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded cursor-pointer border border-white/5">
                        <input 
                          type="checkbox" 
                          checked={selectedGroupMembers.includes(c.user!.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedGroupMembers(prev => [...prev, c.user!.id]);
                            else setSelectedGroupMembers(prev => prev.filter(id => id !== c.user!.id));
                          }}
                          className="w-4 h-4 rounded border-slate-600 text-accent focus:ring-accent bg-slate-700"
                        />
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-white font-bold text-sm">
                          {c.user!.name.charAt(0)}
                        </div>
                        <span className="text-white text-sm">{c.user!.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <button 
                  onClick={async () => {
                    if (!newGroupName.trim() || selectedGroupMembers.length === 0) {
                      alert("Please enter a group name and select at least one member");
                      return;
                    }
                    setIsLoading(true);
                    try {
                      const res = await fetch("/api/chat/group", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: newGroupName, memberIds: selectedGroupMembers })
                      });
                      if (res.ok) {
                        setNewGroupName("");
                        setSelectedGroupMembers([]);
                        setIsCreatingGroup(false);
                        const convRes = await fetch(`/api/chat?t=${new Date().getTime()}`);
                        if (convRes.ok) {
                          const data = await convRes.json();
                          setConversations(data.conversations || []);
                        }
                      }
                    } catch (e) {}
                    setIsLoading(false);
                  }}
                  disabled={isLoading}
                  className="w-full bg-accent hover:bg-accent text-white font-bold py-2 rounded-lg mt-auto disabled:opacity-50"
                >
                  {isLoading ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            ) : (
            /* Conversations List */
            <div className="flex-1 overflow-y-auto bg-[#0b1120] flex flex-col">
              <div className="p-3 border-b border-white/5 bg-[#0f1623] shrink-0">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for a user or group..."
                    className="w-full bg-[#1a2235] text-white text-sm rounded-lg pl-10 pr-4 py-2 border border-white/10 focus:outline-none focus:border-accent"
                    dir="rtl"
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <p className="text-center text-slate-500 text-sm mt-10">No other users found.</p>
              ) : (
                conversations
                  .filter(conv => (activeTab === "users" ? !conv.isGroup : conv.isGroup))
                  .filter(conv => {
                    const name = conv.isGroup ? conv.group!.name : conv.user!.name;
                    return name.toLowerCase().includes(searchQuery.toLowerCase());
                  })
                  .sort((a, b) => {
                    const aId = a.isGroup ? a.group!.id : a.user!.id;
                    const bId = b.isGroup ? b.group!.id : b.user!.id;
                    const aPinned = pinnedChats.includes(aId);
                    const bPinned = pinnedChats.includes(bId);
                    if (aPinned && !bPinned) return -1;
                    if (!aPinned && bPinned) return 1;
                    return 0; // maintain original sort (date)
                  })
                  .map((conv) => {
                  const id = conv.isGroup ? conv.group!.id : conv.user!.id;
                  const name = conv.isGroup ? conv.group!.name : conv.user!.name;
                  const isPinned = pinnedChats.includes(id);
                  return (
                  <div 
                    key={id} 
                    className={`p-4 border-b transition-colors cursor-pointer flex items-center justify-between ${isPinned ? 'bg-accent-deep/20 border-accent/30' : 'border-white/5 hover:bg-white/5'}`}
                    onClick={() => setSelectedChat({
                      id, name, isGroup: conv.isGroup,
                      role: conv.isGroup ? undefined : conv.user!.role,
                      lastActiveAt: conv.isGroup ? undefined : conv.user!.lastActiveAt
                    })}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="relative shrink-0">
                        <div className={`flex h-11 w-11 items-center justify-center rounded-full text-white font-bold text-lg border border-white/10 ${conv.isGroup ? 'bg-emerald-800' : 'bg-slate-800'}`}>
                          {conv.isGroup ? <Users size={16} /> : name.charAt(0)}
                        </div>
                        {!conv.isGroup && <span className={`absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-[#0b1120] ${isOnline(conv.user!.lastActiveAt) ? 'bg-green-500' : 'bg-slate-500'}`} />}
                      </div>
                      <div className="truncate text-right">
                        <h4 className="text-sm font-bold text-white truncate flex items-center gap-2">
                          {name}
                        </h4>
                        {conv.latestMessage && (
                          <p className="text-xs text-slate-400 truncate mt-1" dir="rtl">
                            {conv.latestMessage.content.startsWith("data:audio")
                              ? "Voice message"
                              : conv.latestMessage.content.startsWith("[FILE:") ? "Attachment" : conv.latestMessage.content}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-left mr-2 flex flex-col items-end gap-1">
                      <button 
                        onClick={(e) => togglePin(e, id)} 
                        className={`hover:scale-110 transition-transform ${isPinned ? 'opacity-100' : 'opacity-30 hover:opacity-100'}`}
                        title={isPinned ? 'Unpin' : 'Pin conversation'}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill={isPinned ? "#ef4444" : "currentColor"} stroke={isPinned ? "#ef4444" : "currentColor"} className={isPinned ? "" : "text-slate-400"} strokeWidth="2">
                          <path d="M12 2L12 10" />
                          <path d="M8 10L16 10" />
                          <path d="M10 10L10 14" />
                          <path d="M14 10L14 14" />
                          <path d="M6 14L18 14" />
                          <path d="M12 14L12 22" />
                        </svg>
                      </button>
                      {conv.latestMessage && (
                        <span className="text-[10px] text-slate-500">
                          {new Date(conv.latestMessage.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                  );
                })
              )}
              </div>
            </div>
            )
          ) : (
            /* Active Chat View */
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0b1120]" ref={messagesContainerRef}>
                {messages.length === 0 ? (
                  <p className="text-center text-slate-500 text-sm mt-10">No previous messages. Start the conversation!</p>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.sender.id === session?.user?.id;
                    const isAudio = msg.content.startsWith("data:audio");
                    const isFile = msg.content.startsWith("[FILE:");
                    
                    let fileUrl = "", fileName = "", isImage = false;
                    if (isFile) {
                      const match = msg.content.match(/\[FILE:(.*?)\](.*)/);
                      if (match) {
                        fileUrl = match[1];
                        fileName = match[2];
                        isImage = !!fileUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i);
                      }
                    }
                    
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group mb-2`}>
                        <div className={`flex items-start gap-2 max-w-[85%] relative ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                          
                          <div className={`p-3 rounded-2xl ${isMe ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-[#1c2438] text-slate-200 rounded-bl-sm'} relative min-w-[80px]`}>
                            {editingMessageId === msg.id ? (
                              <div className="flex flex-col gap-2">
                                <textarea 
                                  value={editContent} 
                                  onChange={e => setEditContent(e.target.value)} 
                                  className="bg-black/20 text-white rounded p-1.5 text-sm resize-none outline-none w-full min-w-[150px]"
                                  autoFocus
                                  dir="rtl"
                                />
                                <div className="flex justify-end gap-2">
                                  <button onClick={() => setEditingMessageId(null)} className="text-[10px] text-white/70 hover:text-white">Cancel</button>
                                  <button onClick={() => updateMessage(msg.id)} className="text-[10px] bg-white/20 px-2 py-0.5 rounded hover:bg-white/30">Save</button>
                                </div>
                              </div>
                            ) : isAudio ? (
                              <audio controls src={msg.content} className="max-w-[200px] h-10" />
                            ) : isFile ? (
                              <div className="flex flex-col gap-1">
                                {isImage ? (
                                  <a href={fileUrl} target="_blank" rel="noreferrer">
                                    <img src={fileUrl} alt={fileName} className="max-w-[200px] max-h-[200px] rounded object-cover border border-white/10" />
                                  </a>
                                ) : (
                                  <a href={fileUrl} target="_blank" download className="flex items-center gap-2 underline hover:text-blue-200">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>
                                    <span className="truncate max-w-[150px] text-xs font-bold" dir="ltr">{fileName}</span>
                                  </a>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                            )}
                          </div>

                          {/* Options Menu Button */}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity relative mt-2">
                            <button onClick={() => setActiveMenuId(activeMenuId === msg.id ? null : msg.id)} className="text-slate-400 hover:text-white p-1">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="12" cy="5" r="2"/>
                                <circle cx="12" cy="12" r="2"/>
                                <circle cx="12" cy="19" r="2"/>
                              </svg>
                            </button>
                            {activeMenuId === msg.id && (
                              <div className={`absolute top-6 w-24 bg-[#1a2235] border border-white/10 rounded-lg shadow-xl z-10 py-1 ${isMe ? 'left-0' : 'right-0'}`}>
                                {!isAudio && (
                                  <button onClick={() => copyMessage(msg.content)} className="w-full text-right px-3 py-1.5 text-xs text-white hover:bg-white/5">Copy</button>
                                )}
                                {isMe && !isAudio && (
                                  <button onClick={() => { setEditingMessageId(msg.id); setEditContent(msg.content); setActiveMenuId(null); }} className="w-full text-right px-3 py-1.5 text-xs text-white hover:bg-white/5">Edit</button>
                                )}
                                {isMe && (
                                  <button onClick={() => { deleteMessage(msg.id); setActiveMenuId(null); }} className="w-full text-right px-3 py-1.5 text-xs text-red-400 hover:bg-white/5">Delete</button>
                                )}
                              </div>
                            )}
                          </div>

                        </div>
                        <div className="flex items-center gap-1 mt-1 px-1">
                          <span className="text-[10px] text-slate-500">
                            {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {isMe && (
                            <span className={`flex items-center ${msg.isRead ? 'text-blue-500' : 'text-slate-500'}`}>
                              {msg.isRead ? <CheckCheck size={13} /> : <Check size={13} />}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Input Area */}
              <div className="p-3 border-t border-white/5 bg-[#121927] shrink-0 relative">
                {/* Emoji Picker Container */}
                {showEmojiPicker && (
                  <div className="absolute bottom-[70px] right-2 z-50 shadow-2xl rounded-lg overflow-hidden border border-white/10" dir="ltr">
                    <EmojiPicker 
                      onEmojiClick={(emojiData: any) => {
                        setNewMessage(prev => prev + emojiData.emoji);
                      }}
                      theme={"dark" as any}
                    />
                  </div>
                )}
                <form onSubmit={sendMessage} className="flex gap-1.5 items-end" dir="rtl">
                  
                  {isRecording ? (
                    <div className="flex-1 flex items-center gap-3 bg-red-950/30 border border-red-500/30 rounded-lg p-2 h-[40px] justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-3 w-3 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                        </span>
                        <span className="text-red-400 text-sm font-bold font-mono">
                          {Math.floor(recordingTime / 60).toString().padStart(2, '0')}:{(recordingTime % 60).toString().padStart(2, '0')}
                        </span>
                      </div>
                      <span className="text-slate-300 text-xs">Recording audio...</span>
                      <button
                        type="button"
                        onClick={cancelRecording}
                        className="text-red-400 hover:text-red-300 text-xs underline"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Right side icons */}
                      <div className="flex gap-0.5 shrink-0">
                        <button
                          type="button"
                          title="Add emoji"
                          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                          className={`text-slate-400 hover:text-white hover:bg-white/5 rounded-full transition-colors flex items-center justify-center w-[36px] h-[36px] ${showEmojiPicker ? 'text-white bg-white/10' : ''}`}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                            <line x1="9" y1="9" x2="9.01" y2="9"></line>
                            <line x1="15" y1="9" x2="15.01" y2="9"></line>
                          </svg>
                        </button>
                        <label
                          title="Attach a file or image"
                          className="cursor-pointer text-slate-400 hover:text-white hover:bg-white/5 rounded-full transition-colors flex items-center justify-center w-[36px] h-[36px]"
                        >
                          <input type="file" className="hidden" onChange={handleFileUpload} />
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                          </svg>
                        </label>
                      </div>

                      {/* Text Area */}
                      <textarea
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a message..."
                        className="flex-1 bg-[#1a2235] border border-white/10 rounded-lg py-2.5 px-3 text-sm text-white resize-none focus:outline-none focus:border-blue-500 h-[40px] overflow-hidden"
                        rows={1}
                        dir="rtl"
                        disabled={isLoading}
                      />
                    </>
                  )}
                  
                  {/* Left side icons */}
                  <div className="flex gap-0.5 shrink-0">
                    {isRecording ? (
                      <button
                        type="button"
                        title="Send voice clip"
                        onClick={stopRecording}
                        className="text-white hover:text-red-100 bg-red-600 hover:bg-red-700 rounded-full transition-colors flex items-center justify-center w-[36px] h-[36px] shrink-0"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13"></line>
                          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                      </button>
                    ) : (
                      <button
                        type="button"
                        title="Record a voice message"
                        onClick={startRecording}
                        disabled={isLoading || newMessage.trim().length > 0}
                        className="text-slate-400 hover:text-blue-400 hover:bg-white/5 rounded-full transition-colors flex items-center justify-center w-[36px] h-[36px] shrink-0 disabled:opacity-30"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                          <line x1="12" y1="19" x2="12" y2="22"></line>
                        </svg>
                      </button>
                    )}

                    {!isRecording && (
                      <button
                        type="submit"
                        disabled={isLoading || !newMessage.trim()}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors flex items-center justify-center w-[36px] h-[36px] shrink-0 disabled:opacity-50"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="-ml-1">
                          <line x1="22" y1="2" x2="11" y2="13"></line>
                          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
