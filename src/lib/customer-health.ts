export type HealthEvidence = {
  subscription?: { total: number; active: number } | null;
  lastEngagementAt?: Date | null;
  support?: { total: number; open: number; high: number; critical: number } | null;
  npsScore?: number | null;
  email?: { total: number; delivered: number; bounced: number; complained: number } | null;
};

type Component = {
  available: boolean;
  points: number | null;
  maximum: number;
  evidence: Record<string, unknown>;
};

export function calculateCustomerHealth(evidence: HealthEvidence, now = new Date()) {
  const components: Record<string, Component> = {};

  const subscriptionAvailable = Boolean(evidence.subscription && evidence.subscription.total > 0);
  components.subscription = {
    available: subscriptionAvailable,
    points: subscriptionAvailable ? (evidence.subscription!.active > 0 ? 25 : 0) : null,
    maximum: 25,
    evidence: evidence.subscription ?? { reason: "No subscription records" },
  };

  const engagementAvailable = Boolean(evidence.lastEngagementAt);
  const daysSinceEngagement = evidence.lastEngagementAt
    ? Math.max(0, Math.floor((now.getTime() - evidence.lastEngagementAt.getTime()) / 86_400_000))
    : null;
  const engagementPoints = daysSinceEngagement === null ? null
    : daysSinceEngagement <= 7 ? 25
      : daysSinceEngagement <= 30 ? 18
        : daysSinceEngagement <= 90 ? 8
          : 0;
  components.engagement = {
    available: engagementAvailable,
    points: engagementPoints,
    maximum: 25,
    evidence: { lastEngagementAt: evidence.lastEngagementAt?.toISOString() ?? null, daysSinceEngagement },
  };

  const supportAvailable = Boolean(evidence.support && evidence.support.total > 0);
  let supportPoints: number | null = null;
  if (supportAvailable) {
    supportPoints = evidence.support!.critical > 0 ? 0
      : evidence.support!.high > 0 ? 8
        : evidence.support!.open > 0 ? 15
          : 25;
  }
  components.support = {
    available: supportAvailable,
    points: supportPoints,
    maximum: 25,
    evidence: evidence.support ?? { reason: "No support records" },
  };

  const sentimentAvailable = Number.isInteger(evidence.npsScore) && evidence.npsScore! >= 0 && evidence.npsScore! <= 10;
  const sentimentPoints = !sentimentAvailable ? null
    : evidence.npsScore! >= 9 ? 25
      : evidence.npsScore! >= 7 ? 18
        : evidence.npsScore! >= 4 ? 8
          : 0;
  components.sentiment = {
    available: sentimentAvailable,
    points: sentimentPoints,
    maximum: 25,
    evidence: { npsScore: sentimentAvailable ? evidence.npsScore : null },
  };

  const emailAvailable = Boolean(evidence.email && evidence.email.total >= 3);
  const successfulEmail = evidence.email ? Math.max(0, evidence.email.delivered) : 0;
  const emailRate = emailAvailable ? successfulEmail / Math.max(1, evidence.email!.total) : null;
  const emailPoints = emailRate === null ? null : Math.round(emailRate * 25 * 100) / 100;
  components.emailDelivery = {
    available: emailAvailable,
    points: emailPoints,
    maximum: 25,
    evidence: evidence.email ? { ...evidence.email, deliveredRate: emailRate } : { reason: "Fewer than three tracked emails" },
  };

  const available = Object.values(components).filter((component) => component.available && component.points !== null);
  if (available.length < 2) {
    return {
      score: null,
      status: "insufficient_data" as const,
      components,
      methodologyVersion: "customer_health_rules_v1",
      explanation: "At least two independent evidence components are required. Missing evidence is not treated as positive or negative.",
    };
  }

  const earned = available.reduce((sum, component) => sum + Number(component.points), 0);
  const maximum = available.reduce((sum, component) => sum + component.maximum, 0);
  const score = Math.round((earned / maximum) * 10000) / 100;
  const status = score >= 70 ? "healthy" : score >= 40 ? "watch" : "at_risk";
  return {
    score,
    status,
    components,
    methodologyVersion: "customer_health_rules_v1",
    explanation: "Score is normalized only across available evidence. It is a deterministic operational rule score, not a churn prediction.",
  };
}
