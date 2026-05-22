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
    this.model = options.embeddingModel || 'Qwen/Qwen3-Embedding-4B';
    if (this.model.includes('3-large')) this.dimension = 3072;
    if (this.model.includes('ada-002')) this.dimension = 1536;
    if (this.model.toLowerCase().includes('qwen3-embedding')) this.dimension = 2560;
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
        encoding_format: 'float'
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Embedding API error: ${res.statusText} - Details: ${errText}`);
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
      let retries = 3;
      let res: Response | null = null;
      
      while (retries > 0) {
        res = await fetch(`${this.baseURL.replace(/\/$/, '')}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            input: batch,
            model: this.model,
            encoding_format: 'float'
          }),
        });

        if (res.status === 429) {
          retries--;
          const delay = (4 - retries) * 2000; // 2s, 4s, 6s
          console.log(`\x1b[33m⚠️ 触发向量 API 频控 (429 Too Many Requests)，等待 ${delay}ms 后重试...\x1b[0m`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Embedding API error: ${res.statusText} (${res.status}) - Details: ${errText}`);
        }
        break;
      }

      if (!res || !res.ok) {
         throw new Error(`Embedding API error: 经过多次重试依然失败`);
      }

      const data = await res.json();
      results.push(...data.data.map((d: any) => d.embedding));
      
      // 成功后加入一点小小的延迟，防止立刻发下一个请求再次触发频控
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return results;
  }
}
