import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { fundService } from '../services/fund.service.js';

export const fundReturnTool = createTool({
  id: 'fund-return',
  description:
    'Compute mutual fund period return % from NAV history: ((endNAV - startNAV) / startNAV) * 100. This is fund performance, not your holding return.',
  inputSchema: z.object({
    fundName: z.string().describe('Full or partial fund name'),
    startDate: z.string().describe('Period start YYYY-MM-DD'),
    endDate: z.string().describe('Period end YYYY-MM-DD'),
  }),
  outputSchema: z.object({
    fundName: z.string(),
    fundId: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    startNav: z.number(),
    endNav: z.number(),
    returnPercent: z.number(),
    tablesRead: z.array(z.string()),
  }),
  execute: async (input) => fundService.fundReturn(input.fundName, input.startDate, input.endDate),
});
