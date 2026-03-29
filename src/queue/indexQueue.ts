import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { env } from '../config/env.js';

export const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const indexQueue = new Queue('index-repo', {
  connection: redis
});