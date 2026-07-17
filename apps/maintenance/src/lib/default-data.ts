// Portado de apps/maintenance/src/lib/default-data.ts (v1), reduzido: a v1
// também guardava um catálogo de itens sugeridos (ITENS_PADRAO_SUGESTAO)
// pensado pra popular Unit.itemIds automaticamente — não se aplica mais
// aqui, já que Unit não existe nesta v2 (ver comentário no schema). Só a
// lista de categorias (usada no seletor da tela de Configurações) continua.

export const CATEGORIAS = ["Elétrica", "Hidráulica", "Estrutural", "Acabamento"] as const;

export type Categoria = (typeof CATEGORIAS)[number];
