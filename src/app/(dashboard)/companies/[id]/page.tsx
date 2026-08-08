"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import type {
  Company,
  Contact,
  Deal,
  FollowUp,
  FollowUpActivityType,
  FollowUpChannel,
  FollowUpPriority,
  Pipeline,
  PipelineStage,
  Profile,
} from "@/types";
import {
  buildCompanyRows,
  buildLinkedContactUpdate,
  canUseCompanyScopedRecord,
} from "@/lib/companies-workspace";
import { buildCompanyDisplayName } from "@/lib/companies";
import { getFollowUpBucket, getNextPendingFollowUp } from "@/lib/follow-ups";
import { ContactForm } from "@/components/contacts/contact-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  GitBranch,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  TriangleAlert,
  Unlink,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";

export default function CompanyDetailPage() {
  const t = useTranslations("Companies.detail");
  const tCommon = useTranslations("Companies.common");
  const params = useParams<{ id: string }>();
  const companyId = params.id;
  const router = useRouter();
  const supabase = createClient();
  const { accountId, profile } = useAuth();
  const canEdit = useCan("send-messages");

  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [availableContacts, setAvailableContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const companyResult = await supabase
      .from("companies")
      .select("*")
      .eq("account_id", accountId)
      .eq("id", companyId)
      .maybeSingle();
    if (!companyResult.data) {
      toast.error(t("toasts.notFound"));
      router.push("/companies");
      return;
    }
    const row = companyResult.data as Company;
    const [linkedContacts, unlinkedContacts, companyDeals, companyFollowUps, profileRows, pipelineRows, stageRows] =
      await Promise.all([
        supabase.from("contacts").select("*").eq("account_id", accountId).eq("company_id", companyId).order("name"),
        supabase.from("contacts").select("*").eq("account_id", accountId).is("company_id", null).order("name").limit(200),
        supabase.from("deals").select("*, stage:pipeline_stages(*)").eq("account_id", accountId).eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("follow_ups").select("*, contact:contacts(*), deal:deals(*), assignee:profiles!follow_ups_assigned_to_fkey(*)").eq("account_id", accountId).eq("company_id", companyId).order("due_at"),
        supabase.from("profiles").select("*").eq("account_id", accountId).order("full_name"),
        supabase.from("pipelines").select("*").eq("account_id", accountId).order("created_at"),
        supabase.from("pipeline_stages").select("*").order("position"),
      ]);
    setCompany(row);
    setContacts((linkedContacts.data ?? []) as Contact[]);
    setAvailableContacts((unlinkedContacts.data ?? []) as Contact[]);
    setDeals((companyDeals.data ?? []) as Deal[]);
    setFollowUps((companyFollowUps.data ?? []) as FollowUp[]);
    setProfiles((profileRows.data ?? []) as Profile[]);
    setPipelines((pipelineRows.data ?? []) as Pipeline[]);
    setStages((stageRows.data ?? []) as PipelineStage[]);
    setLoading(false);
  }, [accountId, companyId, router, supabase, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const summary = useMemo(() => {
    if (!company) return null;
    return buildCompanyRows([{ company, contacts, deals, followUps, profiles }])[0];
  }, [company, contacts, deals, followUps, profiles]);

  async function archiveToggle() {
    if (!company || !accountId || !canEdit) return;
    const archived = !company.archived_at;
    const { error } = await supabase
      .from("companies")
      .update({
        archived_at: archived ? new Date().toISOString() : null,
        commercial_status: archived ? "archived" : "prospect",
      })
      .eq("account_id", accountId)
      .eq("id", company.id);
    if (error) {
      toast.error(t("toasts.updateFailed"));
      return;
    }
    toast.success(archived ? t("toasts.archived") : t("toasts.restored"));
    load();
  }

  async function linkContact(contactId: string) {
    if (!company || !accountId || !canEdit) return;
    const contact = availableContacts.find((item) => item.id === contactId);
    if (!contact || !canUseCompanyScopedRecord(accountId, contact)) {
      toast.error(t("toasts.contactWrongAccount"));
      return;
    }
    const { error } = await supabase
      .from("contacts")
      .update(buildLinkedContactUpdate(accountId, company))
      .eq("account_id", accountId)
      .eq("id", contactId);
    if (error) {
      toast.error(t("toasts.linkContactFailed"));
      return;
    }
    setLinkOpen(false);
    load();
  }

  async function removeContact(contactId: string) {
    if (!accountId || !canEdit) return;
    const { error } = await supabase
      .from("contacts")
      .update({ company_id: null, company: null, is_primary_company_contact: false })
      .eq("account_id", accountId)
      .eq("id", contactId);
    if (error) toast.error(t("toasts.unlinkContactFailed"));
    else load();
  }

  async function makePrimary(contactId: string) {
    if (!accountId || !canEdit) return;
    const { error } = await supabase
      .from("contacts")
      .update({ is_primary_company_contact: true })
      .eq("account_id", accountId)
      .eq("id", contactId)
      .eq("company_id", companyId);
    if (error) toast.error(t("toasts.primaryContactFailed"));
    else load();
  }

  async function completeFollowUp(followUp: FollowUp) {
    if (!accountId || !canEdit) return;
    const result = window.prompt(t("prompts.result"));
    if (result === null) return;
    const { error } = await supabase
      .from("follow_ups")
      .update({
        status: "completed",
        result: result.trim() || null,
        completed_at: new Date().toISOString(),
        completed_by: profile?.id ?? null,
      })
      .eq("account_id", accountId)
      .eq("id", followUp.id);
    if (error) toast.error(t("toasts.completeFollowUpFailed"));
    else load();
  }

  async function cancelFollowUp(followUp: FollowUp) {
    if (!accountId || !canEdit) return;
    const result = window.prompt(t("prompts.cancelReason"));
    if (result === null) return;
    const { error } = await supabase
      .from("follow_ups")
      .update({ status: "cancelled", result: result.trim() || null })
      .eq("account_id", accountId)
      .eq("id", followUp.id);
    if (error) toast.error(t("toasts.cancelFollowUpFailed"));
    else load();
  }

  async function rescheduleFollowUp(followUp: FollowUp) {
    if (!accountId || !canEdit) return;
    const dueAt = window.prompt(t("prompts.newDueDate"), followUp.due_at.slice(0, 16));
    if (!dueAt) return;
    const { error } = await supabase
      .from("follow_ups")
      .update({ due_at: new Date(dueAt).toISOString(), status: "pending" })
      .eq("account_id", accountId)
      .eq("id", followUp.id);
    if (error) toast.error(t("toasts.rescheduleFollowUpFailed"));
    else load();
  }

  if (loading || !company || !summary) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pending = followUps.filter((item) => item.status === "pending");
  const nextFollowUp = getNextPendingFollowUp(pending);
  const owner = profiles.find((item) => item.id === company.assigned_to);
  const labelStatus = (status: string) => statusLabel(status, tCommon);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button nativeButton={false} variant="outline" size="sm" render={<Link href="/companies" />}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {tCommon("back")}
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              {buildCompanyDisplayName(company)}
            </h1>
            <p className="text-sm text-muted-foreground">
              {company.legal_name || company.segment || t("areaFallback")}
              {company.archived_at ? ` · ${t("archivedSuffix")}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setContactFormOpen(true)} disabled={!canEdit}>
            <Plus className="mr-2 h-4 w-4" />
            {t("buttons.contact")}
          </Button>
          <Button variant="outline" onClick={() => setDealOpen(true)} disabled={!canEdit}>
            <GitBranch className="mr-2 h-4 w-4" />
            {t("buttons.deal")}
          </Button>
          <Button variant="outline" onClick={() => setFollowOpen(true)} disabled={!canEdit}>
            <CalendarClock className="mr-2 h-4 w-4" />
            {t("buttons.followUp")}
          </Button>
          <Button nativeButton={false} variant="outline" render={<Link href={`/companies/${company.id}/edit`} />}>
            <Pencil className="mr-2 h-4 w-4" />
            {t("buttons.edit")}
          </Button>
          <Button variant="outline" onClick={archiveToggle} disabled={!canEdit}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {company.archived_at ? tCommon("restore") : tCommon("archive")}
          </Button>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-4">
        <Metric icon={<Users />} label={t("metrics.contacts")} value={summary.contactsCount} />
        <Metric icon={<GitBranch />} label={t("metrics.openDeals")} value={summary.openDealsCount} />
        <Metric icon={<CalendarClock />} label={t("metrics.nextFollowUp")} value={nextFollowUp ? new Date(nextFollowUp.due_at).toLocaleDateString() : t("metrics.none")} />
        <Metric icon={<TriangleAlert />} label={t("metrics.overdue")} value={summary.hasOverdueFollowUp ? t("metrics.needsAction") : t("metrics.onTrack")} danger={summary.hasOverdueFollowUp} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title={t("panels.overview")}>
          <Info label={t("info.status")} value={labelStatus(company.commercial_status)} />
          <Info label={t("info.segment")} value={company.segment} />
          <Info label={t("info.owner")} value={owner?.full_name || owner?.email} />
          <Info label={t("info.taxId")} value={company.tax_id} />
          <Info label={t("info.phone")} value={company.primary_phone} />
          <Info label={t("info.email")} value={company.general_email} />
          <Info label={t("info.website")} value={company.website} />
          <Info label={t("info.address")} value={[company.address_line1, company.address_line2, company.city, company.region, company.postal_code, company.country].filter(Boolean).join(", ")} />
          <Info label={t("info.createdAt")} value={new Date(company.created_at).toLocaleDateString()} />
          <Info label={t("info.notes")} value={company.notes} wide />
        </Panel>

        <Panel title={t("panels.contacts")} action={<Button size="sm" variant="outline" onClick={() => setLinkOpen(true)} disabled={!canEdit}><Link2 className="mr-2 h-4 w-4" />{t("buttons.linkExisting")}</Button>}>
          {contacts.length === 0 ? (
            <Empty title={t("contacts.emptyTitle")} description={t("contacts.emptyDescription")} />
          ) : (
            <div className="divide-y divide-border">
              {contacts.map((contact) => (
                <div key={contact.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {contact.name || contact.phone}
                      {contact.is_primary_company_contact ? ` · ${t("contacts.primarySuffix")}` : ""}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {contact.job_title || t("contacts.noRole")} · {contact.commercial_role || t("contacts.undefinedRole")} · {contact.email || contact.phone}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => makePrimary(contact.id)} disabled={!canEdit || contact.is_primary_company_contact}>
                      <UserCheck className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => removeContact(contact.id)} disabled={!canEdit}>
                      <Unlink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel title={t("panels.deals")}>
          {deals.length === 0 ? (
            <Empty title={t("deals.emptyTitle")} description={t("deals.emptyDescription")} />
          ) : (
            <div className="space-y-2">
              {deals.map((deal) => (
                <div key={deal.id} className="rounded-md border border-border p-3">
                  <div className="flex justify-between gap-3">
                    <p className="font-medium text-foreground">{deal.title}</p>
                    <span className="text-xs text-muted-foreground">{labelStatus(deal.status ?? "open")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {deal.stage?.name || t("deals.undefinedStage")} · {deal.value?.toLocaleString()} {deal.currency || ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title={t("panels.followUps")}>
          {followUps.length === 0 ? (
            <Empty title={t("followUps.emptyTitle")} description={t("followUps.emptyDescription")} />
          ) : (
            <div className="space-y-2">
              {followUps.slice(0, 12).map((followUp) => (
                <div key={followUp.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">
                      {followUp.activity_type} · {new Date(followUp.due_at).toLocaleString()}
                    </p>
                    <span className={getFollowUpBucket(followUp, new Date()) === "overdue" ? "text-xs text-red-300" : "text-xs text-muted-foreground"}>
                      {labelStatus(followUp.status)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {followUp.contact?.name || followUp.deal?.title || t("followUps.companyScope")} · {followUp.note || t("followUps.noNote")}
                  </p>
                  {followUp.status === "pending" && (
                    <div className="mt-2 flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => completeFollowUp(followUp)} disabled={!canEdit}><CheckCircle2 className="mr-1 h-3 w-3" />{t("buttons.complete")}</Button>
                      <Button size="sm" variant="outline" onClick={() => rescheduleFollowUp(followUp)} disabled={!canEdit}>{t("buttons.reschedule")}</Button>
                      <Button size="sm" variant="ghost" onClick={() => cancelFollowUp(followUp)} disabled={!canEdit}>{tCommon("cancel")}</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </section>

      <Panel title={t("panels.activities")}>
        <div className="space-y-2">
          {[...followUps].slice(0, 8).map((item) => (
            <div key={item.id} className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium text-foreground">Follow-up {labelStatus(item.status)}</p>
              <p className="text-xs text-muted-foreground">
                {t("activities.origin")}: {item.deal?.title || item.contact?.name || t("activities.company")} · {new Date(item.updated_at).toLocaleString()}
              </p>
            </div>
          ))}
          {followUps.length === 0 && <Empty title={t("activities.emptyTitle")} description={t("activities.emptyDescription")} />}
        </div>
      </Panel>

      <ContactForm
        open={contactFormOpen}
        onOpenChange={setContactFormOpen}
        defaultCompany={company}
        onSaved={load}
      />
      <LinkContactDialog open={linkOpen} onOpenChange={setLinkOpen} contacts={availableContacts} onLink={linkContact} />
      <DealDialog open={dealOpen} onOpenChange={setDealOpen} company={company} contacts={contacts} pipelines={pipelines} stages={stages} accountId={accountId} onSaved={load} />
      <FollowUpDialog open={followOpen} onOpenChange={setFollowOpen} company={company} contacts={contacts} deals={deals} profiles={profiles} accountId={accountId} onSaved={load} />
    </div>
  );
}

function Metric({ icon, label, value, danger }: { icon: React.ReactNode; label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className={danger ? "mb-2 text-red-300" : "mb-2 text-primary"}>{icon}</div>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Info({ label, value, wide }: { label: string; value?: string | null; wide?: boolean }) {
  const tCommon = useTranslations("Companies.common");
  return (
    <div className={wide ? "mb-3" : "mb-2 grid grid-cols-[8rem_1fr] gap-3"}>
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || tCommon("notSet")}</p>
    </div>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-md border border-dashed border-border p-4 text-center">
      <Building2 className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function statusLabel(
  status: string,
  t: ReturnType<typeof useTranslations<"Companies.common">>,
): string {
  const labels: Record<string, string> = {
    prospect: t("statuses.prospect"),
    active_customer: t("statuses.active_customer"),
    at_risk: t("statuses.at_risk"),
    inactive: t("statuses.inactive"),
    reactivated: t("statuses.reactivated"),
    archived: t("statuses.archived"),
    pending: t("statuses.pending"),
    completed: t("statuses.completed"),
    cancelled: t("statuses.cancelled"),
    rescheduled: t("statuses.rescheduled"),
    open: t("statuses.open"),
    won: t("statuses.won"),
    lost: t("statuses.lost"),
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

function LinkContactDialog({ open, onOpenChange, contacts, onLink }: { open: boolean; onOpenChange: (open: boolean) => void; contacts: Contact[]; onLink: (id: string) => void }) {
  const t = useTranslations("Companies.detail");
  const [contactId, setContactId] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("dialogs.linkContactTitle")}</DialogTitle></DialogHeader>
        <select value={contactId} onChange={(event) => setContactId(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">{t("dialogs.chooseContact")}</option>
          {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name || contact.phone}</option>)}
        </select>
        <DialogFooter><Button onClick={() => contactId && onLink(contactId)}>{t("dialogs.link")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DealDialog({ open, onOpenChange, company, contacts, pipelines, stages, accountId, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; company: Company; contacts: Contact[]; pipelines: Pipeline[]; stages: PipelineStage[]; accountId: string | null; onSaved: () => void }) {
  const t = useTranslations("Companies.detail");
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");
  const [value, setValue] = useState("");
  async function save() {
    if (!accountId || !title.trim() || !pipelineId || !stageId) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const contact = contacts.find((item) => item.id === contactId);
    if (contactId && contact?.account_id !== accountId) {
      toast.error(t("toasts.contactWrongAccount"));
      return;
    }
    const { error } = await supabase.from("deals").insert({
      user_id: session.user.id,
      account_id: accountId,
      title: title.trim(),
      value: parseFloat(value) || 0,
      contact_id: contactId || null,
      company_id: company.id,
      pipeline_id: pipelineId,
      stage_id: stageId,
      status: "open",
    });
    if (error) toast.error(t("toasts.createDealFailed"));
    else {
      onOpenChange(false);
      onSaved();
    }
  }
  const stageOptions = stages.filter((stage) => stage.pipeline_id === pipelineId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("dialogs.createDealTitle")}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Label>{t("dialogs.title")}</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} />
          <Label>{t("dialogs.pipeline")}</Label><select value={pipelineId} onChange={(event) => { setPipelineId(event.target.value); setStageId(""); }} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">{t("dialogs.choosePipeline")}</option>{pipelines.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <Label>{t("dialogs.stage")}</Label><select value={stageId} onChange={(event) => setStageId(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">{t("dialogs.chooseStage")}</option>{stageOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <Label>{t("dialogs.contact")}</Label><select value={contactId} onChange={(event) => setContactId(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">{t("dialogs.noContact")}</option>{contacts.map((item) => <option key={item.id} value={item.id}>{item.name || item.phone}</option>)}</select>
          <Label>{t("dialogs.value")}</Label><Input value={value} onChange={(event) => setValue(event.target.value)} />
        </div>
        <DialogFooter><Button onClick={save}>{t("dialogs.createDeal")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FollowUpDialog({ open, onOpenChange, company, contacts, deals, profiles, accountId, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; company: Company; contacts: Contact[]; deals: Deal[]; profiles: Profile[]; accountId: string | null; onSaved: () => void }) {
  const t = useTranslations("Companies.detail");
  const tCommon = useTranslations("Companies.common");
  const supabase = createClient();
  const [contactId, setContactId] = useState("");
  const [dealId, setDealId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [note, setNote] = useState("");
  const [activityType, setActivityType] = useState<FollowUpActivityType>("whatsapp");
  const [channel, setChannel] = useState<FollowUpChannel>("whatsapp");
  const [priority, setPriority] = useState<FollowUpPriority>("normal");
  async function save() {
    if (!accountId || !dueAt) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const contact = contacts.find((item) => item.id === contactId);
    const deal = deals.find((item) => item.id === dealId);
    if ((contactId && contact?.account_id !== accountId) || (dealId && deal?.account_id !== accountId)) {
      toast.error(t("toasts.selectedRecordWrongAccount"));
      return;
    }
    const { error } = await supabase.from("follow_ups").insert({
      user_id: session.user.id,
      account_id: accountId,
      company_id: company.id,
      contact_id: contactId || null,
      deal_id: dealId || null,
      assigned_to: assignedTo || null,
      activity_type: activityType,
      channel,
      priority,
      due_at: new Date(dueAt).toISOString(),
      note: note.trim() || null,
      status: "pending",
    });
    if (error) toast.error(t("toasts.createFollowUpFailed"));
    else {
      onOpenChange(false);
      onSaved();
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("dialogs.createFollowUpTitle")}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Label>{t("dialogs.dueAt")}</Label><Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          <Label>{t("dialogs.contact")}</Label><select value={contactId} onChange={(event) => setContactId(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">{t("followUps.companyScope")}</option>{contacts.map((item) => <option key={item.id} value={item.id}>{item.name || item.phone}</option>)}</select>
          <Label>{t("dialogs.deal")}</Label><select value={dealId} onChange={(event) => setDealId(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">{t("dialogs.noDeal")}</option>{deals.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
          <Label>{t("dialogs.owner")}</Label><select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">{tCommon("unassigned")}</option>{profiles.map((item) => <option key={item.id} value={item.id}>{item.full_name || item.email}</option>)}</select>
          <Label>{t("dialogs.type")}</Label><select value={activityType} onChange={(event) => setActivityType(event.target.value as FollowUpActivityType)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="whatsapp">WhatsApp</option><option value="call">{t("options.call")}</option><option value="email">Email</option><option value="meeting">{t("options.meeting")}</option><option value="proposal">{t("options.proposal")}</option><option value="reactivation">{t("options.reactivation")}</option><option value="other">{t("options.other")}</option></select>
          <Label>{t("dialogs.channel")}</Label><select value={channel} onChange={(event) => setChannel(event.target.value as FollowUpChannel)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="whatsapp">WhatsApp</option><option value="phone">{t("options.phone")}</option><option value="email">Email</option><option value="internal">{t("options.internal")}</option><option value="other">{t("options.other")}</option></select>
          <Label>{t("dialogs.priority")}</Label><select value={priority} onChange={(event) => setPriority(event.target.value as FollowUpPriority)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="low">{t("options.low")}</option><option value="normal">{t("options.normal")}</option><option value="high">{t("options.high")}</option><option value="urgent">{t("options.urgent")}</option></select>
          <Label>{t("dialogs.note")}</Label><Textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
        <DialogFooter><Button onClick={save}>{t("dialogs.createFollowUp")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
