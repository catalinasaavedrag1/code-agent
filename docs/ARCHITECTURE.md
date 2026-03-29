# Arquitectura lógica

1. La API recibe solicitudes.
2. BullMQ encola trabajos de indexación.
3. El worker clona o actualiza el repositorio.
4. El indexador detecta servicios.
5. El parser semántico extrae símbolos.
6. Las heurísticas extraen endpoints, eventos y dependencias.
7. PostgreSQL guarda metadata.
8. Qdrant guarda vectores.
9. La consulta usa búsqueda vectorial y arma contexto para el LLM.

## Mermaid

```mermaid
flowchart LR
    A[Cliente] --> B[API Express]
    B --> C[BullMQ]
    C --> D[Worker]
    D --> E[Git Clone/Pull]
    D --> F[Tree-sitter + heurísticas]
    F --> G[PostgreSQL]
    F --> H[OpenAI Embeddings]
    H --> I[Qdrant]
    B --> J[/ask]
    J --> I
    J --> K[LLM]
    I --> K
    K --> A
```
