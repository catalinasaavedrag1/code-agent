import fs from 'fs/promises';
import Parser from 'tree-sitter';
import { ParsedFileResult, ParsedSymbol } from '../types/index.js';
import { detectDependencies, detectEndpoints, detectEvents } from './heuristics.js';
import { buildParserForFile } from './languages.js';

const JS_SYMBOL_TYPES = new Set([
  'function_declaration',
  'method_definition',
  'class_declaration',
  'lexical_declaration',
  'generator_function_declaration'
]);

const CS_SYMBOL_TYPES = new Set([
  'class_declaration',
  'method_declaration',
  'interface_declaration',
  'record_declaration'
]);

export async function parseSemanticFile(filePath: string, knownServices: string[]): Promise<ParsedFileResult> {
  const fileContent = await fs.readFile(filePath, 'utf8');
  const { parser, language } = buildParserForFile(filePath);
  let symbols: ParsedSymbol[] = [];

  if (parser) {
    const tree = parser.parse(fileContent);
    symbols = extractSymbols(tree.rootNode, fileContent, language);
  }

  if (symbols.length === 0) {
    symbols = fallbackChunk(fileContent);
  }

  return {
    language,
    fileContent,
    symbols,
    endpoints: detectEndpoints(fileContent),
    events: detectEvents(fileContent),
    dependencies: detectDependencies(fileContent, knownServices)
  };
}

function extractSymbols(root: Parser.SyntaxNode, source: string, language: string): ParsedSymbol[] {
  const symbols: ParsedSymbol[] = [];
  visit(root, source, language, symbols);
  return symbols;
}

function visit(node: Parser.SyntaxNode, source: string, language: string, symbols: ParsedSymbol[]): void {
  const eligible = language === 'csharp' ? CS_SYMBOL_TYPES.has(node.type) : JS_SYMBOL_TYPES.has(node.type);

  if (eligible) {
    const content = source.slice(node.startIndex, node.endIndex);
    const nameNode = node.childForFieldName('name');
    const symbolType = mapSymbolType(node.type, language);
    symbols.push({
      name: nameNode?.text ?? `${symbolType}_${node.startPosition.row + 1}`,
      symbolType,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      signature: firstLine(content),
      content
    });
  }

  for (const child of node.namedChildren) {
    visit(child, source, language, symbols);
  }
}

function mapSymbolType(nodeType: string, language: string): ParsedSymbol['symbolType'] {
  if (nodeType.includes('class')) return 'class';
  if (nodeType.includes('method')) return 'method';
  if (nodeType.includes('interface')) return 'dto';
  if (language === 'csharp' && nodeType.includes('record')) return 'dto';
  if (nodeType.includes('function')) return 'function';
  return 'unknown';
}

function firstLine(content: string): string {
  return content.split('\n')[0]?.trim().slice(0, 300) ?? '';
}

function fallbackChunk(fileContent: string): ParsedSymbol[] {
  const lines = fileContent.split('\n');
  const chunks: ParsedSymbol[] = [];
  const size = 80;

  for (let i = 0; i < lines.length; i += size) {
    const chunk = lines.slice(i, i + size).join('\n');
    chunks.push({
      name: `chunk_${Math.floor(i / size) + 1}`,
      symbolType: 'unknown',
      startLine: i + 1,
      endLine: Math.min(i + size, lines.length),
      signature: chunk.split('\n')[0]?.trim().slice(0, 150),
      content: chunk
    });
  }

  return chunks;
}