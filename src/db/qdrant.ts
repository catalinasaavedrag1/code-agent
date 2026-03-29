import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '../config/env.js';

export const qdrant = new QdrantClient({ url: env.QDRANT_URL });

export async function ensureCollection(dimensions: number): Promise<void> {
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some((item) => item.name === env.QDRANT_COLLECTION);

  if (!exists) {
    await qdrant.createCollection(env.QDRANT_COLLECTION, {
      vectors: {
        size: dimensions,
        distance: 'Cosine'
      }
    });

    await qdrant.createPayloadIndex(env.QDRANT_COLLECTION, {
      field_name: 'repoId',
      field_schema: 'keyword'
    });

    await qdrant.createPayloadIndex(env.QDRANT_COLLECTION, {
      field_name: 'serviceName',
      field_schema: 'keyword'
    });

    await qdrant.createPayloadIndex(env.QDRANT_COLLECTION, {
      field_name: 'chunkKind',
      field_schema: 'keyword'
    });
  }
}