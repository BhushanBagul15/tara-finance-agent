import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { holdingService } from '../services/holding.service.js';

export const holdingReturnTool = createTool({
  id: 'holding-return',
  description:
    'Compute user holding return: cost basis (units × purchase NAV), current value (units × latest NAV), profit, and return %. Distinct from fund NAV period return.',
  inputSchema: z.object({
    fundName: z.string().describe('Full or partial fund name'),
  }),
  outputSchema: z.object({
    fundName: z.string(),
    fundId: z.string(),
    units: z.number(),
    purchaseDate: z.string(),
    purchaseNav: z.number(),
    latestNav: z.number(),
    purchaseCost: z.number(),
    currentValue: z.number(),
    profit: z.number(),
    returnPercent: z.number(),
    tablesRead: z.array(z.string()),
  }),
  execute: async (input) => holdingService.holdingReturn(input.fundName),
});
