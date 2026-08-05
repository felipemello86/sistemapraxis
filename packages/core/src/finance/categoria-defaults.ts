// Catálogo padrão de categorias financeiras — taxonomia extraída e
// verificada aritmeticamente a partir da planilha real do Felipe
// ("DRE Julho 2026.xlsx", exportada do Conta Azul, jul/2026). Usado como
// seed pro módulo Financeiro (ver scripts/seed-finance-categorias.ts).
//
// `bloco` é o vocabulário usado por lib/finance/dre.ts pra montar a fórmula
// fixa da DRE do Felipe (não são regras contábeis oficiais):
//
//   Margem Bruta      = RECEITA_BRUTA + GASTOS_VARIAVEIS + DESPESAS_VEICULOS
//   Despesas          = DESPESAS_FUNCIONARIOS + DESPESAS_ADMINISTRATIVAS + DESPESAS_SEDE
//   Geração de Caixa  = Margem Bruta + Despesas
//   Lucro/Prejuízo    = Geração de Caixa + DESPESAS_DIRETORIA + FINANCEIRAS
//
// `ordem` preserva a ordem de exibição da planilha original dentro de cada
// bloco. `tipo` é o sinal esperado (RECEITA soma positivo, DESPESA soma
// negativo) — informativo, não é validado com hard-fail na API pra não
// travar lançamento atípico (ex.: estorno de uma despesa).

export const DEFAULT_FINANCE_CATEGORIAS: {
  nome: string;
  tipo: "RECEITA" | "DESPESA";
  bloco: string;
  ordem: number;
}[] = [
  // Receita Bruta
  { nome: "Diárias de Plataformas", tipo: "RECEITA", bloco: "RECEITA_BRUTA", ordem: 1 },
  { nome: "Reserva Direta", tipo: "RECEITA", bloco: "RECEITA_BRUTA", ordem: 2 },
  { nome: "Frigobar", tipo: "RECEITA", bloco: "RECEITA_BRUTA", ordem: 3 },
  { nome: "Café da Manhã", tipo: "RECEITA", bloco: "RECEITA_BRUTA", ordem: 4 },
  { nome: "Multas Recebidas", tipo: "RECEITA", bloco: "RECEITA_BRUTA", ordem: 5 },

  // Gastos Variáveis
  { nome: "Simples Nacional - DAS", tipo: "DESPESA", bloco: "GASTOS_VARIAVEIS", ordem: 1 },
  { nome: "IPTU (flats)", tipo: "DESPESA", bloco: "GASTOS_VARIAVEIS", ordem: 2 },
  { nome: "Caução (Flats)", tipo: "DESPESA", bloco: "GASTOS_VARIAVEIS", ordem: 3 },
  { nome: "Aluguel (Flats)", tipo: "DESPESA", bloco: "GASTOS_VARIAVEIS", ordem: 4 },
  { nome: "Água e saneamento (Flats)", tipo: "DESPESA", bloco: "GASTOS_VARIAVEIS", ordem: 5 },
  { nome: "Condomínio (Flats)", tipo: "DESPESA", bloco: "GASTOS_VARIAVEIS", ordem: 6 },
  { nome: "Energia Elétrica (Flats)", tipo: "DESPESA", bloco: "GASTOS_VARIAVEIS", ordem: 7 },
  { nome: "Internet (Flats)", tipo: "DESPESA", bloco: "GASTOS_VARIAVEIS", ordem: 8 },
  { nome: "Manutenção Predial (Flats)", tipo: "DESPESA", bloco: "GASTOS_VARIAVEIS", ordem: 9 },
  { nome: "Enxoval", tipo: "DESPESA", bloco: "GASTOS_VARIAVEIS", ordem: 10 },
  { nome: "Comissões de Vendedores", tipo: "DESPESA", bloco: "GASTOS_VARIAVEIS", ordem: 11 },
  { nome: "EPI's", tipo: "DESPESA", bloco: "GASTOS_VARIAVEIS", ordem: 12 },
  { nome: "Lavanderia", tipo: "DESPESA", bloco: "GASTOS_VARIAVEIS", ordem: 13 },
  { nome: "Lavanderia Especial (manchas)", tipo: "DESPESA", bloco: "GASTOS_VARIAVEIS", ordem: 14 },
  { nome: "Manutenção de Equipamentos", tipo: "DESPESA", bloco: "GASTOS_VARIAVEIS", ordem: 15 },
  { nome: "Materiais de limpeza e de higiene", tipo: "DESPESA", bloco: "GASTOS_VARIAVEIS", ordem: 16 },
  { nome: "Presentes a Hóspedes", tipo: "DESPESA", bloco: "GASTOS_VARIAVEIS", ordem: 17 },
  { nome: "Materiais para Revenda (frigobar)", tipo: "DESPESA", bloco: "GASTOS_VARIAVEIS", ordem: 18 },

  // Despesas com veículos e transporte
  { nome: "Combustíveis", tipo: "DESPESA", bloco: "DESPESAS_VEICULOS", ordem: 1 },
  { nome: "Estacionamento", tipo: "DESPESA", bloco: "DESPESAS_VEICULOS", ordem: 2 },
  { nome: "Fretes Pagos", tipo: "DESPESA", bloco: "DESPESAS_VEICULOS", ordem: 3 },
  { nome: "Transporte urbano (táxi, uber, blablacar)", tipo: "DESPESA", bloco: "DESPESAS_VEICULOS", ordem: 4 },

  // Despesas com funcionários
  { nome: "13º Salário", tipo: "DESPESA", bloco: "DESPESAS_FUNCIONARIOS", ordem: 1 },
  { nome: "Adiantamento Salarial", tipo: "DESPESA", bloco: "DESPESAS_FUNCIONARIOS", ordem: 2 },
  { nome: "Férias", tipo: "DESPESA", bloco: "DESPESAS_FUNCIONARIOS", ordem: 3 },
  { nome: "FGTS e Multa de FGTS", tipo: "DESPESA", bloco: "DESPESAS_FUNCIONARIOS", ordem: 4 },
  { nome: "INSS sobre salários", tipo: "DESPESA", bloco: "DESPESAS_FUNCIONARIOS", ordem: 5 },
  { nome: "IRRF sobre salários", tipo: "DESPESA", bloco: "DESPESAS_FUNCIONARIOS", ordem: 6 },
  { nome: "PLR - Participação nos Lucros e Resultados", tipo: "DESPESA", bloco: "DESPESAS_FUNCIONARIOS", ordem: 7 },
  { nome: "Rescisões", tipo: "DESPESA", bloco: "DESPESAS_FUNCIONARIOS", ordem: 8 },
  { nome: "Salários", tipo: "DESPESA", bloco: "DESPESAS_FUNCIONARIOS", ordem: 9 },
  { nome: "Confraternizações", tipo: "DESPESA", bloco: "DESPESAS_FUNCIONARIOS", ordem: 10 },
  { nome: "Contribuição sindical", tipo: "DESPESA", bloco: "DESPESAS_FUNCIONARIOS", ordem: 11 },
  { nome: "Cursos e treinamentos", tipo: "DESPESA", bloco: "DESPESAS_FUNCIONARIOS", ordem: 12 },
  { nome: "Exames médicos", tipo: "DESPESA", bloco: "DESPESAS_FUNCIONARIOS", ordem: 13 },
  { nome: "Farmácia", tipo: "DESPESA", bloco: "DESPESAS_FUNCIONARIOS", ordem: 14 },
  { nome: "Gratificações", tipo: "DESPESA", bloco: "DESPESAS_FUNCIONARIOS", ordem: 15 },
  { nome: "Plano de saúde colaboradores", tipo: "DESPESA", bloco: "DESPESAS_FUNCIONARIOS", ordem: 16 },
  { nome: "Plano odontológico colaboradores", tipo: "DESPESA", bloco: "DESPESAS_FUNCIONARIOS", ordem: 17 },
  { nome: "Seguro de vida", tipo: "DESPESA", bloco: "DESPESAS_FUNCIONARIOS", ordem: 18 },
  { nome: "Uniformes", tipo: "DESPESA", bloco: "DESPESAS_FUNCIONARIOS", ordem: 19 },
  { nome: "Ajuda de Custo", tipo: "DESPESA", bloco: "DESPESAS_FUNCIONARIOS", ordem: 20 },
  { nome: "Vale-transporte", tipo: "DESPESA", bloco: "DESPESAS_FUNCIONARIOS", ordem: 21 },

  // Despesas Administrativas e Comerciais
  { nome: "Cartório", tipo: "DESPESA", bloco: "DESPESAS_ADMINISTRATIVAS", ordem: 1 },
  { nome: "Copa e cozinha", tipo: "DESPESA", bloco: "DESPESAS_ADMINISTRATIVAS", ordem: 2 },
  { nome: "Honorários advocatícios", tipo: "DESPESA", bloco: "DESPESAS_ADMINISTRATIVAS", ordem: 3 },
  { nome: "Honorários consultoria", tipo: "DESPESA", bloco: "DESPESAS_ADMINISTRATIVAS", ordem: 4 },
  { nome: "Honorários contábeis", tipo: "DESPESA", bloco: "DESPESAS_ADMINISTRATIVAS", ordem: 5 },
  { nome: "Honorários (outros)", tipo: "DESPESA", bloco: "DESPESAS_ADMINISTRATIVAS", ordem: 6 },
  { nome: "Investimentos nos Flats", tipo: "DESPESA", bloco: "DESPESAS_ADMINISTRATIVAS", ordem: 7 },
  { nome: "Lanches e refeições", tipo: "DESPESA", bloco: "DESPESAS_ADMINISTRATIVAS", ordem: 8 },
  { nome: "Materiais de escritório", tipo: "DESPESA", bloco: "DESPESAS_ADMINISTRATIVAS", ordem: 9 },
  { nome: "Computadores e Periféricos", tipo: "DESPESA", bloco: "DESPESAS_ADMINISTRATIVAS", ordem: 10 },
  { nome: "Telefonia móvel", tipo: "DESPESA", bloco: "DESPESAS_ADMINISTRATIVAS", ordem: 11 },
  { nome: "Marketing e publicidade", tipo: "DESPESA", bloco: "DESPESAS_ADMINISTRATIVAS", ordem: 12 },
  { nome: "Manutenção de veículos", tipo: "DESPESA", bloco: "DESPESAS_ADMINISTRATIVAS", ordem: 13 },
  { nome: "Multas de trânsito", tipo: "DESPESA", bloco: "DESPESAS_ADMINISTRATIVAS", ordem: 14 },
  { nome: "Multas pagas", tipo: "DESPESA", bloco: "DESPESAS_ADMINISTRATIVAS", ordem: 15 },
  { nome: "Seguros de veículos", tipo: "DESPESA", bloco: "DESPESAS_ADMINISTRATIVAS", ordem: 16 },
  { nome: "Software / Licença de Uso", tipo: "DESPESA", bloco: "DESPESAS_ADMINISTRATIVAS", ordem: 17 },
  { nome: "IPVA / DPVAT / Licenciamento", tipo: "DESPESA", bloco: "DESPESAS_ADMINISTRATIVAS", ordem: 18 },

  // Despesas com Sede e Estrutura
  { nome: "Água e saneamento (Sede)", tipo: "DESPESA", bloco: "DESPESAS_SEDE", ordem: 1 },
  { nome: "Aluguel (Sede)", tipo: "DESPESA", bloco: "DESPESAS_SEDE", ordem: 2 },
  { nome: "Alvará de funcionamento", tipo: "DESPESA", bloco: "DESPESAS_SEDE", ordem: 3 },
  { nome: "Infraestrutura de Manutenção e Serviços", tipo: "DESPESA", bloco: "DESPESAS_SEDE", ordem: 4 },
  { nome: "Energia Elétrica (Sede)", tipo: "DESPESA", bloco: "DESPESAS_SEDE", ordem: 5 },
  { nome: "Internet (Sede)", tipo: "DESPESA", bloco: "DESPESAS_SEDE", ordem: 6 },
  { nome: "IPTU (Sede)", tipo: "DESPESA", bloco: "DESPESAS_SEDE", ordem: 7 },
  { nome: "Terrenos", tipo: "DESPESA", bloco: "DESPESAS_SEDE", ordem: 8 },
  { nome: "Bens de Pequeno Valor", tipo: "DESPESA", bloco: "DESPESAS_SEDE", ordem: 9 },
  { nome: "Manutenção e reformas (Sede)", tipo: "DESPESA", bloco: "DESPESAS_SEDE", ordem: 10 },

  // Despesas com Diretoria
  { nome: "Antecipação de lucros", tipo: "DESPESA", bloco: "DESPESAS_DIRETORIA", ordem: 1 },
  { nome: "Despesas pessoais dos sócios", tipo: "DESPESA", bloco: "DESPESAS_DIRETORIA", ordem: 2 },
  { nome: "Dividendos", tipo: "DESPESA", bloco: "DESPESAS_DIRETORIA", ordem: 3 },
  { nome: "IRRF sobre pré-labore - Darf", tipo: "DESPESA", bloco: "DESPESAS_DIRETORIA", ordem: 4 },
  { nome: "Plano de saúde sócios", tipo: "DESPESA", bloco: "DESPESAS_DIRETORIA", ordem: 5 },
  { nome: "Plano odontológico sócios", tipo: "DESPESA", bloco: "DESPESAS_DIRETORIA", ordem: 6 },
  { nome: "Pró-labore", tipo: "DESPESA", bloco: "DESPESAS_DIRETORIA", ordem: 7 },

  // Despesas e Receitas Financeiras (bloco misto — sinal varia por categoria)
  { nome: "Aporte ou empréstimos de sócios", tipo: "RECEITA", bloco: "FINANCEIRAS", ordem: 1 },
  { nome: "Empréstimos Recebidos de Bancos", tipo: "RECEITA", bloco: "FINANCEIRAS", ordem: 2 },
  { nome: "Impostos sobre aplicações", tipo: "DESPESA", bloco: "FINANCEIRAS", ordem: 3 },
  { nome: "Empréstimos Pagos a Bancos", tipo: "DESPESA", bloco: "FINANCEIRAS", ordem: 4 },
  { nome: "Juros pagos", tipo: "DESPESA", bloco: "FINANCEIRAS", ordem: 5 },
  { nome: "Juros Recebidos", tipo: "RECEITA", bloco: "FINANCEIRAS", ordem: 6 },
  { nome: "Pagamentos indevidos", tipo: "DESPESA", bloco: "FINANCEIRAS", ordem: 7 },
  { nome: "Descontos obtidos", tipo: "RECEITA", bloco: "FINANCEIRAS", ordem: 8 },
  { nome: "Reembolso de pagamentos indevidos", tipo: "RECEITA", bloco: "FINANCEIRAS", ordem: 9 },
  { nome: "Rendimentos de Aplicações", tipo: "RECEITA", bloco: "FINANCEIRAS", ordem: 10 },
  { nome: "Taxas Financeiras", tipo: "DESPESA", bloco: "FINANCEIRAS", ordem: 11 },
];
