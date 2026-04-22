export interface RAGDocument {
  id: string;
  content: string;
  filePath: string;
  extension: string;
  startLine: number;
  endLine: number;
  embedding?: number[];
  metadata?: Record<string, any>;
}

export interface SearchResult extends RAGDocument {
  score: number;
}

export interface RAGOptions {
  indexDir: string;
  chunkSize: number;
  chunkOverlap: number;
  excludePatterns: string[];
}

export interface Embedder {
  embed(text: string): Promise<number[]>;
  batchEmbed(texts: string[]): Promise<number[][]>;
  dimension: number;
}
