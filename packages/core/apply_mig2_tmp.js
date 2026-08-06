const fs = require("fs");
const crypto = require("crypto");
const { Client } = require("pg");

const envPath = "/sessions/awesome-focused-davinci/mnt/dev/sistemapraxis/packages/core/.env";
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (!m) continue;
  let val = m[2].trim();
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  env[m[1]] = val;
}

const migName = "20260806160000_drop_finance_empreendimento_unidade";
const sqlPath = `/sessions/awesome-focused-davinci/mnt/dev/sistemapraxis/packages/core/prisma/migrations/${migName}/migration.sql`;
const sql = fs.readFileSync(sqlPath, "utf8");
const checksum = crypto.createHash("sha256").update(sql, "utf8").digest("hex");
const id = crypto.randomUUID();

const client = new Client({ connectionString: env.DIRECT_URL });

(async () => {
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
       VALUES ($1, $2, $3, now(), now(), 1)`,
      [id, checksum, migName]
    );
    await client.query("COMMIT");
    console.log("Migration applied and recorded:", migName);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("FAILED, rolled back:", e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
