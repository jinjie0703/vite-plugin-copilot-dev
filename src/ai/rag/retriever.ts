import { RAGStorage } from './storage';
import { Embedder, SearchResult } from './types';
import { logger } from '../../utils/logger';

export class RAGRetriever {
  private storage: RAGStorage;
  private embedder: Embedder;

  constructor(storage: RAGStorage, embedder: Embedder) {
    this.storage = storage;
    this.embedder = embedder;
  }

  async retrieve(query: string, limit: number = 5): Promise<SearchResult[]> {
    try {
      logger.info(`正在执行 RAG 检索: "${query}"`);
      const embedding = await this.embedder.embed(query);
      const results = await this.storage.hybridSearch(query, embedding, limit);
      
      logger.info(`检索到 ${results.length} 条相关上下文`);
      return results;
    } catch (e) {
      logger.error('RAG 检索失败', e);
      return [];
    }
  }

  /**
   * 将检索结果格式化为 LLM 提示词的一部分
   */
  formatResultsForPrompt(results: SearchResult[]): string {
    if (results.length === 0) return '';

    let prompt = '\n--- 相关的代码上下文 ---\n';
    results.forEach((res, index) => {
      prompt += `\n[Context #${index + 1}] 文件: ${res.filePath} (第 ${res.startLine}-${res.endLine} 行)\n`;
      prompt += '```' + res.extension.replace('.', '') + '\n';
      prompt += res.content + '\n';
      prompt += '```\n';
    });
    prompt += '\n------------------------\n';

    return prompt;
  }
}
