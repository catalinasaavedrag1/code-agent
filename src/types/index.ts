export type DetectedService = {
  name: string;
  rootPath: string;
  domainTag: string | null;
  language: string | null;
  frameworkHint: string | null;
};

export type ParsedSymbolType =
  | 'function'
  | 'class'
  | 'method'
  | 'route'
  | 'consumer'
  | 'publisher'
  | 'schema'
  | 'dto'
  | 'unknown';

export type ParsedSymbol = {
  name: string;
  symbolType: ParsedSymbolType;
  startLine: number;
  endLine: number;
  signature?: string;
  content: string;
};

export type ParsedEndpoint = {
  method: string;
  routePath: string;
  startLine: number;
  endLine: number;
};

export type ParsedEvent = {
  direction: 'publish' | 'consume';
  eventName: string;
  transport: string | null;
  startLine: number;
  endLine: number;
};

export type ParsedDependency = {
  toServiceName: string;
  dependencyKind: 'import' | 'http' | 'event' | 'package';
  evidence: string;
};

export type ParsedFileResult = {
  language: string;
  fileContent: string;
  symbols: ParsedSymbol[];
  endpoints: ParsedEndpoint[];
  events: ParsedEvent[];
  dependencies: ParsedDependency[];
};

export type SearchHit = {
  chunkId: string;
  score: number;
  filePath: string;
  serviceName: string | null;
  symbolName: string | null;
  startLine: number;
  endLine: number;
  chunkKind: string;
  content: string;
};