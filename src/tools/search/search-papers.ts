import { Type } from "@sinclair/typebox";
import { defineTool } from "../define-tool.ts";
import getDb from "../../utils/db.ts";

import { getCollectionIfExists } from "../../utils/chroma.ts";
import { generateEmbedding } from "../../utils/embedding.ts";

export const searchPapers = defineTool({
  name: "search_papers",
  label: "Search Papers",
  description:
    "在论文库中检索相关段落。如果指定 collectionName,只搜该库;不指定则搜所有库,返回全局 Top K 结果。结果包含来源论文、章节、所在库和相关性。",
  parameters: Type.Object({
    query: Type.String({ description: "检索问题或关键词" }),
    collectionName: Type.Optional(
      Type.String({
        description: "指定要搜的库,不填则在所有库中搜索",
      }),
    ),
    topK: Type.Optional(Type.Number({ description: "返回的段落数量,默认 5", default: 5 })),
  }),
  execute: async (_id, { query, collectionName, topK = 5 }) => {
    const db = getDb();

    let targetCollections: string[];
    if (collectionName) {
      const col = db.prepare("SELECT name FROM collections WHERE name = ?").get(collectionName);
      if (!col) {
        return {
          content: [{ type: "text", text: `❌ 库 "${collectionName}" 不存在。` }],
          details: { error: "not_found" },
        };
      }
      targetCollections = [collectionName];
    } else {
      const all = db.prepare("SELECT name FROM collections").all() as Array<{ name: string }>;
      if (all.length === 0) {
        return {
          content: [{ type: "text", text: `📭 没有任何库可供检索。` }],
          details: { results: [], searchedCollections: [] },
        };
      }
      targetCollections = all.map((c) => c.name);
    }

    const queryEmbedding = await generateEmbedding(query);

    interface Hit {
      chunkId: string;
      content: string;
      paperId: string;
      paperTitle: string;
      section: string;
      collectionName: string;
      distance: number;
    }

    const allHits: Hit[] = [];

    for (const colName of targetCollections) {
      const chromaCol = await getCollectionIfExists(colName);
      if (!chromaCol) continue;

      try {
        const result = await chromaCol.query({
          queryEmbeddings: [queryEmbedding],
          nResults: topK,
        });

        const ids = result.ids[0] || [];
        const docs = result.documents[0] || [];
        const metas = result.metadatas[0] || [];
        const dists = result.distances?.[0] || [];

        for (let i = 0; i < ids.length; i++) {
          const meta = metas[i] as any;
          allHits.push({
            chunkId: ids[i],
            content: docs[i] || "",
            paperId: meta?.paperId ?? "",
            paperTitle: meta?.paperTitle ?? "",
            section: meta?.section ?? "",
            collectionName: colName,
            distance: dists[i] ?? 1,
          });
        }
      } catch {
        // collection 可能为空,跳过
      }
    }

    if (allHits.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `🔍 在 ${targetCollections.join(", ")} 中未找到相关内容。可能这些库还没建索引,或者主题不匹配。`,
          },
        ],
        details: { results: [], searchedCollections: targetCollections },
      };
    }

    // distance 越小越相关,全局排序取 Top K
    allHits.sort((a, b) => a.distance - b.distance);
    const top = allHits.slice(0, topK);

    const text = top
      .map(
        (r, i) =>
          `### [${i + 1}] ${r.paperTitle}\n来源库: \`${r.collectionName}\` | 章节: ${r.section} | 论文: \`${r.paperId}\`\n\n${r.content}`,
      )
      .join("\n\n---\n\n");

    return {
      content: [
        {
          type: "text",
          text: `🔍 查询: "${query}"\n搜索范围: ${targetCollections.join(", ")}\n命中 ${allHits.length} 个段落,Top ${top.length}:\n\n${text}`,
        },
      ],
      details: { results: top, searchedCollections: targetCollections, totalHits: allHits.length },
    };
  },
});
