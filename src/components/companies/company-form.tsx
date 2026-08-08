"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import type { Company, CompanyCommercialStatus, Profile } from "@/types";
import {
  buildCompanyPayload,
  validateCompanyPayload,
} from "@/lib/companies-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Archive, Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

const STATUS_OPTIONS: CompanyCommercialStatus[] = [
  "prospect",
  "active_customer",
  "at_risk",
  "inactive",
  "reactivated",
  "archived",
];

interface CompanyFormProps {
  companyId?: string;
}

export function CompanyForm({ companyId }: CompanyFormProps) {
  const t = useTranslations("Companies.form");
  const tCommon = useTranslations("Companies.common");
  const supabase = createClient();
  const router = useRouter();
  const { accountId } = useAuth();
  const canEdit = useCan("send-messages");
  const isEdit = !!companyId;

  const [company, setCompany] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [commercialStatus, setCommercialStatus] =
    useState<CompanyCommercialStatus>("prospect");
  const [segment, setSegment] = useState("");
  const [website, setWebsite] = useState("");
  const [primaryPhone, setPrimaryPhone] = useState("");
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const [existingCompanies, members] = await Promise.all([
      supabase.from("companies").select("*").eq("account_id", accountId),
      supabase.from("profiles").select("*").eq("account_id", accountId).order("full_name"),
    ]);
    setCompanies((existingCompanies.data ?? []) as Company[]);
    setProfiles((members.data ?? []) as Profile[]);

    if (companyId) {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("account_id", accountId)
        .eq("id", companyId)
        .maybeSingle();
      if (error || !data) {
        toast.error(t("toasts.notFound"));
        router.push("/companies");
        return;
      }
      const row = data as Company;
      setCompany(row);
      setLegalName(row.legal_name ?? "");
      setTradeName(row.trade_name ?? "");
      setTaxId(row.tax_id ?? "");
      setCommercialStatus(row.commercial_status);
      setSegment(row.segment ?? "");
      setWebsite(row.website ?? "");
      setPrimaryPhone(row.primary_phone ?? "");
      setPrimaryEmail(row.general_email ?? "");
      setAddressLine1(row.address_line1 ?? "");
      setAddressLine2(row.address_line2 ?? "");
      setCity(row.city ?? "");
      setRegion(row.region ?? "");
      setPostalCode(row.postal_code ?? "");
      setCountry(row.country ?? "");
      setAssignedTo(row.assigned_to ?? "");
      setNotes(row.notes ?? "");
    }
    setLoading(false);
  }, [accountId, companyId, router, supabase, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!accountId || !canEdit) return;
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error(t("toasts.unauthenticated"));

      const payload = buildCompanyPayload({
        accountId,
        userId: company?.user_id ?? user.id,
        legalName,
        tradeName,
        taxId,
        commercialStatus,
        segment,
        website,
        primaryPhone,
        primaryEmail,
        addressLine1,
        addressLine2,
        city,
        region,
        postalCode,
        country,
        assignedTo,
        notes,
      });
      const validation = validateCompanyPayload(payload, companies, companyId);
      if (!validation.ok) {
        toast.error(validation.message);
        return;
      }

      if (isEdit && companyId) {
        const { error } = await supabase
          .from("companies")
          .update(payload)
          .eq("account_id", accountId)
          .eq("id", companyId);
        if (error) throw error;
        toast.success(t("toasts.updated"));
        router.push(`/companies/${companyId}`);
      } else {
        const { data, error } = await supabase
          .from("companies")
          .insert(payload)
          .select("id")
          .single();
        if (error || !data) throw error;
        toast.success(t("toasts.created"));
        router.push(`/companies/${data.id}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toasts.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function setArchived(archived: boolean) {
    if (!accountId || !companyId || !canEdit) return;
    setSaving(true);
    const { error } = await supabase
      .from("companies")
      .update({
        archived_at: archived ? new Date().toISOString() : null,
        commercial_status: archived ? "archived" : "prospect",
      })
      .eq("account_id", accountId)
      .eq("id", companyId);
    setSaving(false);
    if (error) {
      toast.error(t("toasts.archiveFailed"));
      return;
    }
    toast.success(archived ? t("toasts.archived") : t("toasts.restored"));
    router.refresh();
    load();
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={<Link href={companyId ? `/companies/${companyId}` : "/companies"} />}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
              {tCommon("back")}
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              {isEdit ? t("editTitle") : t("newTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
        </div>
        {isEdit && company && (
          <Button
            variant="outline"
            onClick={() => setArchived(!company.archived_at)}
            disabled={!canEdit || saving}
          >
            {company.archived_at ? (
              <RotateCcw className="mr-2 h-4 w-4" />
            ) : (
              <Archive className="mr-2 h-4 w-4" />
            )}
            {company.archived_at ? tCommon("restore") : tCommon("archive")}
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-sm font-semibold text-foreground">{t("sections.identity")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("fields.tradeName")}>
              <Input value={tradeName} onChange={(e) => setTradeName(e.target.value)} />
            </Field>
            <Field label={t("fields.legalName")}>
              <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
            </Field>
            <Field label={t("fields.taxId")}>
              <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} />
            </Field>
            <Field label={t("fields.commercialStatus")}>
              <select
                value={commercialStatus}
                onChange={(e) => setCommercialStatus(e.target.value as CompanyCommercialStatus)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status, tCommon)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("fields.segment")}>
              <Input value={segment} onChange={(e) => setSegment(e.target.value)} />
            </Field>
            <Field label={t("fields.owner")}>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{tCommon("unassigned")}</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.full_name || profile.email}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-sm font-semibold text-foreground">{t("sections.channels")}</h2>
          <div className="grid gap-4">
            <Field label={t("fields.primaryPhone")}>
              <Input value={primaryPhone} onChange={(e) => setPrimaryPhone(e.target.value)} />
            </Field>
            <Field label={t("fields.primaryEmail")}>
              <Input value={primaryEmail} onChange={(e) => setPrimaryEmail(e.target.value)} />
            </Field>
            <Field label={t("fields.website")}>
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-sm font-semibold text-foreground">{t("sections.address")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("fields.addressLine1")}>
              <Input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
            </Field>
            <Field label={t("fields.addressLine2")}>
              <Input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
            </Field>
            <Field label={t("fields.city")}>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <Field label={t("fields.region")}>
              <Input value={region} onChange={(e) => setRegion(e.target.value)} />
            </Field>
            <Field label={t("fields.postalCode")}>
              <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
            </Field>
            <Field label={t("fields.country")}>
              <Input value={country} onChange={(e) => setCountry(e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-sm font-semibold text-foreground">{t("sections.notes")}</h2>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={8} />
        </section>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          nativeButton={false}
          variant="outline"
          render={<Link href={companyId ? `/companies/${companyId}` : "/companies"} />}
        >
          {tCommon("cancel")}
        </Button>
        <Button onClick={save} disabled={!canEdit || saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {tCommon("save")}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function statusLabel(
  status: CompanyCommercialStatus,
  t: ReturnType<typeof useTranslations<"Companies.common">>,
): string {
  const labels: Record<CompanyCommercialStatus, string> = {
    prospect: t("statuses.prospect"),
    active_customer: t("statuses.active_customer"),
    at_risk: t("statuses.at_risk"),
    inactive: t("statuses.inactive"),
    reactivated: t("statuses.reactivated"),
    archived: t("statuses.archived"),
  };
  return labels[status];
}
