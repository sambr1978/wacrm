import type { Deal, FollowUp, FollowUpBucket } from "@/types";

export type ReactivationSegment =
  | "active"
  | "no_recent_contact"
  | "stale_60"
  | "stale_90";

export const FOLLOW_UP_SEGMENT_CONFIG = {
  reactivationDays: [30, 60, 90],
  noRecentContactDays: 30,
  noPurchaseDays: [30, 60, 90],
} as const;

export const FOLLOW_UP_ACTIVITY_TYPES = [
  "whatsapp",
  "phone",
  "email",
  "meeting",
  "proposal",
  "agreed_return",
  "post_sale",
  "rebuy",
  "reactivation",
  "internal_note",
] as const;

export const FOLLOW_UP_CHANNELS = [
  "whatsapp",
  "phone",
  "email",
  "meeting",
  "internal",
  "other",
] as const;

export const FOLLOW_UP_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export function getFollowUpBucket(
  followUp: Pick<FollowUp, "status" | "due_at">,
  now: Date = new Date(),
): FollowUpBucket {
  if (followUp.status === "completed") return "completed";
  if (followUp.status === "cancelled") return "cancelled";
  if (followUp.status === "rescheduled") return "rescheduled";

  const due = new Date(followUp.due_at);
  if (Number.isNaN(due.getTime())) return "upcoming";

  if (localDayKey(due) === localDayKey(now)) return "today";
  if (startOfLocalDay(due).getTime() < startOfLocalDay(now).getTime()) {
    return "overdue";
  }
  return "upcoming";
}

export function getNextPendingFollowUp(
  followUps: FollowUp[] | null | undefined,
): FollowUp | null {
  const pending = (followUps ?? [])
    .filter((followUp) => followUp.status === "pending" && followUp.is_primary)
    .sort(
      (a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime(),
    );

  return pending[0] ?? null;
}

export function activeDealNeedsFollowUp(
  deal: Pick<Deal, "id" | "status">,
  followUps: FollowUp[] | null | undefined,
): boolean {
  if (deal.status && deal.status !== "open") return false;

  return !getNextPendingFollowUp(
    (followUps ?? []).filter((followUp) => followUp.deal_id === deal.id),
  );
}

export function daysSince(
  value: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const ms = startOfLocalDay(now).getTime() - startOfLocalDay(date).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function getReactivationSegment(days: number | null): ReactivationSegment {
  if (days === null || days < FOLLOW_UP_SEGMENT_CONFIG.reactivationDays[0]) {
    return "active";
  }
  if (days >= FOLLOW_UP_SEGMENT_CONFIG.reactivationDays[2]) return "stale_90";
  if (days >= FOLLOW_UP_SEGMENT_CONFIG.reactivationDays[1]) return "stale_60";
  return "no_recent_contact";
}

export function formatDateTimeLocalValue(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function localDayKey(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
