import { create, AnyOrama, insert, search, save, load } from '@orama/orama';
import { RAGDocument, SearchResult } from './types';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../utils/logger';

export class RAGStorage {
  private db: AnyOrama | null = null;
  private indexPath: string;

  constructor(indexDir: string) {
    this.indexPath = path.join(indexDir, 'orama-index.json');
  }

  async init(embeddingDimension: number = 1536) {
    // 首先创建索引实例
    this.db = await create({
      schema: {
        content: 'string',
        filePath: 'string',
        extension: 'string',
        embedding: `vector[${embeddingDimension}]` as any,
        startLine: 'number',
        endLine: 'number',
      },
    });

    if (await fs.pathExists(this.indexPath)) {
      try {
        const data = await fs.readFile(this.indexPath, 'utf-8');
        // Orama v3 中 load 是原地更新，第一个参数是 db 实例
        await load(this.db, JSON.parse(data));
        logger.info('成功从本地加载 RAG 索引');
        return;
      } catch (e) {
        logger.warn('加载 RAG 索引失败，将使用全新的索引...', e);
      }
    }

    logger.info('已初始化全新的 RAG 索引');
  }

  async addDocuments(docs: RAGDocument[]) {
    if (!this.db) throw new Error('RAG Storage not initialized');
    
    // Orama insert works with individual docs or batches
    for (const doc of docs) {
      await insert(this.db, {
        content: doc.content,
        filePath: doc.filePath,
        extension: doc.extension,
        embedding: doc.embedding,
        startLine: doc.startLine,
        endLine: doc.endLine,
      });
    }
  }

  async hybridSearch(query: string, embedding: number[], limit: number = 5): Promise<SearchResult[]> {
    if (!this.db) throw new Error('RAG Storage not initialized');

    const results = await search(this.db, {
      term: query,
      mode: 'hybrid',
      vector: {
        value: embedding,
        property: 'embedding',
      },
      similarity: 0.7,
      limit,
    });

    return results.hits.map((hit) => ({
      id: hit.id,
      score: hit.score,
      ...(hit.document as any),
    }));
  }

  async persist() {
    if (!this.db) return;
    const data = await save(this.db);
    await fs.ensureDir(path.dirname(this.indexPath));
    await fs.writeFile(this.indexPath, JSON.stringify(data), 'utf-8');
    logger.info('RAG 索引已保存到本地');
  }
}
