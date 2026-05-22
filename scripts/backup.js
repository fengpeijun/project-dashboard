/**
 * Supabase 数据备份脚本
 * 用法: node scripts/backup.js
 * 环境变量: SUPABASE_URL, SUPABASE_KEY
 */

const fs = require("fs");
const path = require("path");

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_KEY;

if (!SUPA_URL || !SUPA_KEY) {
  console.error("❌ 请设置环境变量 SUPABASE_URL 和 SUPABASE_KEY");
  process.exit(1);
}

const HEADERS = {
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  "Content-Type": "application/json",
};

// ========== 要备份的表 ==========
const TABLES = [
  "projects",
  "weekly_tasks",
  "project_links",
  "uploaded_files",
];

const BUCKET = "project-files";

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const dir = path.join(__dirname, "..", "backups", today);
  fs.mkdirSync(dir, { recursive: true });

  const manifest = {
    date: today,
    timestamp: new Date().toISOString(),
    tables: {},
    storage: {},
  };

  // ========== 1. 导出所有表数据 ==========
  console.log("📦 开始导出数据库表...");
  for (const table of TABLES) {
    try {
      const res = await fetch(
        `${SUPA_URL}/rest/v1/${table}?order=created_at.asc`,
        { headers: { ...HEADERS, Prefer: "count=exact" } }
      );
      if (!res.ok) {
        const err = await res.text();
        console.error(`  ⚠️ ${table}: HTTP ${res.status} - ${err.slice(0, 200)}`);
        manifest.tables[table] = { error: res.status, count: 0 };
        continue;
      }
      const data = await res.json();
      const file = path.join(dir, `${table}.json`);
      fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
      console.log(`  ✅ ${table}: ${data.length} 条记录 → ${table}.json`);
      manifest.tables[table] = { count: data.length, file: `backups/${today}/${table}.json` };
    } catch (e) {
      console.error(`  ❌ ${table}: ${e.message}`);
      manifest.tables[table] = { error: e.message, count: 0 };
    }
  }

  // ========== 2. 导出 Storage 文件列表 ==========
  console.log("📁 开始导出 Storage 文件列表...");
  try {
    const res = await fetch(
      `${SUPA_URL}/storage/v1/object/list/${BUCKET}`,
      { headers: { ...HEADERS } }
    );
    if (res.ok) {
      const files = await res.json();
      const file = path.join(dir, `storage_${BUCKET}.json`);
      fs.writeFileSync(file, JSON.stringify(files, null, 2), "utf-8");
      console.log(`  ✅ storage: ${files.length} 个文件 → storage_${BUCKET}.json`);
      manifest.storage = { bucket: BUCKET, count: files.length, file: `backups/${today}/storage_${BUCKET}.json` };
    } else {
      console.error(`  ⚠️ storage: HTTP ${res.status}`);
      manifest.storage = { error: res.status };
    }
  } catch (e) {
    console.error(`  ❌ storage: ${e.message}`);
    manifest.storage = { error: e.message };
  }

  // ========== 3. 总清单 ==========
  const totalRecords = Object.values(manifest.tables).reduce((sum, t) => sum + (t.count || 0), 0);
  manifest.totalRecords = totalRecords;

  const manifestFile = path.join(dir, "backup.json");
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), "utf-8");

  console.log(`\n🎉 备份完成: backups/${today}/`);
  console.log(`   表记录: ${totalRecords} 条`);
  console.log(`   Storage: ${manifest.storage.count || "N/A"} 个文件`);
  console.log(`   清单: backup.json`);
}

main().catch((e) => {
  console.error("备份失败:", e.message);
  process.exit(1);
});
