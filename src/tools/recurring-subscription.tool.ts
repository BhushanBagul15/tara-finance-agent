import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { recurringService } from '../services/recurring.service.js';

export const recurringSubscriptionTool = createTool({
  id: 'recurring-subscriptions',
  description:
    'Detect recurring subscriptions: similar amounts, same canonical merchant, regular monthly-ish intervals. No hardcoded merchant names.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    subscriptions: z.array(
      z.object({
        canonicalMerchant: z.string(),
        merchantExamples: z.array(z.string()),
        averageAmount: z.number(),
        occurrenceCount: z.number(),
        medianIntervalDays: z.number(),
        category: z.string(),
      }),
    ),
    tablesRead: z.array(z.string()),
  }),
  execute: async () => recurringService.detectSubscriptions(),
});
