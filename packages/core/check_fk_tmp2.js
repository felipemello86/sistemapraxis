const fs = require("fs");
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
const client = new Client({ connectionString: env.DIRECT_URL });
(async () => {
  await client.connect();
  const fks = await client.query(`
    SELECT conname, conrelid::regclass::text as tbl FROM pg_constraint
    WHERE conrelid IN ('"FinanceUnidade"'::regclass, '"FinanceEmpreendimento"'::regclass) AND contype = 'f'
  `);
  console.log("FKs on FinanceUnidade/FinanceEmpreendimento:", fks.rows);
  await client.end();
})();
