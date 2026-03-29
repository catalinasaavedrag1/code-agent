# Contratos de API

## POST /index/repo

Request:
```json
{
  "repoUrl": "https://github.com/tu-org/tu-repo.git",
  "branch": "main"
}
```

Response:
```json
{
  "repoId": "uuid",
  "jobId": "bull-job-id",
  "trackingId": "uuid",
  "status": "queued"
}
```

## POST /ask

Request:
```json
{
  "repoId": "uuid",
  "question": "¿Dónde se descuenta stock?"
}
```

Response:
```json
{
  "answer": "...",
  "hits": [
    {
      "chunkId": "uuid",
      "score": 0.91,
      "filePath": "inventory/src/stock.service.ts",
      "serviceName": "inventory",
      "symbolName": "reserveStock",
      "startLine": 10,
      "endLine": 55,
      "chunkKind": "function",
      "content": "..."
    }
  ]
}
```

## GET /repos/:repoId/graph

Response:
```json
{
  "repoId": "uuid",
  "nodes": [
    { "id": "svc-1", "label": "oms", "type": "service" }
  ],
  "edges": [
    { "from": "svc-1", "to": "inventory", "type": "http", "evidence": "axios.post(...)" }
  ]
}
```
