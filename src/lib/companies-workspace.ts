import type {
  Company,
  CompanyCommercialStatus,
  Contact,
  Deal,
  FollowUp,
  Profile,
} from "@/types";
import { buildCompanyDisplayName, normalizeCompanyName } from "@/lib/companies";
import { getFollowUpBucket, getNextPendingFollowUp } from "@/lib/follow-ups";

export type CompanyArchiveFilter = "active" | "archived" | "all";
export type CompanyPresenceFilter = "all" | "with" | "without";

export interface CompanyWorkspaceFilters {
  search: string;
  commercialStatus: CompanyCommercialStatus | "all";
  assignedTo: string | "all";
  segment: string | "all";
  primaryContact: CompanyPresenceFilter;
  nextFollowUp: CompanyPresenceFilter;
  overdueOnly: boolean;
  archive: CompanyArchiveFilter;
}

export interface CompanyWorkspaceRow {
  company: Company;
  primaryContact: Contact | null;
  contactsCount: number;
  openDealsCount: number;
  nextFollowUp: FollowUp | null;
  hasOverdueFollowUp: boolean;
  owner: Profile | null;
}

export interface CompanyScopedData {
  company: Company;
  contacts: Contact[];
  deals: Deal[];
  followUps: FollowUp[];
  profiles?: Profile[];
}

export interface CompanyPayloadInput {
  accountId: string;
  userId: string;
  legalName?: string;
  tradeName?: string;
  taxId?: string;
  commercialStatus: CompanyCommercialStatus;
  segment?: string;
  website?: string;
  primaryPhone?: string;
  primaryEmail?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  assignedTo?: string;
  notes?: string;
}

export interface CompanyValidationResult {
  ok: boolean;
  message?: string;
}

export function buildCompanyRows(data: CompanyScopedData[]): CompanyWorkspaceRow[] {
  return data.map(({ company, contacts, deals, followUps, profiles = [] }) => {
    const pending = followUps.filter((item) => item.status === "pending");
    const nextFollowUp = getNextPendingFollowUp(pending);
    return {
      company,
      primaryContact:
        contacts.find((contact) => contact.is_primary_company_contact) ?? null,
      contactsCount: contacts.length,
      openDealsCount: deals.filter((deal) => (deal.status ?? "open") === "open").length,
      nextFollowUp,
      hasOverdueFollowUp: pending.some(
        (item) => getFollowUpBucket(item, new Date()) === "overdue",
      ),
      owner:
        profiles.find((profile) => profile.id === company.assigned_to) ??
        company.assignee ??
        null,
    };
  });
}

export function filterCompanyRows(
  rows: CompanyWorkspaceRow[],
  filters: CompanyWorkspaceFilters,
): CompanyWorkspaceRow[] {
  const term = normalizeCompanyName(filters.search);

  return rows.filter((row) => {
    const { company } = row;
    if (filters.archive === "active" && company.archived_at) return false;
    if (filters.archive === "archived" && !company.archived_at) return false;
    if (
      filters.commercialStatus !== "all" &&
      company.commercial_status !== filters.commercialStatus
    ) {
      return false;
    }
    if (filters.assignedTo !== "all" && company.assigned_to !== filters.assignedTo) {
      return false;
    }
    if (filters.segment !== "all" && (company.segment || "") !== filters.segment) {
      return false;
    }
    if (filters.primaryContact === "with" && !row.primaryContact) return false;
    if (filters.primaryContact === "without" && row.primaryContact) return false;
    if (filters.nextFollowUp === "with" && !row.nextFollowUp) return false;
    if (filters.nextFollowUp === "without" && row.nextFollowUp) return false;
    if (filters.overdueOnly && !row.hasOverdueFollowUp) return false;

    if (!term) return true;
    const haystack = normalizeCompanyName(
      [
        buildCompanyDisplayName(company),
        company.legal_name,
        company.tax_id,
        company.segment,
        company.primary_phone,
        company.general_email,
      ]
        .filter(Boolean)
        .join(" "),
    );
    return haystack.includes(term);
  });
}

export function buildCompanyPayload(input: CompanyPayloadInput) {
  return {
    account_id: input.accountId,
    user_id: input.userId,
    legal_name: clean(input.legalName),
    trade_name: clean(input.tradeName) ?? clean(input.legalName) ?? "",
    tax_id: clean(input.taxId),
    commercial_status: input.commercialStatus,
    segment: clean(input.segment),
    website: clean(input.website),
    primary_phone: clean(input.primaryPhone),
    general_email: clean(input.primaryEmail),
    address_line1: clean(input.addressLine1),
    address_line2: clean(input.addressLine2),
    city: clean(input.city),
    region: clean(input.region),
    postal_code: clean(input.postalCode),
    country: clean(input.country),
    assigned_to: clean(input.assignedTo),
    notes: clean(input.notes),
  };
}

export function validateCompanyPayload(
  payload: ReturnType<typeof buildCompanyPayload>,
  existingCompanies: Company[],
  currentCompanyId?: string,
): CompanyValidationResult {
  if (!payload.trade_name.trim()) {
    return { ok: false, message: "O nome da empresa é obrigatório." };
  }
  const key = normalizeCompanyName(payload.trade_name);
  const duplicate = existingCompanies.find(
    (company) =>
      company.id !== currentCompanyId &&
      !company.archived_at &&
      normalizeCompanyName(company.trade_name || company.legal_name) === key,
  );
  if (duplicate) {
    return { ok: false, message: "Já existe uma empresa ativa com esse nome." };
  }
  return { ok: true };
}

export function canUseCompanyScopedRecord(
  accountId: string,
  record: { account_id?: string | null },
): boolean {
  return record.account_id === accountId;
}

export function buildLinkedContactUpdate(accountId: string, company: Company) {
  if (!canUseCompanyScopedRecord(accountId, company)) {
    throw new Error("A empresa não pertence a esta conta.");
  }
  return {
    company_id: company.id,
    company: buildCompanyDisplayName(company),
  };
}

function clean(value: string | null | undefined): string | null {
  const next = value?.trim();
  return next ? next : null;
}
