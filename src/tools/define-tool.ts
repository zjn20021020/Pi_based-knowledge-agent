import {
  defineTool as definePiTool,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { TSchema } from "@sinclair/typebox";

// 统一工具详情为 unknown，避免不同成功/失败分支被推断成互斥结果类型。
export function defineTool<TParams extends TSchema>(
  tool: ToolDefinition<TParams, unknown>,
) {
  return definePiTool<TParams, unknown>(tool);
}
