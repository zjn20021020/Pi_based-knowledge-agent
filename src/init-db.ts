/**
 * 数据库初始化脚本。运行 `npm run init` 一次即可。
 */
import getDb, { initDb, SCHEMA, closeDb } from "./utils/db.ts";

await initDb();
const db = getDb();
db.exec(SCHEMA);

console.log("✅ 数据库初始化完成");
console.log("   位置: index/papers.db");
console.log("\n下一步: npm start");

closeDb();
