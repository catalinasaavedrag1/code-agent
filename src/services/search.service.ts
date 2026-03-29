import { Filter } from '@qdrant/js-client-rest/dist/types/qdrant.js';
import { env } from '../config/env.js';
import { qdrant } from '../db/qdrant.js';
import { embedTexts, openai } from '../llm/openai.js';
import { SearchHit } from '../types/index.js';

export async function askRepo(repoId: string, question: string): Promise<{
  answer: string;
  hits: SearchHit[];
}> {
  const [vector] = await embedTexts([question]);
  const filter: Filter = {
    must: [{ key: 'repoId', match: { value: repoId } }]
  };

  const result = await qdrant.search(env.QDRANT_COLLECTION, {
    vector,
    limit: env.TOP_K,
    filter,
    with_payload: true
  });

  const hits: SearchHit[] = result.map((item) => ({
    chunkId: String(item.id),
    score: item.score,
    filePath: String(item.payload?.filePath ?? ''),
    serviceName: item.payload?.serviceName ? String(item.payload.serviceName) : null,
    symbolName: item.payload?.symbolName ? String(item.payload.symbolName) : null,
    startLine: Number(item.payload?.startLine ?? 0),
    endLine: Number(item.payload?.endLine ?? 0),
    chunkKind: String(item.payload?.chunkKind ?? 'unknown'),
    content: String(item.payload?.content ?? '')
  }));

  const context = hits
    .map((item, index) => {
      return `[#${index + 1}] service=${item.serviceName ?? 'root'} file=${item.filePath}:${item.startLine}-${item.endLine} kind=${item.chunkKind}\n${item.content}`;
    })
    .join('\n\n');

  const completion = await openai.chat.completions.create({
    model: env.CHAT_MODEL,
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content: [
          'Responde preguntas sobre una codebase.',
          'Usa solo el contexto entregado.',
          'Si no hay suficiente evidencia, dilo claramente.',
          'Cita archivo y líneas cuando afirmes algo.'
        ].join(' ')
      },
      {
        role: 'user',
        content: `Pregunta: ${question}\n\nContexto:\n${context}`
      }
    ]
  });

  return {
    answer: completion.choices[0]?.message?.content ?? 'Sin respuesta',
    hits
  };
}