export type SubscriptionRecord = {
  contactId: string | null;
  amount: string;
  interval: string | null;
  status: string | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelledAt: Date | null;
  createdAt: Date;
};

export function normalizedMrr(amount: string | number, interval: string | null | undefined): number {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) return 0;
  switch ((interval ?? "month").toLowerCase()) {
    case "year":
    case "annual":
    case "annually": return value / 12;
    case "week":
    case "weekly": return value * (52 / 12);
    case "day":
    case "daily": return value * (365 / 12);
    case "quarter":
    case "quarterly": return value / 3;
    default: return value;
  }
}

function activeAt(subscription: SubscriptionRecord, date: Date): boolean {
  if (subscription.createdAt > date) return false;
  if (subscription.cancelledAt && subscription.cancelledAt <= date) return false;
  return !["expired", "failed", "unpaid", "cancelled", "canceled"].includes(subscription.status?.toLowerCase() ?? "active") || Boolean(subscription.cancelledAt && subscription.cancelledAt > date);
}

export function calculateRevenueAnalytics(subscriptions: SubscriptionRecord[], now = new Date()) {
  const current = subscriptions.filter((subscription) => activeAt(subscription, now));
  const mrr = current.reduce((sum, subscription) => sum + normalizedMrr(subscription.amount, subscription.interval), 0);
  const activeCustomers = new Set(current.map((subscription) => subscription.contactId).filter(Boolean)).size;
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const newMrr = subscriptions.filter((subscription) => subscription.createdAt >= monthStart && subscription.createdAt <= now).reduce((sum, subscription) => sum + normalizedMrr(subscription.amount, subscription.interval), 0);
  const churnedSubscriptions = subscriptions.filter((subscription) => subscription.cancelledAt && subscription.cancelledAt >= monthStart && subscription.cancelledAt <= now);
  const churnedMrr = churnedSubscriptions.reduce((sum, subscription) => sum + normalizedMrr(subscription.amount, subscription.interval), 0);
  const churnedContacts = new Set(churnedSubscriptions.map((subscription) => subscription.contactId).filter(Boolean).filter((contactId) => !current.some((subscription) => subscription.contactId === contactId))).size;
  const customersAtStart = new Set(subscriptions.filter((subscription) => activeAt(subscription, new Date(monthStart.getTime() - 1))).map((subscription) => subscription.contactId).filter(Boolean)).size;
  const logoChurnRate = customersAtStart > 0 ? churnedContacts / customersAtStart * 100 : null;

  const history = Array.from({ length: 12 }, (_, reverseIndex) => {
    const offset = 11 - reverseIndex;
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset + 1, 0, 23, 59, 59, 999));
    const monthSubscriptions = subscriptions.filter((subscription) => activeAt(subscription, date));
    const monthMrr = monthSubscriptions.reduce((sum, subscription) => sum + normalizedMrr(subscription.amount, subscription.interval), 0);
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const monthNew = subscriptions.filter((subscription) => subscription.createdAt >= start && subscription.createdAt <= date).reduce((sum, subscription) => sum + normalizedMrr(subscription.amount, subscription.interval), 0);
    const monthChurned = subscriptions.filter((subscription) => subscription.cancelledAt && subscription.cancelledAt >= start && subscription.cancelledAt <= date).reduce((sum, subscription) => sum + normalizedMrr(subscription.amount, subscription.interval), 0);
    return { month: date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }), period: date.toISOString().slice(0, 7), mrr: round(monthMrr), arr: round(monthMrr * 12), new: round(monthNew), churned: round(monthChurned), net: round(monthNew - monthChurned) };
  });

  return {
    mrr: round(mrr),
    arr: round(mrr * 12),
    newMrr: round(newMrr),
    churnedMrr: round(churnedMrr),
    activeCustomers,
    churnedCustomers: churnedContacts,
    logoChurnRate: logoChurnRate === null ? null : round(logoChurnRate),
    ltv: null,
    ltvStatus: "insufficient_data",
    ltvReason: "LTV requires validated gross margin and cohort retention data; it is not inferred from MRR or deal values.",
    history,
    methodology: "Subscription MRR normalized by billing interval. Churn is customers who canceled all subscriptions during the current calendar month divided by customers active at month start.",
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
