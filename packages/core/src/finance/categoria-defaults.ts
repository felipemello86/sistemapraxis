// Catálogo padrão de categorias financeiras — taxonomia extraída e
// verificada aritmeticamente a partir da planilha real do Felipe
// ("DRE Julho 2026.xlsx", exportada do Conta Azul, jul/2026). Usado como
// seed pro módulo Financeiro (ver scripts/seed-finance-categorias.ts).
//
// Desde 05/08/2026 os "blocos" (super-categorias) não são mais um enum fixo
// — viraram FinanceBloco, configurável por tenant na tela de Configurações
// (pedido do Felipe: "categorias, super-categorias e relações de soma e
// subtração devem ser customizáveis"). O que continua fixo são só os NOMES
// dos 4 totais finais da DRE (ver lib/finance/dre.ts):
//
//   Margem Bruta      = Σ blocos com totalizador=MARGEM_BRUTA
//   Despesas          = Σ blocos com totalizador=DESPESAS
//   Geração de Caixa  = Margem Bruta + Despesas
//   Lucro/Prejuízo    = Geração de Caixa + Σ blocos com totalizador=LUCRO_PREJUIZO_EXTRA
//
// DEFAULT_FINANCE_BLOCOS abaixo é só o PONTO DE PARTIDA (seed inicial) —
// depois de criado, o tenant pode renomear/mover/apagar/criar blocos
// livremente, sem afetar este arquivo.

export type DreTotalizador = "MARGEM_BRUTA" | "DESPESAS" | "LUCRO_PREJUIZO_EXTRA";

export const DEFAULT_FINANCE_BLOCOS: {
  nome: string;
  ordem: number;
  totalizador: DreTotalizador;
  sinal: number;
}[] = [
  { nome: "Receita Bruta", ordem: 1, totalizador: "MARGEM_BRUTA", sinal: 1 },
  { nome: "Gastos Variáveis", ordem: 2, totalizador: "MARGEM_BRUTA", sinal: 1 },
  { nome: "Despesas com Veículos e Transporte", ordem: 3, totalizador: "MARGEM_BRUTA", sinal: 1 },
  { nome: "Despesas com Funcionários", ordem: 1, totalizador: "DESPESAS", sinal: 1 },
  { nome: "Despesas Administrativas e Comerciais", ordem: 2, totalizador: "DESPESAS", sinal: 1 },
  { nome: "Despesas com Sede e Estrutura", ordem: 3, totalizador: "DESPESAS", sinal: 1 },
  { nome: "Despesas com Diretoria", ordem: 1, totalizador: "LUCRO_PREJUIZO_EXTRA", sinal: 1 },
  { nome: "Despesas e Receitas Financeiras", ordem: 2, totalizador: "LUCRO_PREJUIZO_EXTRA", sinal: 1 },
];

// `blocoNome` referencia DEFAULT_FINANCE_BLOCOS[].nome acima (resolvido pro
// blocoId real na hora do seed). `ordem` preserva a ordem de exibição da
// planilha original dentro de cada bloco. `tipo` é o sinal esperado
// (RECEITA soma positivo, DESPESA soma negativo) — informativo, não é
// validado com hard-fail na API pra não travar lançamento atípico (ex.:
// estorno de uma despesa).
export const DEFAULT_FINANCE_CATEGORIAS: {
  nome: string;
  tipo: "RECEITA" | "DESPESA";
  blocoNome: string;
  ordem: number;
}[] = [
  // Receita Bruta
  { nome: "Diárias de Plataformas", tipo: "RECEITA", blocoNome: "Receita Bruta", ordem: 1 },
  { nome: "Reserva Direta", tipo: "RECEITA", blocoNome: "Receita Bruta", ordem: 2 },
  { nome: "Frigobar", tipo: "RECEITA", blocoNome: "Receita Bruta", ordem: 3 },
  { nome: "Café da Manhã", tipo: "RECEITA", blocoNome: "Receita Bruta", ordem: 4 },
  { nome: "Multas Recebidas", tipo: "RECEITA", blocoNome: "Receita Bruta", ordem: 5 },

  // Gastos Variáveis
  { nome: "Simples Nacional - DAS", tipo: "DESPESA", blocoNome: "Gastos Variáveis", ordem: 1 },
  { nome: "IPTU (flats)", tipo: "DESPESA", blocoNome: "Gastos Variáveis", ordem: 2 },
  { nome: "Caução (Flats)", tipo: "DESPESA", blocoNome: "Gastos Variáveis", ordem: 3 },
  { nome: "Aluguel (Flats)", tipo: "DESPESA", blocoNome: "Gastos Variáveis", ordem: 4 },
  { nome: "Água e saneamento (Flats)", tipo: "DESPESA", blocoNome: "Gastos Variáveis", ordem: 5 },
  { nome: "Condomínio (Flats)", tipo: "DESPESA", blocoNome: "Gastos Variáveis", ordem: 6 },
  { nome: "Energia Elétrica (Flats)", tipo: "DESPESA", blocoNome: "Gastos Variáveis", ordem: 7 },
  { nome: "Internet (Flats)", tipo: "DESPESA", blocoNome: "Gastos Variáveis", ordem: 8 },
  { nome: "Manutenção Predial (Flats)", tipo: "DESPESA", blocoNome: "Gastos Variáveis", ordem: 9 },
  { nome: "Enxoval", tipo: "DESPESA", blocoNome: "Gastos Variáveis", ordem: 10 },
  { nome: "Comissões de Vendedores", tipo: "DESPESA", blocoNome: "Gastos Variáveis", ordem: 11 },
  { nome: "EPI's", tipo: "DESPESA", blocoNome: "Gastos Variáveis", ordem: 12 },
  { nome: "Lavanderia", tipo: "DESPESA", blocoNome: "Gastos Variáveis", ordem: 13 },
  { nome: "Lavanderia Especial (manchas)", tipo: "DESPESA", blocoNome: "Gastos Variáveis", ordem: 14 },
  { nome: "Manutenção de Equipamentos", tipo: "DESPESA", blocoNome: "Gastos Variáveis", ordem: 15 },
  { nome: "Materiais de limpeza e de higiene", tipo: "DESPESA", blocoNome: "Gastos Variáveis", ordem: 16 },
  { nome: "Presentes a Hóspedes", tipo: "DESPESA", blocoNome: "Gastos Variáveis", ordem: 17 },
  { nome: "Materiais para Revenda (frigobar)", tipo: "DESPESA", blocoNome: "Gastos Variáveis", ordem: 18 },

  // Despesas com Veículos e Transporte
  { nome: "Combustíveis", tipo: "DESPESA", blocoNome: "Despesas com Veículos e Transporte", ordem: 1 },
  { nome: "Estacionamento", tipo: "DESPESA", blocoNome: "Despesas com Veículos e Transporte", ordem: 2 },
  { nome: "Fretes Pagos", tipo: "DESPESA", blocoNome: "Despesas com Veículos e Transporte", ordem: 3 },
  { nome: "Transporte urbano (táxi, uber, blablacar)", tipo: "DESPESA", blocoNome: "Despesas com Veículos e Transporte", ordem: 4 },

  // Despesas com Funcionários
  { nome: "13º Salário", tipo: "DESPESA", blocoNome: "Despesas com Funcionários", ordem: 1 },
  { nome: "Adiantamento Salarial", tipo: "DESPESA", blocoNome: "Despesas com Funcionários", ordem: 2 },
  { nome: "Férias", tipo: "DESPESA", blocoNome: "Despesas com Funcionários", ordem: 3 },
  { nome: "FGTS e Multa de FGTS", tipo: "DESPESA", blocoNome: "Despesas com Funcionários", ordem: 4 },
  { nome: "INSS sobre salários", tipo: "DESPESA", blocoNome: "Despesas com Funcionários", ordem: 5 },
  { nome: "IRRF sobre salários", tipo: "DESPESA", blocoNome: "Despesas com Funcionários", ordem: 6 },
  { nome: "PLR - Participação nos Lucros e Resultados", tipo: "DESPESA", blocoNome: "Despesas com Funcionários", ordem: 7 },
  { nome: "Rescisões", tipo: "DESPESA", blocoNome: "Despesas com Funcionários", ordem: 8 },
  { nome: "Salários", tipo: "DESPESA", blocoNome: "Despesas com Funcionários", ordem: 9 },
  { nome: "Confraternizações", tipo: "DESPESA", blocoNome: "Despesas com Funcionários", ordem: 10 },
  { nome: "Contribuição sindical", tipo: "DESPESA", blocoNome: "Despesas com Funcionários", ordem: 11 },
  { nome: "Cursos e treinamentos", tipo: "DESPESA", blocoNome: "Despesas com Funcionários", ordem: 12 },
  { nome: "Exames médicos", tipo: "DESPESA", blocoNome: "Despesas com Funcionários", ordem: 13 },
  { nome: "Farmácia", tipo: "DESPESA", blocoNome: "Despesas com Funcionários", ordem: 14 },
  { nome: "Gratificações", tipo: "DESPESA", blocoNome: "Despesas com Funcionários", ordem: 15 },
  { nome: "Plano de saúde colaboradores", tipo: "DESPESA", blocoNome: "Despesas com Funcionários", ordem: 16 },
  { nome: "Plano odontológico colaboradores", tipo: "DESPESA", blocoNome: "Despesas com Funcionários", ordem: 17 },
  { nome: "Seguro de vida", tipo: "DESPESA", blocoNome: "Despesas com Funcionários", ordem: 18 },
  { nome: "Uniformes", tipo: "DESPESA", blocoNome: "Despesas com Funcionários", ordem: 19 },
  { nome: "Ajuda de Custo", tipo: "DESPESA", blocoNome: "Despesas com Funcionários", ordem: 20 },
  { nome: "Vale-transporte", tipo: "DESPESA", blocoNome: "Despesas com Funcionários", ordem: 21 },

  // Despesas Administrativas e Comerciais
  { nome: "Cartório", tipo: "DESPESA", blocoNome: "Despesas Administrativas e Comerciais", ordem: 1 },
  { nome: "Copa e cozinha", tipo: "DESPESA", blocoNome: "Despesas Administrativas e Comerciais", ordem: 2 },
  { nome: "Honorários advocatícios", tipo: "DESPESA", blocoNome: "Despesas Administrativas e Comerciais", ordem: 3 },
  { nome: "Honorários consultoria", tipo: "DESPESA", blocoNome: "Despesas Administrativas e Comerciais", ordem: 4 },
  { nome: "Honorários contábeis", tipo: "DESPESA", blocoNome: "Despesas Administrativas e Comerciais", ordem: 5 },
  { nome: "Honorários (outros)", tipo: "DESPESA", blocoNome: "Despesas Administrativas e Comerciais", ordem: 6 },
  { nome: "Investimentos nos Flats", tipo: "DESPESA", blocoNome: "Despesas Administrativas e Comerciais", ordem: 7 },
  { nome: "Lanches e refeições", tipo: "DESPESA", blocoNome: "Despesas Administrativas e Comerciais", ordem: 8 },
  { nome: "Materiais de escritório", tipo: "DESPESA", blocoNome: "Despesas Administrativas e Comerciais", ordem: 9 },
  { nome: "Computadores e Periféricos", tipo: "DESPESA", blocoNome: "Despesas Administrativas e Comerciais", ordem: 10 },
  { nome: "Telefonia móvel", tipo: "DESPESA", blocoNome: "Despesas Administrativas e Comerciais", ordem: 11 },
  { nome: "Marketing e publicidade", tipo: "DESPESA", blocoNome: "Despesas Administrativas e Comerciais", ordem: 12 },
  { nome: "Manutenção de veículos", tipo: "DESPESA", blocoNome: "Despesas Administrativas e Comerciais", ordem: 13 },
  { nome: "Multas de trânsito", tipo: "DESPESA", blocoNome: "Despesas Administrativas e Comerciais", ordem: 14 },
  { nome: "Multas pagas", tipo: "DESPESA", blocoNome: "Despesas Administrativas e Comerciais", ordem: 15 },
  { nome: "Seguros de veículos", tipo: "DESPESA", blocoNome: "Despesas Administrativas e Comerciais", ordem: 16 },
  { nome: "Software / Licença de Uso", tipo: "DESPESA", blocoNome: "Despesas Administrativas e Comerciais", ordem: 17 },
  { nome: "IPVA / DPVAT / Licenciamento", tipo: "DESPESA", blocoNome: "Despesas Administrativas e Comerciais", ordem: 18 },

  // Despesas com Sede e Estrutura
  { nome: "Água e saneamento (Sede)", tipo: "DESPESA", blocoNome: "Despesas com Sede e Estrutura", ordem: 1 },
  { nome: "Aluguel (Sede)", tipo: "DESPESA", blocoNome: "Despesas com Sede e Estrutura", ordem: 2 },
  { nome: "Alvará de funcionamento", tipo: "DESPESA", blocoNome: "Despesas com Sede e Estrutura", ordem: 3 },
  { nome: "Infraestrutura de Manutenção e Serviços", tipo: "DESPESA", blocoNome: "Despesas com Sede e Estrutura", ordem: 4 },
  { nome: "Energia Elétrica (Sede)", tipo: "DESPESA", blocoNome: "Despesas com Sede e Estrutura", ordem: 5 },
  { nome: "Internet (Sede)", tipo: "DESPESA", blocoNome: "Despesas com Sede e Estrutura", ordem: 6 },
  { nome: "IPTU (Sede)", tipo: "DESPESA", blocoNome: "Despesas com Sede e Estrutura", ordem: 7 },
  { nome: "Terrenos", tipo: "DESPESA", blocoNome: "Despesas com Sede e Estrutura", ordem: 8 },
  { nome: "Bens de Pequeno Valor", tipo: "DESPESA", blocoNome: "Despesas com Sede e Estrutura", ordem: 9 },
  { nome: "Manutenção e reformas (Sede)", tipo: "DESPESA", blocoNome: "Despesas com Sede e Estrutura", ordem: 10 },

  // Despesas com Diretoria
  { nome: "Antecipação de lucros", tipo: "DESPESA", blocoNome: "Despesas com Diretoria", ordem: 1 },
  { nome: "Despesas pessoais dos sócios", tipo: "DESPESA", blocoNome: "Despesas com Diretoria", ordem: 2 },
  { nome: "Dividendos", tipo: "DESPESA", blocoNome: "Despesas com Diretoria", ordem: 3 },
  { nome: "IRRF sobre pré-labore - Darf", tipo: "DESPESA", blocoNome: "Despesas com Diretoria", ordem: 4 },
  { nome: "Plano de saúde sócios", tipo: "DESPESA", blocoNome: "Despesas com Diretoria", ordem: 5 },
  { nome: "Plano odontológico sócios", tipo: "DESPESA", blocoNome: "Despesas com Diretoria", ordem: 6 },
  { nome: "Pró-labore", tipo: "DESPESA", blocoNome: "Despesas com Diretoria", ordem: 7 },

  // Despesas e Receitas Financeiras (bloco misto — sinal varia por categoria)
  { nome: "Aporte ou empréstimos de sócios", tipo: "RECEITA", blocoNome: "Despesas e Receitas Financeiras", ordem: 1 },
  { nome: "Empréstimos Recebidos de Bancos", tipo: "RECEITA", blocoNome: "Despesas e Receitas Financeiras", ordem: 2 },
  { nome: "Impostos sobre aplicações", tipo: "DESPESA", blocoNome: "Despesas e Receitas Financeiras", ordem: 3 },
  { nome: "Empréstimos Pagos a Bancos", tipo: "DESPESA", blocoNome: "Despesas e Receitas Financeiras", ordem: 4 },
  { nome: "Juros pagos", tipo: "DESPESA", blocoNome: "Despesas e Receitas Financeiras", ordem: 5 },
  { nome: "Juros Recebidos", tipo: "RECEITA", blocoNome: "Despesas e Receitas Financeiras", ordem: 6 },
  { nome: "Pagamentos indevidos", tipo: "DESPESA", blocoNome: "Despesas e Receitas Financeiras", ordem: 7 },
  { nome: "Descontos obtidos", tipo: "RECEITA", blocoNome: "Despesas e Receitas Financeiras", ordem: 8 },
  { nome: "Reembolso de pagamentos indevidos", tipo: "RECEITA", blocoNome: "Despesas e Receitas Financeiras", ordem: 9 },
  { nome: "Rendimentos de Aplicações", tipo: "RECEITA", blocoNome: "Despesas e Receitas Financeiras", ordem: 10 },
  { nome: "Taxas Financeiras", tipo: "DESPESA", blocoNome: "Despesas e Receitas Financeiras", ordem: 11 },
];
