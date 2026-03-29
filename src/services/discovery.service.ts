import fs from 'fs/promises';
import path from 'path';
import { DetectedService } from '../types/index.js';

const DOMAIN_HINTS = ['catalog', 'inventory', 'oms', 'dom', 'commerce', 'delivery', 'picking', 'packing', 'crm', 'pricing'];

export async function detectServices(repoRoot: string): Promise<DetectedService[]> {
  const entries = await fs.readdir(repoRoot, { withFileTypes: true }).catch(() => []);
  const result: DetectedService[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const rootPath = path.join(repoRoot, entry.name);
    const files = await fs.readdir(rootPath).catch(() => []);
    const marker = files.find((file) =>
      file === 'package.json' ||
      file.endsWith('.csproj') ||
      file === 'pom.xml' ||
      file === 'Dockerfile' ||
      file === 'openapi.yaml' ||
      file === 'openapi.yml'
    );

    if (!marker) continue;

    result.push({
      name: entry.name,
      rootPath,
      domainTag: DOMAIN_HINTS.find((item) => entry.name.toLowerCase().includes(item)) ?? null,
      language: detectServiceLanguage(files),
      frameworkHint: detectFrameworkHint(files)
    });
  }

  if (result.length === 0) {
    result.push({
      name: 'root',
      rootPath: repoRoot,
      domainTag: inferDomain(repoRoot),
      language: null,
      frameworkHint: null
    });
  }

  return result;
}

function detectServiceLanguage(files: string[]): string | null {
  if (files.some((file) => file.endsWith('.csproj'))) return 'csharp';
  if (files.includes('package.json')) return 'typescript';
  return null;
}

function detectFrameworkHint(files: string[]): string | null {
  if (files.includes('package.json')) return 'node';
  if (files.some((file) => file.endsWith('.csproj'))) return '.net';
  return null;
}

function inferDomain(repoRoot: string): string | null {
  const lower = repoRoot.toLowerCase();
  return DOMAIN_HINTS.find((item) => lower.includes(item)) ?? null;
}