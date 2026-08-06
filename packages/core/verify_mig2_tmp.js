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
  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'FinanceLancamento' AND column_name IN ('empreendimentoId','unidadeId','propertyId','uhId')
    ORDER BY column_name
  `);
  console.log("FinanceLancamento relevant cols now:", cols.rows.map(r => r.column_name));
  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_name IN ('FinanceEmpreendimento','FinanceUnidade')
  `);
  console.log("Old tables still present (should be empty):", tables.rows.map(r => r.table_name));
  const idx = await client.query(`
    SELECT indexname FROM pg_indexes WHERE tablename = 'FinanceLancamento' AND (indexname ILIKE '%empreendimento%' OR indexname ILIKE '%unidade%')
  `);
  console.log("Leftover old indexes (should be empty):", idx.rows.map(r => r.indexname));
  const count = await client.query(`SELECT count(*) FROM "FinanceLancamento" WHERE "propertyId" IS NOT NULL OR "uhId" IS NOT NULL`);
  console.log("FinanceLancamento rows with propertyId/uhId set:", count.rows[0].count);
  await client.end();
})();
