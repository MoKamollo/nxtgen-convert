import { signTracking, verifyTracking } from "@/lib/email-tracking";

const DESTINATION = "unsubscribe";

export function signUnsubscribe(campaignId: string, deliveryId: string): string {
  return signTracking(campaignId, deliveryId, DESTINATION);
}

export function verifyUnsubscribe(campaignId: string, deliveryId: string, signature: string): boolean {
  return verifyTracking(campaignId, deliveryId, DESTINATION, signature);
}
