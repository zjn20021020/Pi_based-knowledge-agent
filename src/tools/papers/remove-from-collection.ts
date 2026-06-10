import { Type } from "@sinclair/typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import getDb from "../../utils/db.ts";

import { getCollectionIfExists } from "../../utils/chroma.ts";

export const removeFromCollection = defineTool({
  name: "remove_from_collection",
  label: "Remove from Collection",
  description:
    "从指定库中移除一篇论文。这只解除论文与库的关联(以及该库的索引),不删除 PDF 文件。如果论文还在其他库中,在那些库里仍可被检索。",
  parameters: Type.Object({
    paperId: Type.String({ description: "arXiv 论文 ID" }),
    collectionName: Type.String({ description: "要从中移除的库名" }),
  }),
  execute: async (_id, { paperId, collectionName }) => {
    const db = getDb();

    const link = db
      .prepare("SELECT 1 FROM collection_papers WHERE paper_id = ? AND collection_name = ?")
      .get(paperId, collectionName);
    if (!link) {
      return {
        content: [{ type: "text", text: `❌ 论文 ${paperId} 不在库 "${collectionName}" 中。` }],
        details: { error: "not_in_collection" },
      };
    }

    // 1. 找到该 (paper, collection) 的所有 chunk id,从 Chroma 删除
    const chunkIds = db
      .prepare("SELECT id FROM chunks WHERE paper_id = ? AND collection_name = ?")
      .all(paperId, collectionName)
      .map((r: any) => r.id) as string[];

    if (chunkIds.length > 0) {
      const chromaCol = await getCollectionIfExists(collectionName);
      if (chromaCol) {
        await chromaCol.delete({ ids: chunkIds });
      }
    }

    // 2. 删 SQLite 的 chunks 和关联
    db.prepare("DELETE FROM chunks WHERE paper_id = ? AND collection_name = ?").run(paperId, collectionName);
    db.prepare("DELETE FROM collection_papers WHERE paper_id = ? AND collection_name = ?").run(
      paperId,
      collectionName,
    );

    // 3. 检查论文是否还在其他库
    const otherCols = db
      .prepare("SELECT collection_name FROM collection_papers WHERE paper_id = ?")
      .all(paperId) as Array<{ collection_name: string }>;

    let extraNote = "";
    if (otherCols.length === 0) {
      extraNote = `\n\n⚠️ 该论文已不在任何库中,但 PDF 文件仍保留在 data/papers/ 下。如需彻底删除,请用 delete_paper_globally。`;
    } else {
      extraNote = `\n\nℹ️ 该论文仍在其他库中: ${otherCols.map((c) => c.collection_name).join(", ")}`;
    }

    return {
      content: [
        {
          type: "text",
          text: `✅ 已从库 "${collectionName}" 移除论文 ${paperId},清理 ${chunkIds.length} 个索引段落。${extraNote}`,
        },
      ],
      details: { paperId, collectionName, removedChunks: chunkIds.length, otherCollections: otherCols },
    };
  },
});
