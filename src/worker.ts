import { Worker } from 'bullmq';
import { redis } from './queue/indexQueue.js';
import { indexRepository } from './indexer/indexRepo.js';
import { failIndexJob, markIndexJobDone, markIndexJobRunning } from './services/metadata.service.js';

const worker = new Worker(
  'index-repo',
  async (job) => {
    const { repoId, repoUrl, branch, mode, trackingId, serviceName } = job.data as {
      repoId: string;
      repoUrl: string;
      branch: string;
      mode: string;
      trackingId: string;
      serviceName?: string;
    };

    await markIndexJobRunning(trackingId, String(job.id));

    const result = await indexRepository({
      repoId,
      repoUrl,
      branch,
      mode,
      serviceName
    });

    await markIndexJobDone(trackingId, result);
    return result;
  },
  { connection: redis }
);

worker.on('failed', async (job, error) => {
  const trackingId = job?.data?.trackingId;
  if (trackingId) {
    await failIndexJob(String(trackingId), error instanceof Error ? error.message : 'worker error');
  }
  console.error('Index worker failed', error);
});

console.log('Worker ready');