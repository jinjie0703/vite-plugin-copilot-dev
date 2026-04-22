import { Embedder } from './types';
import { LLMOptions } from '../../types';

export class OpenAIEmbedder implements Embedder {
  private apiKey: string;
  private baseURL: string;
  private model: string;
  public dimension: number = 1536;

  constructor(options: LLMOptions) {
    this.apiKey = options.apiKey || '';
    this.baseURL = options.baseURL || 'https://api.openai.com/v1';
    this.model = options.embeddingModel || 'text-embedding-3-small';
    if (this.model.includes('3-large')) this.dimension = 3072;
    if (this.model.includes('ada-002')) this.dimension = 1536;
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseURL.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: text,
        model: this.model,
      }),
    });

    if (!res.ok) {
      throw new Error(`Embedding API error: ${res.statusText}`);
    }

    const data = await res.json();
    return data.data[0].embedding;
  }

  async batchEmbed(texts: string[]): Promise<number[][]> {
    // 简单的分批处理，避免单次请求太大
    const batchSize = 20;
    const results: number[][] = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const res = await fetch(`${this.baseURL.replace(/\/$/, '')}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          input: batch,
          model: this.model,
        }),
      });

      if (!res.ok) {
        throw new Error(`Embedding API error: ${res.statusText}`);
      }

      const data = await res.json();
      results.push(...data.data.map((d: any) => d.embedding));
    }

    return results;
  }
}
