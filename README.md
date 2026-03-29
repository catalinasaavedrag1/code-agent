# Codebase Agent V2

Proyecto backend para indexar repositorios, generar embeddings, detectar servicios/eventos/dependencias y responder preguntas sobre una codebase.

## Qué construye

- API Express
- worker BullMQ
- metadata en PostgreSQL
- vectores en Qdrant
- parser semántico con Tree-sitter
- chunking por símbolos
- heurísticas para:
  - endpoints HTTP
  - publishers de eventos
  - consumers de eventos
  - dependencias entre servicios
- búsqueda semántica + respuesta RAG
- reindex incremental por hash
- endpoint de grafo de arquitectura

## Endpoints

- `GET /health`
- `POST /index/repo`
- `POST /index/service`
- `POST /reindex`
- `POST /ask`
- `GET /repos/:repoId/services`
- `GET /repos/:repoId/graph`
- `GET /jobs/:jobId`

## Flujo

1. Se registra el repo y se encola un job.
2. El worker clona o actualiza el repo.
3. Se descubren servicios.
4. Se parsean archivos relevantes.
5. Se generan símbolos, chunks, endpoints, eventos y dependencias.
6. Se generan embeddings.
7. Se guarda metadata en PostgreSQL y vectores en Qdrant.
8. `POST /ask` busca los chunks más relevantes y arma una respuesta con citas.

## Levantar local

```bash
cp .env.example .env
npm install
npm run db:up
psql postgres://postgres:postgres@localhost:5432/code_agent -f sql/schema.sql
npm run api:dev
npm run worker:dev
```

## Ejemplo de indexación

```bash
curl -X POST http://localhost:3000/index/repo \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/tu-org/tu-repo.git",
    "branch": "main"
  }'
```

## Ejemplo de consulta

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{
    "repoId": "UUID_DEL_REPO",
    "question": "¿Qué servicio publica eventos de despacho?"
  }'
```

## Qué hace cada carpeta

- `src/api`: rutas HTTP
- `src/indexer`: pipeline de indexación
- `src/parser`: parsing semántico y heurísticas de extracción
- `src/services`: capa de negocio
- `src/db`: conexiones a Postgres y Qdrant
- `src/queue`: cola BullMQ
- `src/utils`: utilidades
- `sql`: esquema relacional

## Límites reales

Esto ya es una base seria, pero no es una plataforma enterprise terminada. Todavía faltaría:

- auth y multi-tenant real
- webhooks Git
- reranking
- soporte más profundo para Java, Python y Go
- AST específico por framework
- observabilidad y tracing
- UI web para explorar el grafo

## Cómo se piensa

Este sistema no “entiende” mágicamente el repo completo. Primero lo convierte en:

- servicios
- archivos
- símbolos
- chunks
- eventos
- dependencias

Después usa eso como contexto para responder.
