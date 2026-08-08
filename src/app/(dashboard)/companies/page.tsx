"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import type {
  Company,
  CompanyCommercialStatus,
  Contact,
  Deal,
  FollowUp,
  Profile,
} from "@/types";
import {
  buildCompanyRows,
  filterCompanyRows,
  type CompanyArchiveFilter,
  type CompanyPresenceFilter,
} from "@/lib/companies-workspace";
import { buildCompanyDisplayName } from "@/lib/companies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Building2,
  CalendarClock,
  Plus,
  Search,
  TriangleAlert,
  Users,
} from "lucide-react";

const STATUSES: (CompanyCommercialStatus | "all")[] = [
  "all",
  "prospect",
  "active_customer",
  "at_risk",
  "inactive",
  "reactivated",
  "archived",
];

export default function CompaniesPage() {
  const t = useTranslations("Companies.list");
  const tCommon = useTranslations("Companies.common");
  const supabase = createClient();
  const { accountId } = useAuth();
  const canEdit = useCan("send-messages");

  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [commercialStatus, setCommercialStatus] =
    useState<CompanyCommercialStatus | "all">("all");
  const [assignedTo, setAssignedTo] = useState<string | "all">("all");
  const [segment, setSegment] = useState<string | "all">("all");
  const [primaryContact, setPrimaryContact] =
    useState<CompanyPresenceFilter>("all");
  const [nextFollowUp, setNextFollowUp] =
    useState<CompanyPresenceFilter>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [archive, setArchive] = useState<CompanyArchiveFilter>("active");

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const [companyRows, contactRows, dealRows, followUpRows, profileRows] =
      await Promise.all([
        supabase.from("companies").select("*").eq("account_id", accountId).order("trade_name"),
        supabase.from("contacts").select("*").eq("account_id", accountId).not("company_id", "is", null),
        supabase.from("deals").select("*").eq("account_id", accountId),
        supabase.from("follow_ups").select("*").eq("account_id", accountId).order("due_at"),
        supabase.from("profiles").select("*").eq("account_id", accountId).order("full_name"),
      ]);
    setCompanies((companyRows.data ?? []) as Company[]);
    setContacts((contactRows.data ?? []) as Contact[]);
    setDeals((dealRows.data ?? []) as Deal[]);
    setFollowUps((followUpRows.data ?? []) as FollowUp[]);
    setProfiles((profileRows.data ?? []) as Profile[]);
    setLoading(false);
  }, [accountId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const rows = useMemo(
    () =>
      buildCompanyRows(
        companies.map((company) => ({
          company,
          contacts: contacts.filter((contact) => contact.company_id === company.id),
          deals: deals.filter((deal) => deal.company_id === company.id),
          followUps: followUps.filter((followUp) => followUp.company_id === company.id),
          profiles,
        })),
      ),
    [companies, contacts, deals, followUps, profiles],
  );

  const segments = useMemo(
    () => [...new Set(companies.map((company) => company.segment).filter(Boolean))] as string[],
    [companies],
  );

  const visibleRows = filterCompanyRows(rows, {
    search,
    commercialStatus,
    assignedTo,
    segment,
    primaryContact,
    nextFollowUp,
    overdueOnly,
    archive,
  });

  const statusLabel = (value: string) => {
    const labels: Record<string, string> = {
      all: tCommon("statuses.all"),
      prospect: tCommon("statuses.prospect"),
      active_customer: tCommon("statuses.active_customer"),
      at_risk: tCommon("statuses.at_risk"),
      inactive: tCommon("statuses.inactive"),
      reactivated: tCommon("statuses.reactivated"),
      archived: tCommon("statuses.archived"),
    };
    return labels[value] ?? value.replaceAll("_", " ");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/companies/new" />} disabled={!canEdit}>
          <Plus className="mr-2 h-4 w-4" />
          {t("newCompany")}
        </Button>
      </div>

      <section className="grid gap-3 rounded-lg border border-border bg-card p-3 xl:grid-cols-[1.4fr_repeat(7,minmax(0,1fr))]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <Select value={commercialStatus} onChange={(value) => setCommercialStatus(value as CompanyCommercialStatus | "all")}>
          {STATUSES.map((status) => (
            <option key={status} value={status}>{statusLabel(status)}</option>
          ))}
        </Select>
        <Select value={assignedTo} onChange={setAssignedTo}>
          <option value="all">{t("filters.allOwners")}</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>{profile.full_name || profile.email}</option>
          ))}
        </Select>
        <Select value={segment} onChange={setSegment}>
          <option value="all">{t("filters.allSegments")}</option>
          {segments.map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
        <Select value={primaryContact} onChange={(value) => setPrimaryContact(value as CompanyPresenceFilter)}>
          <option value="all">{t("filters.primaryContact")}</option>
          <option value="with">{t("filters.withPrimary")}</option>
          <option value="without">{t("filters.withoutPrimary")}</option>
        </Select>
        <Select value={nextFollowUp} onChange={(value) => setNextFollowUp(value as CompanyPresenceFilter)}>
          <option value="all">{t("filters.nextFollowUp")}</option>
          <option value="with">{t("filters.withNext")}</option>
          <option value="without">{t("filters.withoutNext")}</option>
        </Select>
        <Select value={archive} onChange={(value) => setArchive(value as CompanyArchiveFilter)}>
          <option value="active">{t("filters.active")}</option>
          <option value="archived">{t("filters.archived")}</option>
          <option value="all">{t("filters.all")}</option>
        </Select>
        <label className="flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(event) => setOverdueOnly(event.target.checked)}
          />
          {t("filters.overdue")}
        </label>
      </section>

      <section className="overflow-x-auto rounded-lg border border-border bg-card">
        <div className="grid min-w-[920px] grid-cols-[1.5fr_0.8fr_0.8fr_0.9fr_0.8fr_0.8fr_1fr] gap-3 border-b border-border px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>{t("table.company")}</span>
          <span>{t("table.status")}</span>
          <span>{t("table.primary")}</span>
          <span>{t("table.owner")}</span>
          <span>{t("table.contacts")}</span>
          <span>{t("table.deals")}</span>
          <span>{t("table.nextAction")}</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
        ) : visibleRows.length === 0 ? (
          <div className="p-8 text-center">
            <Building2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">{t("emptyTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("emptyDescription")}</p>
          </div>
        ) : (
          <div className="min-w-[920px] divide-y divide-border">
            {visibleRows.map((row) => (
              <Link
                key={row.company.id}
                href={`/companies/${row.company.id}`}
                className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.9fr_0.8fr_0.8fr_1fr] gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">
                    {buildCompanyDisplayName(row.company)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.company.segment || row.company.legal_name || t("noSegment")}
                    {row.company.archived_at ? ` · ${t("archivedSuffix")}` : ""}
                  </span>
                </span>
                <span>{statusLabel(row.company.commercial_status)}</span>
                <span className="truncate">{row.primaryContact?.name || row.primaryContact?.phone || t("pending")}</span>
                <span className="truncate">{row.owner?.full_name || row.owner?.email || tCommon("unassigned")}</span>
                <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{row.contactsCount}</span>
                <span>{t("openDeals", { count: row.openDealsCount })}</span>
                <span className={row.hasOverdueFollowUp ? "font-medium text-red-300" : "text-muted-foreground"}>
                  {row.hasOverdueFollowUp ? <TriangleAlert className="mr-1 inline h-3 w-3" /> : <CalendarClock className="mr-1 inline h-3 w-3" />}
                  {row.nextFollowUp ? new Date(row.nextFollowUp.due_at).toLocaleDateString() : t("noNextAction")}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
    >
      {children}
    </select>
  );
}
