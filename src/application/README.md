# application

Use cases, the screening-pipeline orchestrator (finite state machine), agent definitions (Evidence Extractor, Rubric Scorer, Shortlist Drafter), and the ports (`LLMProviderPort`, `EmbeddingProviderPort`, `VectorStorePort`, `RelationalRepositoryPort`, `OcrPort`, `DocumentGeneratorPort`) that `adapters` implement.

Depends only on `domain` and `contracts`. Never imports a concrete adapter — only the port interfaces.
