import type { Contact } from "@/types";

export interface TagFilteredContactRow {
  contact: Contact;
  total_count: number | string;
}

export interface ParsedTagFilteredContacts {
  contacts: Contact[];
  totalCount: number;
}

export function parseTagFilteredContactRows(
  rows: TagFilteredContactRow[] | null | undefined,
): ParsedTagFilteredContacts {
  const safeRows = rows ?? [];

  return {
    contacts: safeRows.map((row) => row.contact),
    totalCount: safeRows.length > 0 ? Number(safeRows[0].total_count) : 0,
  };
}
