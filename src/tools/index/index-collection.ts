import { Type } from "@sinclair/typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import getDb from "../../utils/db.ts";

import { getOrCreateCollection } from "../../utils/chroma.ts";
import { generateEmbeddings } from "../../utils/embedding.ts";
import { parsePdf, chunkSections } from "../../utils/pdf-parser.ts";

export const indexCollection = defineTool({
  name: "index_collection",
  label: "Index Collection",
  description:
    "为指定库构建/更新索引:解析每篇论文的 PDF、按章节分块、生成向量、存入 Chroma。增量更新——只处理该库中尚未索引的论文。下载新论文后必须调用此工具才能搜索。",
  parameters: Type.Object({
    collectionName: Type.String({ description: "要索引的库名" }),
    rebuild: Type.Optional(
      Type.Boolean({
        description: "true 时清空该库现有索引重新建。默认 false(增量)。",
        default: false,
      }),
    ),
  }),
  execute: async (_id, { collectionName, rebuild = false }, signal, onUpdate) => {
    const db = getDb();
    const collection = db.prepare("SELECT name FROM collections WHERE name = ?").get(collectionName);
    if (!collection) {
      return {
        content: [{ type: "text", text: `❌ 库 "${collectionName}" 不存在。` }],
        details: { error: "not_found" },
      };
    }

    const chromaCol = await getOrCreateCollection(collectionName);

    if (rebuild) {
      const existing = db
        .prepare("SELECT id FROM chunks WHERE collection_name = ?")
        .all(collectionName)
        .map((r: any) => r.id) as string[];
      if (existing.length > 0) {
        await chromaCol.delete({ ids: existing });
        db.prepare("DELETE FROM chunks WHERE collection_name = ?").run(collectionName);
      }
    }

    // 找该库中未索引的论文(增量逻辑:在 chunks 中没有该论文 + 该 collection 的记录)
    const papersToIndex = db
      .prepare(
        `
        SELECT p.id, p.title, p.pdf_path
        FROM papers p
        JOIN collection_papers cp ON p.id = cp.paper_id
        WHERE cp.collection_name = ?
          AND NOT EXISTS (
            SELECT 1 FROM chunks ck
            WHERE ck.paper_id = p.id AND ck.collection_name = ?
          )
        `,
      )
      .all(collectionName, collectionName) as Array<{ id: string; title: string; pdf_path: string }>;

    if (papersToIndex.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `✅ 库 "${collectionName}" 已是最新,没有需要新索引的论文。`,
          },
        ],
        details: { collectionName, indexed: 0, totalChunks: 0 },
      };
    }

    let indexedPapers = 0;
    let totalChunks = 0;
    let failed = 0;
    const errors: Array<{ id: string; error: string }> = [];

    const insertChunkStmt = db.prepare(
      "INSERT INTO chunks (id, paper_id, collection_name, section_title, content, chunk_index) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const updateParsedStmt = db.prepare("UPDATE papers SET parsed_at = ? WHERE id = ?");

    for (let i = 0; i < papersToIndex.length; i++) {
      if (signal?.aborted) {
        break;
      }
      const paper = papersToIndex[i];

      onUpdate?.({
        content: [
          {
            type: "text",
            text: `🔧 索引 ${i + 1}/${papersToIndex.length}: ${paper.title.slice(0, 60)}...`,
          },
        ],
        details: { progress: { current: i + 1, total: papersToIndex.length, paperId: paper.id } },
      });

      try {
        const parsed = await parsePdf(paper.pdf_path, paper.id);
        const chunks = chunkSections(parsed.sections);
        if (chunks.length === 0) {
          failed++;
          errors.push({ id: paper.id, error: "PDF 解析后没有有效内容" });
          continue;
        }

        const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

        const chunkIds: string[] = [];
        const chunkContents: string[] = [];
        const chunkMetadatas: Array<Record<string, string | number>> = [];

        for (let j = 0; j < chunks.length; j++) {
          const chunkId = `${paper.id}::${collectionName}::${j}`;
          chunkIds.push(chunkId);
          chunkContents.push(chunks[j].content);
          chunkMetadatas.push({
            paperId: paper.id,
            paperTitle: paper.title,
            section: chunks[j].sectionTitle,
            chunkIndex: j,
          });
          insertChunkStmt.run(
            chunkId,
            paper.id,
            collectionName,
            chunks[j].sectionTitle,
            chunks[j].content,
            j,
          );
        }

        await chromaCol.add({
          ids: chunkIds,
          embeddings,
          documents: chunkContents,
          metadatas: chunkMetadatas,
        });

        updateParsedStmt.run(new Date().toISOString(), paper.id);
        indexedPapers++;
        totalChunks += chunks.length;
      } catch (err: any) {
        failed++;
        errors.push({ id: paper.id, error: err.message || String(err) });
      }
    }

    const errorText = errors.length > 0 ? `\n\n失败明细:\n${errors.map((e) => `- ${e.id}: ${e.error}`).join("\n")}` : "";

    return {
      content: [
        {
          type: "text",
          text: `📊 索引完成 (库: ${collectionName})
- 成功索引: ${indexedPapers} 篇 / ${papersToIndex.length} 篇
- 新增段落: ${totalChunks} 个
- 失败: ${failed} 篇${errorText}

可以开始用 search_papers 检索这个库了。`,
        },
      ],
      details: {
        collectionName,
        indexedPapers,
        totalChunks,
        failed,
        aborted: signal?.aborted ?? false,
        errors,
      },
    };
  },
});
