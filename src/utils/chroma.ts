/**
 * 轻量级向量存储(替代 ChromaDB)
 * 使用 JSON 文件 + 内存索引,不需要外部服务
 */
import { join } from "path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { cosineSimilarity } from "./embedding.ts";

const INDEX_DIR = join(process.cwd(), "index");
mkdirSync(INDEX_DIR, { recursive: true });

interface VectorDocument {
  id: string;
  embedding: number[];
  document: string;
  metadata: Record<string, any>;
}

interface Collection {
  name: string;
  documents: VectorDocument[];
}

// 内存缓存
const collections = new Map<string, Collection>();

function getCollectionPath(name: string): string {
  return join(INDEX_DIR, `vector_${name}.json`);
}

function loadCollection(name: string): Collection {
  if (collections.has(name)) {
    return collections.get(name)!;
  }

  const path = getCollectionPath(name);
  if (existsSync(path)) {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    collections.set(name, data);
    return data;
  }

  const newCollection: Collection = { name, documents: [] };
  collections.set(name, newCollection);
  return newCollection;
}

function saveCollection(name: string): void {
  const collection = collections.get(name);
  if (!collection) return;
  writeFileSync(getCollectionPath(name), JSON.stringify(collection, null, 2));
}

export function chromaCollectionName(collectionName: string): string {
  return `papers_${collectionName}`;
}

export async function getOrCreateCollection(collectionName: string): Promise<any> {
  const name = chromaCollectionName(collectionName);
  loadCollection(name);
  return {
    name,
    add: async ({ ids, embeddings, documents, metadatas }: any) => {
      const collection = loadCollection(name);
      for (let i = 0; i < ids.length; i++) {
        collection.documents.push({
          id: ids[i],
          embedding: embeddings[i],
          document: documents[i],
          metadata: metadatas[i],
        });
      }
      saveCollection(name);
    },
    query: async ({ queryEmbeddings, nResults }: any) => {
      const collection = loadCollection(name);
      const queryEmbedding = queryEmbeddings[0];

      // 计算所有文档的相似度
      const scored = collection.documents.map((doc) => ({
        ...doc,
        distance: 1 - cosineSimilarity(queryEmbedding, doc.embedding), // 转换为距离(越小越相似)
      }));

      // 排序并取 Top N
      scored.sort((a, b) => a.distance - b.distance);
      const top = scored.slice(0, nResults);

      return {
        ids: [top.map((d) => d.id)],
        documents: [top.map((d) => d.document)],
        metadatas: [top.map((d) => d.metadata)],
        distances: [top.map((d) => d.distance)],
      };
    },
    delete: async ({ ids }: any) => {
      const collection = loadCollection(name);
      collection.documents = collection.documents.filter((d) => !ids.includes(d.id));
      saveCollection(name);
    },
  };
}

export async function getCollectionIfExists(collectionName: string): Promise<any | null> {
  const name = chromaCollectionName(collectionName);
  const path = getCollectionPath(name);
  if (!existsSync(path)) return null;
  return getOrCreateCollection(collectionName);
}

export async function deleteChromaCollection(collectionName: string): Promise<void> {
  const name = chromaCollectionName(collectionName);
  const path = getCollectionPath(name);
  if (existsSync(path)) {
    const fs = await import("fs/promises");
    await fs.unlink(path);
  }
  collections.delete(name);
}
