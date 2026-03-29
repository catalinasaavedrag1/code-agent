import fs from 'fs/promises';
import path from 'path';
import { shouldIgnoreDir, shouldProcessFile } from './ignore.js';

export async function walkFiles(rootDir: string): Promise<string[]> {
  const output: string[] = [];
  await walk(rootDir, output);
  return output;
}

async function walk(current: string, output: string[]): Promise<void> {
  const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const abs = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (shouldIgnoreDir(entry.name)) continue;
      await walk(abs, output);
      continue;
    }
    if (shouldProcessFile(abs)) output.push(abs);
  }
}