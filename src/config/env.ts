import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3000),
  OPENAI_API_KEY: z.string().min(1),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  CHAT_MODEL: z.string().default('gpt-4.1-mini'),
  DATABASE_URL: z.string().min(1),
  QDRANT_URL: z.string().url(),
  QDRANT_COLLECTION: z.string().default('code_chunks'),
  REDIS_URL: z.string().min(1),
  WORKDIR_BASE: z.string().default('.workdir'),
  TOP_K: z.coerce.number().default(10),
  MAX_FILE_SIZE_BYTES: z.coerce.number().default(400000)
});

export const env = EnvSchema.parse(process.env);