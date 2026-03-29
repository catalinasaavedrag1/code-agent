import { ParsedDependency, ParsedEndpoint, ParsedEvent } from '../types/index.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

export function detectEndpoints(source: string): ParsedEndpoint[] {
  const output: ParsedEndpoint[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const method of HTTP_METHODS) {
      const regex = new RegExp(String.raw`\b(?:app|router)\.${method}\s*\(\s*['"\`]([^'"\`]+)['"\`]`);
      const match = line.match(regex);
      if (match) {
        output.push({
          method: method.toUpperCase(),
          routePath: match[1],
          startLine: i + 1,
          endLine: i + 1
        });
      }
    }

    const httpGet = line.match(/\[Http(Get|Post|Put|Patch|Delete)\s*\(\s*"([^"]+)"\s*\)\]/);
    if (httpGet) {
      output.push({
        method: httpGet[1].toUpperCase(),
        routePath: httpGet[2],
        startLine: i + 1,
        endLine: i + 1
      });
    }
  }

  return output;
}

export function detectEvents(source: string): ParsedEvent[] {
  const output: ParsedEvent[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const publish = line.match(/\b(?:publish|emit|producer\.send|channel\.publish)\s*\(\s*['"`]([^'"`]+)['"`]/i);
    if (publish) {
      output.push({
        direction: 'publish',
        eventName: publish[1],
        transport: detectTransport(line),
        startLine: i + 1,
        endLine: i + 1
      });
    }

    const consume = line.match(/\b(?:subscribe|consume|onMessage|addHandler)\s*\(\s*['"`]([^'"`]+)['"`]/i);
    if (consume) {
      output.push({
        direction: 'consume',
        eventName: consume[1],
        transport: detectTransport(line),
        startLine: i + 1,
        endLine: i + 1
      });
    }
  }

  return dedupeEvents(output);
}

export function detectDependencies(source: string, knownServices: string[]): ParsedDependency[] {
  const dependencies: ParsedDependency[] = [];
  const lines = source.split('\n');

  for (const line of lines) {
    for (const service of knownServices) {
      if (!service) continue;

      if (line.includes(`from '${service}`) || line.includes(`from "${service}`) || line.includes(`/${service}/`)) {
        dependencies.push({
          toServiceName: service,
          dependencyKind: 'import',
          evidence: line.trim().slice(0, 300)
        });
      }

      if (line.includes(service) && /(axios|fetch|http|HttpClient|baseUrl|localhost)/i.test(line)) {
        dependencies.push({
          toServiceName: service,
          dependencyKind: 'http',
          evidence: line.trim().slice(0, 300)
        });
      }

      if (line.includes(service) && /(publish|emit|consume|subscribe|topic|queue)/i.test(line)) {
        dependencies.push({
          toServiceName: service,
          dependencyKind: 'event',
          evidence: line.trim().slice(0, 300)
        });
      }
    }
  }

  return dedupeDependencies(dependencies);
}

function detectTransport(line: string): string | null {
  const lower = line.toLowerCase();
  if (lower.includes('kafka')) return 'kafka';
  if (lower.includes('rabbit')) return 'rabbitmq';
  if (lower.includes('sqs')) return 'sqs';
  return null;
}

function dedupeEvents(events: ParsedEvent[]): ParsedEvent[] {
  const seen = new Set<string>();
  return events.filter((item) => {
    const key = `${item.direction}|${item.eventName}|${item.startLine}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeDependencies(items: ParsedDependency[]): ParsedDependency[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.toServiceName}|${item.dependencyKind}|${item.evidence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}