import { Router, Response, NextFunction } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { authenticate, AuthRequest } from '../middleware/auth';

export const aiRouter = Router();

aiRouter.use(authenticate);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function setupSSE(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

function sendSSE(res: Response, data: unknown) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function streamResponse(res: Response, messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
  setupSSE(res);
  try {
    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        sendSSE(res, { type: 'delta', text: event.delta.text });
      }
    }
    sendSSE(res, { type: 'done' });
  } catch (err) {
    sendSSE(res, { type: 'error', message: 'AI request failed' });
  } finally {
    res.end();
  }
}

aiRouter.post('/generate-page', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { topic, outline } = req.body as { topic: string; outline?: string };
    const prompt = outline
      ? `Write a detailed wiki page about "${topic}". Follow this outline:\n${outline}\n\nFormat the response as valid Tiptap/ProseMirror HTML.`
      : `Write a comprehensive wiki page about "${topic}". Include relevant sections, details, and examples. Format as valid Tiptap/ProseMirror HTML.`;
    await streamResponse(res, [{ role: 'user', content: prompt }]);
  } catch (err) {
    next(err);
  }
});

aiRouter.post('/assist', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { selectedText, action, context } = req.body as {
      selectedText: string;
      action: 'improve' | 'summarize' | 'translate' | 'expand' | 'fix-grammar';
      context?: string;
    };
    const prompts: Record<string, string> = {
      improve: `Improve the following text to be clearer and more professional:\n\n${selectedText}`,
      summarize: `Summarize the following text concisely:\n\n${selectedText}`,
      translate: `Translate the following text to English (if not English) or improve clarity:\n\n${selectedText}`,
      expand: `Expand the following text with more detail and context:\n\n${selectedText}`,
      'fix-grammar': `Fix the grammar and spelling in the following text:\n\n${selectedText}`,
    };
    const prompt = prompts[action] ?? prompts.improve;
    await streamResponse(res, [{ role: 'user', content: prompt }]);
  } catch (err) {
    next(err);
  }
});

aiRouter.post('/summarize', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { content, title } = req.body as { content: string; title: string };
    await streamResponse(res, [
      {
        role: 'user',
        content: `Provide a 2-3 sentence summary of this wiki page titled "${title}":\n\n${content}`,
      },
    ]);
  } catch (err) {
    next(err);
  }
});

aiRouter.post('/search-chat', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { question, pageContent, pageTitle } = req.body as {
      question: string;
      pageContent: string;
      pageTitle: string;
    };
    await streamResponse(res, [
      {
        role: 'user',
        content: `Based on this wiki page titled "${pageTitle}", answer the following question:\n\nPage content:\n${pageContent}\n\nQuestion: ${question}`,
      },
    ]);
  } catch (err) {
    next(err);
  }
});

aiRouter.post('/autocomplete', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { text, context } = req.body as { text: string; context?: string };
    const prompt = `Continue the following sentence with 1-2 sentences. Be concise and match the writing style. Output ONLY the continuation, no preamble:\n\n${text}`;
    await streamResponse(res, [{ role: 'user', content: prompt }]);
  } catch (err) {
    next(err);
  }
});

aiRouter.post('/fill-template', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { template, variables } = req.body as { template: string; variables: Record<string, string> };
    let filled = template;
    for (const [key, value] of Object.entries(variables)) {
      filled = filled.replaceAll(`{{${key}}}`, value);
    }
    res.json({ content: filled });
  } catch (err) {
    next(err);
  }
});
