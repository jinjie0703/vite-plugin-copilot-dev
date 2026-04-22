export * from './types';
export * from './storage';
export * from './ingestor';
export * from './retriever';
export * from './embedder';

import { RAGStorage } from './storage';
import { RAGIngestor } from './ingestor';
import { RAGRetriever } from './retriever';
import { OpenAIEmbedder } from './embedder';
import { LLMOptions, RAGOptions } from '../../types';
import path from 'path';

export class RAGSystem {
  public storage: RAGStorage;
  public ingestor: RAGIngestor;
  public retriever: RAGRetriever;
  public embedder: OpenAIEmbedder;

  constructor(llmOptions: LLMOptions, ragOptions: RAGOptions) {
    this.embedder = new OpenAIEmbedder(llmOptions);
    this.storage = new RAGStorage(ragOptions.indexDir);
    this.ingestor = new RAGIngestor(this.storage, this.embedder, ragOptions);
    this.retriever = new RAGRetriever(this.storage, this.embedder);
  }

  async init() {
    await this.storage.init(this.embedder.dimension);
  }
}