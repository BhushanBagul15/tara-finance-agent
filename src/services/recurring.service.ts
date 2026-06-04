import { prisma } from '../db/prisma.js';
import { toNumber } from '../utils/decimal.js';
import { TRANSFER_CATEGORY } from './transaction.service.js';

export interface RecurringSubscription {
  canonicalMerchant: string;
  merchantExamples: string[];
  averageAmount: number;
  occurrenceCount: number;
  medianIntervalDays: number;
  category: string;
}

export interface RecurringSubscriptionsResult {
  subscriptions: RecurringSubscription[];
  tablesRead: string[];
}

const MIN_OCCURRENCES = 3;
const AMOUNT_TOLERANCE = 0.15;
const MIN_INTERVAL_DAYS = 20;
const MAX_INTERVAL_DAYS = 40;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function amountsSimilar(a: number, b: number): boolean {
  const base = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / base <= AMOUNT_TOLERANCE;
}

export class RecurringService {
  async detectSubscriptions(): Promise<RecurringSubscriptionsResult> {
    const transactions = await prisma.transaction.findMany({
      where: {
        NOT: { category: { equals: TRANSFER_CATEGORY, mode: 'insensitive' } },
        amount: { gt: 0 },
      },
      orderBy: [{ canonicalMerchant: 'asc' }, { date: 'asc' }],
    });

    const byMerchant = new Map<
      string,
      { dates: Date[]; amounts: number[]; merchants: Set<string>; category: string }
    >();

    for (const t of transactions) {
      const key = t.canonicalMerchant;
      const entry = byMerchant.get(key) ?? {
        dates: [],
        amounts: [],
        merchants: new Set<string>(),
        category: t.category,
      };
      entry.dates.push(t.date);
      entry.amounts.push(toNumber(t.amount));
      entry.merchants.add(t.merchant);
      entry.category = t.category;
      byMerchant.set(key, entry);
    }

    const subscriptions: RecurringSubscription[] = [];

    for (const [canonicalMerchant, data] of byMerchant) {
      if (data.dates.length < MIN_OCCURRENCES) continue;

      const avgAmount =
        data.amounts.reduce((s, a) => s + a, 0) / data.amounts.length;
      const amountConsistent = data.amounts.every((a) =>
        amountsSimilar(a, avgAmount),
      );
      if (!amountConsistent) continue;

      const intervals: number[] = [];
      for (let i = 1; i < data.dates.length; i++) {
        const days =
          (data.dates[i].getTime() - data.dates[i - 1].getTime()) /
          (1000 * 60 * 60 * 24);
        intervals.push(days);
      }

      const medianInterval = median(intervals);
      if (
        medianInterval < MIN_INTERVAL_DAYS ||
        medianInterval > MAX_INTERVAL_DAYS
      ) {
        continue;
      }

      const intervalRegular = intervals.every(
        (d) =>
          d >= medianInterval * 0.6 &&
          d <= medianInterval * 1.6,
      );

      if (!intervalRegular && intervals.length >= 2) {
        const irregular = intervals.filter(
          (d) => d < medianInterval * 0.5 || d > medianInterval * 1.8,
        );
        if (irregular.length > intervals.length * 0.4) continue;
      }

      subscriptions.push({
        canonicalMerchant,
        merchantExamples: [...data.merchants].slice(0, 5),
        averageAmount: Math.round(avgAmount * 100) / 100,
        occurrenceCount: data.dates.length,
        medianIntervalDays: Math.round(medianInterval),
        category: data.category,
      });
    }

    subscriptions.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

    return {
      subscriptions,
      tablesRead: ['transactions'],
    };
  }
}

export const recurringService = new RecurringService();
