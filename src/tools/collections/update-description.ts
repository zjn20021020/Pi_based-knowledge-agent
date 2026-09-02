import { Type } from "@sinclair/typebox";
import { defineTool } from "../define-tool.ts";
import getDb from "../../utils/db.ts";


export const updateCollectionDescription = defineTool({
  name: "update_collection_description",
  label: "Update Collection Description",
  description: "更新一个已有论文库的描述。描述会用于智能路由判断,所以应当具体明确。",
  parameters: Type.Object({
    name: Type.String({ description: "库名" }),
    description: Type.String({ description: "新的描述" }),
  }),
  execute: async (_id, { name, description }) => {
    const db = getDb();
    const result = db.prepare("UPDATE collections SET description = ? WHERE name = ?").run(description, name);

    if (result.changes === 0) {
      return {
        content: [{ type: "text", text: `❌ 库 "${name}" 不存在。` }],
        details: { error: "not_found" },
      };
    }

    return {
      content: [{ type: "text", text: `✅ 已更新库 "${name}" 的描述:\n${description}` }],
      details: { name, description },
    };
  },
});
