import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env.js';
import { ensureCollection, qdrant } from '../db/qdrant.js';
import { embedTexts } from '../llm/openai.js';
import { parseSemanticFile } from '../parser/semanticParser.js';
import { detectServices } from '../services/discovery.service.js';
import { cloneOrPullRepo } from '../services/git.service.js';
import {
  createSymbol,
  markEmbedding,
  touchRepoIndexed,
  upsertChunk,
  upsertDependency,
  upsertEndpoint,
  upsertEvent,
  upsertFile,
  upsertService
} from '../services/metadata.service.js';
import { walkFiles } from '../utils/fs.js';
import { sha256 } from '../utils/hash.js';

export async function indexRepository(input: {
  repoId: string;
  repoUrl: string;
  branch: string;
  mode: string;
  serviceName?: string;
}): Promise<{
  indexedFiles: number;
  indexedChunks: number;
  indexedEvents: number;
  indexedDependencies: number;
}> {
  const repoRoot = await cloneOrPullRepo(input.repoUrl, input.branch);
  const discovered = await detectServices(repoRoot);
  const selectedServices = input.serviceName
    ? discovered.filter((item) => item.name === input.serviceName)
    : discovered;

  const allServiceNames = discovered.map((item) => item.name);
  const vectorPoints: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> = [];

  let dimensions = 0;
  let indexedFiles = 0;
  let indexedChunks = 0;
  let indexedEvents = 0;
  let indexedDependencies = 0;

  for (const service of selectedServices) {
    const serviceId = await upsertService({
      repoId: input.repoId,
      name: service.name,
      rootPath: relativeToRepo(repoRoot, service.rootPath),
      domainTag: service.domainTag,
      language: service.language,
      frameworkHint: service.frameworkHint
    });

    const files = await walkFiles(service.rootPath);

    for (const fileAbsPath of files) {
      const stats = await fs.stat(fileAbsPath);
      if (stats.size > env.MAX_FILE_SIZE_BYTES) continue;

      const relPath = relativeToRepo(repoRoot, fileAbsPath);
      const fileContent = await fs.readFile(fileAbsPath, 'utf8');
      const fileSha = sha256(fileContent);

      const parsed = await parseSemanticFile(fileAbsPath, allServiceNames);

      const fileId = await upsertFile({
        repoId: input.repoId,
        serviceId,
        filePath: relPath,
        language: parsed.language,
        sha: fileSha,
        bytesSize: stats.size
      });

      indexedFiles += 1;

      const embeddingInputs = parsed.symbols.map((symbol) =>
        normalizeChunk(service.name, relPath, symbol.name, symbol.symbolType, symbol.content)
      );
      const embeddings = await embedTexts(embeddingInputs);

      if (embeddings[0] && !dimensions) {
        dimensions = embeddings[0].length;
        await ensureCollection(dimensions);
      }

      for (let i = 0; i < parsed.symbols.length; i++) {
        const symbol = parsed.symbols[i];

        const symbolId = await createSymbol(
          fileId,
          symbol.name,
          symbol.symbolType,
          symbol.startLine,
          symbol.endLine,
          symbol.signature
        );

        const chunkId = await upsertChunk({
          repoId: input.repoId,
          serviceId,
          fileId,
          symbolId,
          content: symbol.content,
          contentHash: sha256(symbol.content),
          startLine: symbol.startLine,
          endLine: symbol.endLine,
          tokenEstimate: estimateTokens(symbol.content),
          chunkKind: symbol.symbolType
        });

        if (embeddings[i]) {
          await markEmbedding(chunkId, env.EMBEDDING_MODEL, embeddings[i].length);
          vectorPoints.push({
            id: chunkId,
            vector: embeddings[i],
            payload: {
              repoId: input.repoId,
              serviceName: service.name,
              filePath: relPath,
              symbolName: symbol.name,
              chunkKind: symbol.symbolType,
              startLine: symbol.startLine,
              endLine: symbol.endLine,
              content: symbol.content
            }
          });
        }

        for (const endpoint of parsed.endpoints.filter((item) => within(item.startLine, item.endLine, symbol.startLine, symbol.endLine))) {
          await upsertEndpoint({
            repoId: input.repoId,
            serviceId,
            fileId,
            symbolId,
            method: endpoint.method,
            routePath: endpoint.routePath,
            startLine: endpoint.startLine,
            endLine: endpoint.endLine
          });
        }

        for (const event of parsed.events.filter((item) => within(item.startLine, item.endLine, symbol.startLine, symbol.endLine))) {
          await upsertEvent({
            repoId: input.repoId,
            serviceId,
            fileId,
            symbolId,
            direction: event.direction,
            eventName: event.eventName,
            transport: event.transport,
            startLine: event.startLine,
            endLine: event.endLine
          });
          indexedEvents += 1;
        }
      }

      for (const event of parsed.events.filter((item) => !parsed.symbols.some((symbol) => within(item.startLine, item.endLine, symbol.startLine, symbol.endLine)))) {
        await upsertEvent({
          repoId: input.repoId,
          serviceId,
          fileId,
          symbolId: null,
          direction: event.direction,
          eventName: event.eventName,
          transport: event.transport,
          startLine: event.startLine,
          endLine: event.endLine
        });
        indexedEvents += 1;
      }

      for (const dependency of parsed.dependencies) {
        await upsertDependency({
          repoId: input.repoId,
          fromServiceId: serviceId,
          toServiceName: dependency.toServiceName,
          dependencyKind: dependency.dependencyKind,
          sourceFileId: fileId,
          evidence: dependency.evidence
        });
        indexedDependencies += 1;
      }

      indexedChunks += parsed.symbols.length;
    }
  }

  if (vectorPoints.length > 0) {
    await qdrant.upsert(env.QDRANT_COLLECTION, {
      wait: true,
      points: vectorPoints
    });
  }

  await touchRepoIndexed(input.repoId);

  return {
    indexedFiles,
    indexedChunks,
    indexedEvents,
    indexedDependencies
  };
}

function relativeToRepo(repoRoot: string, absPath: string): string {
  return path.relative(repoRoot, absPath).replaceAll('\\', '/');
}

function normalizeChunk(serviceName: string, filePath: string, symbolName: string, symbolType: string, content: string): string {
  return [
    `service=${serviceName}`,
    `file=${filePath}`,
    `symbol=${symbolName}`,
    `kind=${symbolType}`,
    '',
    content
  ].join('\n');
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

function within(targetStart: number, targetEnd: number, parentStart: number, parentEnd: number): boolean {
  return targetStart >= parentStart && targetEnd <= parentEnd;
}