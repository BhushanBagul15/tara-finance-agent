import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { config } from 'dotenv';
import { prisma, disconnectPrisma } from '../src/db/prisma.js';
import { buildCanonicalMap } from '../src/services/merchant-normalizer.js';
import { validateDatabaseUrl } from '../src/config/validate-database-url.js';

config();
validateDatabaseUrl();

interface RawTransaction {
  id: string;
  date: string;
  merchant: string;
  category: string;
  amount: number;
  currency: string;
  memo?: string;
}

interface RawFundNav {
  date: string;
  value: number;
}

interface RawFund {
  id: string;
  name: string;
  category: string;
  nav: RawFundNav[];
}

interface RawHolding {
  fund_id: string;
  fund_name?: string;
  units: number;
  purchase_date: string;
  purchase_nav: number;
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

function parseDate(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`);
  }
  return d;
}

async function ingestTransactions(filePath: string): Promise<number> {
  const rows = await readJson<RawTransaction[]>(filePath);
  const canonicalMap = buildCanonicalMap(rows.map((r) => r.merchant));

  await prisma.transaction.deleteMany();

  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    await prisma.transaction.createMany({
      data: chunk.map((row) => ({
        id: row.id,
        date: parseDate(row.date),
        merchant: row.merchant,
        canonicalMerchant: canonicalMap.get(row.merchant) ?? row.merchant.toUpperCase(),
        category: row.category,
        amount: new Prisma.Decimal(row.amount),
        currency: row.currency,
        memo: row.memo ?? null,
      })),
    });
  }

  return rows.length;
}

async function ingestFunds(filePath: string): Promise<number> {
  const funds = await readJson<RawFund[]>(filePath);

  await prisma.fundNav.deleteMany();
  await prisma.holding.deleteMany();
  await prisma.fund.deleteMany();

  for (const fund of funds) {
    await prisma.fund.create({
      data: {
        id: fund.id,
        name: fund.name,
        category: fund.category,
        navs: {
          create: fund.nav.map((n, idx) => ({
            id: `${fund.id}_nav_${n.date}_${idx}`,
            navDate: parseDate(n.date),
            nav: new Prisma.Decimal(n.value),
          })),
        },
      },
    });
  }

  return funds.length;
}

async function ingestHoldings(filePath: string): Promise<number> {
  const holdings = await readJson<RawHolding[]>(filePath);

  let count = 0;
  for (const h of holdings) {
    const fund = await prisma.fund.findUnique({ where: { id: h.fund_id } });
    if (!fund) {
      throw new Error(`Holding references unknown fund_id: ${h.fund_id}`);
    }

    await prisma.holding.create({
      data: {
        id: `${h.fund_id}_${h.purchase_date}_${h.units}`,
        fundId: h.fund_id,
        units: new Prisma.Decimal(h.units),
        purchaseDate: parseDate(h.purchase_date),
        purchaseNav: new Prisma.Decimal(h.purchase_nav),
      },
    });
    count++;
  }

  return count;
}

async function main(): Promise<void> {
  const dataDir = process.env.DATA_DIR ?? './data/sample_x';
  const resolved = join(process.cwd(), dataDir);

  console.log(`Ingesting from ${resolved}`);

  const txPath = join(resolved, 'transactions.json');
  const fundsPath = join(resolved, 'funds.json');
  const holdingsPath = join(resolved, 'holdings.json');

  const txCount = await ingestTransactions(txPath);
  const fundCount = await ingestFunds(fundsPath);
  const holdingCount = await ingestHoldings(holdingsPath);

  console.log(`Ingested ${txCount} transactions, ${fundCount} funds, ${holdingCount} holdings`);
}

main()
  .catch((err) => {
    console.error('Ingest failed:', err);
    process.exit(1);
  })
  .finally(() => disconnectPrisma());
