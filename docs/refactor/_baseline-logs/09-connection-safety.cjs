const fs = require("fs");
const path = require("path");
const net = require("net");
const { Client } = require(require.resolve("pg", {
  paths: [
    path.join(process.cwd(), "packages/database"),
    path.join(process.cwd(), "apps/api"),
  ],
}));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, vars: {} };
  const vars = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    vars[m[1]] = v;
  }
  return { exists: true, vars };
}

function redactUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return {
      protocol: u.protocol.replace(":", ""),
      host: u.hostname,
      port: u.port || "5432",
      database: decodeURIComponent((u.pathname || "/").replace(/^\//, "").split("?")[0] || ""),
      user: u.username ? "***" : "",
      schema: u.searchParams.get("schema"),
      hasPassword: Boolean(u.password),
      redacted: `${u.protocol}//${u.username ? "***:***@" : ""}${u.hostname}:${u.port || "5432"}${u.pathname}`,
    };
  } catch (e) {
    return { parseError: String(e.message || e) };
  }
}

function canConnect(host, port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function probeSql(url, label) {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    const r = await client.query(`
      SELECT
        current_database() AS db,
        current_user AS db_user,
        inet_server_addr()::text AS server_addr,
        inet_server_port() AS server_port,
        pg_backend_pid() AS pid,
        (SELECT oid FROM pg_database WHERE datname = current_database()) AS db_oid
    `);
    const mig = await client.query(`
      SELECT COUNT(*)::int AS n FROM information_schema.tables
      WHERE table_schema='public' AND table_name='_prisma_migrations'
    `);
    let migrationCount = null;
    if (mig.rows[0].n > 0) {
      const c = await client.query(`SELECT COUNT(*)::int AS n FROM _prisma_migrations`);
      migrationCount = c.rows[0].n;
    }
    await client.end();
    return { ok: true, label, ...r.rows[0], migrationCount, url: redactUrl(url) };
  } catch (e) {
    try { await client.end(); } catch {}
    return { ok: false, label, error: e.code || e.message, url: redactUrl(url) };
  }
}

(async () => {
  const rootEnvPath = path.join(process.cwd(), ".env");
  const dbEnvPath = path.join(process.cwd(), "packages/database/.env");
  const apiEnvPath = path.join(process.cwd(), "apps/api/.env");
  const rootEnv = loadEnvFile(rootEnvPath);
  const dbEnv = loadEnvFile(dbEnvPath);
  const apiEnv = loadEnvFile(apiEnvPath);

  const report = {
    timestamp: new Date().toISOString(),
    envFiles: {
      "root/.env": { exists: rootEnv.exists, keysPresent: Object.keys(rootEnv.vars).filter(k => /DATABASE|DIRECT|POSTGRES|URL/i.test(k)) },
      "packages/database/.env": { exists: dbEnv.exists, keysPresent: Object.keys(dbEnv.vars).filter(k => /DATABASE|DIRECT|POSTGRES|URL/i.test(k)) },
      "apps/api/.env": { exists: apiEnv.exists, keysPresent: Object.keys(apiEnv.vars).filter(k => /DATABASE|DIRECT|POSTGRES|URL/i.test(k)) },
    },
    processEnv: {
      DATABASE_URL: redactUrl(process.env.DATABASE_URL),
      DIRECT_URL: redactUrl(process.env.DIRECT_URL),
      POSTGRES_DB: process.env.POSTGRES_DB || null,
      POSTGRES_PORT: process.env.POSTGRES_PORT || null,
      NODE_ENV: process.env.NODE_ENV || null,
    },
    fileEnv: {
      root_DATABASE_URL: redactUrl(rootEnv.vars.DATABASE_URL),
      root_DIRECT_URL: redactUrl(rootEnv.vars.DIRECT_URL),
      root_POSTGRES_DB: rootEnv.vars.POSTGRES_DB || null,
      root_POSTGRES_PORT: rootEnv.vars.POSTGRES_PORT || null,
      databasePkg_DATABASE_URL: redactUrl(dbEnv.vars.DATABASE_URL),
      databasePkg_DIRECT_URL: redactUrl(dbEnv.vars.DIRECT_URL),
      api_DATABASE_URL: redactUrl(apiEnv.vars.DATABASE_URL),
      api_DIRECT_URL: redactUrl(apiEnv.vars.DIRECT_URL),
    },
    prismaConfigBehavior: {
      loads: ["../../.env from packages/database cwd", "packages/database/.env"],
      datasourceUses: "env(DATABASE_URL) only — no DIRECT_URL in prisma.config.ts or schema.prisma",
      dotenvOverrideDefault: false,
    },
    nestTestBehavior: {
      ignoreEnvFileWhenNodeEnvTest: true,
      file: "apps/api/src/config/app-config.module.ts",
    },
    integrationFallbackDefaultDb: "bouquet_one",
    ports: {},
    probes: [],
    verdict: {},
  };

  for (const port of [5432, 5433]) {
    report.ports[String(port)] = await canConnect("127.0.0.1", port);
  }

  // Simulate prisma effective URL: process env wins if set; else root .env then package .env
  const prismaEffective =
    process.env.DATABASE_URL ||
    rootEnv.vars.DATABASE_URL ||
    dbEnv.vars.DATABASE_URL ||
    null;

  // Simulate integration FALLBACK at module load
  const integrationFallback =
    process.env.DATABASE_URL ||
    `postgresql://bouquet:bouquet_dev_password@127.0.0.1:5432/bouquet_one?schema=public`;

  // Simulate resolveIntegrationDatabaseUrl roughly
  let resolvedIntegration = null;
  if (process.env.DATABASE_URL) {
    const u = redactUrl(process.env.DATABASE_URL);
    if (u && (u.host === "localhost" || u.host === "127.0.0.1")) {
      const open = await canConnect(u.host, Number(u.port));
      resolvedIntegration = open ? process.env.DATABASE_URL : null;
    } else {
      resolvedIntegration = process.env.DATABASE_URL;
    }
  }
  if (!resolvedIntegration) {
    for (const port of [5432, 5433]) {
      if (report.ports[String(port)]) {
        resolvedIntegration = `postgresql://bouquet:bouquet_dev_password@127.0.0.1:${port}/bouquet_one?schema=public`;
        break;
      }
    }
  }

  report.effective = {
    prismaWouldUse: redactUrl(prismaEffective),
    integrationFallbackWouldUse: redactUrl(integrationFallback),
    resolveIntegrationWouldUse: redactUrl(resolvedIntegration),
  };

  const candidates = [];
  const pushUnique = (label, url) => {
    if (!url) return;
    if (candidates.some((c) => c.url === url)) return;
    candidates.push({ label, url });
  };
  pushUnique("process.DATABASE_URL", process.env.DATABASE_URL);
  pushUnique("root.env.DATABASE_URL", rootEnv.vars.DATABASE_URL);
  pushUnique("working_db_guess_5432", "postgresql://bouquet:bouquet_dev_password@127.0.0.1:5432/bouquet_one?schema=public");
  pushUnique("audit_db", "postgresql://bouquet:bouquet_dev_password@127.0.0.1:5432/bouquet_one_baseline_audit?schema=public");
  if (rootEnv.vars.DATABASE_URL) {
    try {
      const u = new URL(rootEnv.vars.DATABASE_URL);
      u.pathname = "/bouquet_one_baseline_audit";
      pushUnique("audit_derived_from_root_creds", u.toString());
    } catch {}
  }

  for (const c of candidates) {
    report.probes.push(await probeSql(c.url, c.label));
  }

  const working = report.probes.find((p) => p.ok && p.db === "bouquet_one");
  const audit = report.probes.find((p) => p.ok && p.db === "bouquet_one_baseline_audit");
  const rootDbName = report.fileEnv.root_DATABASE_URL && report.fileEnv.root_DATABASE_URL.database;
  const prismaDbName = report.effective.prismaWouldUse && report.effective.prismaWouldUse.database;
  const fallbackDbName = report.effective.integrationFallbackWouldUse && report.effective.integrationFallbackWouldUse.database;
  const resolveDbName = report.effective.resolveIntegrationWouldUse && report.effective.resolveIntegrationWouldUse.database;

  const processPointsAtAudit =
    report.processEnv.DATABASE_URL &&
    report.processEnv.DATABASE_URL.database === "bouquet_one_baseline_audit";

  const physicallySeparate =
    Boolean(working && audit && String(working.db_oid) !== String(audit.db_oid) && working.db !== audit.db);

  const wouldHitWorkingWithoutExplicitEnv =
    fallbackDbName === "bouquet_one" || resolveDbName === "bouquet_one" || prismaDbName === "bouquet_one" || rootDbName === "bouquet_one";

  const safeToRunDbTests =
    physicallySeparate &&
    processPointsAtAudit &&
    report.effective.prismaWouldUse &&
    report.effective.prismaWouldUse.database === "bouquet_one_baseline_audit" &&
    report.effective.integrationFallbackWouldUse.database === "bouquet_one_baseline_audit" &&
    report.effective.resolveIntegrationWouldUse.database === "bouquet_one_baseline_audit" &&
    !report.fileEnv.root_DIRECT_URL &&
    !report.processEnv.DIRECT_URL;

  report.verdict = {
    DIRECT_URL_present: Boolean(report.processEnv.DIRECT_URL || report.fileEnv.root_DIRECT_URL || report.fileEnv.databasePkg_DIRECT_URL || report.fileEnv.api_DIRECT_URL),
    physicallySeparate,
    workingDbAlive: Boolean(working),
    auditDbAlive: Boolean(audit),
    workingOid: working ? working.db_oid : null,
    auditOid: audit ? audit.db_oid : null,
    rootEnvDatabase: rootDbName,
    processEnvDatabase: report.processEnv.DATABASE_URL && report.processEnv.DATABASE_URL.database,
    wouldHitWorkingWithoutExplicitEnv,
    processPointsAtAudit,
    safeToRunDbTests,
    reasonsIfUnsafe: [],
  };

  if (!physicallySeparate) report.verdict.reasonsIfUnsafe.push("Cannot prove distinct OIDs for bouquet_one vs bouquet_one_baseline_audit");
  if (!processPointsAtAudit) report.verdict.reasonsIfUnsafe.push("process.env.DATABASE_URL is not set to bouquet_one_baseline_audit before test/migrate");
  if (report.verdict.DIRECT_URL_present) report.verdict.reasonsIfUnsafe.push("DIRECT_URL present — must verify it does not retarget working DB (Prisma config currently ignores it)");
  if (!(report.effective.prismaWouldUse && report.effective.prismaWouldUse.database === "bouquet_one_baseline_audit")) {
    report.verdict.reasonsIfUnsafe.push("Prisma effective DATABASE_URL would not target audit DB");
  }
  if (report.effective.integrationFallbackWouldUse.database !== "bouquet_one_baseline_audit") {
    report.verdict.reasonsIfUnsafe.push("Integration FALLBACK effective URL would not target audit DB");
  }

  const out = path.join(process.cwd(), "docs/refactor/_baseline-logs/09-connection-safety.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.verdict, null, 2));
  console.log("WROTE", out);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
