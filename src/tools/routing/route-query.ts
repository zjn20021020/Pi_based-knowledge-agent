import { Type } from "@sinclair/typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import getDb from "../../utils/db.ts";

import { generateEmbedding, cosineSimilarity } from "../../utils/embedding.ts";

export const routeQuery = defineTool({
  name: "route_query",
  label: "Route Query",
  description:
    "根据用户的检索问题,判断应该在哪些库中搜索。返回每个库的相关性评分。当用户问检索问题但没指定库时,先调用这个工具。",
  parameters: Type.Object({
    query: Type.String({ description: "用户的检索问题" }),
    threshold: Type.Optional(
      Type.Number({
        description: "相似度阈值,只返回相似度高于此值的库。默认 0.4。",
        default: 0.4,
      }),
    ),
  }),
  execute: async (_id, { query, threshold = 0.4 }) => {
    const db = getDb();
    const collections = db.prepare("SELECT name, description FROM collections").all() as Array<{
      name: string;
      description: string;
    }>;

    if (collections.length === 0) {
      return {
        content: [{ type: "text", text: `📭 没有任何库可供检索。请先创建库并下载论文。` }],
        details: { recommendedCollections: [] },
      };
    }

    const queryEmbedding = await generateEmbedding(query);
    const scored = await Promise.all(
      collections.map(async (c) => ({
        name: c.name,
        description: c.description,
        similarity: cosineSimilarity(queryEmbedding, await generateEmbedding(c.description)),
      })),
    );

    scored.sort((a, b) => b.similarity - a.similarity);
    const recommended = scored.filter((s) => s.similarity >= threshold);

    if (recommended.length === 0) {
      // 没有库相关性达标,返回 Top 1 让用户决定
      const top = scored[0];
      return {
        content: [
          {
            type: "text",
            text: `⚠️ 没有库的相关性高于 ${threshold}。最相关的是 **${top.name}** (相似度 ${top.similarity.toFixed(2)})。\n建议询问用户是否仍要在此库搜索,或扩大到所有库搜索。`,
          },
        ],
        details: { recommendedCollections: [], allCollections: scored },
      };
    }

    const text = recommended
      .map((r) => `- **${r.name}** (相似度 ${r.similarity.toFixed(2)}): ${r.description}`)
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `查询: "${query}"\n\n推荐在以下库中搜索:\n${text}\n\n下一步:对每个推荐库分别调用 search_papers,或直接传第一个库进行精搜。`,
        },
      ],
      details: { recommendedCollections: recommended, allCollections: scored },
    };
  },
});
