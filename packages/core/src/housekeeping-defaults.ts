// Catálogo padrão de programas de limpeza — usado como seed pra todo tenant
// novo que habilita o módulo Housekeeping (ver uso em tenant.ts, mesmo
// padrão de DEFAULT_MAINTENANCE_ITEMS em maintenance-defaults.ts).
//
// 4 programas, 2 categorias (ver CleaningProgram.tipo no schema Prisma):
//   - Com referencial de tempo (pontuam por calcularScoreUH — 50%
//     velocidade + 50% qualidade, contra a meta HkConfig.targetMinutes):
//       - ARRUMACAO ("Arrumação Iniciante") — com o checklist passo a
//         passo completo, pensado pra treinar camareira nova. Etapas
//         copiadas do catálogo real em uso pela BNB Flex (packages/core/
//         scripts/import-housekeeping-data.ts).
//       - ARRUMACAO_SIMPLES ("Arrumação Simples", pedido do Felipe,
//         04/08/2026) — sem etapas, só início/fim; pra camareira
//         experiente que não precisa do passo a passo.
//   - Sem referencial de tempo:
//       - LIMPEZA_COMPLETA ("Limpeza Específica") — limpezas atípicas/UHs
//         em manutenção; pontua só falhas (calcularScoreQualidade), sem
//         comparar tempo. Sem etapas — tenant novo já nasce sem o
//         hack de "2 etapas falsas" que a BNB Flex tinha por herança do
//         v1 (histórico só, não precisa reproduzir em tenant novo).
//       - SUPER_LIMPEZA ("Super Limpeza ⭐️") — 120 pts fixos, só desconta
//         falha. Sem etapas, mesma lógica acima.
//
// "Simples" é o tipo default hoje pra atribuições novas (ver AtribuicaoView,
// "Simples é o default pra novas atribuições") — isso não muda em função
// deste seed, é decidido em runtime pelo próprio app, não pela ordem de
// criação aqui.

export const DEFAULT_CLEANING_PROGRAMS: {
  nome: string;
  tipo: string;
  steps: { titulo: string; descricao: string; ordem: number }[];
}[] = [
  {
    nome: "Arrumação Iniciante (25 min)",
    tipo: "ARRUMACAO",
    steps: [
      { ordem: 1, titulo: "Box", descricao: "Verifique o piso do box, caso haja manchas, aplique o saponáceo e deixe agir.\nVerificar se há mofo no silicone, caso haja, aplique água sanitária com papel higiênico e deixe agir." },
      { ordem: 2, titulo: "Lixo", descricao: "Retire todo o lixo do quarto e do banheiro e descarte-os no lixo da escada." },
      { ordem: 3, titulo: "Pó", descricao: "Remova o pó dos armários, TV e móveis com espanador e o pano de microfibra dos móveis.\nGaranta que não há acúmulo de poeira." },
      { ordem: 4, titulo: "Cozinha", descricao: "Lave a louça suja (se houver) com detergente e bucha.\nEnxugue a louça com o pano de microfibra da cozinha.\nGuarde a louça organizadamente.\nConfira os copos, talheres, pratos e panelas. Informe governanta em caso de ausência e quebras.\nVerifique a geladeira e limpe-a, caso necessário, com detergente e bucha." },
      { ordem: 5, titulo: "Quarto", descricao: "Varra todo o ambiente com vassoura e retire o pó com a pá.\nArrume a cama conforme o padrão estabelecido.\nLimpar interruptores e tomadas" },
      { ordem: 6, titulo: "Banheiro", descricao: "Lave o box e a pia com sabão líquido.\nLave o vaso sanitário com sabão líquido e cloro.\nLimpe o espelho com pano seco ou sabão líquido se estiver sujo." },
      { ordem: 7, titulo: "Mop", descricao: "Umedecer o mop.\nAspergir o desinfetante diluído no piso de todo o quarto.\nPassar o mop em todo o piso." },
      { ordem: 8, titulo: "Revisão", descricao: "Observe o quarto em busca de algum desvio.\nVerifique se há sujeiras ou itens fora do lugar.\nVerifique se há itens necessitando manutenção e informe à governanta." },
    ],
  },
  {
    nome: "Arrumação Simples (25 min)",
    tipo: "ARRUMACAO_SIMPLES",
    steps: [],
  },
  {
    nome: "Limpeza Específica",
    tipo: "LIMPEZA_COMPLETA",
    steps: [],
  },
  {
    nome: "Super Limpeza ⭐️",
    tipo: "SUPER_LIMPEZA",
    steps: [],
  },
];
