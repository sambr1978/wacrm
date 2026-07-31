"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Pipeline, PipelineStage, Deal } from "@/types";
import { PipelineBoard } from "@/components/pipelines/pipeline-board";
import { PipelineSettings } from "@/components/pipelines/pipeline-settings";
import { DealForm } from "@/components/pipelines/deal-form";
import { PipelineAnalytics } from "@/components/pipelines/pipeline-analytics";
import {
  FollowUpWorkspace,
  type FollowUpCreateInput,
} from "@/components/pipelines/follow-up-workspace";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GitBranch, Plus, ChevronDown, Settings } from "lucide-react";
import { toast } from "sonner";
import { useCan } from "@/hooks/use-can";
import { useAuth } from "@/hooks/use-auth";
import { GatedButton } from "@/components/ui/gated-button";
import { useTranslations } from "next-intl";
import type { Contact, Conversation, FollowUp } from "@/types";

// Pipeline creation is admin-class (settings-tier write under
// the new RLS); deal creation is operational and only requires
// agent+. The two CTAs gate on different `useCan` capabilities,
// not on different copy.

// Spec-defined seed — name and color per the product spec.
const SPEC_DEFAULT_STAGES = [
  { name: "New Lead", color: "#3b82f6", position: 0 }, // blue
  { name: "Qualified", color: "#eab308", position: 1 }, // yellow
  { name: "Proposal Sent", color: "#f97316", position: 2 }, // orange
  { name: "Negotiation", color: "#8b5cf6", position: 3 }, // purple
  { name: "Won", color: "#22c55e", position: 4 }, // green
];

type ContactWithConversations = Contact & {
  conversations?: Pick<Conversation, "id" | "last_message_at" | "status">[];
};

export default function PipelinesPage() {
  const t = useTranslations("Pipelines.page");
  const supabase = createClient();
  const canEditSettings = useCan("edit-settings");
  const canCreateDeals = useCan("send-messages");
  const { accountId, profile } = useAuth();

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [contacts, setContacts] = useState<ContactWithConversations[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog / sheet state
  const [newPipelineOpen, setNewPipelineOpen] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Deal form state is lifted here so both the top-bar "Add Deal" and
  // the per-column "+" trigger the same Sheet.
  const [dealFormOpen, setDealFormOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [defaultStageId, setDefaultStageId] = useState<string>("");

  // Guard against double-seeding (React StrictMode double-effect in dev).
  const seedAttempted = useRef(false);

  const loadPipelines = useCallback(async () => {
    const { data, error } = await supabase
      .from("pipelines")
      .select("*")
      .order("created_at");
    if (error) {
      console.error("Failed to load pipelines:", error.message);
      return [];
    }
    return data ?? [];
  }, [supabase]);

  const loadStages = useCallback(
    async (pipelineId: string) => {
      const { data } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("position");
      return data ?? [];
    },
    [supabase],
  );

  const loadDeals = useCallback(
    async (pipelineId: string) => {
      const { data } = await supabase
        .from("deals")
        .select("*, contact:contacts(*), company:companies(*), assignee:profiles!deals_assigned_to_fkey(*)")
        .eq("pipeline_id", pipelineId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Deal[];
    },
    [supabase],
  );

  const loadFollowUps = useCallback(async () => {
    if (!accountId) return [];
    const { data, error } = await supabase
      .from("follow_ups")
      .select(
        "*, contact:contacts(*), company:companies(*), deal:deals(*), assignee:profiles!follow_ups_assigned_to_fkey(*)",
      )
      .eq("account_id", accountId)
      .order("due_at", { ascending: true });
    if (error) {
      console.error("Failed to load follow-ups:", error.message);
      return [];
    }
    return (data ?? []) as FollowUp[];
  }, [supabase, accountId]);

  const loadContacts = useCallback(async () => {
    if (!accountId) return [];
    const { data, error } = await supabase
      .from("contacts")
      .select("*, company_record:companies(*), conversations(id,last_message_at,status)")
      .eq("account_id", accountId)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("Failed to load contacts:", error.message);
      return [];
    }
    return (data ?? []) as ContactWithConversations[];
  }, [supabase, accountId]);

  const seedDefaultPipeline = useCallback(async (): Promise<Pipeline | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return null;
    // pipelines.account_id is NOT NULL post-017 with no DB default.
    if (!accountId) return null;

    const { data: pipeline, error } = await supabase
      .from("pipelines")
      .insert({ user_id: user.id, account_id: accountId, name: "Sales Pipeline" })
      .select()
      .single();

    if (error || !pipeline) {
      console.error("Failed to seed pipeline:", error?.message);
      return null;
    }

    const stagesPayload = SPEC_DEFAULT_STAGES.map((s) => ({
      pipeline_id: pipeline.id,
      name: s.name,
      color: s.color,
      position: s.position,
    }));
    await supabase.from("pipeline_stages").insert(stagesPayload);

    return pipeline as Pipeline;
  }, [supabase, accountId]);

  // Initial load + seed-if-empty
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let list = await loadPipelines();

      if (list.length === 0 && !seedAttempted.current) {
        seedAttempted.current = true;
        const seeded = await seedDefaultPipeline();
        if (seeded) list = await loadPipelines();
      }

      if (cancelled) return;
      setPipelines(list);
      if (list.length > 0) {
        setSelectedPipelineId((prev) =>
          prev && list.some((p) => p.id === prev) ? prev : list[0].id,
        );
      } else {
        setSelectedPipelineId("");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPipelines, seedDefaultPipeline]);

  // Load stages + deals whenever selected pipeline changes.
  // Clearing on no-selection is a legitimate sync with URL/prop
  // state; the load completion uses async setters inside promise
  // callbacks (not synchronous in the effect body).
  useEffect(() => {
    if (!selectedPipelineId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStages([]);
      setDeals([]);
      setFollowUps([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const [s, d, f, c] = await Promise.all([
        loadStages(selectedPipelineId),
        loadDeals(selectedPipelineId),
        loadFollowUps(),
        loadContacts(),
      ]);
      if (cancelled) return;
      setStages(s);
      setDeals(d);
      setFollowUps(f);
      setContacts(c);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPipelineId, loadStages, loadDeals, loadFollowUps, loadContacts]);

  const refreshPipelines = useCallback(async () => {
    const list = await loadPipelines();
    setPipelines(list);
    if (list.length === 0) setSelectedPipelineId("");
    else if (!list.some((p) => p.id === selectedPipelineId))
      setSelectedPipelineId(list[0].id);
  }, [loadPipelines, selectedPipelineId]);

  const refreshStages = useCallback(async () => {
    if (!selectedPipelineId) return;
    setStages(await loadStages(selectedPipelineId));
  }, [loadStages, selectedPipelineId]);

  const refreshDeals = useCallback(async () => {
    if (!selectedPipelineId) return;
    setDeals(await loadDeals(selectedPipelineId));
  }, [loadDeals, selectedPipelineId]);

  const refreshFollowUps = useCallback(async () => {
    setFollowUps(await loadFollowUps());
  }, [loadFollowUps]);

  const refreshContacts = useCallback(async () => {
    setContacts(await loadContacts());
  }, [loadContacts]);

  const handleDealMoved = useCallback(
    async (dealId: string, newStageId: string) => {
      // Optimistic update — board already animated; just persist.
      setDeals((prev) =>
        prev.map((d) => (d.id === dealId ? { ...d, stage_id: newStageId } : d)),
      );
      const { error } = await supabase
        .from("deals")
        .update({ stage_id: newStageId })
        .eq("id", dealId);
      if (error) {
        toast.error(t("toastFailedMoveDeal"));
        refreshDeals();
      }
    },
    [supabase, refreshDeals, t],
  );

  const handleAddDeal = useCallback(
    (stageId?: string) => {
      setEditingDeal(null);
      setDefaultStageId(stageId ?? stages[0]?.id ?? "");
      setDealFormOpen(true);
    },
    [stages],
  );

  const handleEditDeal = useCallback((deal: Deal) => {
    setEditingDeal(deal);
    setDefaultStageId(deal.stage_id);
    setDealFormOpen(true);
  }, []);

  const handleCreateFollowUp = useCallback(
    async (input: FollowUpCreateInput) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || !accountId) {
        toast.error(t("toastNotLinkedToAccount"));
        return;
      }

      const { data, error } = await supabase
        .from("follow_ups")
        .insert({
          ...input,
          user_id: user.id,
          account_id: accountId,
          status: "pending",
          is_primary: true,
        })
        .select()
        .single();

      if (error || !data) {
        toast.error(t("toastFailedCreateFollowUp"));
        return;
      }

      await supabase.from("follow_up_events").insert({
        account_id: accountId,
        follow_up_id: data.id,
        actor_profile_id: profile?.id ?? null,
        event_type: "created",
        to_status: "pending",
        to_due_at: input.due_at,
        note: input.note,
      });

      toast.success(t("toastFollowUpCreated"));
      await refreshFollowUps();
    },
    [supabase, accountId, profile?.id, refreshFollowUps, t],
  );

  const handleCompleteFollowUp = useCallback(
    async (followUp: FollowUp, result: string, decision: string) => {
      const completedAt = new Date().toISOString();
      const { error } = await supabase
        .from("follow_ups")
        .update({
          status: "completed",
          result: result || null,
          completed_at: completedAt,
          completed_by: profile?.id ?? null,
        })
        .eq("id", followUp.id);
      if (error) {
        toast.error(t("toastFailedUpdateFollowUp"));
        return;
      }
      if (accountId) {
        await supabase.from("follow_up_events").insert({
          account_id: accountId,
          follow_up_id: followUp.id,
          actor_profile_id: profile?.id ?? null,
          event_type: "completed",
          from_status: followUp.status,
          to_status: "completed",
          decision,
          result: result || null,
        });
      }
      toast.success(t("toastFollowUpCompleted"));
      await refreshFollowUps();
    },
    [supabase, accountId, profile?.id, refreshFollowUps, t],
  );

  const handleRescheduleFollowUp = useCallback(
    async (followUp: FollowUp, dueAt: string) => {
      const { error } = await supabase
        .from("follow_ups")
        .update({ status: "rescheduled" })
        .eq("id", followUp.id);
      if (error) {
        toast.error(t("toastFailedUpdateFollowUp"));
        return;
      }

      const { error: createError } = await supabase.from("follow_ups").insert({
        account_id: followUp.account_id,
        user_id: followUp.user_id,
        contact_id: followUp.contact_id,
        deal_id: followUp.deal_id,
        conversation_id: followUp.conversation_id,
        company_id: followUp.company_id ?? null,
        assigned_to: followUp.assigned_to,
        activity_type: followUp.activity_type,
        channel: followUp.channel,
        priority: followUp.priority,
        due_at: dueAt,
        note: followUp.note,
        status: "pending",
        is_primary: followUp.is_primary,
        rescheduled_from_id: followUp.id,
      });

      if (createError) {
        await supabase
          .from("follow_ups")
          .update({ status: "pending" })
          .eq("id", followUp.id);
        toast.error(t("toastFailedUpdateFollowUp"));
        return;
      }

      if (accountId) {
        await supabase.from("follow_up_events").insert({
          account_id: accountId,
          follow_up_id: followUp.id,
          actor_profile_id: profile?.id ?? null,
          event_type: "rescheduled",
          from_status: followUp.status,
          to_status: "rescheduled",
          from_due_at: followUp.due_at,
          to_due_at: dueAt,
        });
      }
      toast.success(t("toastFollowUpRescheduled"));
      await refreshFollowUps();
    },
    [supabase, accountId, profile?.id, refreshFollowUps, t],
  );

  const handleCancelFollowUp = useCallback(
    async (followUp: FollowUp, result: string) => {
      const { error } = await supabase
        .from("follow_ups")
        .update({ status: "cancelled", result: result || null })
        .eq("id", followUp.id);
      if (error) {
        toast.error(t("toastFailedUpdateFollowUp"));
        return;
      }
      if (accountId) {
        await supabase.from("follow_up_events").insert({
          account_id: accountId,
          follow_up_id: followUp.id,
          actor_profile_id: profile?.id ?? null,
          event_type: "cancelled",
          from_status: followUp.status,
          to_status: "cancelled",
          result: result || null,
        });
      }
      toast.success(t("toastFollowUpCancelled"));
      await refreshFollowUps();
    },
    [supabase, accountId, profile?.id, refreshFollowUps, t],
  );

  async function handleCreatePipeline() {
    const name = newPipelineName.trim();
    if (!name) return;
    setCreating(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      setCreating(false);
      return;
    }
    // pipelines.account_id is NOT NULL post-017 with no DB default.
    if (!accountId) {
      toast.error(t("toastNotLinkedToAccount"));
      setCreating(false);
      return;
    }

    const { data: pipeline, error } = await supabase
      .from("pipelines")
      .insert({ user_id: user.id, account_id: accountId, name })
      .select()
      .single();

    if (error || !pipeline) {
      toast.error(t("toastFailedCreatePipeline"));
      setCreating(false);
      return;
    }

    const stagesPayload = SPEC_DEFAULT_STAGES.map((s) => ({
      pipeline_id: pipeline.id,
      name: s.name,
      color: s.color,
      position: s.position,
    }));
    await supabase.from("pipeline_stages").insert(stagesPayload);

    setNewPipelineName("");
    setNewPipelineOpen(false);
    setSelectedPipelineId(pipeline.id);
    await refreshPipelines();
    setCreating(false);
    toast.success(t("toastPipelineCreated"));
  }

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-9 w-28 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="flex gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-96 w-72 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Pipeline selector dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors data-[popup-open]:bg-muted"
            >
              <GitBranch className="h-4 w-4 text-primary" />
              <span className="font-semibold">
                {selectedPipeline?.name ?? t("selectPipeline")}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-64 border-border bg-popover text-popover-foreground"
            >
              {pipelines.length === 0 && (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  {t("noPipelinesYet")}
                </DropdownMenuItem>
              )}
              {pipelines.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => setSelectedPipelineId(p.id)}
                  className={
                    p.id === selectedPipelineId
                      ? "text-primary"
                      : "text-popover-foreground"
                  }
                >
                  <GitBranch className="mr-2 h-3.5 w-3.5" />
                  {p.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-border" />
              {selectedPipeline && (
                <DropdownMenuItem
                  onClick={() => setSettingsOpen(true)}
                  className="text-popover-foreground"
                >
                  <Settings className="mr-2 h-3.5 w-3.5" />
                  {t("managePipelines")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          <GatedButton
            variant="outline"
            canAct={canEditSettings}
            gateReason="create pipelines"
            onClick={() => setNewPipelineOpen(true)}
            className="border-border bg-card text-foreground hover:bg-muted"
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("addPipeline")}
          </GatedButton>
          <GatedButton
            canAct={canCreateDeals}
            gateReason="create deals"
            disabled={!selectedPipelineId || stages.length === 0}
            onClick={() => handleAddDeal()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("addDeal")}
          </GatedButton>
        </div>
      </div>

      {/* Board */}
      {pipelines.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
          <GitBranch className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium text-foreground">
            {t("noPipelinesYet")}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("createToStartTracking")}
          </p>
          <GatedButton
            canAct={canEditSettings}
            gateReason="create pipelines"
            onClick={() => setNewPipelineOpen(true)}
            className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("createPipeline")}
          </GatedButton>
        </div>
      ) : (
        <>
          <PipelineAnalytics stages={stages} deals={deals} />
          <FollowUpWorkspace
            deals={deals}
            contacts={contacts}
            followUps={followUps}
            onCreateFollowUp={handleCreateFollowUp}
            onCompleteFollowUp={handleCompleteFollowUp}
            onRescheduleFollowUp={handleRescheduleFollowUp}
            onCancelFollowUp={handleCancelFollowUp}
          />
          <PipelineBoard
            stages={stages}
            deals={deals}
            followUps={followUps}
            onDealMoved={handleDealMoved}
            onAddDeal={handleAddDeal}
            onEditDeal={handleEditDeal}
          />
        </>
      )}

      {/* New Pipeline Dialog */}
      <Dialog open={newPipelineOpen} onOpenChange={setNewPipelineOpen}>
        <DialogContent className="sm:max-w-sm bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{t("newPipeline")}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-muted-foreground">{t("pipelineName")}</Label>
            <Input
              value={newPipelineName}
              onChange={(e) => setNewPipelineName(e.target.value)}
              placeholder={t("pipelineNamePlaceholder")}
              className="mt-2 bg-muted border-border text-foreground"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreatePipeline();
              }}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {t("defaultStagesDesc")}
            </p>
          </div>
          <DialogFooter className="bg-popover/50 border-border">
            <Button
              variant="outline"
              onClick={() => setNewPipelineOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleCreatePipeline}
              disabled={creating || !newPipelineName.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {creating ? t("creating") : t("createPipelineBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pipeline Settings */}
      {selectedPipeline && (
        <PipelineSettings
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          pipeline={selectedPipeline}
          stages={stages}
          onPipelinesChanged={refreshPipelines}
          onStagesChanged={refreshStages}
          onCreateNewPipeline={() => {
            setSettingsOpen(false);
            setNewPipelineOpen(true);
          }}
        />
      )}

      {/* Deal Form (Sheet) */}
      <DealForm
        open={dealFormOpen}
        onOpenChange={setDealFormOpen}
        deal={editingDeal}
        pipelineId={selectedPipelineId}
        stages={stages}
        defaultStageId={defaultStageId}
        onSaved={async () => {
          await refreshDeals();
          await refreshFollowUps();
          await refreshContacts();
        }}
      />
    </div>
  );
}
