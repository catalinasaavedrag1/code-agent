import { Router } from 'express';
import { z } from 'zod';
import { indexQueue } from '../queue/indexQueue.js';
import { createIndexJob, fetchIndexJob, fetchRepo, listServices, upsertRepo } from '../services/metadata.service.js';
import { askRepo } from '../services/search.service.js';
import { getArchitectureGraph } from '../services/graph.service.js';

const router = Router();

const RepoSchema = z.object({
  repoUrl: z.string().url(),
  branch: z.string().default('main')
});

const AskSchema = z.object({
  repoId: z.string().uuid(),
  question: z.string().min(3)
});

router.get('/health', (_req, res) => {
  res.json({ ok: true });
});

router.post('/index/repo', async (req, res, next) => {
  try {
    const { repoUrl, branch } = RepoSchema.parse(req.body);
    const repoId = await upsertRepo(repoUrl, branch);
    const trackingId = await createIndexJob(repoId, 'repo');
    const job = await indexQueue.add('index-repo', { repoId, repoUrl, branch, mode: 'repo', trackingId });
    res.status(202).json({ repoId, jobId: job.id, trackingId, status: 'queued' });
  } catch (error) {
    next(error);
  }
});

router.post('/index/service', async (req, res, next) => {
  try {
    const body = RepoSchema.extend({ serviceName: z.string().min(1) }).parse(req.body);
    const repoId = await upsertRepo(body.repoUrl, body.branch);
    const trackingId = await createIndexJob(repoId, 'service');
    const job = await indexQueue.add('index-repo', { ...body, repoId, mode: 'service', trackingId });
    res.status(202).json({ repoId, jobId: job.id, trackingId, status: 'queued' });
  } catch (error) {
    next(error);
  }
});

router.post('/reindex', async (req, res, next) => {
  try {
    const body = z.object({ repoId: z.string().uuid() }).parse(req.body);
    const repo = await fetchRepo(body.repoId);
    if (!repo) return res.status(404).json({ message: 'repo no encontrado' });

    const trackingId = await createIndexJob(repo.id, 'reindex');
    const job = await indexQueue.add('index-repo', {
      repoId: repo.id,
      repoUrl: repo.repo_url,
      branch: repo.branch,
      mode: 'reindex',
      trackingId
    });

    res.status(202).json({ repoId: repo.id, jobId: job.id, trackingId, status: 'queued' });
  } catch (error) {
    next(error);
  }
});

router.post('/ask', async (req, res, next) => {
  try {
    const { repoId, question } = AskSchema.parse(req.body);
    const result = await askRepo(repoId, question);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/repos/:repoId/services', async (req, res, next) => {
  try {
    const repoId = z.string().uuid().parse(req.params.repoId);
    const services = await listServices(repoId);
    res.json({ repoId, services });
  } catch (error) {
    next(error);
  }
});

router.get('/repos/:repoId/graph', async (req, res, next) => {
  try {
    const repoId = z.string().uuid().parse(req.params.repoId);
    const graph = await getArchitectureGraph(repoId);
    res.json(graph);
  } catch (error) {
    next(error);
  }
});

router.get('/jobs/:jobId', async (req, res, next) => {
  try {
    const jobId = z.string().uuid().parse(req.params.jobId);
    const job = await fetchIndexJob(jobId);
    if (!job) return res.status(404).json({ message: 'job no encontrado' });
    res.json(job);
  } catch (error) {
    next(error);
  }
});

export default router;