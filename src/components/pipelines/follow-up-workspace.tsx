"use client";

import { useMemo, useState, type ReactNode } from "react";
import type {
  Contact,
  Conversation,
  Deal,
  FollowUp,
  FollowUpActivityType,
  FollowUpChannel,
  FollowUpPriority,
} from "@/types";
import {
  FOLLOW_UP_ACTIVITY_TYPES,
  FOLLOW_UP_CHANNELS,
  FOLLOW_UP_PRIORITIES,
  activeDealNeedsFollowUp,
  addHours,
  daysSince,
  formatDateTimeLocalValue,
  getFollowUpBucket,
  getNextPendingFollowUp,
  getReactivationSegment,
} from "@/lib/follow-ups";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, RotateCcw, UserRoundX } from "lucide-react";
import { useTranslations } from "next-intl";

type ContactWithConversations = Contact & {
  conversations?: Pick<Conversation, "id" | "last_message_at" | "status">[];
};

export interface FollowUpCreateInput {
  company_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  conversation_id: string | null;
  assigned_to: string | null;
  activity_type: FollowUpActivityType;
  channel: FollowUpChannel;
  priority: FollowUpPriority;
  due_at: string;
  note: string | null;
}

interface FollowUpWorkspaceProps {
  deals: Deal[];
  contacts: ContactWithConversations[];
  followUps: FollowUp[];
  onCreateFollowUp: (input: FollowUpCreateInput) => Promise<void>;
  onCompleteFollowUp: (followUp: FollowUp, result: string, decision: string) => Promise<void>;
  onRescheduleFollowUp: (followUp: FollowUp, dueAt: string) => Promise<void>;
  onCancelFollowUp: (followUp: FollowUp, result: string) => Promise<void>;
}

export function FollowUpWorkspace({
  deals,
  contacts,
  followUps,
  onCreateFollowUp,
  onCompleteFollowUp,
  onRescheduleFollowUp,
  onCancelFollowUp,
}: FollowUpWorkspaceProps) {
  const t = useTranslations("Pipelines.followUps");
  const [target, setTarget] = useState<{
    companyId: string | null;
    contactId: string | null;
    dealId: string | null;
    conversationId: string | null;
    assignedTo: string | null;
    label: string;
  } | null>(null);
  const [dueAt, setDueAt] = useState(formatDateTimeLocalValue(addHours(new Date(), 4)));
  const [activityType, setActivityType] = useState<FollowUpActivityType>("whatsapp");
  const [channel, setChannel] = useState<FollowUpChannel>("whatsapp");
  const [priority, setPriority] = useState<FollowUpPriority>("normal");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const now = new Date();
  const pending = followUps.filter((followUp) => followUp.status === "pending");
  const overdue = pending.filter((followUp) => getFollowUpBucket(followUp, now) === "overdue");
  const today = pending.filter((followUp) => getFollowUpBucket(followUp, now) === "today");
  const upcoming = pending
    .filter((followUp) => getFollowUpBucket(followUp, now) === "upcoming")
    .slice(0, 6);
  const completed = followUps
    .filter((followUp) => followUp.status === "completed")
    .sort((a, b) => new Date(b.completed_at ?? b.updated_at).getTime() - new Date(a.completed_at ?? a.updated_at).getTime())
    .slice(0, 5);

  const dealsWithoutNextAction = useMemo(
    () => deals.filter((deal) => activeDealNeedsFollowUp(deal, followUps)),
    [deals, followUps],
  );

  const reactivationCandidates = contacts
    .map((contact) => {
      const lastConversation = contact.conversations?.[0] ?? null;
      const contactDays = daysSince(lastConversation?.last_message_at, now);
      return {
        contact,
        conversationId: lastConversation?.id ?? null,
        contactDays,
        segment: getReactivationSegment(contactDays),
      };
    })
    .filter((item) => item.segment !== "active")
    .sort((a, b) => (b.contactDays ?? 0) - (a.contactDays ?? 0))
    .slice(0, 8);

  function openForDeal(deal: Deal) {
    const next = getNextPendingFollowUp(followUps.filter((followUp) => followUp.deal_id === deal.id));
    if (next) return;
    setTarget({
      companyId: deal.company_id ?? deal.contact?.company_id ?? null,
      contactId: deal.contact_id,
      dealId: deal.id,
      conversationId: deal.conversation_id ?? null,
      assignedTo: deal.assigned_to ?? null,
      label: deal.title,
    });
    setDueAt(formatDateTimeLocalValue(addHours(new Date(), 4)));
  }

  function openForContact(item: { contact: ContactWithConversations; conversationId: string | null }) {
    setTarget({
      companyId: item.contact.company_id ?? null,
      contactId: item.contact.id,
      dealId: null,
      conversationId: item.conversationId,
      assignedTo: null,
      label: item.contact.name || item.contact.phone,
    });
    setActivityType("reactivation");
    setChannel("whatsapp");
    setDueAt(formatDateTimeLocalValue(addHours(new Date(), 4)));
  }

  async function handleCreate() {
    if (!target || !dueAt) return;
    setSaving(true);
    await onCreateFollowUp({
      company_id: target.companyId,
      contact_id: target.contactId,
      deal_id: target.dealId,
      conversation_id: target.conversationId,
      assigned_to: target.assignedTo,
      activity_type: activityType,
      channel,
      priority,
      due_at: new Date(dueAt).toISOString(),
      note: note.trim() || null,
    });
    setSaving(false);
    setTarget(null);
    setNote("");
    setActivityType("whatsapp");
    setChannel("whatsapp");
    setPriority("normal");
  }

  async function complete(followUp: FollowUp) {
    const result = window.prompt(t("resultPrompt"));
    if (result === null) return;
    const decision = window.prompt(t("decisionPrompt"), "new_follow_up");
    if (decision === null) return;
    await onCompleteFollowUp(followUp, result.trim(), decision.trim() || "new_follow_up");
  }

  async function reschedule(followUp: FollowUp) {
    const next = window.prompt(
      t("reschedulePrompt"),
      formatDateTimeLocalValue(addHours(new Date(followUp.due_at), 24)),
    );
    if (!next) return;
    await onRescheduleFollowUp(followUp, new Date(next).toISOString());
  }

  async function cancel(followUp: FollowUp) {
    const result = window.prompt(t("cancelPrompt"));
    if (result === null) return;
    await onCancelFollowUp(followUp, result.trim());
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
      <div className="rounded-xl border border-border bg-card/60">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t("agendaTitle")}</h2>
            <p className="text-xs text-muted-foreground">{t("agendaSubtitle")}</p>
          </div>
          <CalendarClock className="h-4 w-4 text-primary" />
        </header>
        <div className="grid gap-3 p-4 lg:grid-cols-3">
          <AgendaColumn title={t("overdue")} tone="danger" items={overdue} onComplete={complete} onReschedule={reschedule} onCancel={cancel} />
          <AgendaColumn title={t("today")} tone="warning" items={today} onComplete={complete} onReschedule={reschedule} onCancel={cancel} />
          <AgendaColumn title={t("upcoming")} tone="neutral" items={upcoming} onComplete={complete} onReschedule={reschedule} onCancel={cancel} />
        </div>
        <div className="border-t border-border px-4 py-3">
          <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{t("recentlyCompleted")}</h3>
          {completed.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("emptyCompleted")}</p>
          ) : (
            <div className="grid gap-2">
              {completed.map((followUp) => (
                <FollowUpRow key={followUp.id} followUp={followUp} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <Panel title={t("noNextActionTitle")} icon={<AlertTriangle className="h-4 w-4 text-red-300" />}>
          {dealsWithoutNextAction.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("emptyNoNextAction")}</p>
          ) : (
            <div className="space-y-2">
              {dealsWithoutNextAction.slice(0, 8).map((deal) => (
                <div key={deal.id} className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{deal.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{deal.contact?.name || deal.contact?.phone || t("noContact")}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openForDeal(deal)} className="shrink-0 border-red-500/40 text-red-200 hover:bg-red-500/10">
                    {t("schedule")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title={t("reactivationTitle")} icon={<UserRoundX className="h-4 w-4 text-amber-300" />}>
          {reactivationCandidates.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("emptyReactivation")}</p>
          ) : (
            <div className="space-y-2">
              {reactivationCandidates.map((item) => (
                <div key={item.contact.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{item.contact.name || item.contact.phone}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("daysWithoutContact", { count: item.contactDays ?? 0 })} · {t("purchaseUnavailable")}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openForContact(item)} className="shrink-0 border-border text-muted-foreground hover:bg-muted">
                    {t("reactivate")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("newFollowUpFor", { label: target?.label ?? "" })}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{t("dueAt")}</Label>
              <Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="border-border bg-muted text-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SelectField label={t("activityType")} value={activityType} values={FOLLOW_UP_ACTIVITY_TYPES} onChange={(value) => setActivityType(value as FollowUpActivityType)} translate={(value) => t(`activityTypes.${value}`)} />
              <SelectField label={t("channel")} value={channel} values={FOLLOW_UP_CHANNELS} onChange={(value) => setChannel(value as FollowUpChannel)} translate={(value) => t(`channels.${value}`)} />
            </div>
            <SelectField label={t("priority")} value={priority} values={FOLLOW_UP_PRIORITIES} onChange={(value) => setPriority(value as FollowUpPriority)} translate={(value) => t(`priorities.${value}`)} />
            <div className="grid gap-2">
              <Label>{t("note")}</Label>
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-24 border-border bg-muted text-foreground" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} className="border-border text-muted-foreground hover:bg-muted">{t("cancel")}</Button>
            <Button onClick={handleCreate} disabled={saving || !dueAt} className="bg-primary text-primary-foreground hover:bg-primary/90">{saving ? t("saving") : t("create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AgendaColumn({
  title,
  tone,
  items,
  onComplete,
  onReschedule,
  onCancel,
}: {
  title: string;
  tone: "danger" | "warning" | "neutral";
  items: FollowUp[];
  onComplete: (followUp: FollowUp) => void;
  onReschedule: (followUp: FollowUp) => void;
  onCancel: (followUp: FollowUp) => void;
}) {
  const t = useTranslations("Pipelines.followUps");
  const toneClass =
    tone === "danger"
      ? "border-red-500/40 bg-red-500/10"
      : tone === "warning"
        ? "border-amber-500/40 bg-amber-500/10"
        : "border-border bg-muted/40";
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-foreground">
        <Clock className="h-3.5 w-3.5" />
        {title}
        <span className="ml-auto rounded-full bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("emptyBucket")}</p>
      ) : (
        <div className="space-y-2">
          {items.map((followUp) => (
            <FollowUpRow key={followUp.id} followUp={followUp} onComplete={onComplete} onReschedule={onReschedule} onCancel={onCancel} />
          ))}
        </div>
      )}
    </div>
  );
}

function FollowUpRow({
  followUp,
  onComplete,
  onReschedule,
  onCancel,
}: {
  followUp: FollowUp;
  onComplete?: (followUp: FollowUp) => void;
  onReschedule?: (followUp: FollowUp) => void;
  onCancel?: (followUp: FollowUp) => void;
}) {
  const t = useTranslations("Pipelines.followUps");
  const label = followUp.deal?.title || followUp.contact?.name || followUp.contact?.phone || t("untitled");
  return (
    <div className="rounded-lg border border-border bg-background/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">
            {t(`activityTypes.${followUp.activity_type}`)} · {new Date(followUp.due_at).toLocaleString()}
          </p>
        </div>
        {followUp.status === "completed" && <CheckCircle2 className="h-4 w-4 text-primary" />}
      </div>
      {followUp.note && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{followUp.note}</p>}
      {onComplete && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={() => onComplete(followUp)} className="h-7 border-primary/40 text-primary hover:bg-primary/10">{t("complete")}</Button>
          <Button size="sm" variant="outline" onClick={() => onReschedule?.(followUp)} className="h-7 border-border text-muted-foreground hover:bg-muted">
            <RotateCcw className="mr-1 h-3 w-3" />
            {t("reschedule")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onCancel?.(followUp)} className="h-7 border-border text-muted-foreground hover:bg-muted">{t("cancelAction")}</Button>
        </div>
      )}
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card/60">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {icon}
      </header>
      <div className="p-4">{children}</div>
    </div>
  );
}

function SelectField({
  label,
  value,
  values,
  onChange,
  translate,
}: {
  label: string;
  value: string;
  values: readonly string[];
  onChange: (value: string) => void;
  translate: (value: string) => string;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
      >
        {values.map((item) => (
          <option key={item} value={item}>
            {translate(item)}
          </option>
        ))}
      </select>
    </div>
  );
}
