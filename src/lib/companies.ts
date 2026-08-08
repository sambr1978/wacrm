export interface CompanyNameParts {
  trade_name?: string | null;
  legal_name?: string | null;
}

export function normalizeCompanyName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function buildCompanyDisplayName(company: CompanyNameParts): string {
  return (company.trade_name || company.legal_name || "").trim();
}

export function shouldAutoLinkCompany(
  sourceName: string | null | undefined,
  normalizedCandidateKeys: string[],
): boolean {
  const key = normalizeCompanyName(sourceName);
  if (!key) return false;
  return normalizedCandidateKeys.filter((candidate) => candidate === key).length === 1;
}
