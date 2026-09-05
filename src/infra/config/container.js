import { createContainer, asValue, asFunction, InjectionMode } from "awilix";
import knexFactory from "knex";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./env.js";
import { loadPromptTemplate } from "../../application/prompts/loadPromptTemplate.js";
import { createAnswerQuestionUseCase, createAnswerQuestionStreamUseCase } from "../../application/use-cases/answerQuestion.js";
import { KnexDocumentRepository } from "../../adapters/relational/KnexDocumentRepository.js";
import { KnexCandidateRepository } from "../../adapters/relational/KnexCandidateRepository.js";
import { KnexRunRepository } from "../../adapters/relational/KnexRunRepository.js";
import { KnexApprovalRepository } from "../../adapters/relational/KnexApprovalRepository.js";
import { KnexScoreRepository } from "../../adapters/relational/KnexScoreRepository.js";
import { KnexShortlistRepository } from "../../adapters/relational/KnexShortlistRepository.js";
import { KnexBiasAuditLogRepository } from "../../adapters/relational/KnexBiasAuditLogRepository.js";
import { KnexCompetencyRepository } from "../../adapters/relational/KnexCompetencyRepository.js";
import { KnexRubricRepository } from "../../adapters/relational/KnexRubricRepository.js";
import { KnexReportAssetRepository } from "../../adapters/relational/KnexReportAssetRepository.js";
import { KnexUserRepository } from "../../adapters/relational/KnexUserRepository.js";
import { KnexTraceEventRepository } from "../../adapters/relational/KnexTraceEventRepository.js";
import { BcryptPasswordHasher } from "../../adapters/auth/BcryptPasswordHasher.js";
import { JwtTokenPort } from "../../adapters/auth/JwtTokenPort.js";
import { ReportDocumentGenerator } from "../../adapters/docgen/ReportDocumentGenerator.js";
import { PgVectorStore } from "../../adapters/vectorstore/PgVectorStore.js";
import { createExtractor } from "../../adapters/extraction/createExtractor.js";
import { TesseractOcrAdapter } from "../../adapters/ocr/TesseractOcrAdapter.js";
import { OllamaEmbeddingProvider } from "../../adapters/llm/OllamaEmbeddingProvider.js";
import { OllamaProvider } from "../../adapters/llm/OllamaProvider.js";
import { GeminiProvider } from "../../adapters/llm/GeminiProvider.js";
import { FallbackLLMProvider } from "../../adapters/llm/FallbackLLMProvider.js";
import { createIngestDocumentUseCase } from "../../application/ingestion/ingestDocument.js";
import { createSearchCorpusTool } from "../../application/tools/searchCorpus.js";
import { createGetCandidateChunksTool } from "../../application/tools/getCandidateChunks.js";
import { createFinalizeShortlistTool } from "../../application/tools/finalizeShortlist.js";
import { createGenerateReportTool } from "../../application/tools/generateReport.js";
import { createBuildReportContentUseCase } from "../../application/reporting/buildReportContent.js";
import { createScopedToolDispatcher } from "../../application/tools/dispatchTool.js";
import { createEvidenceExtractorAgent, EVIDENCE_EXTRACTOR_ALLOWED_TOOLS } from "../../application/agents/evidenceExtractor.js";
import { createRubricScorerAgent } from "../../application/agents/rubricScorer.js";
import { createShortlistDrafterAgent } from "../../application/agents/shortlistDrafter.js";
import { createExtractRedactScoreWorkflow } from "../../application/workflows/extractRedactScore.js";
import { createRunScreeningWorkflowUseCase } from "../../application/workflows/runScreeningWorkflow.js";
import { createApplyApprovalDecisionUseCase } from "../../application/workflows/applyApprovalDecision.js";
import { createCompleteRunUseCase } from "../../application/workflows/completeRun.js";
import { createLoginUseCase } from "../../application/auth/login.js";
import { createCreateUserAccountUseCase } from "../../application/auth/createUserAccount.js";
import { createTracingLLMProvider } from "../../application/tracing/createTracingLLMProvider.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..", "..", "..");

// Maps a config-declared provider name (LLM_PROVIDER_CHAIN, e.g. "ollama,gemini")
// to the concrete adapter it names — the "swap provider = config change"
// acceptance test (ADR-0005) hinges on this being the only place that mapping exists.
const LLM_PROVIDER_FACTORIES = {
  ollama: (config) => new OllamaProvider({ host: config.ollama.host, model: config.ollama.model }),
  gemini: (config) => new GeminiProvider({ apiKey: config.gemini.apiKey, model: config.gemini.model }),
};

// Composition root: the only place in the codebase allowed to know about
// every concrete adapter at once (see CLAUDE.md). `overrides` lets tests
// inject a test config/knex instance without needing a second wiring path.
export function buildContainer(overrides = {}) {
  const container = createContainer({ injectionMode: InjectionMode.PROXY });

  const config = overrides.config ?? loadConfig();
  const knex = overrides.knex ?? knexFactory({ client: "pg", connection: config.databaseUrl });

  container.register({
    config: asValue(config),
    knex: asValue(knex),
    documentRepository: asFunction(({ knex }) => new KnexDocumentRepository(knex)).singleton(),
    candidateRepository: asFunction(({ knex }) => new KnexCandidateRepository(knex)).singleton(),
    runRepository: asFunction(({ knex }) => new KnexRunRepository(knex)).singleton(),
    approvalRepository: asFunction(({ knex }) => new KnexApprovalRepository(knex)).singleton(),
    scoreRepository: asFunction(({ knex }) => new KnexScoreRepository(knex)).singleton(),
    shortlistRepository: asFunction(({ knex }) => new KnexShortlistRepository(knex)).singleton(),
    biasAuditLogRepository: asFunction(({ knex }) => new KnexBiasAuditLogRepository(knex)).singleton(),
    competencyRepository: asFunction(({ knex }) => new KnexCompetencyRepository(knex)).singleton(),
    rubricRepository: asFunction(({ knex }) => new KnexRubricRepository(knex)).singleton(),
    reportAssetRepository: asFunction(({ knex }) => new KnexReportAssetRepository(knex)).singleton(),
    userRepository: asFunction(({ knex }) => new KnexUserRepository(knex)).singleton(),
    traceEventRepository: asFunction(({ knex }) => new KnexTraceEventRepository(knex)).singleton(),
    passwordHasher: asFunction(({ config }) => new BcryptPasswordHasher({ saltRounds: config.bcryptSaltRounds })).singleton(),
    tokenPort: asFunction(({ config }) => new JwtTokenPort({ secret: config.jwtSecret, expiresIn: config.jwtExpiresIn })).singleton(),
    vectorStore: asFunction(({ knex }) => new PgVectorStore(knex)).singleton(),
    extractorFactory: asValue((sourceFormat) => createExtractor(sourceFormat)),
    ocrPort: asFunction(() => new TesseractOcrAdapter()).singleton(),
    embeddingProvider: asFunction(
      ({ config }) => new OllamaEmbeddingProvider({ host: config.ollama.host, model: config.ollama.embedModel }),
    ).singleton(),
    // The raw fallback chain (ADR-0005), undecorated — kept as its own
    // resolvable only so `llmProvider` below can wrap it; nothing else
    // should ever resolve this directly.
    rawLlmProvider: asFunction(({ config }) => {
      const providers = config.llmProviderChain.map((name) => {
        const factory = LLM_PROVIDER_FACTORIES[name];
        if (!factory) throw new Error(`Unknown LLM provider "${name}" in LLM_PROVIDER_CHAIN`);
        return { name, provider: factory(config) };
      });
      return new FallbackLLMProvider(providers);
    }).singleton(),
    // Every consumer resolves THIS, not rawLlmProvider — FR-9's token/cost
    // accounting is a decorator around the real chain (same pattern
    // FallbackLLMProvider itself uses), not a change to any provider
    // adapter or to any agent's own code.
    llmProvider: asFunction(({ rawLlmProvider, traceEventRepository }) =>
      createTracingLLMProvider({ llmProvider: rawLlmProvider, traceEventRepository }),
    ).singleton(),
    ingestDocument: asFunction(({ documentRepository, vectorStore, embeddingProvider, extractorFactory, ocrPort, config }) =>
      createIngestDocumentUseCase({ documentRepository, vectorStore, embeddingProvider, extractorFactory, ocrPort, maxUploadSizeBytes: config.maxUploadSizeBytes }),
    ).singleton(),
    answerQuestion: asFunction(({ embeddingProvider, vectorStore, llmProvider, candidateRepository, config }) => {
      const { system, template } = loadPromptTemplate(path.join(repoRoot, "prompts", "answer-grounded.md"));
      return createAnswerQuestionUseCase({
        embeddingProvider,
        vectorStore,
        llmProvider,
        candidateRepository,
        promptTemplate: template,
        systemPrompt: system,
        refusalThreshold: config.retrieval.refusalThreshold,
        defaultTopK: config.retrieval.topK,
      });
    }).singleton(),
    answerQuestionStream: asFunction(({ embeddingProvider, vectorStore, llmProvider, candidateRepository, config }) => {
      const { system, template } = loadPromptTemplate(path.join(repoRoot, "prompts", "answer-grounded.md"));
      return createAnswerQuestionStreamUseCase({
        embeddingProvider,
        vectorStore,
        llmProvider,
        candidateRepository,
        promptTemplate: template,
        systemPrompt: system,
        refusalThreshold: config.retrieval.refusalThreshold,
        defaultTopK: config.retrieval.topK,
      });
    }).singleton(),
    // A plain name->implementation map, not yet gated by any agent's
    // allow-list — src/application/tools/dispatchTool.js's scoped
    // dispatcher (created per-agent once agents exist, Phase 4 PR C) is
    // what actually enforces which agent may call which of these.
    finalizeShortlist: asFunction(({ approvalRepository, shortlistRepository }) =>
      createFinalizeShortlistTool({ approvalRepository, shortlistRepository }),
    ).singleton(),
    buildReportContent: asFunction(({ runRepository, shortlistRepository, scoreRepository, competencyRepository, rubricRepository, vectorStore }) =>
      createBuildReportContentUseCase({ runRepository, shortlistRepository, scoreRepository, competencyRepository, rubricRepository, vectorStore }),
    ).singleton(),
    documentGenerator: asFunction(() => new ReportDocumentGenerator()).singleton(),
    generateReport: asFunction(({ approvalRepository, reportAssetRepository, buildReportContent, documentGenerator }) =>
      createGenerateReportTool({ approvalRepository, reportAssetRepository, buildReportContent, documentGenerator }),
    ).singleton(),
    toolImplementations: asFunction(({ vectorStore, embeddingProvider, candidateRepository, finalizeShortlist, generateReport, config }) => ({
      search_corpus: createSearchCorpusTool({ vectorStore, embeddingProvider }),
      get_candidate_chunks: createGetCandidateChunksTool({ vectorStore, candidateRepository, ocrThresholds: config.ocr }),
      finalize_shortlist: finalizeShortlist,
      generate_report: generateReport,
    })).singleton(),
    evidenceExtractor: asFunction(({ llmProvider, competencyRepository, toolImplementations, traceEventRepository }) => {
      const { system, template } = loadPromptTemplate(path.join(repoRoot, "prompts", "evidence-extractor.md"));
      const callTool = createScopedToolDispatcher({
        agentName: "evidence_extractor",
        allowedTools: EVIDENCE_EXTRACTOR_ALLOWED_TOOLS,
        implementations: toolImplementations,
        traceEventRepository,
      });
      return createEvidenceExtractorAgent({ llmProvider, competencyRepository, callTool, promptTemplate: template, systemPrompt: system });
    }).singleton(),
    rubricScorer: asFunction(({ llmProvider }) => {
      const { system, template } = loadPromptTemplate(path.join(repoRoot, "prompts", "rubric-scorer.md"));
      return createRubricScorerAgent({ llmProvider, promptTemplate: template, systemPrompt: system });
    }).singleton(),
    shortlistDrafter: asFunction(({ llmProvider }) => {
      const { system, template } = loadPromptTemplate(path.join(repoRoot, "prompts", "shortlist-drafter.md"));
      return createShortlistDrafterAgent({ llmProvider, promptTemplate: template, systemPrompt: system });
    }).singleton(),
    extractRedactScore: asFunction(({ evidenceExtractor, rubricScorer, rubricRepository, competencyRepository }) =>
      createExtractRedactScoreWorkflow({ evidenceExtractor, rubricScorer, rubricRepository, competencyRepository }),
    ).singleton(),
    runScreeningWorkflow: asFunction(
      ({ runRepository, scoreRepository, shortlistRepository, biasAuditLogRepository, extractRedactScore, shortlistDrafter, rubricRepository, traceEventRepository }) =>
        createRunScreeningWorkflowUseCase({
          runRepository,
          scoreRepository,
          shortlistRepository,
          biasAuditLogRepository,
          extractRedactScore,
          shortlistDrafter,
          rubricRepository,
          traceEventRepository,
        }),
    ).singleton(),
    applyApprovalDecision: asFunction(({ runRepository, approvalRepository, shortlistRepository, finalizeShortlist }) =>
      createApplyApprovalDecisionUseCase({ runRepository, approvalRepository, shortlistRepository, finalizeShortlist }),
    ).singleton(),
    completeRun: asFunction(({ runRepository, approvalRepository, generateReport }) =>
      createCompleteRunUseCase({ runRepository, approvalRepository, generateReport }),
    ).singleton(),
    login: asFunction(({ userRepository, passwordHasher, tokenPort }) =>
      createLoginUseCase({ userRepository, passwordHasher, tokenPort }),
    ).singleton(),
    createUserAccount: asFunction(({ userRepository, passwordHasher }) =>
      createCreateUserAccountUseCase({ userRepository, passwordHasher }),
    ).singleton(),
  });

  return container;
}

export async function destroyContainer(container) {
  await container.resolve("knex").destroy();
  await container.dispose();
}
