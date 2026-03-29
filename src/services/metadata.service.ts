import { query } from '../db/postgres.js';

type RepoRow = { id: string; repo_url: string; branch: string };
type ServiceRow = { id: string; name: string };
type FileRow = { id: string };
type IndexJobRow = {
  id: string;
  repo_id: string;
  bull_job_id: string | null;
  mode: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  indexed_files: number;
  indexed_chunks: number;
  indexed_events: number;
  indexed_dependencies: number;
  error_message: string | null;
  created_at: string;
};

export async function upsertRepo(repoUrl: string, branch: string): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO repos (repo_url, branch)
     VALUES ($1, $2)
     ON CONFLICT (repo_url)
     DO UPDATE SET branch = EXCLUDED.branch, updated_at = NOW()
     RETURNING id`,
    [repoUrl, branch]
  );
  return rows[0].id;
}

export async function fetchRepo(repoId: string): Promise<RepoRow | null> {
  const rows = await query<RepoRow>(
    `SELECT id, repo_url, branch
     FROM repos
     WHERE id = $1
     LIMIT 1`,
    [repoId]
  );
  return rows[0] ?? null;
}

export async function touchRepoIndexed(repoId: string): Promise<void> {
  await query(
    `UPDATE repos
     SET last_indexed_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [repoId]
  );
}

export async function createIndexJob(repoId: string, mode: string): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO index_jobs (repo_id, mode, status)
     VALUES ($1, $2, 'queued')
     RETURNING id`,
    [repoId, mode]
  );
  return rows[0].id;
}

export async function markIndexJobRunning(id: string, bullJobId: string): Promise<void> {
  await query(
    `UPDATE index_jobs
     SET status = 'running', bull_job_id = $2, started_at = NOW()
     WHERE id = $1`,
    [id, bullJobId]
  );
}

export async function markIndexJobDone(id: string, metrics: {
  indexedFiles: number;
  indexedChunks: number;
  indexedEvents: number;
  indexedDependencies: number;
}): Promise<void> {
  await query(
    `UPDATE index_jobs
     SET status = 'completed',
         finished_at = NOW(),
         indexed_files = $2,
         indexed_chunks = $3,
         indexed_events = $4,
         indexed_dependencies = $5
     WHERE id = $1`,
    [id, metrics.indexedFiles, metrics.indexedChunks, metrics.indexedEvents, metrics.indexedDependencies]
  );
}

export async function failIndexJob(id: string, message: string): Promise<void> {
  await query(
    `UPDATE index_jobs
     SET status = 'failed',
         finished_at = NOW(),
         error_message = $2
     WHERE id = $1`,
    [id, message]
  );
}

export async function fetchIndexJob(id: string): Promise<IndexJobRow | null> {
  const rows = await query<IndexJobRow>(
    `SELECT *
     FROM index_jobs
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function upsertService(input: {
  repoId: string;
  name: string;
  rootPath: string;
  domainTag: string | null;
  language: string | null;
  frameworkHint: string | null;
}): Promise<string> {
  const rows = await query<ServiceRow>(
    `INSERT INTO services (repo_id, name, root_path, domain_tag, language, framework_hint)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (repo_id, root_path)
     DO UPDATE SET
       name = EXCLUDED.name,
       domain_tag = EXCLUDED.domain_tag,
       language = EXCLUDED.language,
       framework_hint = EXCLUDED.framework_hint,
       updated_at = NOW()
     RETURNING id, name`,
    [input.repoId, input.name, input.rootPath, input.domainTag, input.language, input.frameworkHint]
  );
  return rows[0].id;
}

export async function listServices(repoId: string): Promise<Array<{
  id: string;
  name: string;
  root_path: string;
  domain_tag: string | null;
  language: string | null;
  framework_hint: string | null;
}>> {
  return query(
    `SELECT id, name, root_path, domain_tag, language, framework_hint
     FROM services
     WHERE repo_id = $1
     ORDER BY name`,
    [repoId]
  );
}

export async function upsertFile(input: {
  repoId: string;
  serviceId: string | null;
  filePath: string;
  language: string;
  sha: string;
  bytesSize: number;
}): Promise<string> {
  const rows = await query<FileRow>(
    `INSERT INTO files (repo_id, service_id, file_path, language, sha256, bytes_size, parsed_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (repo_id, file_path)
     DO UPDATE SET
       service_id = EXCLUDED.service_id,
       language = EXCLUDED.language,
       sha256 = EXCLUDED.sha256,
       bytes_size = EXCLUDED.bytes_size,
       parsed_at = NOW(),
       updated_at = NOW()
     RETURNING id`,
    [input.repoId, input.serviceId, input.filePath, input.language, input.sha, input.bytesSize]
  );
  return rows[0].id;
}

export async function createSymbol(fileId: string, name: string, symbolType: string, startLine: number, endLine: number, signature?: string): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO symbols (file_id, name, symbol_type, signature, start_line, end_line)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (file_id, name, symbol_type, start_line, end_line)
     DO UPDATE SET signature = EXCLUDED.signature
     RETURNING id`,
    [fileId, name, symbolType, signature ?? null, startLine, endLine]
  );
  return rows[0].id;
}

export async function upsertChunk(input: {
  repoId: string;
  serviceId: string | null;
  fileId: string;
  symbolId: string | null;
  content: string;
  contentHash: string;
  startLine: number;
  endLine: number;
  tokenEstimate: number;
  chunkKind: string;
}): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO chunks (
       repo_id, service_id, file_id, symbol_id, content, content_hash,
       start_line, end_line, token_estimate, chunk_kind
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (repo_id, file_id, content_hash)
     DO UPDATE SET
       symbol_id = EXCLUDED.symbol_id,
       content = EXCLUDED.content,
       start_line = EXCLUDED.start_line,
       end_line = EXCLUDED.end_line,
       token_estimate = EXCLUDED.token_estimate,
       chunk_kind = EXCLUDED.chunk_kind,
       updated_at = NOW()
     RETURNING id`,
    [
      input.repoId,
      input.serviceId,
      input.fileId,
      input.symbolId,
      input.content,
      input.contentHash,
      input.startLine,
      input.endLine,
      input.tokenEstimate,
      input.chunkKind
    ]
  );
  return rows[0].id;
}

export async function markEmbedding(chunkId: string, model: string, dimensions: number): Promise<void> {
  await query(
    `INSERT INTO embeddings (chunk_id, vector_provider, vector_model, dimensions)
     VALUES ($1, 'openai', $2, $3)
     ON CONFLICT (chunk_id)
     DO UPDATE SET vector_model = EXCLUDED.vector_model, dimensions = EXCLUDED.dimensions`,
    [chunkId, model, dimensions]
  );
}

export async function upsertEndpoint(input: {
  repoId: string;
  serviceId: string | null;
  fileId: string;
  symbolId: string | null;
  method: string;
  routePath: string;
  startLine: number;
  endLine: number;
}): Promise<void> {
  await query(
    `INSERT INTO endpoints (repo_id, service_id, file_id, symbol_id, method, route_path, start_line, end_line)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (repo_id, file_id, method, route_path, start_line, end_line)
     DO NOTHING`,
    [input.repoId, input.serviceId, input.fileId, input.symbolId, input.method, input.routePath, input.startLine, input.endLine]
  );
}

export async function upsertEvent(input: {
  repoId: string;
  serviceId: string | null;
  fileId: string;
  symbolId: string | null;
  direction: 'publish' | 'consume';
  eventName: string;
  transport: string | null;
  startLine: number;
  endLine: number;
}): Promise<void> {
  await query(
    `INSERT INTO events (repo_id, service_id, file_id, symbol_id, direction, event_name, transport, start_line, end_line)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (repo_id, file_id, direction, event_name, start_line, end_line)
     DO NOTHING`,
    [
      input.repoId,
      input.serviceId,
      input.fileId,
      input.symbolId,
      input.direction,
      input.eventName,
      input.transport,
      input.startLine,
      input.endLine
    ]
  );
}

export async function upsertDependency(input: {
  repoId: string;
  fromServiceId: string | null;
  toServiceName: string;
  dependencyKind: 'import' | 'http' | 'event' | 'package';
  sourceFileId: string | null;
  evidence: string;
}): Promise<void> {
  await query(
    `INSERT INTO dependencies (repo_id, from_service_id, to_service_name, dependency_kind, source_file_id, evidence)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (repo_id, from_service_id, to_service_name, dependency_kind, source_file_id)
     DO NOTHING`,
    [input.repoId, input.fromServiceId, input.toServiceName, input.dependencyKind, input.sourceFileId, input.evidence]
  );
}