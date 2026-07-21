// Catálogo padrão de itens de inspeção da Manutenção — usado como seed pra
// todo tenant novo que habilita o módulo. Veio do checklist real usado pelo
// primeiro cliente (BNB Flex, protótipo standalone "Bnb Manutenção"), com 40
// itens em 4 categorias (Estrutura, Cozinha, Quarto, Banheiro). Importado
// manualmente pra bnbflex em 2026-07; a partir daqui, todo tenant novo com
// Manutenção habilitada já nasce com esse catálogo (ver uso em tenant.ts).
//
// category é texto livre no schema (sem lista fixa — ver comentário em
// MaintenanceChecklistItem no schema Prisma), então essas 4 categorias não
// são a única opção: o cliente pode editar/remover/adicionar itens e
// categorias livremente depois em Configurações > Itens.

export const DEFAULT_MAINTENANCE_ITEMS: {
  name: string;
  category: string;
  subDescription: string;
}[] = [
  { name: "Portas", category: "Estrutura", subDescription: "Pintura, maçaneta (interna e externa), madeira" },
  { name: "Fechadura eletrônica", category: "Estrutura", subDescription: "Existente, marcas de uso, funcionamento" },
  { name: "Paredes", category: "Estrutura", subDescription: "Manchas, massa sem lixar, furos/buchas aparentes, mofo, marcas de impacto" },
  { name: "Teto (forro)", category: "Estrutura", subDescription: "Manchas, massa sem lixar, furos, buchas" },
  { name: "Piso", category: "Estrutura", subDescription: "Manchas de tinta, sujeiras difíceis, furos, defeitos na cerâmica/porcelanato" },
  { name: "Tomadas e interruptores", category: "Estrutura", subDescription: "Manchas, fixação, funcionalidade" },
  { name: "Iluminação", category: "Estrutura", subDescription: "Lâmpadas LED amarelas, todas funcionam, manchas de tinta ou sujeira" },
  { name: "Armários da cozinha", category: "Cozinha", subDescription: "Abertura/fechamento, revestimento, puxadores, fixação, manchas" },
  { name: "Janela do corredor", category: "Cozinha", subDescription: "Vedação, vidros, manchas, abertura e fechamento" },
  { name: "Cortina do corredor", category: "Cozinha", subDescription: "Instalada, funciona, manchas, rasgos, componentes quebrados" },
  { name: "Geladeira", category: "Cozinha", subDescription: "Pintura, vedação, portas, prateleiras, pés, sujeiras, manchas" },
  { name: "Pia da cozinha", category: "Cozinha", subDescription: "Vazamento, corrosão, manchas, cuba, fixação, vedação" },
  { name: "Fogão", category: "Cozinha", subDescription: "Corrosão, manchas, funcionamento (acionamento, tamanho da chama)" },
  { name: "Depurador (coifa)", category: "Cozinha", subDescription: "Manchas, funcionamento, fixação" },
  { name: "Micro-ondas", category: "Cozinha", subDescription: "Fixação, manchas, funcionamento" },
  { name: "Janela grande", category: "Quarto", subDescription: "Vedação, vidros, manchas, abertura e fechamento" },
  { name: "Armário (guarda-roupa)", category: "Quarto", subDescription: "Abertura/fechamento, revestimento, puxadores, fixação, manchas" },
  { name: "TV", category: "Quarto", subDescription: "Funcionando, smart, internet, canais abertos, fixação, fiação, tamanho adequado" },
  { name: "Móvel abaixo da TV", category: "Quarto", subDescription: "Madeira, manchas, revestimento, fixação" },
  { name: "Ar-condicionado", category: "Quarto", subDescription: "Funciona, controle existente, sujeira, pintura, vazamento" },
  { name: "Cabeceira da cama", category: "Quarto", subDescription: "Alinhamento, madeira, fixação, interruptores, tomadas, luminárias" },
  { name: "Cama", category: "Quarto", subDescription: "Molas, colchão amassado/duro, pés com defeito, base quebrada" },
  { name: "Travesseiros", category: "Quarto", subDescription: "Volume adequado, 2 unidades, consistência, encardidos, machados" },
  { name: "Cortina do quarto", category: "Quarto", subDescription: "Fixação, abertura/fechamento, ganchinhos, trilho, tecido (mofo/sujeira), tamanho" },
  { name: "Mesa", category: "Quarto", subDescription: "Bem montada, riscos/manchas, nivelamento, fixação" },
  { name: "Cadeiras", category: "Quarto", subDescription: "2 unidades, padronizadas, nivelamento, manchas, quebradas" },
  { name: "Quadro", category: "Quarto", subDescription: "Modelo padrão, manchado, riscado, moldura, fixação e nivelamento" },
  { name: "Papel de parede", category: "Quarto", subDescription: "Fixação (partes soltando), manchado, riscado" },
  { name: "Box", category: "Banheiro", subDescription: "Porta de vidro abre/fecha, manchas, trincas, ralo, maçaneta" },
  { name: "Prateleira do box", category: "Banheiro", subDescription: "Existe, bem fixada, suportes limpos e perfeitos" },
  { name: "Armário do banheiro", category: "Banheiro", subDescription: "Abertura/fechamento, revestimento, puxadores, fixação, manchas" },
  { name: "Pia do banheiro", category: "Banheiro", subDescription: "Vazamento, fixação, corrosão, manchas" },
  { name: "Lixeira do banheiro", category: "Banheiro", subDescription: "Existe, funcionamento, manchas" },
  { name: "Chuveiro", category: "Banheiro", subDescription: "Jato bem distribuído, furos entupidos, aquecimento, manchas permanentes" },
  { name: "Espelho", category: "Banheiro", subDescription: "Tamanho adequado, trincas, manchas, abre e fecha (se tipo armário)" },
  { name: "Ducha higiênica", category: "Banheiro", subDescription: "Existe, fixação, vazamento, manchas, corrosão" },
  { name: "Suportes de toalha e papel", category: "Banheiro", subDescription: "Existem, padrão, fixação, manchas" },
  { name: "Janela do banheiro", category: "Banheiro", subDescription: "Abertura/fechamento, vidro, maçaneta, manchas, fixação, vedação" },
  { name: "Assento do vaso sanitário", category: "Banheiro", subDescription: "Existe, compatível com a bacia, fixação, manchas, trincas" },
  { name: "Vaso sanitário", category: "Banheiro", subDescription: "Vedação, fixação, volume da descarga, entupimento" },
];
