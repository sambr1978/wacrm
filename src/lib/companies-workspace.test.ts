import { describe, expect, it } from "vitest";

import type { Company, Contact, Deal, FollowUp, Profile } from "@/types";
import {
  buildCompanyPayload,
  buildCompanyRows,
  buildLinkedContactUpdate,
  filterCompanyRows,
  validateCompanyPayload,
  type CompanyWorkspaceFilters,
} from "./companies-workspace";

const baseFilters: CompanyWorkspaceFilters = {
  search: "",
  commercialStatus: "all",
  assignedTo: "all",
  segment: "all",
  primaryContact: "all",
  nextFollowUp: "all",
  overdueOnly: false,
  archive: "active",
};

function company(overrides: Partial<Company> = {}): Company {
  return {
    id: "company-1",
    account_id: "account-1",
    user_id: "user-1",
    legal_name: "Acme Brasil Ltda",
    trade_name: "Acme Brasil",
    normalized_name: "acme brasil",
    tax_id: null,
    commercial_status: "prospect",
    segment: "Retail",
    website: null,
    primary_phone: null,
    general_email: null,
    address_line1: null,
    address_line2: null,
    city: null,
    region: null,
    postal_code: null,
    country: null,
    assigned_to: "profile-1",
    notes: null,
    archived_at: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "contact-1",
    user_id: "user-1",
    account_id: "account-1",
    phone: "+5511999999999",
    name: "Ana",
    email: undefined,
    company: "Acme Brasil",
    company_id: "company-1",
    job_title: null,
    commercial_role: null,
    is_primary_company_contact: false,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function deal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: "deal-1",
    user_id: "user-1",
    account_id: "account-1",
    pipeline_id: "pipeline-1",
    stage_id: "stage-1",
    contact_id: "contact-1",
    company_id: "company-1",
    title: "New contract",
    value: 1000,
    status: "open",
    created_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function followUp(overrides: Partial<FollowUp> = {}): FollowUp {
  return {
    id: "follow-1",
    account_id: "account-1",
    user_id: "user-1",
    contact_id: null,
    company_id: "company-1",
    deal_id: null,
    conversation_id: null,
    assigned_to: null,
    activity_type: "whatsapp",
    channel: "whatsapp",
    priority: "normal",
    status: "pending",
    due_at: "2026-01-01T00:00:00Z",
    note: null,
    result: null,
    completed_at: null,
    completed_by: null,
    rescheduled_from_id: null,
    is_primary: true,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "profile-1",
    user_id: "user-1",
    full_name: "Sam",
    email: "sam@example.com",
    role: "agent",
    created_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("companies workspace helpers", () => {
  it("builds list rows with primary contact, open deals, owner, next follow-up, and overdue state", () => {
    const [row] = buildCompanyRows([
      {
        company: company(),
        contacts: [contact({ is_primary_company_contact: true })],
        deals: [deal(), deal({ id: "deal-2", status: "won" })],
        followUps: [followUp()],
        profiles: [profile()],
      },
    ]);

    expect(row).toMatchObject({
      contactsCount: 1,
      openDealsCount: 1,
      hasOverdueFollowUp: true,
    });
    expect(row?.primaryContact?.id).toBe("contact-1");
    expect(row?.owner?.id).toBe("profile-1");
    expect(row?.nextFollowUp?.id).toBe("follow-1");
  });

  it("filters by search, status, owner, segment, primary contact, next follow-up, overdue, and archived state", () => {
    const rows = buildCompanyRows([
      {
        company: company(),
        contacts: [contact({ is_primary_company_contact: true })],
        deals: [deal()],
        followUps: [followUp()],
      },
      {
        company: company({
          id: "company-2",
          trade_name: "Beta",
          normalized_name: "beta",
          commercial_status: "inactive",
          segment: "Services",
          assigned_to: null,
          archived_at: "2026-08-02T00:00:00Z",
        }),
        contacts: [],
        deals: [],
        followUps: [],
      },
    ]);

    expect(
      filterCompanyRows(rows, {
        ...baseFilters,
        search: "acme",
        commercialStatus: "prospect",
        assignedTo: "profile-1",
        segment: "Retail",
        primaryContact: "with",
        nextFollowUp: "with",
        overdueOnly: true,
      }).map((row) => row.company.id),
    ).toEqual(["company-1"]);
    expect(filterCompanyRows(rows, { ...baseFilters, archive: "archived" })).toHaveLength(1);
  });

  it("validates duplicate active companies after normalization but allows editing the current row", () => {
    const existing = [company({ trade_name: "Ácme Comércio LTDA." })];
    const payload = buildCompanyPayload({
      accountId: "account-1",
      userId: "user-1",
      tradeName: "ACME Comercio Ltda",
      commercialStatus: "prospect",
    });

    expect(validateCompanyPayload(payload, existing).ok).toBe(false);
    expect(validateCompanyPayload(payload, existing, "company-1").ok).toBe(true);
  });

  it("builds linked contact updates from the relational company and rejects cross-account records", () => {
    expect(buildLinkedContactUpdate("account-1", company())).toEqual({
      company_id: "company-1",
      company: "Acme Brasil",
    });
    expect(() =>
      buildLinkedContactUpdate("account-2", company()),
    ).toThrow("A empresa não pertence");
  });
});
