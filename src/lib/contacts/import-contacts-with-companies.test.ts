import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ParsedContactRow } from "./parse-contact-csv";
import { importContactsWithCompanies } from "./import-contacts-with-companies";

interface FakeCompany {
  id: string;
  account_id: string;
  user_id: string;
  trade_name: string;
  normalized_name: string;
  archived_at: string | null;
}

interface FakeContact {
  id: string;
  account_id: string;
  user_id: string;
  phone: string;
  phone_normalized: string;
  name: string | null;
  email: string | null;
  company: string | null;
  company_id: string | null;
}

interface FakeDbState {
  companies?: FakeCompany[];
  contacts?: FakeContact[];
  failPhones?: string[];
}

function row(phone: string, company?: string): ParsedContactRow {
  return { phone, company, tagNames: [] };
}

function fakeSupabase(initial: FakeDbState = {}) {
  const state = {
    companies: [...(initial.companies ?? [])],
    contacts: [...(initial.contacts ?? [])],
    failPhones: new Set(initial.failPhones ?? []),
    nextCompany: 1,
    nextContact: 1,
  };

  return {
    state,
    client: {
      from(table: "contacts" | "companies") {
        return makeBuilder(table, state);
      },
    } as unknown as SupabaseClient,
  };
}

function makeBuilder(
  table: "contacts" | "companies",
  state: {
    companies: FakeCompany[];
    contacts: FakeContact[];
    failPhones: Set<string>;
    nextCompany: number;
    nextContact: number;
  },
) {
  const filters: Record<string, unknown> = {};
  const nullFilters = new Set<string>();
  let insertPayload: unknown;
  let selectColumns = "*";

  const builder = {
    select(columns = "*") {
      selectColumns = columns;
      return builder;
    },
    eq(column: string, value: unknown) {
      filters[column] = value;
      return builder;
    },
    is(column: string, value: unknown) {
      if (value === null) nullFilters.add(column);
      return builder;
    },
    insert(payload: unknown) {
      insertPayload = payload;
      return builder;
    },
    single() {
      return execute();
    },
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return execute().then(resolve, reject);
    },
  };

  async function execute() {
    if (insertPayload !== undefined) {
      return executeInsert(table, insertPayload, selectColumns, state);
    }

    if (table === "contacts") {
      const contacts = state.contacts.filter((contact) =>
        Object.entries(filters).every(([key, value]) => contact[key as keyof FakeContact] === value),
      );
      return {
        data: contacts.map(({ phone_normalized }) => ({ phone_normalized })),
        error: null,
      };
    }

    const companies = state.companies.filter((company) => {
      const matchesFilters = Object.entries(filters).every(
        ([key, value]) => company[key as keyof FakeCompany] === value,
      );
      const matchesNull = [...nullFilters].every(
        (key) => company[key as keyof FakeCompany] === null,
      );
      return matchesFilters && matchesNull;
    });

    return {
      data: companies.map(({ id, normalized_name }) => ({ id, normalized_name })),
      error: null,
    };
  }

  return builder;
}

async function executeInsert(
  table: "contacts" | "companies",
  payload: unknown,
  selectColumns: string,
  state: {
    companies: FakeCompany[];
    contacts: FakeContact[];
    failPhones: Set<string>;
    nextCompany: number;
    nextContact: number;
  },
) {
  if (table === "companies") {
    const item = payload as {
      account_id: string;
      user_id: string;
      trade_name: string;
    };
    const normalized_name = item.trade_name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const company: FakeCompany = {
      id: `new-company-${state.nextCompany++}`,
      account_id: item.account_id,
      user_id: item.user_id,
      trade_name: item.trade_name,
      normalized_name,
      archived_at: null,
    };
    state.companies.push(company);
    return { data: selectColumns === "id" ? { id: company.id } : company, error: null };
  }

  const rows = Array.isArray(payload) ? payload : [payload];
  const hasFailingRow = rows.some((item) =>
    state.failPhones.has((item as { phone: string }).phone),
  );
  if (hasFailingRow) {
    return { data: null, error: { code: "23514", message: "bad contact" } };
  }

  const inserted = rows.map((item) => {
    const source = item as Omit<FakeContact, "id" | "phone_normalized">;
    const contact: FakeContact = {
      ...source,
      id: `new-contact-${state.nextContact++}`,
      phone_normalized: source.phone.replace(/\D/g, ""),
    };
    state.contacts.push(contact);
    return { id: contact.id };
  });

  return {
    data: Array.isArray(payload) ? inserted : inserted[0],
    error: null,
  };
}

describe("importContactsWithCompanies", () => {
  it("creates a new company and links the imported contact to it", async () => {
    const db = fakeSupabase();

    const result = await importContactsWithCompanies(db.client, {
      accountId: "account-1",
      userId: "user-1",
      rows: [row("+55 11 90000-0001", "Acme Brasil")],
    });

    expect(result).toMatchObject({ imported: 1, skipped: 0, failed: 0 });
    expect(db.state.companies).toMatchObject([
      {
        account_id: "account-1",
        trade_name: "Acme Brasil",
        normalized_name: "acme brasil",
      },
    ]);
    expect(db.state.contacts[0]).toMatchObject({
      company: "Acme Brasil",
      company_id: "new-company-1",
    });
  });

  it("reuses an active company after case, accent, punctuation, and space normalization", async () => {
    const db = fakeSupabase({
      companies: [
        {
          id: "company-1",
          account_id: "account-1",
          user_id: "user-1",
          trade_name: "Acme Comercio Ltda",
          normalized_name: "acme comercio ltda",
          archived_at: null,
        },
      ],
    });

    await importContactsWithCompanies(db.client, {
      accountId: "account-1",
      userId: "user-1",
      rows: [
        row("+55 11 90000-0001", " ÁCME   Comércio, LTDA. "),
        row("+55 11 90000-0002", "Acme Comercio Ltda"),
      ],
    });

    expect(db.state.companies).toHaveLength(1);
    expect(db.state.contacts.map((contact) => contact.company_id)).toEqual([
      "company-1",
      "company-1",
    ]);
    expect(db.state.contacts.map((contact) => contact.company)).toEqual([
      " ÁCME   Comércio, LTDA. ",
      "Acme Comercio Ltda",
    ]);
  });

  it("is idempotent across reimport and duplicate rows within the same file", async () => {
    const db = fakeSupabase();
    const rows = [
      row("+55 11 90000-0001", "Acme Brasil"),
      row("+55 (11) 90000-0001", "Acme Brasil"),
    ];

    const first = await importContactsWithCompanies(db.client, {
      accountId: "account-1",
      userId: "user-1",
      rows,
    });
    const second = await importContactsWithCompanies(db.client, {
      accountId: "account-1",
      userId: "user-1",
      rows,
    });

    expect(first).toMatchObject({ imported: 1, skipped: 1, failed: 0 });
    expect(second).toMatchObject({ imported: 0, skipped: 2, failed: 0 });
    expect(db.state.companies).toHaveLength(1);
    expect(db.state.contacts).toHaveLength(1);
  });

  it("keeps same company names isolated by account", async () => {
    const db = fakeSupabase({
      companies: [
        {
          id: "other-account-company",
          account_id: "account-2",
          user_id: "user-2",
          trade_name: "Acme Brasil",
          normalized_name: "acme brasil",
          archived_at: null,
        },
      ],
    });

    await importContactsWithCompanies(db.client, {
      accountId: "account-1",
      userId: "user-1",
      rows: [row("+55 11 90000-0001", "Acme Brasil")],
    });

    expect(db.state.companies).toHaveLength(2);
    expect(db.state.contacts[0]?.company_id).toBe("new-company-1");
  });

  it("imports a contact without company without creating or linking a company", async () => {
    const db = fakeSupabase();

    await importContactsWithCompanies(db.client, {
      accountId: "account-1",
      userId: "user-1",
      rows: [row("+55 11 90000-0001")],
    });

    expect(db.state.companies).toHaveLength(0);
    expect(db.state.contacts[0]).toMatchObject({
      company: null,
      company_id: null,
    });
  });

  it("does not reuse an archived company", async () => {
    const db = fakeSupabase({
      companies: [
        {
          id: "archived-company",
          account_id: "account-1",
          user_id: "user-1",
          trade_name: "Acme Brasil",
          normalized_name: "acme brasil",
          archived_at: "2026-08-01T00:00:00Z",
        },
      ],
    });

    await importContactsWithCompanies(db.client, {
      accountId: "account-1",
      userId: "user-1",
      rows: [row("+55 11 90000-0001", "Acme Brasil")],
    });

    expect(db.state.companies).toHaveLength(2);
    expect(db.state.contacts[0]?.company_id).toBe("new-company-1");
  });

  it("preserves legacy company text but avoids company_id when active company matching is ambiguous", async () => {
    const db = fakeSupabase({
      companies: [
        {
          id: "company-1",
          account_id: "account-1",
          user_id: "user-1",
          trade_name: "Acme Brasil",
          normalized_name: "acme brasil",
          archived_at: null,
        },
        {
          id: "company-2",
          account_id: "account-1",
          user_id: "user-1",
          trade_name: "Acme Brasil Holdings",
          normalized_name: "acme brasil",
          archived_at: null,
        },
      ],
    });

    await importContactsWithCompanies(db.client, {
      accountId: "account-1",
      userId: "user-1",
      rows: [row("+55 11 90000-0001", "Acme Brasil")],
    });

    expect(db.state.companies).toHaveLength(2);
    expect(db.state.contacts[0]).toMatchObject({
      company: "Acme Brasil",
      company_id: null,
    });
  });

  it("retries a failed batch individually so valid contacts still import", async () => {
    const db = fakeSupabase({ failPhones: ["+55 11 90000-0002"] });

    const result = await importContactsWithCompanies(db.client, {
      accountId: "account-1",
      userId: "user-1",
      rows: [
        row("+55 11 90000-0001", "Acme Brasil"),
        row("+55 11 90000-0002", "Beta Ltda"),
      ],
    });

    expect(result).toMatchObject({ imported: 1, skipped: 0, failed: 1 });
    expect(db.state.contacts).toHaveLength(1);
    expect(db.state.contacts[0]).toMatchObject({
      phone: "+55 11 90000-0001",
      company_id: "new-company-1",
    });
  });
});
