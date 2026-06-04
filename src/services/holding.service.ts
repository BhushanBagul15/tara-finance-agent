import { prisma } from '../db/prisma.js';
import { fundService } from './fund.service.js';
import { roundMoney, roundPercent, toNumber } from '../utils/decimal.js';

export interface HoldingReturnResult {
  fundName: string;
  fundId: string;
  units: number;
  purchaseDate: string;
  purchaseNav: number;
  latestNav: number;
  purchaseCost: number;
  currentValue: number;
  profit: number;
  returnPercent: number;
  tablesRead: string[];
}

export interface PortfolioSummaryResult {
  portfolioValue: number;
  totalCost: number;
  totalProfit: number;
  returnPercent: number;
  bestHolding: { fundName: string; returnPercent: number; profit: number };
  worstHolding: { fundName: string; returnPercent: number; profit: number };
  holdings: HoldingReturnResult[];
  tablesRead: string[];
}

async function findFundByName(fundName: string) {
  const fund = await prisma.fund.findFirst({
    where: { name: { equals: fundName, mode: 'insensitive' } },
  });
  if (fund) return fund;
  return prisma.fund.findFirst({
    where: { name: { contains: fundName, mode: 'insensitive' } },
  });
}

export class HoldingService {
  async holdingReturn(fundName: string): Promise<HoldingReturnResult> {
    const fund = await findFundByName(fundName);
    if (!fund) {
      throw new Error(`Fund not found: ${fundName}`);
    }

    const holding = await prisma.holding.findFirst({
      where: { fundId: fund.id },
      orderBy: { purchaseDate: 'desc' },
    });

    if (!holding) {
      throw new Error(`No holding found for fund: ${fund.name}`);
    }

    const units = toNumber(holding.units);
    const purchaseNav = toNumber(holding.purchaseNav);
    const latestNav = await fundService.latestNav(fund.id);

    const purchaseCost = roundMoney(units * purchaseNav);
    const currentValue = roundMoney(units * latestNav);
    const profit = roundMoney(currentValue - purchaseCost);
    const returnPercent =
      purchaseCost > 0 ? roundPercent((profit / purchaseCost) * 100) : 0;

    return {
      fundName: fund.name,
      fundId: fund.id,
      units,
      purchaseDate: holding.purchaseDate.toISOString().slice(0, 10),
      purchaseNav: roundMoney(purchaseNav),
      latestNav: roundMoney(latestNav),
      purchaseCost,
      currentValue,
      profit,
      returnPercent,
      tablesRead: ['funds', 'holdings', 'fund_navs'],
    };
  }

  async portfolioSummary(): Promise<PortfolioSummaryResult> {
    const holdings = await prisma.holding.findMany({
      include: { fund: true },
    });

    const results: HoldingReturnResult[] = [];
    for (const h of holdings) {
      results.push(await this.holdingReturn(h.fund.name));
    }

    if (results.length === 0) {
      throw new Error('No holdings in portfolio');
    }

    const portfolioValue = roundMoney(
      results.reduce((s, r) => s + r.currentValue, 0),
    );
    const totalCost = roundMoney(results.reduce((s, r) => s + r.purchaseCost, 0));
    const totalProfit = roundMoney(portfolioValue - totalCost);
    const returnPercent =
      totalCost > 0 ? roundPercent((totalProfit / totalCost) * 100) : 0;

    const sorted = [...results].sort((a, b) => b.returnPercent - a.returnPercent);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    return {
      portfolioValue,
      totalCost,
      totalProfit,
      returnPercent,
      bestHolding: {
        fundName: best.fundName,
        returnPercent: best.returnPercent,
        profit: best.profit,
      },
      worstHolding: {
        fundName: worst.fundName,
        returnPercent: worst.returnPercent,
        profit: worst.profit,
      },
      holdings: results,
      tablesRead: ['funds', 'holdings', 'fund_navs'],
    };
  }
}

export const holdingService = new HoldingService();
