"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn, timeAgo } from "@/lib/utils";
import { apiUrl } from "@/lib/org";
import {
  Search, Plus, Mail, MessageSquare, Phone, Star, Archive,
  MoreHorizontal, Send, Loader2, Inbox,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";

type Activity = {
  id: string; type: string; subject: string; body: string | null;
  contactId: string | null; createdAt: string; outcome: string | null;
};

type Contact = {
  id: string; firstName: string; lastName: string | null;
  email: string | null; phone: string | null; jobTitle: string | null;
  status: string; score: number;
};

type Conversation = {
  contactId: string | null;
  contactName: string;
  lastActivity: Activity;
  activities: Activity[];
};

const CHANNEL_ICON: Record<string, typeof Mail> = {
  email: Mail, chat: MessageSquare, sms: MessageSquare,
  call: Phone, whatsapp: MessageSquare,
};

export default function InboxPage() {
  const [activities,   setActivities]   = useState<Activity[]>([]);
  const [contacts,     setContacts]     = useState<Contact[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [conversations,setConversations]= useState<Conversation[]>([]);
  const [selected,     setSelected]     = useState<Conversation | null>(null);
  const [reply,        setReply]        = useState("");
  const [sending,      setSending]      = useState(false);
  const [sendMode,     setSendMode]     = useState<"log" | "email">("log");

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(apiUrl("/api/activities")).then(r => r.json()),
      fetch(apiUrl("/api/contacts")).then(r => r.json()),
    ]).then(([actsRes, contsRes]) => {
      const acts: Activity[] = actsRes.data ?? [];
      const conts: Contact[] = contsRes.data ?? [];
      setActivities(acts);
      setContacts(conts);

      const contactMap = new Map(conts.map(c => [c.id, c]));

      // Group activities by contactId
      const groups = new Map<string, { contactId: string | null; activities: Activity[] }>();
      for (const act of acts) {
        const key = act.contactId ?? "__no_contact__";
        if (!groups.has(key)) groups.set(key, { contactId: act.contactId, activities: [] });
        groups.get(key)!.activities.push(act);
      }

      const convList: Conversation[] = Array.from(groups.values())
        .filter(g => g.activities.length > 0)
        .map(g => {
          const sorted = [...g.activities].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          const contact = g.contactId ? contactMap.get(g.contactId) : undefined;
          const name = contact ? `${contact.firstName} ${contact.lastName ?? ""}`.trim() : "Unknown Contact";
          return { contactId: g.contactId, contactName: name, lastActivity: sorted[0], activities: sorted };
        })
        .sort((a, b) => new Date(b.lastActivity.createdAt).getTime() - new Date(a.lastActivity.createdAt).getTime());

      setConversations(convList);
      if (convList.length > 0 && !selected) setSelected(convList[0]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [selected]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedContact = selected?.contactId ? contacts.find(c => c.id === selected.contactId) : null;

  async function handleSend() {
    if (!reply.trim() || !selected) return;
    setSending(true);
    const res = await fetch(apiUrl("/api/activities"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "email",
        subject: `Re: ${selected.lastActivity.subject}`,
        body: reply.trim(),
        contactId: selected.contactId,
        sendEmail: sendMode === "email",
      }),
    });
    if (res.ok) {
      const j = await res.json();
      const newAct: Activity = j.data;
      setActivities(prev => [newAct, ...prev]);
      setConversations(prev => prev.map(c =>
        c.contactId === selected.contactId
          ? { ...c, lastActivity: newAct, activities: [newAct, ...c.activities] }
          : c
      ));
      setSelected(prev => prev ? { ...prev, lastActivity: newAct, activities: [newAct, ...prev.activities] } : prev);
      setReply("");
    }
    setSending(false);
  }

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-3.5rem)] animate-fade-in">
        {/* Conversation List */}
        <div className="w-80 shrink-0 border-r border-surface-800 flex flex-col">
          <div className="p-3 border-b border-surface-800 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-surface-200">Inbox</h2>
              <div className="flex items-center gap-1">
                {conversations.length > 0 && <Badge variant="info" size="sm">{conversations.length}</Badge>}
                <button className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-800 transition-all">
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-600 pointer-events-none" />
              <input type="text" placeholder="Search conversations..."
                className="w-full h-7 rounded-lg border border-surface-700 bg-surface-900 pl-8 pr-2 text-xs text-surface-200 placeholder:text-surface-600 focus:outline-none focus:border-brand-500" />
            </div>
            <div className="flex items-center gap-1">
              {["All", "Unread", "Starred", "Mine"].map(tab => (
                <button key={tab} className="flex-1 h-6 rounded-md text-[10px] text-surface-500 hover:text-surface-300 hover:bg-surface-800 transition-all">{tab}</button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 size={16} className="animate-spin text-surface-500" /></div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 gap-2 text-center">
                <Inbox size={24} className="text-surface-600" />
                <p className="text-xs text-surface-400">No conversations yet</p>
                <p className="text-[11px] text-surface-600">Log activities in your CRM to see them here</p>
              </div>
            ) : (
              <div className="divide-y divide-surface-800/50">
                {conversations.map(conv => {
                  const Icon = CHANNEL_ICON[conv.lastActivity.type] ?? Mail;
                  return (
                    <button key={conv.contactId ?? conv.lastActivity.id}
                      onClick={() => setSelected(conv)}
                      className={cn("w-full text-left p-3 hover:bg-surface-800/40 transition-colors",
                        selected?.contactId === conv.contactId && "bg-brand-500/8 border-l-2 border-brand-500")}>
                      <div className="flex items-start gap-2.5">
                        <Avatar name={conv.contactName} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-medium text-surface-100 truncate">{conv.contactName}</span>
                            <span className="text-[10px] text-surface-600 shrink-0 ml-1">{timeAgo(conv.lastActivity.createdAt)}</span>
                          </div>
                          <p className="text-[11px] text-surface-200 truncate mb-0.5">{conv.lastActivity.subject}</p>
                          {conv.lastActivity.body && (
                            <p className="text-[10px] text-surface-600 truncate">{conv.lastActivity.body}</p>
                          )}
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <Icon size={10} className="text-surface-600" />
                            <span className="text-[10px] text-surface-600 capitalize">{conv.lastActivity.type}</span>
                            <Badge variant="ghost" size="sm" className="ml-auto">{conv.activities.length}</Badge>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Thread or empty */}
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Inbox size={32} className="text-surface-600 mx-auto mb-3" />
              <p className="text-sm text-surface-400">Select a conversation</p>
            </div>
          </div>
        ) : (
          <>
            {/* Activity Thread */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Thread header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-surface-800">
                <div>
                  <h3 className="text-sm font-semibold text-surface-100">{selected.lastActivity.subject}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Avatar name={selected.contactName} size="xs" />
                    <span className="text-xs text-surface-400">{selected.contactName}</span>
                    {selectedContact?.email && (
                      <>
                        <span className="text-surface-700">·</span>
                        <span className="text-xs text-surface-600">{selectedContact.email}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-500 hover:text-amber-400 hover:bg-amber-500/10 transition-all"><Star size={14} /></button>
                  <button className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-800 transition-all"><Archive size={14} /></button>
                  <button className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-800 transition-all"><MoreHorizontal size={14} /></button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {[...selected.activities].reverse().map(act => (
                  <div key={act.id} className="flex gap-3">
                    <Avatar name={selected.contactName} size="sm" className="shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-surface-200">{selected.contactName}</span>
                        <span className="text-[10px] text-surface-600">{timeAgo(act.createdAt)}</span>
                        <Badge variant="ghost" size="sm" className="capitalize">{act.type}</Badge>
                      </div>
                      <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-3.5">
                        <p className="text-xs font-semibold text-surface-200 mb-1">{act.subject}</p>
                        {act.body && <p className="text-xs text-surface-400 leading-relaxed">{act.body}</p>}
                        {act.outcome && <p className="text-[11px] text-emerald-400 mt-2">Outcome: {act.outcome}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reply composer */}
              <div className="border-t border-surface-800 p-4">
                <div className="rounded-xl border border-surface-700 bg-surface-900 overflow-hidden">
                  <textarea
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    placeholder={`Log a follow-up activity for ${selected.contactName}…`}
                    rows={3}
                    className="w-full bg-transparent px-4 pt-3 pb-2 text-sm text-surface-200 placeholder:text-surface-600 resize-none focus:outline-none"
                  />
                  <div className="flex items-center justify-between px-4 pb-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setSendMode(sendMode === "email" ? "log" : "email")}
                        title={sendMode === "email" ? "Currently: Send Email — click to switch to Log Note" : "Click to send as real email"}
                        className={cn("flex h-7 w-7 items-center justify-center rounded-md transition-all",
                          sendMode === "email" ? "bg-brand-500/20 text-brand-400" : "text-surface-600 hover:text-surface-400 hover:bg-surface-800")}>
                        <Mail size={13} />
                      </button>
                      <button className="flex h-7 w-7 items-center justify-center rounded-md text-surface-600 hover:text-surface-400 hover:bg-surface-800 transition-all"><MessageSquare size={13} /></button>
                      <button className="flex h-7 w-7 items-center justify-center rounded-md text-surface-600 hover:text-surface-400 hover:bg-surface-800 transition-all"><Phone size={13} /></button>
                      {sendMode === "email" && selectedContact?.email && (
                        <span className="text-[10px] text-brand-400 ml-1">→ {selectedContact.email}</span>
                      )}
                    </div>
                    <Button variant="gradient" size="sm" icon={Send} loading={sending} onClick={handleSend} disabled={!reply.trim()}>
                      {sendMode === "email" ? "Send Email" : "Log Activity"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Sidebar */}
            <div className="w-64 shrink-0 border-l border-surface-800 overflow-y-auto p-4 space-y-4">
              <div className="text-center">
                <Avatar name={selected.contactName} size="2xl" className="mx-auto mb-2" />
                <p className="text-sm font-semibold text-surface-100">{selected.contactName}</p>
                {selectedContact?.jobTitle && (
                  <p className="text-xs text-surface-500 mt-0.5">{selectedContact.jobTitle}</p>
                )}
                {selectedContact && (
                  <Badge variant={selectedContact.status === "vip" ? "purple" : selectedContact.status === "customer" ? "success" : "ghost"} size="sm" className="mt-1 capitalize">
                    {selectedContact.status}
                  </Badge>
                )}
              </div>

              {selectedContact && (
                <div className="space-y-2">
                  {[
                    { label: "Email",    value: selectedContact.email },
                    { label: "Phone",    value: selectedContact.phone },
                    { label: "AI Score", value: selectedContact.score ? `${selectedContact.score}/100` : null },
                  ].filter(r => r.value).map(row => (
                    <div key={row.label} className="rounded-lg border border-surface-800 p-3">
                      <p className="text-[10px] text-surface-600 mb-0.5">{row.label}</p>
                      <p className="text-xs text-surface-200 font-medium">{row.value}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-lg border border-surface-800 p-3">
                <p className="text-[10px] text-surface-600 mb-1">Activity Count</p>
                <p className="text-sm font-bold text-surface-200">{selected.activities.length}</p>
                <p className="text-[10px] text-surface-600">logged interactions</p>
              </div>

              <Button variant="outline" size="sm" className="w-full">View CRM Profile</Button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
