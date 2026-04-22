import fs from 'fs-extra';
import path from 'path';
import glob from 'fast-glob';
import { RAGDocument, RAGOptions, Embedder } from './types';
import { RAGStorage } from './storage';
import { logger } from '../../utils/logger';

export class RAGIngestor {
  private storage: RAGStorage;
  private embedder: Embedder;
  private options: RAGOptions;

  constructor(storage: RAGStorage, embedder: Embedder, options: RAGOptions) {
    this.storage = storage;
    this.embedder = embedder;
    this.options = options;
  }

  async ingestProject(root: string) {
    logger.info(`正在扫描项目文件进行索引: ${root}`);
    
    const files = await glob(['**/*.{ts,tsx,js,jsx,vue,md}'], {
      cwd: root,
      ignore: ['**/node_modules/**', '**/dist/**', ...this.options.excludePatterns],
      absolute: true,
    });

    logger.info(`找到 ${files.length} 个相关文件，准备进行切片和向量化...`);

    for (const filePath of files) {
      await this.ingestFile(filePath);
    }

    await this.storage.persist();
    logger.success('项目 RAG 索引构建完成');
  }

  async ingestFile(filePath: string) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const chunks = this.chunkText(content, filePath);
      
      const docs: RAGDocument[] = [];
      
      // 批量获取 embedding 提高效率
      const embeddings = await this.embedder.batchEmbed(chunks.map(c => c.content));

      for (let i = 0; i < chunks.length; i++) {
        docs.push({
          id: `${filePath}#${i}`,
          content: chunks[i].content,
          filePath,
          extension: path.extname(filePath),
          startLine: chunks[i].startLine,
          endLine: chunks[i].endLine,
          embedding: embeddings[i],
        });
      }

      await this.storage.addDocuments(docs);
    } catch (e) {
      logger.error(`索引文件失败: ${filePath}`, e);
    }
  }

  private chunkText(text: string, filePath: string): { content: string; startLine: number; endLine: number }[] {
    const lines = text.split('\n');
    const chunks: { content: string; startLine: number; endLine: number }[] = [];
    
    let currentChunkLines: string[] = [];
    let startLine = 1;

    for (let i = 0; i < lines.length; i++) {
      currentChunkLines.push(lines[i]);
      
      // 达到 chunk 大小或者文件末尾
      if (currentChunkLines.join('\n').length >= this.options.chunkSize || i === lines.length - 1) {
        chunks.push({
          content: currentChunkLines.join('\n'),
          startLine,
          endLine: i + 1,
        });

        // 处理 overlap
        const overlapCount = Math.floor(this.options.chunkOverlap / 20); // 粗略估算行数
        const nextStart = Math.max(0, currentChunkLines.length - overlapCount);
        currentChunkLines = currentChunkLines.slice(nextStart);
        startLine = i + 1 - currentChunkLines.length + 1;
      }
    }

    return chunks;
  }
}
