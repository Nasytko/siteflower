const fs = require("fs");
const path = require("path");
function loadEnv(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    vars[m[1]] = v;
  }
  return vars;
}
const root = loadEnv(path.join(process.cwd(), ".env"));
let base = root.DATABASE_URL || "postgresql://bouquet:bouquet_dev_password@127.0.0.1:5432/bouquet_one?schema=public";
// Prefer live 5432 credentials that worked previously
const u = new URL(base);
// Force host/port that is actually open for audit isolation on this host
u.hostname = "127.0.0.1";
u.port = "5432";
u.pathname = "/bouquet_one_baseline_audit";
if (!u.searchParams.get("schema")) u.searchParams.set("schema", "public");
const out = path.join(process.cwd(), "docs/refactor/_baseline-logs/audit-database-url.txt");
fs.writeFileSync(out, u.toString(), { encoding: "utf8", mode: 0o600 });
console.log("AUDIT_URL_FILE_WRITTEN");
console.log("TARGET_DB=" + decodeURIComponent(u.pathname.replace(/^\//, "")));
console.log("TARGET_HOST=" + u.hostname + ":" + u.port);
