// Portado de apps/maintenance/src/lib/default-data.ts (v1), reduzido: a v1
// também guardava um catálogo de itens sugeridos (ITENS_PADRAO_SUGESTAO)
// pensado pra popular Unit.itemIds automaticamente — não se aplica mais
// aqui, já que Unit não existe nesta v2 (ver comentário no schema). Só a
// lista de categorias (usada no seletor da tela de Configurações) continua.
//
// Atualizado em 2026-07 pra bater com as categorias reais dos 40 itens
// importados do checklist original do protótipo "Bnb Manutenção" (tenant
// "Teste 2" de lá) — o placeholder anterior (Elétrica/Hidráulica/Estrutural/
// Acabamento) não correspondia a nenhum item de verdade.

export const CATEGORIAS = ["Estrutura", "Cozinha", "Quarto", "Banheiro"] as const;

export type Categoria = (typeof CATEGORIAS)[number];
