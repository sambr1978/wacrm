import { describe, expect, it } from "vitest";
import {
  FOLLOW_UP_SEGMENT_CONFIG,
  activeDealNeedsFollowUp,
  daysSince,
  getFollowUpBucket,
  getNextPendingFollowUp,
  getReactivationSegment,
} from "./follow-ups";
import type { Deal, FollowUp } from "@/types";

const now = new Date("2026-07-31T12:00:00-03:00");

function followUp(overrides: Partial<FollowUp>): FollowUp {
  return {
    id: "follow-up-1",
    account_id: "account-1",
    user_id: "user-1",
    contact_id: "contact-1",
    deal_id: "deal-1",
    conversation_id: null,
    assigned_to: "profile-1",
    activity_type: "phone",
    channel: "phone",
    priority: "normal",
    status: "pending",
    due_at: "2026-07-31T13:00:00-03:00",
    note: null,
    result: null,
    completed_at: null,
    completed_by: null,
    rescheduled_from_id: null,
    is_primary: true,
    created_at: "2026-07-30T10:00:00-03:00",
    updated_at: "2026-07-30T10:00:00-03:00",
    ...overrides,
  };
}

function deal(overrides: Partial<Deal>): Deal {
  return {
    id: "deal-1",
    user_id: "user-1",
    account_id: "account-1",
    pipeline_id: "pipeline-1",
    stage_id: "stage-1",
    contact_id: "contact-1",
    conversation_id: null,
    assigned_to: "profile-1",
    title: "ACME opportunity",
    value: 1000,
    currency: "BRL",
    status: "open",
    expected_close_date: null,
    closed_reason: null,
    closed_at: null,
    notes: null,
    created_at: "2026-07-01T10:00:00-03:00",
    updated_at: "2026-07-30T10:00:00-03:00",
    ...overrides,
  };
}

describe("getFollowUpBucket", () => {
  it("keeps terminal statuses explicit", () => {
    expect(getFollowUpBucket(followUp({ status: "completed" }), now)).toBe(
      "completed",
    );
    expect(getFollowUpBucket(followUp({ status: "cancelled" }), now)).toBe(
      "cancelled",
    );
    expect(getFollowUpBucket(followUp({ status: "rescheduled" }), now)).toBe(
      "rescheduled",
    );
  });

  it("derives overdue, today, and upcoming from due_at", () => {
    expect(
      getFollowUpBucket(followUp({ due_at: "2026-07-30T18:00:00-03:00" }), now),
    ).toBe("overdue");
    expect(
      getFollowUpBucket(followUp({ due_at: "2026-07-31T18:00:00-03:00" }), now),
    ).toBe("today");
    expect(
      getFollowUpBucket(followUp({ due_at: "2026-08-01T09:00:00-03:00" }), now),
    ).toBe("upcoming");
  });
});

describe("getNextPendingFollowUp", () => {
  it("returns the earliest pending primary follow-up", () => {
    const next = getNextPendingFollowUp([
      followUp({ id: "later", due_at: "2026-08-01T09:00:00-03:00" }),
      followUp({ id: "done", status: "completed", due_at: "2026-07-29T09:00:00-03:00" }),
      followUp({ id: "first", due_at: "2026-07-31T09:00:00-03:00" }),
    ]);

    expect(next?.id).toBe("first");
  });
});

describe("activeDealNeedsFollowUp", () => {
  it("flags open deals without a pending follow-up", () => {
    expect(activeDealNeedsFollowUp(deal({}), [])).toBe(true);
  });

  it("does not flag closed deals or open deals with a pending follow-up", () => {
    expect(activeDealNeedsFollowUp(deal({ status: "won" }), [])).toBe(false);
    expect(
      activeDealNeedsFollowUp(deal({}), [
        followUp({ deal_id: "deal-1", status: "pending" }),
      ]),
    ).toBe(false);
  });
});

describe("reactivation segments", () => {
  it("uses centralized 30/60/90 day thresholds", () => {
    expect(FOLLOW_UP_SEGMENT_CONFIG.reactivationDays).toEqual([30, 60, 90]);
    expect(getReactivationSegment(12)).toBe("active");
    expect(getReactivationSegment(30)).toBe("no_recent_contact");
    expect(getReactivationSegment(60)).toBe("stale_60");
    expect(getReactivationSegment(91)).toBe("stale_90");
  });

  it("computes day distance by local calendar day", () => {
    expect(daysSince("2026-07-01T23:30:00-03:00", now)).toBe(30);
    expect(daysSince(null, now)).toBeNull();
  });
});
