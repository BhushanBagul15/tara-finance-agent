import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { roundMoney, toNumber } from '../utils/decimal.js';
import { buildCanonicalMap, normalizeMerchant } from './merchant-normalizer.js';

export const TRANSFER_CATEGORY = 'transfer';

export interface QueryTransactionsInput {
  category?: string;
  merchant?: string;
  startDate?: string;
  endDate?: string;
  aggregate?: 'sum' | 'avg' | 'count' | 'max' | 'min';
  groupBy?: 'category' | 'merchant' | 'canonical_merchant' | 'month';
  includeTransfers?: boolean;
  limit?: number;
}

export interface QueryTransactionsRow {
  key?: string;
  category?: string;
  merchant?: string;
  canonicalMerchant?: string;
  month?: string;
  total: number;
  count: number;
  average: number;
  max?: number;
  min?: number;
}

export interface QueryTransactionsResult {
  rows: QueryTransactionsRow[];
  grandTotal: number;
  transactionCount: number;
  tablesRead: string[];
}

function parseDate(s: string): Date {
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${s}`);
  }
  return d;
}

function buildWhere(input: QueryTransactionsInput): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = {};

  if (input.startDate || input.endDate) {
    where.date = {};
    if (input.startDate) {
      where.date.gte = parseDate(input.startDate);
    }
    if (input.endDate) {
      where.date.lte = parseDate(input.endDate);
    }
  }

  if (input.category) {
    where.category = { equals: input.category, mode: 'insensitive' };
  }

  if (input.merchant) {
    const canonical = normalizeMerchant(input.merchant);
    where.OR = [
      { canonicalMerchant: { equals: canonical, mode: 'insensitive' } },
      { merchant: { contains: input.merchant, mode: 'insensitive' } },
    ];
  }

  if (!input.includeTransfers) {
    where.NOT = { category: { equals: TRANSFER_CATEGORY, mode: 'insensitive' } };
  }

  return where;
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export class TransactionService {
  async query(input: QueryTransactionsInput): Promise<QueryTransactionsResult> {
    const where = buildWhere(input);
    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    const tablesRead = ['transactions'];

    if (!input.groupBy) {
      const amounts = transactions.map((t) => toNumber(t.amount));
      const total = roundMoney(amounts.reduce((a, b) => a + b, 0));
      const count = amounts.length;
      const average = count > 0 ? roundMoney(total / count) : 0;
      const max = count > 0 ? roundMoney(Math.max(...amounts)) : undefined;
      const min = count > 0 ? roundMoney(Math.min(...amounts)) : undefined;

      let aggregateValue = total;
      if (input.aggregate === 'avg') aggregateValue = average;
      if (input.aggregate === 'count') aggregateValue = count;
      if (input.aggregate === 'max' && max !== undefined) aggregateValue = max;
      if (input.aggregate === 'min' && min !== undefined) aggregateValue = min;

      return {
        rows: [
          {
            total: aggregateValue,
            count,
            average,
            max,
            min,
          },
        ],
        grandTotal: total,
        transactionCount: count,
        tablesRead,
      };
    }

    const groups = new Map<string, { amounts: number[] }>();

    for (const t of transactions) {
      let key: string;
      switch (input.groupBy) {
        case 'category':
          key = t.category;
          break;
        case 'merchant':
          key = t.merchant;
          break;
        case 'canonical_merchant':
          key = t.canonicalMerchant;
          break;
        case 'month':
          key = monthKey(t.date);
          break;
        default:
          key = 'all';
      }
      const g = groups.get(key) ?? { amounts: [] };
      g.amounts.push(toNumber(t.amount));
      groups.set(key, g);
    }

    const rows: QueryTransactionsRow[] = [];
    for (const [key, { amounts }] of groups) {
      const total = roundMoney(amounts.reduce((a, b) => a + b, 0));
      const count = amounts.length;
      const average = count > 0 ? roundMoney(total / count) : 0;
      rows.push({
        key,
        category: input.groupBy === 'category' ? key : undefined,
        merchant: input.groupBy === 'merchant' ? key : undefined,
        canonicalMerchant: input.groupBy === 'canonical_merchant' ? key : undefined,
        month: input.groupBy === 'month' ? key : undefined,
        total,
        count,
        average,
        max: count > 0 ? roundMoney(Math.max(...amounts)) : undefined,
        min: count > 0 ? roundMoney(Math.min(...amounts)) : undefined,
      });
    }

    rows.sort((a, b) => b.total - a.total);

    const limit = input.limit ?? rows.length;
    const limited = rows.slice(0, limit);

    const grandTotal = roundMoney(
      transactions.reduce((sum, t) => sum + toNumber(t.amount), 0),
    );

    return {
      rows: limited,
      grandTotal,
      transactionCount: transactions.length,
      tablesRead,
    };
  }

  /** Largest single expense (positive amount) in range. */
  async largestExpense(
    startDate?: string,
    endDate?: string,
  ): Promise<{
    merchant: string;
    amount: number;
    date: string;
    category: string;
  } | null> {
    const where = buildWhere({ startDate, endDate, includeTransfers: false });
    const rows = await prisma.transaction.findMany({ where });
    const positives = rows.filter((r) => toNumber(r.amount) > 0);
    if (positives.length === 0) return null;

    const best = positives.reduce((a, b) =>
      toNumber(a.amount) >= toNumber(b.amount) ? a : b,
    );

    return {
      merchant: best.merchant,
      amount: roundMoney(toNumber(best.amount)),
      date: best.date.toISOString().slice(0, 10),
      category: best.category,
    };
  }

  resolveCanonicalMerchants(rawMerchants: string[]): Map<string, string> {
    return buildCanonicalMap(rawMerchants);
  }
}

export const transactionService = new TransactionService();
