/**
 * Paper Knowledge Agent 入口。
 * 使用 DeepSeek 模型(通过 OpenAI SDK)。
 */
import "dotenv/config";
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  InteractiveMode,
  SessionManager,
  AuthStorage,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { getModel } from "@earendil-works/pi-ai";

import { ALL_TOOLS } from "./tools/index.ts";
import { SYSTEM_PROMPT } from "./prompt.ts";
import getDb, { initDb, SCHEMA } from "./utils/db.ts";

// 启动时初始化数据库
await initDb();
const db = getDb();
db.exec(SCHEMA);

// 检查 DeepSeek API Key
const DEEPSEEK_API_KEY = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
if (!DEEPSEEK_API_KEY) {
  console.error("❌ 错误: 未找到 DeepSeek API key");
  console.error("请在 .env 文件中设置 OPENAI_API_KEY 或 LLM_API_KEY");
  process.exit(1);
}

// 清除 Anthropic key,避免干扰
delete process.env.ANTHROPIC_API_KEY;

// 设置 DeepSeek base URL
process.env.OPENAI_BASE_URL = "https://api.deepseek.com";

console.log("✓ DeepSeek API key 已加载");
console.log("✓ API 端点: https://api.deepseek.com");

// 初始化 model registry
const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

// 强制使用 openai provider 的特定模型
const model = getModel("openai", "gpt-4");
if (!model) {
  console.error("❌ 错误: 无法加载 openai/gpt-4 模型");
  process.exit(1);
}

console.log(`✓ 使用模型: ${model.provider}/${model.id}`);
console.log();

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({
    cwd,
    authStorage,
    modelRegistry,
    resourceLoaderOptions: {
      systemPromptOverride: () => SYSTEM_PROMPT,
    },
  });

  return {
    ...(await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
      model, // 明确指定使用 openai/gpt-4 (实际调用 DeepSeek)
      noTools: "builtin",
      customTools: ALL_TOOLS,
    })),
    services,
    diagnostics: services.diagnostics,
  };
};

const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});

await new InteractiveMode(runtime, {
  migratedProviders: [],
  modelFallbackMessage: undefined,
  initialMessage: undefined,
  initialImages: [],
  initialMessages: [],
}).run();
