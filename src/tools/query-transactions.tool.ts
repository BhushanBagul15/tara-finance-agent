import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  transactionService,
  type QueryTransactionsInput,
} from '../services/transaction.service.js';

const inputSchema = z.object({
  category: z.string().optional().describe('Filter by category, e.g. food, travel'),
  merchant: z.string().optional().describe('Filter by merchant name (alias-aware)'),
  startDate: z.string().optional().describe('Start date YYYY-MM-DD inclusive'),
  endDate: z.string().optional().describe('End date YYYY-MM-DD inclusive'),
  aggregate: z
    .enum(['sum', 'avg', 'count', 'max', 'min'])
    .optional()
    .describe('Aggregate operation when not grouping'),
  groupBy: z
    .enum(['category', 'merchant', 'canonical_merchant', 'month'])
    .optional()
    .describe('Group results for comparisons and rankings'),
  includeTransfers: z
    .boolean()
    .optional()
    .describe('Include transfer category; default false for spend analysis'),
  limit: z.number().int().positive().optional().describe('Limit grouped rows'),
});

export const queryTransactionsTool = createTool({
  id: 'query-transactions',
  description:
    'Query transaction spend from PostgreSQL. Supports filters, net spend (refunds via negative amounts), grouping, rankings, and comparisons. Excludes transfers by default.',
  inputSchema,
  outputSchema: z.object({
    rows: z.array(z.record(z.unknown())),
    grandTotal: z.number(),
    transactionCount: z.number(),
    tablesRead: z.array(z.string()),
  }),
  execute: async (input) => {
    const params: QueryTransactionsInput = {
      category: input.category,
      merchant: input.merchant,
      startDate: input.startDate,
      endDate: input.endDate,
      aggregate: input.aggregate,
      groupBy: input.groupBy,
      includeTransfers: input.includeTransfers,
      limit: input.limit,
    };
    return transactionService.query(params);
  },
});
