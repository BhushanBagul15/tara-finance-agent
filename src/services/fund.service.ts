import { prisma } from '../db/prisma.js';
import { roundMoney, roundPercent, toNumber } from '../utils/decimal.js';

export interface FundReturnResult {
  fundName: string;
  fundId: string;
  startDate: string;
  endDate: string;
  startNav: number;
  endNav: number;
  returnPercent: number;
  tablesRead: string[];
}

function parseDate(s: string): Date {
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${s}`);
  }
  return d;
}

async function findFundByName(fundName: string) {
  const fund = await prisma.fund.findFirst({
    where: { name: { equals: fundName, mode: 'insensitive' } },
  });
  if (!fund) {
    const partial = await prisma.fund.findFirst({
      where: { name: { contains: fundName, mode: 'insensitive' } },
    });
    return partial;
  }
  return fund;
}

async function navOnOrBefore(fundId: string, date: Date): Promise<{ nav: number; navDate: string } | null> {
  const row = await prisma.fundNav.findFirst({
    where: { fundId, navDate: { lte: date } },
    orderBy: { navDate: 'desc' },
  });
  if (!row) return null;
  return {
    nav: toNumber(row.nav),
    navDate: row.navDate.toISOString().slice(0, 10),
  };
}

export class FundService {
  async fundReturn(
    fundName: string,
    startDate: string,
    endDate: string,
  ): Promise<FundReturnResult> {
    const fund = await findFundByName(fundName);
    if (!fund) {
      throw new Error(`Fund not found: ${fundName}`);
    }

    const start = parseDate(startDate);
    const end = parseDate(endDate);

    const startNavRow = await navOnOrBefore(fund.id, start);
    const endNavRow = await navOnOrBefore(fund.id, end);

    if (!startNavRow || !endNavRow) {
      throw new Error(`NAV data not available for fund ${fund.name} in the requested range`);
    }

    const startNav = startNavRow.nav;
    const endNav = endNavRow.nav;
    const returnPercent = roundPercent(((endNav - startNav) / startNav) * 100);

    return {
      fundName: fund.name,
      fundId: fund.id,
      startDate: startNavRow.navDate,
      endDate: endNavRow.navDate,
      startNav: roundMoney(startNav),
      endNav: roundMoney(endNav),
      returnPercent,
      tablesRead: ['funds', 'fund_navs'],
    };
  }

  async latestNav(fundId: string): Promise<number> {
    const row = await prisma.fundNav.findFirst({
      where: { fundId },
      orderBy: { navDate: 'desc' },
    });
    if (!row) {
      throw new Error(`No NAV history for fund ${fundId}`);
    }
    return toNumber(row.nav);
  }
}

export const fundService = new FundService();
