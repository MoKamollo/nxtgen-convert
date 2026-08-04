export type CampaignDeliveryStats = {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
  unsubscribed: number;
};

export const CAMPAIGN_STAT_KEYS: readonly (keyof CampaignDeliveryStats)[] = [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "failed",
  "unsubscribed",
] as const;

export function normalizeCampaignStats(value: unknown): CampaignDeliveryStats {
  const source = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};

  return {
    sent: finiteCount(source.sent),
    delivered: finiteCount(source.delivered),
    opened: finiteCount(source.opened),
    clicked: finiteCount(source.clicked),
    bounced: finiteCount(source.bounced),
    failed: finiteCount(source.failed),
    unsubscribed: finiteCount(source.unsubscribed),
  };
}

export function addCampaignStats(
  left: CampaignDeliveryStats,
  right: CampaignDeliveryStats,
): CampaignDeliveryStats {
  const result = { ...left };
  for (const key of CAMPAIGN_STAT_KEYS) result[key] += right[key];
  return result;
}

export function emptyCampaignStats(): CampaignDeliveryStats {
  return {
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    failed: 0,
    unsubscribed: 0,
  };
}


export function deliveryStatusTotals(
  statuses: ReadonlyMap<string, number>,
  previous: unknown = {},
): CampaignDeliveryStats {
  const prior = normalizeCampaignStats(previous);
  const delivered = (statuses.get("delivered") ?? 0) + (statuses.get("complained") ?? 0);
  const sent = [...statuses.entries()]
    .filter(([status]) => status !== "pending")
    .reduce((sum, [, total]) => sum + finiteCount(total), 0);

  return {
    ...prior,
    sent,
    delivered,
    bounced: finiteCount(statuses.get("bounced")),
    failed: finiteCount(statuses.get("failed")) + finiteCount(statuses.get("suppressed")),
  };
}

export function percentage(value: number, base: number): number {
  return base > 0 ? Math.round((value / base) * 1000) / 10 : 0;
}

function finiteCount(value: unknown): number {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}
