import { Type } from "@sinclair/typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import getDb from "../../utils/db.ts";


export const listPapers = defineTool({
  name: "list_papers",
  label: "List Papers",
  description: "列出指定库中的论文。支持按加入时间、发表时间、标题排序,支持分页。",
  parameters: Type.Object({
    collectionName: Type.String({ description: "库名" }),
    limit: Type.Optional(Type.Number({ description: "返回数量,默认 20", default: 20 })),
    offset: Type.Optional(Type.Number({ description: "偏移量,默认 0", default: 0 })),
    sortBy: Type.Optional(
      Type.Union(
        [Type.Literal("added_at"), Type.Literal("published"), Type.Literal("title")],
        { description: "排序字段,默认 added_at(加入库的时间)", default: "added_at" },
      ),
    ),
  }),
  execute: async (_id, { collectionName, limit = 20, offset = 0, sortBy = "added_at" }) => {
    const db = getDb();

    const collection = db.prepare("SELECT name FROM collections WHERE name = ?").get(collectionName);
    if (!collection) {
      return {
        content: [{ type: "text", text: `❌ 库 "${collectionName}" 不存在。可用 list_collections 查看现有库。` }],
        details: { error: "not_found" },
      };
    }

    const total = (
      db.prepare("SELECT COUNT(*) AS n FROM collection_papers WHERE collection_name = ?").get(collectionName) as {
        n: number;
      }
    ).n;

    if (total === 0) {
      return {
        content: [{ type: "text", text: `📁 库 "${collectionName}" 暂无论文。` }],
        details: { papers: [], total: 0 },
      };
    }

    const sortColumn =
      sortBy === "added_at" ? "cp.added_at" : sortBy === "published" ? "p.published" : "p.title";

    const papers = db
      .prepare(
        `
        SELECT p.id, p.title, p.authors, p.published, cp.added_at,
               (p.parsed_at IS NOT NULL) AS indexed
        FROM papers p
        JOIN collection_papers cp ON p.id = cp.paper_id
        WHERE cp.collection_name = ?
        ORDER BY ${sortColumn} ${sortBy === "title" ? "ASC" : "DESC"}
        LIMIT ? OFFSET ?
        `,
      )
      .all(collectionName, limit, offset) as Array<{
      id: string;
      title: string;
      authors: string;
      published: string;
      added_at: string;
      indexed: number;
    }>;

    const text = papers
      .map((p, i) => {
        const authors = JSON.parse(p.authors) as string[];
        const authorStr = authors.length > 3 ? `${authors.slice(0, 3).join(", ")} 等` : authors.join(", ");
        const indexedMark = p.indexed ? "✓" : "○";
        return `${offset + i + 1}. ${indexedMark} **${p.title}**\n   ID: \`${p.id}\` | 发表: ${p.published.slice(0, 10)} | 作者: ${authorStr}`;
      })
      .join("\n\n");

    const indexedCount = papers.filter((p) => p.indexed).length;

    return {
      content: [
        {
          type: "text",
          text: `📁 库 "${collectionName}" 共 ${total} 篇,显示 ${offset + 1}-${offset + papers.length}\n(✓ 已索引 ${indexedCount}/${papers.length},○ 未索引)\n\n${text}`,
        },
      ],
      details: { papers, total, offset, limit, indexedCount },
    };
  },
});
