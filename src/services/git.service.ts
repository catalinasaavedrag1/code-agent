import fs from 'fs/promises';
import path from 'path';
import simpleGit from 'simple-git';
import { env } from '../config/env.js';
import { sha256 } from '../utils/hash.js';

export async function cloneOrPullRepo(repoUrl: string, branch: string): Promise<string> {
  const repoDir = path.join(env.WORKDIR_BASE, sha256(`${repoUrl}:${branch}`).slice(0, 16));
  await fs.mkdir(env.WORKDIR_BASE, { recursive: true });

  try {
    await fs.access(repoDir);
    const git = simpleGit(repoDir);
    await git.fetch();
    await git.checkout(branch);
    await git.pull('origin', branch);
  } catch {
    const git = simpleGit();
    await git.clone(repoUrl, repoDir, ['--branch', branch, '--single-branch']);
  }

  return repoDir;
}