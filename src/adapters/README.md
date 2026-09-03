# adapters

Concrete implementations of the `application` ports, plus the inbound HTTP/web surface.

- `llm/` — OllamaProvider (primary, local), GeminiProvider (secondary, hosted free tier), MockProvider (CI/unit tests only)
- `vectorstore/` — PgVectorStore
- `relational/` — Knex-based repositories
- `ocr/` — TesseractOcrAdapter
- `docgen/` — DocxGeneratorAdapter, PdfGeneratorAdapter (Puppeteer)
- `http/` — Fastify routes/controllers, SSE endpoints
- `web/` — static HTML/CSS/vanilla-JS UI, served by Fastify

Swapping any one of these for an alternative implementation must never require a change in `domain` or `application`.
