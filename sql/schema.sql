CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS repos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_url TEXT NOT NULL UNIQUE,
  branch TEXT NOT NULL DEFAULT 'main',
  default_language TEXT NULL,
  last_commit_sha TEXT NULL,
  last_indexed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS index_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  bull_job_id TEXT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  indexed_files INT NOT NULL DEFAULT 0,
  indexed_chunks INT NOT NULL DEFAULT 0,
  indexed_events INT NOT NULL DEFAULT 0,
  indexed_dependencies INT NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  domain_tag TEXT NULL,
  language TEXT NULL,
  framework_hint TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (repo_id, root_path)
);

CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  service_id UUID NULL REFERENCES services(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  language TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes_size BIGINT NOT NULL DEFAULT 0,
  parsed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (repo_id, file_path)
);

CREATE TABLE IF NOT EXISTS symbols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  symbol_type TEXT NOT NULL,
  signature TEXT NULL,
  start_line INT NOT NULL,
  end_line INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (file_id, name, symbol_type, start_line, end_line)
);

CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  service_id UUID NULL REFERENCES services(id) ON DELETE SET NULL,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  symbol_id UUID NULL REFERENCES symbols(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  start_line INT NOT NULL,
  end_line INT NOT NULL,
  token_estimate INT NOT NULL DEFAULT 0,
  chunk_kind TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (repo_id, file_id, content_hash)
);

CREATE TABLE IF NOT EXISTS embeddings (
  chunk_id UUID PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  vector_provider TEXT NOT NULL,
  vector_model TEXT NOT NULL,
  dimensions INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  service_id UUID NULL REFERENCES services(id) ON DELETE SET NULL,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  symbol_id UUID NULL REFERENCES symbols(id) ON DELETE SET NULL,
  method TEXT NOT NULL,
  route_path TEXT NOT NULL,
  start_line INT NOT NULL,
  end_line INT NOT NULL,
  UNIQUE (repo_id, file_id, method, route_path, start_line, end_line)
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  service_id UUID NULL REFERENCES services(id) ON DELETE SET NULL,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  symbol_id UUID NULL REFERENCES symbols(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('publish', 'consume')),
  event_name TEXT NOT NULL,
  transport TEXT NULL,
  start_line INT NOT NULL,
  end_line INT NOT NULL,
  UNIQUE (repo_id, file_id, direction, event_name, start_line, end_line)
);

CREATE TABLE IF NOT EXISTS dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  from_service_id UUID NULL REFERENCES services(id) ON DELETE SET NULL,
  to_service_name TEXT NOT NULL,
  dependency_kind TEXT NOT NULL,
  source_file_id UUID NULL REFERENCES files(id) ON DELETE SET NULL,
  evidence TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (repo_id, from_service_id, to_service_name, dependency_kind, source_file_id)
);

CREATE INDEX IF NOT EXISTS idx_services_repo_id ON services(repo_id);
CREATE INDEX IF NOT EXISTS idx_files_repo_id ON files(repo_id);
CREATE INDEX IF NOT EXISTS idx_chunks_repo_id ON chunks(repo_id);
CREATE INDEX IF NOT EXISTS idx_events_repo_id ON events(repo_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_repo_id ON dependencies(repo_id);