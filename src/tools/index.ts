export { queryTransactionsTool } from './query-transactions.tool.js';
export { fundReturnTool } from './fund-return.tool.js';
export { holdingReturnTool } from './holding-return.tool.js';
export { portfolioSummaryTool } from './portfolio-summary.tool.js';
export { recurringSubscriptionTool } from './recurring-subscription.tool.js';

import { queryTransactionsTool } from './query-transactions.tool.js';
import { fundReturnTool } from './fund-return.tool.js';
import { holdingReturnTool } from './holding-return.tool.js';
import { portfolioSummaryTool } from './portfolio-summary.tool.js';
import { recurringSubscriptionTool } from './recurring-subscription.tool.js';

export const taraTools = {
  queryTransactionsTool,
  fundReturnTool,
  holdingReturnTool,
  portfolioSummaryTool,
  recurringSubscriptionTool,
};

export const TOOL_NAME_MAP: Record<string, string> = {
  'query-transactions': 'queryTransactionsTool',
  'fund-return': 'fundReturnTool',
  'holding-return': 'holdingReturnTool',
  'portfolio-summary': 'portfolioSummaryTool',
  'recurring-subscriptions': 'recurringSubscriptionTool',
};
