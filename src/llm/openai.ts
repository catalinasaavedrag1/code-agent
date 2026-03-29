import OpenAI from 'openai';
import { env } from '../config/env.js';

export const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await openai.embeddings.create({
    model: env.EMBEDDING_MODEL,
    input: texts
  });

  return response.data.map((item) => item.embedding);
}