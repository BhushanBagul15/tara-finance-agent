import { Router } from 'express';
import { z } from 'zod';
import { askService } from '../agent/ask.service.js';

const askBodySchema = z.object({
  question: z.string().min(1).max(4000),
});

export const askRouter = Router();

askRouter.post('/ask', async (req, res) => {
  const parsed = askBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
    return;
  }

  try {
    const { answer } = await askService.ask(parsed.data.question);
    res.json({ answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message.includes('OPENAI_API_KEY') ? 503 : 500;
    res.status(status).json({ error: message });
  }
});
