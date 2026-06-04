import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import pino from 'pino';
import { getEnv } from '../config/env.js';

const env = getEnv();

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

export interface AskLogEntry {
  request_id: string;
  question: string;
  tools_called: string[];
  tool_inputs: unknown[];
  tables_read: string[];
  latency_ms: number;
  status: 'success' | 'error';
  error_reason?: string;
  timestamp: string;
}

const logsDir = join(process.cwd(), 'logs');

function ensureLogsDir(): void {
  mkdirSync(logsDir, { recursive: true });
}

export function writeAskLog(entry: AskLogEntry): void {
  ensureLogsDir();
  const line = `${JSON.stringify(entry)}\n`;
  appendFileSync(join(logsDir, 'ask.jsonl'), line, 'utf8');
  logger.info(
    {
      request_id: entry.request_id,
      tools_called: entry.tools_called,
      latency_ms: entry.latency_ms,
      status: entry.status,
    },
    'ask_request',
  );
}
