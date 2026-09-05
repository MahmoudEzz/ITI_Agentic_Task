import { SearchCorpusInputSchema, SearchCorpusOutputSchema } from "../../contracts/tools.js";

export function createSearchCorpusTool({ vectorStore, embeddingProvider }) {
  return async function searchCorpus(rawInput) {
    const { query, topK, documentType } = SearchCorpusInputSchema.parse(rawInput);
    const [embedding] = await embeddingProvider.embed([query]);
    const results = await vectorStore.hybridSearch(query, embedding, { topK, documentType });
    return SearchCorpusOutputSchema.parse({ results });
  };
}
