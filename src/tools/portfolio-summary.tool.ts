import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { holdingService } from '../services/holding.service.js';

export const portfolioSummaryTool = createTool({
  id: 'portfolio-summary',
  description:
    'Portfolio-wide summary: total value, total profit, best and worst holdings by return %.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    portfolioValue: z.number(),
    totalCost: z.number(),
    totalProfit: z.number(),
    returnPercent: z.number(),
    bestHolding: z.object({
      fundName: z.string(),
      returnPercent: z.number(),
      profit: z.number(),
    }),
    worstHolding: z.object({
      fundName: z.string(),
      returnPercent: z.number(),
      profit: z.number(),
    }),
    holdings: z.array(z.record(z.unknown())),
    tablesRead: z.array(z.string()),
  }),
  execute: async () => holdingService.portfolioSummary(),
});
