import { query } from '../db/postgres.js';

export async function getArchitectureGraph(repoId: string): Promise<{
  repoId: string;
  nodes: Array<{ id: string; label: string; type: string }>;
  edges: Array<{ from: string; to: string; type: string; evidence?: string | null }>;
}> {
  type ServiceRow = { id: string; name: string; domain_tag: string | null };
  type DependencyRow = { from_service_id: string | null; to_service_name: string; dependency_kind: string; evidence: string | null };

  const services = await query<ServiceRow>(
    `SELECT id, name, domain_tag
     FROM services
     WHERE repo_id = $1
     ORDER BY name`,
    [repoId]
  );

    const dependencies = await query<DependencyRow>(
    `SELECT from_service_id, to_service_name, dependency_kind, evidence
     FROM dependencies
     WHERE repo_id = $1`,
    [repoId]
  );

  const nodes = services.map((item) => ({
    id: item.id,
    label: item.name,
    type: item.domain_tag ?? 'service'
  }));

  const serviceByName = new Map(services.map((item) => [item.name.toLowerCase(), item.id]));
  const edges = dependencies.map((item, index) => ({
    from: item.from_service_id ?? `external-${index}`,
    to: serviceByName.get(item.to_service_name.toLowerCase()) ?? item.to_service_name,
    type: item.dependency_kind,
    evidence: item.evidence
  }));

  return { repoId, nodes, edges };
}