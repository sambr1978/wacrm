import { describe, expect, it } from "vitest";

import { parseTagFilteredContactRows } from "./tag-filtered-rpc";

describe("parseTagFilteredContactRows", () => {
  it("preserves relational company data returned by the tag-filter RPC", () => {
    const parsed = parseTagFilteredContactRows([
      {
        total_count: "2",
        contact: {
          id: "contact-1",
          account_id: "account-1",
          user_id: "user-1",
          phone: "+5511999999999",
          name: "Ana",
          company: "Acme Brasil",
          company_id: "company-1",
          company_record: {
            id: "company-1",
            account_id: "account-1",
            user_id: "user-1",
            legal_name: "Acme Brasil Ltda",
            trade_name: "Acme Brasil",
            normalized_name: "acme brasil",
            tax_id: null,
            commercial_status: "prospect",
            segment: null,
            website: null,
            primary_phone: null,
            general_email: null,
            address_line1: null,
            address_line2: null,
            city: null,
            region: null,
            postal_code: null,
            country: null,
            assigned_to: null,
            notes: null,
            archived_at: null,
            created_at: "2026-08-02T00:00:00Z",
            updated_at: "2026-08-02T00:00:00Z",
          },
          created_at: "2026-08-02T00:00:00Z",
          updated_at: "2026-08-02T00:00:00Z",
        },
      },
    ]);

    expect(parsed.totalCount).toBe(2);
    expect(parsed.contacts[0]?.company_id).toBe("company-1");
    expect(parsed.contacts[0]?.company).toBe("Acme Brasil");
    expect(parsed.contacts[0]?.company_record?.trade_name).toBe("Acme Brasil");
  });

  it("returns an empty result for empty RPC data", () => {
    expect(parseTagFilteredContactRows([])).toEqual({
      contacts: [],
      totalCount: 0,
    });
  });
});
