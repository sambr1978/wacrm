import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeCompanyName } from "@/lib/companies";
import {
  dedupeByPhone,
  isUniqueViolation,
  normalizeKey,
} from "@/lib/contacts/dedupe";
import type { ParsedContactRow } from "@/lib/contacts/parse-contact-csv";

export interface ImportedContact {
  contactId: string;
  source: ParsedContactRow;
}

export interface ImportContactsWithCompaniesResult {
  imported: number;
  skipped: number;
  failed: number;
  importedContacts: ImportedContact[];
}

interface ImportContactsWithCompaniesInput {
  accountId: string;
  userId: string;
  rows: ParsedContactRow[];
  chunkSize?: number;
}

interface ExistingContactRow {
  phone_normalized: string | null;
}

interface CompanyLookupRow {
  id: string;
  normalized_name: string;
}

interface ContactInsertRow {
  user_id: string;
  account_id: string;
  phone: string;
  name: string | null;
  email: string | null;
  company: string | null;
  company_id: string | null;
}

interface InsertedContactRow {
  id: string;
}

export async function importContactsWithCompanies(
  supabase: SupabaseClient,
  input: ImportContactsWithCompaniesInput,
): Promise<ImportContactsWithCompaniesResult> {
  const { accountId, userId, rows } = input;
  const chunkSize = input.chunkSize ?? 50;

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const importedContacts: ImportedContact[] = [];

  const { unique, duplicates: inFileDupes } = dedupeByPhone(rows);
  skipped += inFileDupes;

  const { data: existingRows } = await supabase
    .from("contacts")
    .select("phone_normalized")
    .eq("account_id", accountId);

  const existing = new Set(
    ((existingRows ?? []) as ExistingContactRow[])
      .map((row) => row.phone_normalized)
      .filter((phone): phone is string => !!phone),
  );

  const toInsert = unique.filter((row) => {
    if (existing.has(normalizeKey(row.phone))) {
      skipped++;
      return false;
    }
    return true;
  });

  const companyIdByKey = await resolveCompanyIds(supabase, {
    accountId,
    userId,
    rows: toInsert,
  });

  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize);
    const insertRows = chunk.map((row) =>
      buildContactInsertRow(row, accountId, userId, companyIdByKey),
    );

    const { data, error } = await supabase
      .from("contacts")
      .insert(insertRows)
      .select("id");

    if (error) {
      for (let j = 0; j < insertRows.length; j++) {
        const insertRow = insertRows[j];
        const source = chunk[j];
        if (!insertRow || !source) continue;

        const { data: singleData, error: singleError } = await supabase
          .from("contacts")
          .insert(insertRow)
          .select("id")
          .single();

        if (!singleError && singleData) {
          imported++;
          importedContacts.push({
            contactId: (singleData as InsertedContactRow).id,
            source,
          });
        } else if (isUniqueViolation(singleError)) {
          skipped++;
        } else {
          failed++;
        }
      }
      continue;
    }

    const inserted = (data ?? []) as InsertedContactRow[];
    imported += inserted.length;
    for (let j = 0; j < inserted.length; j++) {
      const source = chunk[j];
      const insertedRow = inserted[j];
      if (!source || !insertedRow) continue;
      importedContacts.push({ contactId: insertedRow.id, source });
    }
  }

  return { imported, skipped, failed, importedContacts };
}

async function resolveCompanyIds(
  supabase: SupabaseClient,
  input: {
    accountId: string;
    userId: string;
    rows: ParsedContactRow[];
  },
): Promise<Map<string, string>> {
  const companyNameByKey = new Map<string, string>();

  for (const row of input.rows) {
    const name = row.company?.trim();
    if (!name) continue;
    const key = normalizeCompanyName(name);
    if (!key) continue;
    if (!companyNameByKey.has(key)) companyNameByKey.set(key, name);
  }

  const companyIdByKey = new Map<string, string>();
  if (companyNameByKey.size === 0) return companyIdByKey;

  const { data: existingCompanies } = await supabase
    .from("companies")
    .select("id, normalized_name")
    .eq("account_id", input.accountId)
    .is("archived_at", null);

  const ambiguousKeys = new Set<string>();
  for (const company of (existingCompanies ?? []) as CompanyLookupRow[]) {
    if (companyIdByKey.has(company.normalized_name)) {
      companyIdByKey.delete(company.normalized_name);
      ambiguousKeys.add(company.normalized_name);
      continue;
    }
    if (!ambiguousKeys.has(company.normalized_name)) {
      companyIdByKey.set(company.normalized_name, company.id);
    }
  }

  for (const [key, name] of companyNameByKey) {
    if (companyIdByKey.has(key) || ambiguousKeys.has(key)) continue;

    const { data: created } = await supabase
      .from("companies")
      .insert({
        account_id: input.accountId,
        user_id: input.userId,
        trade_name: name,
      })
      .select("id")
      .single();

    if (created && typeof (created as { id?: unknown }).id === "string") {
      companyIdByKey.set(key, (created as { id: string }).id);
    }
  }

  return companyIdByKey;
}

function buildContactInsertRow(
  row: ParsedContactRow,
  accountId: string,
  userId: string,
  companyIdByKey: Map<string, string>,
): ContactInsertRow {
  const companyName = row.company?.trim();
  const companyId = companyName
    ? companyIdByKey.get(normalizeCompanyName(companyName)) ?? null
    : null;

  return {
    user_id: userId,
    account_id: accountId,
    phone: row.phone,
    name: row.name || null,
    email: row.email || null,
    company: row.company || null,
    company_id: companyId,
  };
}
