import { config } from 'dotenv';
import { prisma, disconnectPrisma } from '../src/db/prisma.js';
import { transactionService } from '../src/services/transaction.service.js';
import { fundService } from '../src/services/fund.service.js';
import { holdingService } from '../src/services/holding.service.js';
import { recurringService } from '../src/services/recurring.service.js';
import { buildCanonicalMap, normalizeMerchant } from '../src/services/merchant-normalizer.js';
import { toNumber } from '../src/utils/decimal.js';

config();

type EvalFn = () => Promise<void>;

interface EvalCase {
  name: string;
  run: EvalFn;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertDefined<T>(value: T | null | undefined, message: string): T {
  if (value == null) {
    throw new Error(message);
  }
  return value;
}

async function ensureData(): Promise<void> {
  const count = await prisma.transaction.count();
  if (count === 0) {
    throw new Error('No transactions in database. Run: DATA_DIR=./data/sample_x npm run ingest');
  }
}

const cases: EvalCase[] = [
  {
    name: '1. Food spending total',
    run: async () => {
      const result = await transactionService.query({ category: 'food' });
      assert(result.transactionCount > 0, 'Expected food transactions');
      assert(typeof result.grandTotal === 'number', 'grandTotal must be a number');
      const manual = await prisma.transaction.findMany({
        where: { category: { equals: 'food', mode: 'insensitive' } },
      });
      const expected = manual.reduce((s, t) => s + toNumber(t.amount), 0);
      assert(
        Math.abs(result.grandTotal - Math.round(expected * 100) / 100) < 0.02,
        `Food total mismatch: ${result.grandTotal} vs ${expected}`,
      );
    },
  },
  {
    name: '2. Largest expense',
    run: async () => {
      const largest = assertDefined(
        await transactionService.largestExpense(),
        'Expected a largest expense',
      );
      assert(largest.amount > 0, 'Largest expense must be positive');
      const all = await prisma.transaction.findMany({
        where: { NOT: { category: { equals: 'transfer', mode: 'insensitive' } } },
      });
      const maxPositive = Math.max(
        ...all.map((t) => toNumber(t.amount)).filter((a) => a > 0),
      );
      assert(
        Math.abs(largest.amount - maxPositive) < 0.02,
        `Largest expense mismatch: ${largest.amount} vs ${maxPositive}`,
      );
    },
  },
  {
    name: '3. Top merchants by spend',
    run: async () => {
      const result = await transactionService.query({
        groupBy: 'canonical_merchant',
        limit: 5,
      });
      assert(result.rows.length > 0, 'Expected merchant groups');
      for (let i = 1; i < result.rows.length; i++) {
        assert(
          result.rows[i - 1].total >= result.rows[i].total,
          'Merchants must be sorted by total descending',
        );
      }
    },
  },
  {
    name: '4. Refund handling (net spend)',
    run: async () => {
      const merchants = await prisma.transaction.findMany({
        where: { amount: { lt: 0 } },
        take: 50,
      });
      assert(merchants.length > 0, 'Expected refund transactions in dataset');
      const sample = merchants[0];
      const result = await transactionService.query({
        merchant: sample.merchant,
      });
      const rows = await prisma.transaction.findMany({
        where: { canonicalMerchant: sample.canonicalMerchant },
      });
      const expected = rows.reduce((s, t) => s + toNumber(t.amount), 0);
      assert(
        Math.abs(result.grandTotal - Math.round(expected * 100) / 100) < 0.02,
        'Refunds must net into spend total',
      );
    },
  },
  {
    name: '5. Transfer exclusion',
    run: async () => {
      const withTransfers = await transactionService.query({ includeTransfers: true });
      const without = await transactionService.query({ includeTransfers: false });
      assert(
        withTransfers.grandTotal >= without.grandTotal,
        'Including transfers should not reduce total',
      );
      const transfers = await prisma.transaction.count({
        where: { category: { equals: 'transfer', mode: 'insensitive' } },
      });
      if (transfers > 0) {
        assert(
          withTransfers.transactionCount > without.transactionCount,
          'Transfers should be excluded by default',
        );
      }
    },
  },
  {
    name: '6. Merchant alias normalization',
    run: async () => {
      const swiggyVariants = await prisma.transaction.findMany({
        where: {
          OR: [
            { merchant: { contains: 'swiggy', mode: 'insensitive' } },
            { merchant: { contains: 'SWIGGY', mode: 'insensitive' } },
          ],
        },
        select: { merchant: true, canonicalMerchant: true },
      });
      if (swiggyVariants.length >= 2) {
        const canonicals = new Set(swiggyVariants.map((s) => s.canonicalMerchant));
        assert(
          canonicals.size === 1,
          `Swiggy variants should share one canonical merchant, got: ${[...canonicals].join(', ')}`,
        );
      }
      const map = buildCanonicalMap(['SWIGGY ORDER', 'SWIGGY*123', 'Swiggy Instamart']);
      const values = new Set(map.values());
      assert(values.size === 1, 'Synthetic Swiggy aliases should cluster');
      assert(
        normalizeMerchant('SWIGGY BANGALORE').startsWith('SWIGGY'),
        'SWIGGY BANGALORE should normalize to SWIGGY family',
      );
    },
  },
  {
    name: '7. Date filtering',
    run: async () => {
      const start = '2024-06-01';
      const end = '2024-06-30';
      const result = await transactionService.query({ startDate: start, endDate: end });
      const rows = await prisma.transaction.findMany({
        where: {
          date: {
            gte: new Date(`${start}T00:00:00.000Z`),
            lte: new Date(`${end}T00:00:00.000Z`),
          },
          NOT: { category: { equals: 'transfer', mode: 'insensitive' } },
        },
      });
      const expected = rows.reduce((s, t) => s + toNumber(t.amount), 0);
      assert(
        result.transactionCount === rows.length,
        'Date filter count mismatch',
      );
      assert(
        Math.abs(result.grandTotal - Math.round(expected * 100) / 100) < 0.02,
        'Date filter total mismatch',
      );
    },
  },
  {
    name: '8. Recurring subscriptions',
    run: async () => {
      const result = await recurringService.detectSubscriptions();
      assert(Array.isArray(result.subscriptions), 'subscriptions must be an array');
      for (const sub of result.subscriptions) {
        assert(sub.occurrenceCount >= 3, 'Recurring needs at least 3 occurrences');
        assert(sub.averageAmount > 0, 'Subscription amount must be positive');
        assert(sub.medianIntervalDays >= 20, 'Interval should be monthly-ish');
      }
    },
  },
  {
    name: '9. No-data case',
    run: async () => {
      const result = await transactionService.query({
        category: 'nonexistent_category_xyz',
      });
      assert(result.transactionCount === 0, 'Unknown category should return zero rows');
      assert(result.grandTotal === 0, 'Unknown category total should be 0');
      await fundService
        .fundReturn('Fund That Does Not Exist', '2024-01-01', '2024-12-31')
        .then(() => {
          throw new Error('Expected fund not found error');
        })
        .catch((err: Error) => {
          assert(err.message.includes('not found'), 'Should throw not found');
        });
    },
  },
  {
    name: '10. Fund period return',
    run: async () => {
      const fund = assertDefined(await prisma.fund.findFirst(), 'Need at least one fund');
      const navs = await prisma.fundNav.findMany({
        where: { fundId: fund.id },
        orderBy: { navDate: 'asc' },
      });
      assert(navs.length >= 2, 'Need NAV history');
      const start = navs[0].navDate.toISOString().slice(0, 10);
      const end = navs[navs.length - 1].navDate.toISOString().slice(0, 10);
      const result = await fundService.fundReturn(fund.name, start, end);
      const startNav = toNumber(navs[0].nav);
      const endNav = toNumber(navs[navs.length - 1].nav);
      const expected = ((endNav - startNav) / startNav) * 100;
      assert(
        Math.abs(result.returnPercent - Math.round(expected * 10000) / 10000) < 0.01,
        `Fund return formula mismatch: ${result.returnPercent} vs ${expected}`,
      );
    },
  },
  {
    name: '11. Holding return',
    run: async () => {
      const holding = assertDefined(
        await prisma.holding.findFirst({ include: { fund: true } }),
        'Need at least one holding',
      );
      const result = await holdingService.holdingReturn(holding.fund.name);
      const units = toNumber(holding.units);
      const purchaseNav = toNumber(holding.purchaseNav);
      const latest = await fundService.latestNav(holding.fundId);
      const cost = units * purchaseNav;
      const value = units * latest;
      const profit = value - cost;
      const ret = (profit / cost) * 100;
      assert(
        Math.abs(result.purchaseCost - Math.round(cost * 100) / 100) < 0.02,
        'purchaseCost mismatch',
      );
      assert(
        Math.abs(result.returnPercent - Math.round(ret * 10000) / 10000) < 0.01,
        'holding return % mismatch',
      );
    },
  },
  {
    name: '12. Portfolio summary',
    run: async () => {
      const summary = await holdingService.portfolioSummary();
      assert(summary.portfolioValue > 0, 'Portfolio value should be positive');
      assert(summary.holdings.length > 0, 'Should include holdings');
      const sumValue = summary.holdings.reduce((s, h) => s + h.currentValue, 0);
      assert(
        Math.abs(summary.portfolioValue - Math.round(sumValue * 100) / 100) < 0.05,
        'Portfolio value should equal sum of holdings',
      );
      assert(
        summary.bestHolding.returnPercent >= summary.worstHolding.returnPercent,
        'Best return should be >= worst return',
      );
    },
  },
];

async function main(): Promise<void> {
  await ensureData();

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  console.log('Tara Evaluation Suite\n');

  for (const evalCase of cases) {
    try {
      await evalCase.run();
      console.log(`PASS  ${evalCase.name}`);
      passed++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`FAIL  ${evalCase.name}`);
      console.log(`      ${msg}`);
      failures.push(`${evalCase.name}: ${msg}`);
      failed++;
    }
  }

  console.log('\n--- Summary ---');
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failed}`);

  if (failures.length > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => disconnectPrisma());
