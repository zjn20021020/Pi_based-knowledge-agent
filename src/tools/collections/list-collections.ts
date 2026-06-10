import { Type } from "@sinclair/typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import getDb from "../../utils/db.ts";


export const listCollections = defineTool({
  name: "list_collections",
  label: "List Collections",
  description:
    "列出所有已创建的论文库,包含库名、描述、论文数量和索引段落数。在新建库或选择库前应先调用此工具查看现状。",
  parameters: Type.Object({}),
  execute: async () => {
    const db = getDb();
    const rows = db
      .prepare(
        `
        SELECT c.name, c.description, c.created_at,
               (SELECT COUNT(*) FROM collection_papers cp WHERE cp.collection_name = c.name) AS paper_count,
               (SELECT COUNT(*) FROM chunks ck WHERE ck.collection_name = c.name) AS chunk_count
        FROM collections c
        ORDER BY c.created_at DESC
        `,
      )
      .all() as Array<{
      name: string;
      description: string;
      created_at: string;
      paper_count: number;
      chunk_count: number;
    }>;

    if (rows.length === 0) {
      return {
        content: [{ type: "text", text: "📚 当前没有任何论文库。请先用 create_collection 创建一个。" }],
        details: { collections: [] },
      };
    }

    const text = rows
      .map(
        (r) =>
          `📁 **${r.name}** (${r.paper_count} 篇,${r.chunk_count} 段已索引)\n   ${r.description}\n   创建于 ${r.created_at.slice(0, 10)}`,
      )
      .join("\n\n");

    return {
      content: [{ type: "text", text: `共 ${rows.length} 个库:\n\n${text}` }],
      details: { collections: rows },
    };
  },
});
