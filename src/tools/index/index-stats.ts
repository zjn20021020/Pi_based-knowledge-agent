import { Type } from "@sinclair/typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import getDb from "../../utils/db.ts";


export const indexStats = defineTool({
  name: "index_stats",
  label: "Index Stats",
  description: "查看索引状态。不传 collectionName 时给出全局统计;传了则给出指定库的详细索引情况。",
  parameters: Type.Object({
    collectionName: Type.Optional(Type.String({ description: "可选,指定查看哪个库的索引详情" })),
  }),
  execute: async (_id, { collectionName }) => {
    const db = getDb();

    if (collectionName) {
      const col = db.prepare("SELECT name, description FROM collections WHERE name = ?").get(collectionName) as
        | { name: string; description: string }
        | undefined;
      if (!col) {
        return {
          content: [{ type: "text", text: `❌ 库 "${collectionName}" 不存在。` }],
          details: { error: "not_found" },
        };
      }

      const total = (
        db
          .prepare("SELECT COUNT(*) AS n FROM collection_papers WHERE collection_name = ?")
          .get(collectionName) as { n: number }
      ).n;
      const indexed = (
        db
          .prepare(
            `
            SELECT COUNT(DISTINCT cp.paper_id) AS n
            FROM collection_papers cp
            WHERE cp.collection_name = ?
              AND EXISTS (SELECT 1 FROM chunks ck WHERE ck.paper_id = cp.paper_id AND ck.collection_name = ?)
            `,
          )
          .get(collectionName, collectionName) as { n: number }
      ).n;
      const totalChunks = (
        db
          .prepare("SELECT COUNT(*) AS n FROM chunks WHERE collection_name = ?")
          .get(collectionName) as { n: number }
      ).n;

      const pending = total - indexed;
      const status = pending === 0 ? "✅ 索引完整" : `⚠️ 有 ${pending} 篇未索引`;

      return {
        content: [
          {
            type: "text",
            text: `📁 库 "${collectionName}" 索引状态\n\n描述: ${col.description}\n论文总数: ${total}\n已索引: ${indexed}\n未索引: ${pending}\n段落总数: ${totalChunks}\n\n${status}${pending > 0 ? `\n建议: 调用 index_collection("${collectionName}") 更新索引。` : ""}`,
          },
        ],
        details: { collectionName, total, indexed, pending, totalChunks },
      };
    }

    // 全局统计
    const stats = db
      .prepare(
        `
        SELECT c.name,
               (SELECT COUNT(*) FROM collection_papers cp WHERE cp.collection_name = c.name) AS papers,
               (SELECT COUNT(*) FROM chunks ck WHERE ck.collection_name = c.name) AS chunks,
               (SELECT COUNT(DISTINCT cp.paper_id) FROM collection_papers cp
                WHERE cp.collection_name = c.name AND EXISTS (
                  SELECT 1 FROM chunks ck WHERE ck.paper_id = cp.paper_id AND ck.collection_name = c.name
                )) AS indexed_papers
        FROM collections c
        ORDER BY c.name
        `,
      )
      .all() as Array<{ name: string; papers: number; chunks: number; indexed_papers: number }>;

    const totalPapers = (db.prepare("SELECT COUNT(*) AS n FROM papers").get() as { n: number }).n;
    const totalChunks = (db.prepare("SELECT COUNT(*) AS n FROM chunks").get() as { n: number }).n;

    if (stats.length === 0) {
      return {
        content: [{ type: "text", text: `📭 没有任何库。` }],
        details: { collections: [], totalPapers, totalChunks },
      };
    }

    const text = stats
      .map((s) => {
        const pending = s.papers - s.indexed_papers;
        const mark = pending === 0 ? "✅" : "⚠️";
        return `${mark} **${s.name}**: ${s.indexed_papers}/${s.papers} 已索引,${s.chunks} 段`;
      })
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `📊 全局索引状态\n\n${text}\n\n论文总数(去重): ${totalPapers}\n段落总数: ${totalChunks}`,
        },
      ],
      details: { collections: stats, totalPapers, totalChunks },
    };
  },
});
