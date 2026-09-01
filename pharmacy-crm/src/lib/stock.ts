const EXPIRY_WARNING_DAYS = 60;

export type ComputedStatus = "good" | "warn" | "critical";

export function computeBatchStatus(
  quantity: number,
  reorderAt: number,
  expiresOn: Date | null,
): ComputedStatus {
  if (quantity <= 0) return "critical";

  if (expiresOn) {
    const daysLeft = Math.ceil(
      (expiresOn.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    if (daysLeft <= 14) return "critical";
    if (daysLeft <= EXPIRY_WARNING_DAYS) return "warn";
  }

  if (quantity <= reorderAt) return "warn";

  return "good";
}

export function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}
