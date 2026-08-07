// Tabela de MCC (Merchant Category Code) — código de 4 dígitos, padrão
// Visa/Mastercard/ISO 18245, que identifica a NATUREZA do estabelecimento
// que fez a venda (ex.: 5411 = supermercado, 5812 = restaurante).
//
// Pedido do Felipe, 06/08/2026: "tem algum campo q vem da pluggy q fale da
// natureza do estabelecimento comercial q fez a venda?" — a Pluggy manda
// esse código em creditCardMetadata.payeeMCC (confirmado ao vivo contra a
// conta real do tenant, 06/08/2026), mas só o NÚMERO — cabe a nós traduzir
// pra algo legível. Cobertura: os MCCs mais comuns no dia a dia de um
// negócio hoteleiro (varejo, alimentação, transporte, serviços, viagem),
// não a lista ISO 18245 inteira (~1000 códigos, muitos irrelevantes aqui,
// ex. "Airlines, not elsewhere classified" código por código de cada
// companhia aérea). Código não mapeado cai no fallback de
// descricaoMcc/generico abaixo — nunca quebra, só fica menos específico.
export const MCC_DESCRICOES: Record<number, string> = {
  // Alimentação / mercado
  5411: "Supermercado",
  5422: "Açougue",
  5441: "Loja de doces",
  5451: "Laticínios",
  5462: "Padaria",
  5499: "Mercearia / conveniência",
  5811: "Serviço de bufê/catering",
  5812: "Restaurante",
  5813: "Bar / casa noturna",
  5814: "Fast food",

  // Combustível / veículos
  5511: "Concessionária de veículos (com serviço)",
  5521: "Concessionária de veículos (sem serviço)",
  5531: "Autopeças e acessórios",
  5541: "Posto de combustível",
  5542: "Posto de combustível automático",
  5571: "Peças e acessórios de moto",
  5599: "Veículos diversos (barcos, motos de neve...)",

  // Vestuário / varejo geral
  5309: "Loja de departamento (duty free)",
  5310: "Loja de descontos",
  5311: "Loja de departamento",
  5331: "Loja de variedades",
  5399: "Loja de departamento diversa",
  5611: "Roupas masculinas",
  5621: "Roupas femininas",
  5631: "Acessórios femininos",
  5641: "Roupas infantis",
  5651: "Roupas em geral (família)",
  5661: "Calçados",
  5691: "Vestuário em geral",
  5699: "Alfaiataria / costura",
  5732: "Eletrônicos",
  5733: "Instrumentos musicais",
  5734: "Lojas de software",
  5735: "Lojas de música/discos",
  5940: "Bicicletas",
  5941: "Artigos esportivos",
  5942: "Livraria",
  5944: "Joalheria / relojoaria",
  5945: "Brinquedos e jogos",
  5946: "Fotografia / câmeras",
  5947: "Presentes e artigos religiosos",
  5949: "Tecidos e aviamentos",
  5992: "Floricultura",
  5993: "Tabacaria",
  5994: "Banca de jornal/revista",
  5995: "Pet shop",
  5999: "Varejo diverso / não especificado",

  // Casa / construção
  5211: "Material de construção",
  5231: "Vidros / tintas / papel de parede",
  5251: "Ferragens",
  5261: "Jardinagem / viveiro",
  5712: "Móveis / decoração",
  5713: "Pisos e carpetes",
  5714: "Tapeçaria / cortinas",
  5719: "Casa e decoração diversos",
  5722: "Eletrodomésticos",
  5039: "Materiais de construção (atacado)",

  // Farmácia / saúde
  5122: "Distribuidora de medicamentos",
  5912: "Farmácia",
  8011: "Médicos",
  8021: "Dentistas",
  8031: "Osteopatas",
  8041: "Quiroprática",
  8042: "Oftalmologia / ótica",
  8043: "Ótica",
  8049: "Podólogos e outros profissionais de saúde",
  8050: "Casas de repouso / cuidado geriátrico",
  8062: "Hospitais",
  8071: "Laboratórios de análises clínicas",
  8099: "Serviços médicos diversos",

  // Serviços profissionais e pessoais
  7230: "Salão de beleza / barbearia",
  7251: "Sapataria / conserto de calçados",
  7296: "Aluguel de roupas",
  7297: "Massagem / spa",
  7298: "Salão de estética",
  7299: "Serviços pessoais diversos",
  7311: "Agência de publicidade",
  7321: "Serviço de proteção ao crédito/cobrança",
  7333: "Fotocópia / design gráfico",
  7338: "Serviços de cópia e impressão",
  7349: "Limpeza e manutenção",
  7372: "Programação de computadores / serviços de TI",
  7379: "Manutenção de equipamentos de informática",
  7392: "Consultoria (exceto advocacia/contabilidade)",
  7399: "Serviços comerciais diversos",
  8111: "Serviços jurídicos / advocacia",
  8244: "Escola de informática",
  8299: "Serviços educacionais diversos",
  8351: "Creche",
  8641: "Associações / clubes civis",
  8661: "Organizações religiosas",
  8699: "Associações diversas",
  8931: "Contabilidade / auditoria / escrituração",
  8999: "Serviços profissionais diversos",

  // Streaming / assinaturas / tecnologia
  4816: "Serviços de rede/informação (provedores)",
  4899: "TV a cabo e outros serviços pagos",
  5968: "Assinatura por marketing direto",
  5817: "Compra digital de jogos",
  7994: "Fliperama / videogame",

  // Viagem / hospedagem / transporte
  3000: "Companhia aérea",
  4111: "Transporte local (ônibus, metrô, ferry)",
  4112: "Trem de passageiros",
  4119: "Ambulância",
  4121: "Táxi / transporte por aplicativo",
  4131: "Ônibus intermunicipal/interestadual",
  4214: "Transportadora / mudanças",
  4411: "Cruzeiro / transporte marítimo",
  4468: "Marina / serviços náuticos",
  4511: "Companhia aérea (voos diversos)",
  4582: "Aeroporto",
  4722: "Agência de viagens",
  4784: "Pedágio",
  4789: "Transporte diverso",
  7011: "Hotel / pousada / motel",
  7012: "Timeshare / multipropriedade",
  7032: "Agência de aluguel de carros (regional)",
  7512: "Locadora de veículos",
  7513: "Locadora de caminhões",
  7519: "Locadora de trailers/motorhomes",
  7523: "Estacionamento",

  // Financeiro / pagamentos
  4829: "Transferência de dinheiro",
  6010: "Saque em instituição financeira",
  6011: "Saque em caixa eletrônico",
  6012: "Instituição financeira — serviços diversos",
  6051: "Compra de moeda estrangeira / cripto",
  6211: "Corretora de valores",
  6300: "Seguros",
  6513: "Aluguel de imóveis",
  6529: "Recarga de conta pré-paga",
  6540: "Recarga de cartão pré-pago",

  // Entretenimento / lazer
  7841: "Locadora de vídeo/streaming",
  7911: "Casas de dança / estúdio",
  7922: "Produção de shows / teatro / ingressos",
  7929: "Bandas / orquestras / entretenimento ao vivo",
  7932: "Boliche",
  7941: "Clube esportivo / estádio",
  7991: "Atração turística",
  7996: "Parque de diversões",
  7997: "Clube recreativo / country club",
  7998: "Aquário",
  7999: "Serviços de recreação diversos",

  // Governo / utilidades / educação
  8211: "Escola (ensino fundamental/médio)",
  8220: "Faculdade / universidade",
  8241: "Curso por correspondência",
  9211: "Pensão alimentícia / decisões judiciais",
  9222: "Multas",
  9311: "Impostos",
  9399: "Serviços governamentais diversos",
  9402: "Correios",
  4900: "Serviços de utilidade pública (água, luz, gás)",
};

/** Descrição em português do MCC — null quando não temos esse código
 * mapeado (não é erro, só não vale a pena mostrar o número cru sem
 * contexto nesse caso). */
export function descricaoMcc(mcc: number | null | undefined): string | null {
  if (mcc == null) return null;
  return MCC_DESCRICOES[mcc] ?? null;
}
