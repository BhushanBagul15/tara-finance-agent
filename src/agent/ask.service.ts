import { randomUUID } from 'node:crypto';
import { taraAgent } from './tara.agent.js';
import { writeAskLog, type AskLogEntry } from '../logging/request-logger.js';
import { requireOpenAiKey } from '../config/env.js';

export interface AskResult {
  answer: string;
  requestId: string;
}

interface ToolCallTrace {
  name: string;
  input: unknown;
  tablesRead: string[];
}

function extractToolTraces(steps: unknown): ToolCallTrace[] {
  const traces: ToolCallTrace[] = [];
  if (!steps || typeof steps !== 'object') return traces;

  const stepList = Array.isArray(steps) ? steps : [steps];
  for (const step of stepList) {
    if (!step || typeof step !== 'object') continue;
    const s = step as Record<string, unknown>;

    if (s.toolCalls && Array.isArray(s.toolCalls)) {
      for (const tc of s.toolCalls) {
        const call = tc as Record<string, unknown>;
        const payload = (call.payload ?? call) as Record<string, unknown>;
        const toolName = String(payload.toolName ?? payload.name ?? 'unknown');
        const args = payload.args ?? payload.input ?? {};
        let tablesRead: string[] = [];
        const result = payload.result as Record<string, unknown> | undefined;
        if (result?.tablesRead && Array.isArray(result.tablesRead)) {
          tablesRead = result.tablesRead as string[];
        }
        traces.push({ name: toolName, input: args, tablesRead });
      }
    }

    if (Array.isArray(s.steps)) {
      traces.push(...extractToolTraces(s.steps));
    }
  }

  return traces;
}

export class AskService {
  async ask(question: string): Promise<AskResult> {
    requireOpenAiKey();
    const requestId = randomUUID();
    const started = Date.now();
    const toolsCalled: string[] = [];
    const toolInputs: unknown[] = [];
    const tablesRead = new Set<string>();

    try {
      const response = await taraAgent.generate(question, {
        maxSteps: 8,
      });

      const traces = extractToolTraces(
        (response as { steps?: unknown }).steps ?? response,
      );

      for (const trace of traces) {
        toolsCalled.push(trace.name);
        toolInputs.push(trace.input);
        for (const table of trace.tablesRead) {
          tablesRead.add(table);
        }
      }

      const answer = response.text?.trim() ?? 'I could not generate an answer.';

      const logEntry: AskLogEntry = {
        request_id: requestId,
        question,
        tools_called: toolsCalled,
        tool_inputs: toolInputs,
        tables_read: [...tablesRead],
        latency_ms: Date.now() - started,
        status: 'success',
        timestamp: new Date().toISOString(),
      };
      writeAskLog(logEntry);

      return { answer, requestId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const logEntry: AskLogEntry = {
        request_id: requestId,
        question,
        tools_called: toolsCalled,
        tool_inputs: toolInputs,
        tables_read: [...tablesRead],
        latency_ms: Date.now() - started,
        status: 'error',
        error_reason: message,
        timestamp: new Date().toISOString(),
      };
      writeAskLog(logEntry);
      throw error;
    }
  }
}

export const askService = new AskService();
