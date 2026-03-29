import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
import TypeScript from 'tree-sitter-typescript';
import CSharp from 'tree-sitter-c-sharp';

export function buildParserForFile(filePath: string): { parser: Parser | null; language: string } {
  const lower = filePath.toLowerCase();
  const parser = new Parser();

  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) {
    parser.setLanguage(TypeScript.typescript);
    return { parser, language: 'typescript' };
  }

  if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
    parser.setLanguage(JavaScript);
    return { parser, language: 'javascript' };
  }

  if (lower.endsWith('.cs')) {
    parser.setLanguage(CSharp);
    return { parser, language: 'csharp' };
  }

  return { parser: null, language: detectByExtension(filePath) };
}

function detectByExtension(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';
  if (lower.endsWith('.md')) return 'markdown';
  return 'unknown';
}