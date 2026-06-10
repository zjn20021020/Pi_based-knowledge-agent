import { Type } from "@sinclair/typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import getDb from "../../utils/db.ts";

import { deleteChromaCollection } from "../../utils/chroma.ts";

export const deleteCollection = defineTool({
  name: "delete_collection",
  label: "Delete Collection",
  description:
    "删除一个论文库及其所有索引数据。注意:这只删除库本身和索引,不删除论文 PDF 文件(因为论文可能还属于其他库)。如果确认要删除,必须传 confirm: true。",
  parameters: Type.Object({
    name: Type.String({ description: "要删除的库名" }),
    confirm: Type.Boolean({
      description: "二次确认。必须为 true 才会真正执行删除。如果用户没明确确认,先不要传 true。",
    }),
  }),
  execute: async (_id, { name, confirm }) => {
    const db = getDb();
    const collection = db.prepare("SELECT name, description FROM collections WHERE name = ?").get(name) as
      | { name: string; description: string }
      | undefined;

    if (!collection) {
      return {
        content: [{ type: "text", text: `❌ 库 "${name}" 不存在。` }],
        details: { error: "not_found" },
      };
    }

    const paperCount = (
      db.prepare("SELECT COUNT(*) AS n FROM collection_papers WHERE collection_name = ?").get(name) as {
        n: number;
      }
    ).n;

    if (!confirm) {
      return {
        content: [
          {
            type: "text",
            text: `⚠️ 请用户确认删除库 "${name}"\n描述: ${collection.description}\n包含论文: ${paperCount} 篇\n\n这会:\n- 删除库的元信息\n- 删除该库的所有索引段落\n- 从 Chroma 删除该库的向量\n- **不会**删除 PDF 文件\n\n如果用户确认,请重新调用此工具并设置 confirm: true。`,
          },
        ],
        details: { needConfirm: true, name, paperCount },
      };
    }

    // 级联删除(SQLite ON DELETE CASCADE 会自动清理 collection_papers 和 chunks)
    db.prepare("DELETE FROM collections WHERE name = ?").run(name);
    await deleteChromaCollection(name);

    return {
      content: [
        {
          type: "text",
          text: `✅ 已删除库 "${name}",释放 ${paperCount} 篇论文的关联和索引。\nPDF 文件保留在 data/papers/ 下。`,
        },
      ],
      details: { name, deletedPapers: paperCount },
    };
  },
});
