/**
 * Paper Knowledge Agent 入口。
 * 直接使用 pi-ai 内置的 deepseek provider，无需任何端点劫持。
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

// pi-ai 的 deepseek provider 读 DEEPSEEK_API_KEY，
// 而 .env 里我们用的是 OPENAI_API_KEY / LLM_API_KEY 做兼容别名，
// 这里把 key 同步到 pi-ai 期望的环境变量名上。
const apiKey =
  process.env.DEEPSEEK_API_KEY ||
  process.env.OPENAI_API_KEY ||
  process.env.LLM_API_KEY;

if (!apiKey) {
  console.error("❌ 错误: 未找到 API key");
  console.error("请在 .env 文件中设置 DEEPSEEK_API_KEY、OPENAI_API_KEY 或 LLM_API_KEY");
  process.exit(1);
}
process.env.DEEPSEEK_API_KEY = apiKey;

// 清掉可能干扰 provider 选择的 Anthropic / OpenAI key
delete process.env.ANTHROPIC_API_KEY;
// 注意：不要再设置 OPENAI_BASE_URL，pi-ai 的 openai provider 不读这个变量，
// 而 deepseek provider 自带正确的 baseUrl，无需任何劫持。

console.log("✓ DeepSeek API key 已加载");

// 选择模型：默认 pro，可通过 DEFAULT_MODEL 环境变量覆盖（deepseek-v4-flash / deepseek-v4-pro）
const modelId =
  (process.env.DEFAULT_MODEL as "deepseek-v4-pro" | "deepseek-v4-flash") ||
  "deepseek-v4-pro";

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

const model = getModel("deepseek", modelId);
if (!model) {
  console.error(`❌ 错误: 无法加载 deepseek/${modelId} 模型`);
  console.error("可选: deepseek-v4-flash, deepseek-v4-pro");
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
      model,
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
