const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  'bin',
  'obj'
]);

const ALLOWED_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.cs',
  '.json', '.yaml', '.yml',
  '.md'
]);

export function shouldIgnoreDir(name: string): boolean {
  return IGNORED_DIRS.has(name);
}

export function shouldProcessFile(filePath: string): boolean {
  const dot = filePath.lastIndexOf('.');
  if (dot === -1) return false;
  return ALLOWED_EXTENSIONS.has(filePath.slice(dot).toLowerCase());
}