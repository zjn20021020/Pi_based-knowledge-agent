/**
 * Paper Knowledge Agent - 简化版启动器
 * 直接使用 OpenAI SDK + DeepSeek,不依赖 pi 的模型注册系统
 */
import "dotenv/config";
import OpenAI from "openai";
import * as readline from "readline/promises";
import { stdin as input, stdout as output } from "process";

import { ALL_TOOLS } from "./tools/index.ts";
import { SYSTEM_PROMPT } from "./prompt.ts";
import getDb, { initDb, SCHEMA, saveDb } from "./utils/db.ts";

// 初始化数据库
await initDb();
const db = getDb();
db.exec(SCHEMA);

// 初始化 DeepSeek client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://api.deepseek.com",
  timeout: 60000,
});

console.log("✅ Paper Knowledge Agent 已启动");
console.log("📊 数据库: index/papers.db");
console.log("🤖 模型: deepseek-v4-flash");
console.log("💡 输入 'exit' 退出,输入 'help' 查看可用工具\n");

// 工具映射
const toolsMap = new Map(ALL_TOOLS.map((t) => [t.name, t]));

// 转换为 OpenAI function calling 格式
const functions = ALL_TOOLS.map((tool) => ({
  type: "function" as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  },
}));

// 对话历史
const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: "system", content: SYSTEM_PROMPT },
];

const rl = readline.createInterface({ input, output });

// 主循环
while (true) {
  try {
    const userInput = await rl.question("\n你: ");

    if (userInput.toLowerCase() === "exit") {
      console.log("再见!");
      saveDb();
      process.exit(0);
    }

    if (userInput.toLowerCase() === "help") {
      console.log("\n可用工具:");
      ALL_TOOLS.forEach((t) => console.log(`  - ${t.name}: ${t.label}`));
      continue;
    }

    if (!userInput.trim()) continue;

    messages.push({ role: "user", content: userInput });

    let response = await client.chat.completions.create({
      model: "deepseek-v4-flash",
      messages,
      tools: functions,
      tool_choice: "auto",
    });

    let assistantMessage = response.choices[0].message;

    // 工具调用循环
    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      messages.push(assistantMessage);

      console.log("\n[工具调用]");

      for (const toolCall of assistantMessage.tool_calls) {
        const tool = toolsMap.get(toolCall.function.name);
        if (!tool) {
          console.log(`  ❌ 未知工具: ${toolCall.function.name}`);
          continue;
        }

        console.log(`  🔧 ${tool.label}...`);

        try {
          const args = JSON.parse(toolCall.function.arguments);
          // 这些工具不读取运行时上下文；仍按新版 Pi 接口补齐可选参数。
          const result = await tool.execute(
            toolCall.id,
            args,
            undefined,
            undefined,
            undefined as never,
          );

          const textContent = result.content.find((item) => item.type === "text");
          const toolResultContent = textContent?.text ?? "Tool completed.";

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResultContent,
          });

          console.log(`  ✓ ${tool.label} 完成`);
        } catch (err: any) {
          console.error(`  ❌ ${tool.label} 失败:`, err.message);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: `Error: ${err.message}`,
          });
        }
      }

      // 让模型根据工具结果继续
      response = await client.chat.completions.create({
        model: "deepseek-v4-flash",
        messages,
        tools: functions,
        tool_choice: "auto",
      });

      assistantMessage = response.choices[0].message;
    }

    // 输出最终回复
    if (assistantMessage.content) {
      messages.push(assistantMessage);
      console.log(`\nAgent: ${assistantMessage.content}`);
    }

    // 定期保存数据库
    saveDb();
  } catch (err: any) {
    console.error("\n❌ 错误:", err.message);
    if (err.message?.includes("timed out")) {
      console.error("💡 提示: API 超时,请检查网络或稍后重试");
    }
  }
}
