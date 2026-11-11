// Bonus (loyalty) point rules. Pure functions, no framework and no database imports,
// so every rule below can be tested on its own.
//
// 1 point = 1 KZT = 100 tiyn. Points are always whole numbers: a customer can never
// hold or spend half a point, and rounding is always DOWN, in the restaurant's favour.

/** Tiyn in one bonus point. */
export const POINT_TIYN = 100;

/** Share of an approved payment that comes back as points (5%). */
export const EARN_RATE = 0.05;

/** A customer may never pay more than this share of an order with points (30%). */
export const MAX_REDEEM_SHARE = 0.3;

/**
 * Points earned by an approved payment.
 * Only the money actually paid earns points: the part covered by points earns nothing,
 * otherwise points would slowly create themselves out of nothing.
 */
export function pointsEarned(paidTiyn: number): number {
  if (!Number.isFinite(paidTiyn) || paidTiyn <= 0) return 0;
  return Math.floor((paidTiyn * EARN_RATE) / POINT_TIYN);
}

/** The most points this order may take: never more than the balance, never over 30% of the total. */
export function maxRedeemablePoints(totalTiyn: number, balance: number): number {
  if (!Number.isFinite(totalTiyn) || totalTiyn <= 0) return 0;
  const cap = Math.floor((totalTiyn * MAX_REDEEM_SHARE) / POINT_TIYN);
  return Math.max(0, Math.min(Math.floor(balance), cap));
}

/**
 * How many of the requested points can really be used right now.
 * Used twice: when the order is created (to show an honest total) and again inside the
 * payment transaction, where the balance may have changed since.
 */
export function applicablePoints(requested: number, totalTiyn: number, balance: number): number {
  if (!Number.isInteger(requested) || requested <= 0) return 0;
  return Math.min(requested, maxRedeemablePoints(totalTiyn, balance));
}

export interface BonusBreakdown {
  totalTiyn: number;
  pointsSpent: number;
  discountTiyn: number;
  payableTiyn: number;
  pointsEarned: number;
  balanceAfter: number;
}

/** The whole money/points picture of one order, in one place. */
export function settle(totalTiyn: number, requestedPoints: number, balance: number): BonusBreakdown {
  const pointsSpent = applicablePoints(requestedPoints, totalTiyn, balance);
  const discountTiyn = pointsSpent * POINT_TIYN;
  const payableTiyn = Math.max(0, totalTiyn - discountTiyn);
  const earned = pointsEarned(payableTiyn);
  return {
    totalTiyn,
    pointsSpent,
    discountTiyn,
    payableTiyn,
    pointsEarned: earned,
    balanceAfter: balance - pointsSpent + earned,
  };
}
