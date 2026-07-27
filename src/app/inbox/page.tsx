"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { apiUrl } from "@/lib/org";
import { cn, timeAgo } from "@/lib/utils";
import {
  Bell,
  CheckCheck,
  ExternalLink,
  Inbox,
  Loader2,
  Mail,
  Search,
  Send,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

interface EmailItem {
  id: string;
  subject: string;
  body: string | null;
  contactId: string | null;
  contactName: string;
  contactEmail: string | null;
  createdAt: string;
  direction: "inbound" | "outbound";
  read: boolean;
}

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  type: string | null;
  link: string | null;
  read: boolean | null;
  createdAt: string;
}

interface Conversation {
  key: string;
  contactId: string | null;
  contactName: string;
  contactEmail: string | null;
  messages: EmailItem[];
  lastMessage: EmailItem;
  unread: boolean;
}

type Tab = "all" | "email" | "notification" | "unread";
type Selected = { kind: "email"; key: string } | { kind: "notification"; id: string } | null;

export default function InboxPage() {
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Selected>(null);
  const [reply, setReply] = useState("");
  const [sendMode, setSendMode] = useState<"log" | "email">("log");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/api/inbox"), { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to load inbox");
      setEmails(payload.emails ?? []);
      setNotifications(payload.notifications ?? []);
      setUnreadCount(Number(payload.unreadCount ?? 0));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load inbox");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("type") === "notification") setTab("notification");
    if (params.get("type") === "email") setTab("email");
    if (params.get("unread") === "true") setTab("unread");
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("notification");
    if (id && notifications.some((item) => item.id === id)) setSelected({ kind: "notification", id });
  }, [notifications]);

  const conversations = useMemo(() => {
    const groups = new Map<string, EmailItem[]>();
    for (const email of emails) {
      const key = email.contactId ?? `unlinked:${email.contactEmail ?? email.id}`;
      const group = groups.get(key) ?? [];
      group.push(email);
      groups.set(key, group);
    }
    return Array.from(groups.entries()).map(([key, records]): Conversation => {
      const messages = [...records].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const lastMessage = messages[messages.length - 1];
      return {
        key,
        contactId: lastMessage.contactId,
        contactName: lastMessage.contactName,
        contactEmail: lastMessage.contactEmail,
        messages,
        lastMessage,
        unread: messages.some((message) => !message.read),
      };
    }).sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());
  }, [emails]);

  const selectedConversation = selected?.kind === "email"
    ? conversations.find((conversation) => conversation.key === selected.key) ?? null
    : null;
  const selectedNotification = selected?.kind === "notification"
    ? notifications.find((notification) => notification.id === selected.id) ?? null
    : null;

  const listItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const emailItems = conversations
      .filter((conversation) => tab !== "notification")
      .filter((conversation) => tab !== "unread" || conversation.unread)
      .filter((conversation) => !query || [conversation.contactName, conversation.contactEmail, conversation.lastMessage.subject, conversation.lastMessage.body]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(query)))
      .map((conversation) => ({ kind: "email" as const, date: conversation.lastMessage.createdAt, conversation }));
    const notificationItems = notifications
      .filter(() => tab !== "email")
      .filter((notification) => tab !== "unread" || !notification.read)
      .filter((notification) => !query || [notification.title, notification.body, notification.type]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(query)))
      .map((notification) => ({ kind: "notification" as const, date: notification.createdAt, notification }));
    return [...emailItems, ...notificationItems].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [conversations, notifications, search, tab]);

  useEffect(() => {
    if (selected) return;
    const first = listItems[0];
    if (first?.kind === "email") setSelected({ kind: "email", key: first.conversation.key });
    if (first?.kind === "notification") setSelected({ kind: "notification", id: first.notification.id });
  }, [listItems, selected]);

  async function markRead(kind: "email" | "notification" | "all", id?: string) {
    setMarking(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/api/inbox/read"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: kind, id, all: kind === "all" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to mark inbox item as read");
      if (kind === "notification" && id) {
        setNotifications((current) => current.map((item) => item.id === id ? { ...item, read: true } : item));
      } else if (kind === "email" && id) {
        setEmails((current) => current.map((item) => item.id === id ? { ...item, read: true } : item));
      } else {
        setEmails((current) => current.map((item) => ({ ...item, read: true })));
        setNotifications((current) => current.map((item) => ({ ...item, read: true })));
      }
      setUnreadCount((current) => kind === "all" ? 0 : Math.max(0, current - 1));
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "Failed to update inbox");
    } finally {
      setMarking(false);
    }
  }

  async function selectItem(next: Selected) {
    setSelected(next);
    setSuccess("");
    if (next?.kind === "notification") {
      const item = notifications.find((notification) => notification.id === next.id);
      if (item && !item.read) await markRead("notification", item.id);
    }
    if (next?.kind === "email") {
      const conversation = conversations.find((item) => item.key === next.key);
      const unread = conversation?.messages.filter((message) => !message.read) ?? [];
      for (const message of unread) await markRead("email", message.id);
    }
  }

  async function sendReply() {
    if (!selectedConversation || !reply.trim()) return;
    setSending(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(apiUrl("/api/activities"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "email",
          subject: selectedConversation.lastMessage.subject.toLowerCase().startsWith("re:")
            ? selectedConversation.lastMessage.subject
            : `Re: ${selectedConversation.lastMessage.subject}`,
          body: reply.trim(),
          contactId: selectedConversation.contactId,
          sendEmail: sendMode === "email",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to create reply");
      setReply("");
      setSuccess(sendMode === "email" ? "Email delivered and logged." : "Reply logged in the contact timeline.");
      await load();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Failed to create reply");
    } finally {
      setSending(false);
    }
  }

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-3.5rem)] animate-fade-in">
        <aside className="w-[340px] shrink-0 border-r border-surface-800 flex flex-col bg-surface-950/30">
          <div className="p-3 border-b border-surface-800 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold text-surface-100">Inbox</h1>
                {unreadCount > 0 && <Badge variant="danger" size="sm">{unreadCount}</Badge>}
              </div>
              <Button size="xs" variant="ghost" icon={CheckCheck} loading={marking} onClick={() => void markRead("all")}>Mark all read</Button>
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-600 pointer-events-none" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search conversations"
                className="w-full h-8 rounded-lg border border-surface-700 bg-surface-900 pl-8 pr-3 text-xs text-surface-200 placeholder:text-surface-600 focus:outline-none focus:border-brand-500"
              />
            </div>
            <div className="grid grid-cols-4 gap-1">
              {(["all", "email", "notification", "unread"] as Tab[]).map((value) => (
                <button
                  key={value}
                  onClick={() => { setTab(value); setSelected(null); }}
                  className={cn(
                    "h-7 rounded-md text-[10px] capitalize transition-colors",
                    tab === value ? "bg-brand-500/15 text-brand-300" : "text-surface-500 hover:text-surface-300 hover:bg-surface-800",
                  )}
                >
                  {value === "notification" ? "Alerts" : value}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16"><Loader2 size={18} className="animate-spin text-surface-500" /></div>
            ) : error && listItems.length === 0 ? (
              <div className="p-4"><div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">{error}</div></div>
            ) : listItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <Inbox size={28} className="text-surface-700 mb-3" />
                <p className="text-sm text-surface-300">No matching inbox items</p>
                <p className="text-xs text-surface-600 mt-1">Email activity and account notifications appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-surface-800/70">
                {listItems.map((item) => item.kind === "email" ? (
                  <button
                    key={`email:${item.conversation.key}`}
                    onClick={() => void selectItem({ kind: "email", key: item.conversation.key })}
                    className={cn(
                      "w-full p-3 text-left transition-colors hover:bg-surface-800/40",
                      selected?.kind === "email" && selected.key === item.conversation.key && "bg-brand-500/8 border-l-2 border-brand-500",
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <Avatar name={item.conversation.contactName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={cn("truncate text-xs", item.conversation.unread ? "font-semibold text-surface-100" : "text-surface-300")}>{item.conversation.contactName}</span>
                          <span className="ml-auto shrink-0 text-[10px] text-surface-600">{timeAgo(item.conversation.lastMessage.createdAt)}</span>
                        </div>
                        <p className="mt-1 truncate text-xs text-surface-400">{item.conversation.lastMessage.subject}</p>
                        <p className="mt-0.5 truncate text-[11px] text-surface-600">{item.conversation.lastMessage.body || "No message body"}</p>
                      </div>
                      {item.conversation.unread && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-400" />}
                    </div>
                  </button>
                ) : (
                  <button
                    key={`notification:${item.notification.id}`}
                    onClick={() => void selectItem({ kind: "notification", id: item.notification.id })}
                    className={cn(
                      "w-full p-3 text-left transition-colors hover:bg-surface-800/40",
                      selected?.kind === "notification" && selected.id === item.notification.id && "bg-brand-500/8 border-l-2 border-brand-500",
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-300"><Bell size={14} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={cn("truncate text-xs", !item.notification.read ? "font-semibold text-surface-100" : "text-surface-300")}>{item.notification.title}</span>
                          <span className="ml-auto shrink-0 text-[10px] text-surface-600">{timeAgo(item.notification.createdAt)}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] text-surface-500">{item.notification.body || "Account notification"}</p>
                      </div>
                      {!item.notification.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-violet-400" />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <main className="min-w-0 flex-1 flex flex-col">
          {error && listItems.length > 0 && <div className="mx-5 mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
          {success && <div className="mx-5 mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{success}</div>}

          {selectedConversation ? (
            <>
              <header className="flex items-center gap-3 border-b border-surface-800 px-5 py-3">
                <Avatar name={selectedConversation.contactName} size="md" status="online" />
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-surface-100">{selectedConversation.contactName}</h2>
                  <p className="truncate text-xs text-surface-500">{selectedConversation.contactEmail || "No email address"}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Badge variant="info" size="sm"><Mail size={11} className="mr-1" />{selectedConversation.messages.length} messages</Badge>
                  {selectedConversation.contactId && (
                    <a href={`/crm/contacts?selected=${selectedConversation.contactId}`} className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-surface-700 px-2.5 text-xs text-surface-300 hover:bg-surface-800">
                      Contact <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </header>

              <section className="flex-1 overflow-y-auto p-5 space-y-4">
                {selectedConversation.messages.map((message) => (
                  <article key={message.id} className={cn("flex", message.direction === "outbound" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-2xl rounded-xl border p-4",
                      message.direction === "outbound" ? "border-brand-500/20 bg-brand-500/10" : "border-surface-800 bg-surface-900/60",
                    )}>
                      <div className="mb-2 flex items-center gap-3">
                        <span className="text-xs font-semibold text-surface-200">{message.subject}</span>
                        <span className="ml-auto shrink-0 text-[10px] text-surface-600">{new Date(message.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-surface-300">{message.body || "No message body"}</p>
                      <p className="mt-2 text-[10px] uppercase tracking-wide text-surface-600">{message.direction}</p>
                    </div>
                  </article>
                ))}
              </section>

              <footer className="border-t border-surface-800 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <button onClick={() => setSendMode("log")} className={cn("rounded-md px-2 py-1 text-[10px]", sendMode === "log" ? "bg-surface-700 text-surface-100" : "text-surface-500 hover:bg-surface-800")}>Log only</button>
                  <button onClick={() => setSendMode("email")} className={cn("rounded-md px-2 py-1 text-[10px]", sendMode === "email" ? "bg-brand-500/20 text-brand-300" : "text-surface-500 hover:bg-surface-800")}>Send email</button>
                  {sendMode === "email" && !selectedConversation.contactEmail && <span className="text-[10px] text-amber-400">This contact has no email address.</span>}
                </div>
                <div className="flex items-end gap-3 rounded-xl border border-surface-700 bg-surface-900 p-3 focus-within:border-brand-500">
                  <textarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void sendReply();
                    }}
                    rows={3}
                    placeholder={sendMode === "email" ? "Write an email reply" : "Log a reply in the contact timeline"}
                    className="min-h-16 flex-1 resize-none bg-transparent text-sm text-surface-200 placeholder:text-surface-600 focus:outline-none"
                  />
                  <Button
                    variant="gradient"
                    icon={Send}
                    loading={sending}
                    disabled={!reply.trim() || (sendMode === "email" && !selectedConversation.contactEmail)}
                    onClick={() => void sendReply()}
                  >
                    {sendMode === "email" ? "Send" : "Log"}
                  </Button>
                </div>
                <p className="mt-1.5 text-[10px] text-surface-600">Press Command or Control plus Enter to submit.</p>
              </footer>
            </>
          ) : selectedNotification ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <article className="w-full max-w-2xl rounded-2xl border border-surface-800 bg-surface-900/60 p-6">
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300"><Bell size={20} /></div>
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <Badge variant="info" size="sm">{selectedNotification.type || "Notification"}</Badge>
                    <h2 className="mt-3 text-xl font-semibold text-surface-50">{selectedNotification.title}</h2>
                    <p className="mt-2 text-xs text-surface-600">{new Date(selectedNotification.createdAt).toLocaleString()}</p>
                    <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-surface-300">{selectedNotification.body || "No additional details were provided."}</p>
                    {selectedNotification.link && (
                      <a href={selectedNotification.link} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600">
                        Open related item <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                </div>
              </article>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <Inbox size={34} className="text-surface-700" />
              <h2 className="mt-3 text-sm font-medium text-surface-300">Select an inbox item</h2>
              <p className="mt-1 text-xs text-surface-600">Choose a conversation or notification to view its details.</p>
            </div>
          )}
        </main>
      </div>
    </AppLayout>
  );
}
