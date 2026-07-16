// DESCONTINUADO — a lógica foi extraída pra createTenant (../src/tenant.ts)
// pra evitar duplicação entre este script, o script genérico de criação de
// cliente, e a futura rota de signup self-service.
//
// Use em vez disso:
//   npx tsx scripts/seed-test-tenant.ts        (dados de teste bnbflex)
//   npx tsx scripts/create-tenant.ts --nome ... --slug ... --email ... --senha ...   (cliente novo)
//
// Este arquivo não é mais chamado por nada; pode ser apagado manualmente
// (o sandbox não teve permissão de remover o arquivo, só de sobrescrevê-lo).
console.error(
  "Este script foi descontinuado. Use: npx tsx scripts/seed-test-tenant.ts"
);
process.exit(1);
