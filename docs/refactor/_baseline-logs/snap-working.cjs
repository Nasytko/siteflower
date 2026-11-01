const fs=require("fs");const path=require("path");
const {Client}=require(require.resolve("pg",{paths:[path.join(process.cwd(),"packages/database")]}));
function loadEnv(p){const v={};if(!fs.existsSync(p))return v;for(const line of fs.readFileSync(p,"utf8").split(/\r?\n/)){const m=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);if(!m)continue;let x=m[2].trim();if((x.startsWith('"')&&x.endsWith('"'))||(x.startsWith("'")&&x.endsWith("'")))x=x.slice(1,-1);v[m[1]]=x;}return v;}
(async()=>{
  const root=loadEnv(".env");
  const u=new URL(root.DATABASE_URL||"postgresql://bouquet:bouquet_dev_password@127.0.0.1:5432/bouquet_one?schema=public");
  u.hostname="127.0.0.1"; u.port="5432"; u.pathname="/bouquet_one";
  const c=new Client({connectionString:u.toString()});
  await c.connect();
  const r=await c.query(`SELECT current_database() db,
    (SELECT count(*)::int FROM products) products,
    (SELECT count(*)::int FROM admin_users) admins,
    (SELECT count(*)::int FROM seo_landing_pages) seo_landings,
    (SELECT COALESCE(max(updated_at)::text,'' ) FROM products) products_max_updated`);
  console.log(JSON.stringify(r.rows[0]));
  fs.writeFileSync("docs/refactor/_baseline-logs/11-working-db-snapshot-before.json", JSON.stringify(r.rows[0],null,2));
  await c.end();
})().catch(e=>{console.error(e.message);process.exit(1)});
