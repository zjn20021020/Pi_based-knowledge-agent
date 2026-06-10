import { Type } from "@sinclair/typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import getDb from "../../utils/db.ts";

import { generateEmbedding, cosineSimilarity } from "../../utils/embedding.ts";

const SIM_HIGH = 0.7;
const SIM_LOW = 0.5;

export const suggestCollection = defineTool({
  name: "suggest_collection",
  label: "Suggest Collection",
  description:
    "根据主题判断应该进入哪个已有库,或建议新建库。在用户要下载论文前,先调用此工具决定归属。返回相似度排名 Top 3 的候选库,以及推荐(增补已有 / 新建 / 让用户判断)。",
  parameters: Type.Object({
    topic: Type.String({
      description: "论文主题或关键词,如 'multi-agent collaboration'、'RAG retrieval evaluation'",
    }),
  }),
  execute: async (_id, { topic }) => {
    const db = getDb();
    const collections = db.prepare("SELECT name, description FROM collections").all() as Array<{
      name: string;
      description: string;
    }>;

    if (collections.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `📭 当前没有任何库。建议为主题 "${topic}" 新建一个库。`,
          },
        ],
        details: { suggestion: "create_new", topic, candidates: [] },
      };
    }

    const topicEmbedding = await generateEmbedding(topic);
    const scored = await Promise.all(
      collections.map(async (c) => ({
        name: c.name,
        description: c.description,
        similarity: cosineSimilarity(topicEmbedding, await generateEmbedding(c.description)),
      })),
    );

    scored.sort((a, b) => b.similarity - a.similarity);
    const top3 = scored.slice(0, 3);
    const best = top3[0];

    let recommendation: "add_to_existing" | "create_new" | "ask_user";
    let advice: string;

    if (best.similarity > SIM_HIGH) {
      recommendation = "add_to_existing";
      advice = `🟢 强烈建议加入已有库 **${best.name}** (相似度 ${best.similarity.toFixed(2)})`;
    } else if (best.similarity < SIM_LOW) {
      recommendation = "create_new";
      advice = `🆕 建议新建库,所有现有库的相似度都低于 ${SIM_LOW}`;
    } else {
      recommendation = "ask_user";
      advice = `🤔 相似度中等(${best.similarity.toFixed(2)}),需要让用户判断:加入 "${best.name}" 还是新建库?`;
    }

    const candidatesText = top3
      .map((c) => `- **${c.name}** (相似度 ${c.similarity.toFixed(2)}): ${c.description}`)
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `主题: "${topic}"\n\n${advice}\n\n候选库:\n${candidatesText}`,
        },
      ],
      details: { topic, candidates: top3, recommendation },
    };
  },
});
