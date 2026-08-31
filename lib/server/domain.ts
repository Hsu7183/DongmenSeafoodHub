import Decimal from 'decimal.js';

export type MoneyInput = Decimal.Value | { toString(): string };
export const decimal = (value: MoneyInput) => new Decimal(value.toString());
export const money = (value: MoneyInput) => decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
export const amount = (value: MoneyInput) => money(value).toNumber();

export function resolvePrice(input: {
  supplierCost: MoneyInput; baseWholesalePrice: MoneyInput;
  override?: { price: MoneyInput; validFrom: Date; validTo: Date | null } | null;
  level?: { mode: string; value: MoneyInput } | null; now?: Date;
}) {
  const now = input.now ?? new Date();
  if (input.override && input.override.validFrom <= now && (!input.override.validTo || input.override.validTo >= now)) return money(input.override.price);
  if (input.level) {
    if (input.level.mode === 'FIXED') return money(input.level.value);
    if (input.level.mode === 'COST_PLUS') return money(decimal(input.supplierCost).plus(decimal(input.level.value)));
    if (input.level.mode === 'MARGIN') {
      const margin = decimal(input.level.value);
      if (margin.lt(0) || margin.gte(1)) throw new Error('毛利率須介於 0 與 1 之間');
      return money(decimal(input.supplierCost).div(decimal(1).minus(margin)));
    }
  }
  return money(input.baseWholesalePrice);
}

export function lineSnapshot(input: { quantity: number; price: MoneyInput; cost: MoneyInput; rate: MoneyInput; fixedCommission?: MoneyInput | null; rebateRate?: MoneyInput }) {
  const lineTotal = money(decimal(input.price).mul(input.quantity));
  const totalCost = money(decimal(input.cost).mul(input.quantity));
  const commission = money(input.fixedCommission != null ? decimal(input.fixedCommission).mul(input.quantity) : lineTotal.mul(decimal(input.rate)));
  return { lineTotal, totalCost, grossProfit: money(lineTotal.minus(totalCost)), commission, rebate: money(totalCost.mul(decimal(input.rebateRate ?? 0))) };
}

export const ORDER_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'], SUBMITTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['ORDERED_TO_SUPPLIER', 'CANCELLED'], ORDERED_TO_SUPPLIER: ['PREPARING'],
  PREPARING: ['SHIPPED'], SHIPPED: ['DELIVERED'], DELIVERED: ['COMPLETED'], COMPLETED: [], CANCELLED: [],
};
export function canTransition(from: string, to: string) { return ORDER_TRANSITIONS[from]?.includes(to) ?? false; }
export function ownsCustomer(role: string, currentCustomerId: string | null, targetCustomerId: string) {
  return role === 'SUPER_ADMIN' || role === 'SALES' || (role === 'CUSTOMER' && currentCustomerId === targetCustomerId);
}
export function ownsSupplier(role: string, currentSupplierId: string | null, targetSupplierId: string) {
  return role === 'SUPER_ADMIN' || role === 'SALES' || (role === 'SUPPLIER' && currentSupplierId === targetSupplierId);
}
export const isStaff = (role?: string) => role === 'SUPER_ADMIN' || role === 'SALES';
export function legalMissing(settings: Record<string, unknown>) {
  return ['businessName', 'taxId', 'customerServicePhone', 'address', 'foodRegistrationNumber', 'tradingEntity', 'paymentMethods', 'returnsPolicy', 'privacyPolicy', 'supplierDisclosure', 'legalReviewConfirmed'].filter(key => !settings[key]);
}
