import type { Metadata } from "next";
import { Mulish } from "next/font/google";
import DemoForm from "./DemoForm";
import estilos from "./landing.module.css";

// Landing page pública da Praxis (raiz de sistemaspraxis.com.br).
//
// Direção visual: "calm editorial" — o mesmo partido do template Curricula
// (Lovable) que o Felipe indicou como referência: fundo pergaminho quente,
// muito respiro, hairlines no lugar de caixas, pesos de fonte leves e um
// grande visual sangrando pela direita com esmaecimento. O template original
// usa serifada de display; aqui a tipografia continua Avenir Next (pedido
// explícito do Felipe e fonte do pitch), então o ar editorial vem do layout
// e do contraste de pesos, não da serifada.
//
// Conteúdo: todo do pitch comercial real ("pitch praxis.pptx") — posicionamento,
// dia típico de 30 UHs, "Pessoas e Processos" e os números do case BNB Flex.
// A frase "+ controle. + foco. + resultado." vem do post do Instagram
// @sistemaspraxis. O gráfico do hero é a tela real de "Conformidade ao longo
// do tempo" do módulo de Manutenção (bnbflex).
//
// Tipografia: Avenir Next só existe em Mac/iOS. Mulish entra atrás como
// substituta (mesma família humanista geométrica) pra Windows/Android não
// caírem numa sans genérica.
//
// A rota "/" não é proxyada por nenhum rewrite do next.config.js (todos são
// /:cliente/<modulo> ou /<modulo>), então não conflita com o acesso dos
// clientes (sistemaspraxis.com.br/bnbflex) nem com os módulos.

const mulish = Mulish({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  display: "swap",
  variable: "--praxis-fallback",
});

const NAVY = "#10284D";
const DOURADO = "#D8A63A";
const CREME = "#FBF8F4";
const TINTA = "rgba(16,40,77,0.68)";
const FIO = "1px solid rgba(16,40,77,0.11)";
const FONTE = `'Avenir Next', 'Avenir', var(--praxis-fallback), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;

export const metadata: Metadata = {
  title: "Praxis — Operação hoteleira. Simples. Inteligente. Confiável.",
  description:
    "A suíte que garante o cumprimento do processo de limpeza etapa a etapa, tolerância zero com defeitos e a equipe focada no que importa.",
  openGraph: {
    title: "Praxis — Operação hoteleira",
    description: "Simples. Inteligente. Confiável. + controle. + foco. + resultado.",
    type: "website",
  },
};

const DIA_TIPICO = [
  { valor: "+1.200", rotulo: "itens de controle de manutenção" },
  { valor: "750", rotulo: "tarefas de limpeza por dia" },
  { valor: "60", rotulo: "hóspedes diferentes passando pelas UHs" },
];

const PESSOAS_PROCESSOS = [
  { titulo: "Garantir o cumprimento do processo de limpeza", texto: "Etapa a etapa, em tempo real." },
  { titulo: "Tolerância zero com defeitos e manutenções", texto: "Controle 1000+ itens de forma natural." },
  { titulo: "Manter a equipe focada", texto: "Definição de padrões e metas operacionais." },
  { titulo: "Nota 9,5+", texto: "O resultado surge naturalmente." },
];

const RESULTADOS = [
  { numero: "93%", texto: "de redução nas falhas de governança", detalhe: "de 2.730 para 270 falhas" },
  { numero: "R$ 7.200", texto: "de redução no custo mensal com camareiras", detalhe: "de R$ 16,7 mil para R$ 9,5 mil" },
];

const TELAS = [
  { src: "/praxis-modulos.jpg", alt: "Tela inicial da Praxis com os módulos", titulo: "Tudo em um lugar", texto: "Cada módulo a um toque, na mesma conta." },
  { src: "/praxis-burndown.jpg", alt: "Burndown do dia com UHs concluídas", titulo: "O dia ao vivo", texto: "Quantas UHs faltam e a que horas o hotel fica pronto." },
  { src: "/praxis-performance.jpg", alt: "Ranking de desempenho das camareiras", titulo: "Desempenho com critério", texto: "A mesma régua de tempo e falhas para toda a equipe." },
];

const MODULOS = [
  { nome: "Governança", texto: "Seleção e liberação de UHs, atribuição por camareira, limpeza etapa a etapa com foto, inspeção e ranking diário." },
  { nome: "Manutenção", texto: "Rotas de inspeção, UH 3D com pontos de verificação, kanbans de correção e programação diária de execução." },
  { nome: "Avaliações", texto: "Avaliação de hóspede tratada como processo: cada crítica com responsável, prazo e desfecho registrado." },
  { nome: "Estoque", texto: "Entrada, saída e saldo de todos os insumos — o consumo amarrado à operação." },
  { nome: "Restaurante", texto: "A rotina de A&B sobre a mesma base de pessoas, unidades e indicadores da suíte." },
  { nome: "Central de Inteligência", texto: "A IA como melhor amigo do hoteleiro, 24x7." },
];

function Marca({ altura = 30 }: { altura?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/praxis-logo.png" alt="Praxis" style={{ height: altura, width: "auto", display: "block" }} />;
}

function Sobrancelha({ children, claro = false }: { children: React.ReactNode; claro?: boolean }) {
  return (
    <p
      style={{
        margin: "0 0 20px",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: claro ? "rgba(255,255,255,0.55)" : DOURADO,
      }}
    >
      {children}
    </p>
  );
}

export default function PraxisLanding() {
  return (
    <main className={mulish.variable} style={{ background: CREME, color: NAVY, fontFamily: FONTE, overflowX: "hidden" }}>
      <header style={{ borderBottom: FIO }}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "22px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <Marca />
          <a
            href="#demonstracao"
            style={{ fontSize: 14, fontWeight: 600, color: NAVY, textDecoration: "none", borderBottom: `1px solid ${DOURADO}`, paddingBottom: 3 }}
          >
            Agendar demonstração
          </a>
        </div>
      </header>

      {/* ── Hero: o gráfico de conformidade ocupa a tela inteira por trás do
             texto (protagonista da página). O esmaecimento forte à esquerda
             está gravado no próprio PNG, junto com o eixo Y quase apagado —
             é o que deixa o texto legível por cima sem precisar de véu. ── */}
      <section className={estilos.hero}>
        <div className={estilos.heroFundo}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={estilos.heroImg}
            src="/praxis-evolucao.png"
            alt="Gráfico de conformidade da operação ao longo de 90 dias, subindo de 46% para 93%"
          />
        </div>

        <div className={estilos.heroConteudo}>
          <div className={estilos.heroTexto}>
            <Sobrancelha>Operação hoteleira</Sobrancelha>
            <h1 style={{ margin: "0 0 28px", fontSize: 58, lineHeight: 1.05, fontWeight: 300, letterSpacing: "-0.032em" }}>
              Simples.
              <br />
              Inteligente.
              <br />
              <span style={{ fontWeight: 600 }}>Confiável.</span>
            </h1>
            <p style={{ margin: "0 0 16px", fontSize: 18, lineHeight: 1.7, color: TINTA, fontWeight: 300 }}>
              A Praxis atua permeando todo o processo de Operação Hoteleira, tornando a Administração mais simples,
              prática e eficiente.
            </p>
            <p style={{ margin: "0 0 36px", fontSize: 18, lineHeight: 1.7, color: TINTA, fontWeight: 300 }}>
              Tudo isso baseando-se em dados, inteligência e processos.
            </p>
            <div style={{ display: "flex", gap: 26, flexWrap: "wrap", alignItems: "center" }}>
              <a
                href="#demonstracao"
                style={{ padding: "15px 32px", borderRadius: 4, background: NAVY, color: "#fff", fontSize: 15.5, fontWeight: 600, textDecoration: "none" }}
              >
                Agendar demonstração
              </a>
              <a href="#resultados" style={{ fontSize: 15.5, fontWeight: 600, color: NAVY, textDecoration: "none", borderBottom: `1px solid ${DOURADO}`, paddingBottom: 3 }}>
                Ver o case
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Faixa do Instagram ───────────────────────────────────── */}
      <section style={{ borderBottom: FIO }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "34px 32px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 21, fontWeight: 300, letterSpacing: "0.01em" }}>
            <span style={{ color: DOURADO }}>+</span> controle. <span style={{ color: DOURADO }}>+</span> foco.{" "}
            <span style={{ color: DOURADO }}>+</span> resultado.
          </p>
        </div>
      </section>

      {/* ── O dia típico ─────────────────────────────────────────── */}
      <section style={{ borderBottom: FIO }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "96px 32px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 56, marginBottom: 64 }}>
            <div>
              <Sobrancelha>O ponto de partida</Sobrancelha>
              <h2 style={{ margin: 0, fontSize: 36, fontWeight: 300, letterSpacing: "-0.022em", lineHeight: 1.25 }}>
                O dia típico de uma pousada com 30 UHs
              </h2>
            </div>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.75, color: TINTA, fontWeight: 300, alignSelf: "center" }}>
              É volume demais para tratar numa planilha, num grupo de WhatsApp ou na memória do Hoteleiro.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 0 }}>
            {DIA_TIPICO.map((d, i) => (
              <div key={d.rotulo} style={{ padding: "0 32px", borderLeft: i === 0 ? "none" : FIO }}>
                <div style={{ fontSize: 54, fontWeight: 300, letterSpacing: "-0.035em", lineHeight: 1, marginBottom: 14 }}>{d.valor}</div>
                <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.6, color: TINTA, fontWeight: 300, maxWidth: 220 }}>{d.rotulo}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pessoas e processos ──────────────────────────────────── */}
      <section style={{ borderBottom: FIO }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "96px 32px" }}>
          <Sobrancelha>Pessoas e processos</Sobrancelha>
          <h2 style={{ margin: "0 0 56px", fontSize: 36, fontWeight: 300, letterSpacing: "-0.022em", maxWidth: 560, lineHeight: 1.25 }}>
            O que a Praxis existe para sustentar, todo dia
          </h2>
          <div>
            {PESSOAS_PROCESSOS.map((p, i) => (
              <div
                key={p.titulo}
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px minmax(240px, 1fr) minmax(240px, 1.1fr)",
                  gap: 24,
                  padding: "28px 0",
                  borderTop: i === 0 ? "none" : FIO,
                  alignItems: "baseline",
                }}
              >
                <span style={{ fontSize: 13, color: DOURADO, fontWeight: 600, letterSpacing: "0.08em" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 style={{ margin: 0, fontSize: 19, fontWeight: 600, lineHeight: 1.4 }}>{p.titulo}</h3>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.7, color: TINTA, fontWeight: 300 }}>{p.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Telas ────────────────────────────────────────────────── */}
      <section style={{ borderBottom: FIO }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "96px 32px" }}>
          <Sobrancelha>Por dentro</Sobrancelha>
          <h2 style={{ margin: "0 0 64px", fontSize: 36, fontWeight: 300, letterSpacing: "-0.022em", maxWidth: 560, lineHeight: 1.25 }}>
            A operação inteira, na palma da mão
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 48 }}>
            {TELAS.map((t) => (
              <figure key={t.src} style={{ margin: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={t.src}
                  alt={t.alt}
                  style={{ width: "100%", maxWidth: 260, height: "auto", borderRadius: 10, border: FIO, display: "block", marginBottom: 22 }}
                />
                <figcaption>
                  <div style={{ fontSize: 16.5, fontWeight: 600, marginBottom: 7 }}>{t.titulo}</div>
                  <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65, color: TINTA, fontWeight: 300, maxWidth: 260 }}>{t.texto}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── Case BNB Flex ────────────────────────────────────────── */}
      <section id="resultados" style={{ background: NAVY, color: "#fff" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "96px 32px" }}>
          <Sobrancelha claro>Case real</Sobrancelha>
          <h2 style={{ margin: "0 0 20px", fontSize: 36, fontWeight: 300, letterSpacing: "-0.022em", lineHeight: 1.25 }}>BNB Flex</h2>
          <p style={{ margin: "0 0 64px", fontSize: 17, lineHeight: 1.75, color: "rgba(255,255,255,0.62)", maxWidth: 520, fontWeight: 300 }}>
            Um ano de operação conduzida pela Praxis, medida pelos próprios indicadores do sistema.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 0 }}>
            <div style={{ padding: "0 40px 0 0" }}>
              <div style={{ fontSize: 52, fontWeight: 300, letterSpacing: "-0.035em", color: DOURADO, lineHeight: 1, marginBottom: 16 }}>
                46 → 93
              </div>
              <p style={{ margin: "0 0 6px", fontSize: 16.5, lineHeight: 1.6, color: "#fff", fontWeight: 300, maxWidth: 250 }}>
                no índice de conservação das propriedades
              </p>
              <p style={{ margin: 0, fontSize: 14, color: "rgba(255,255,255,0.5)", fontWeight: 300 }}>em pontos percentuais</p>
            </div>
            {RESULTADOS.map((r) => (
              <div key={r.texto} style={{ padding: "0 40px", borderLeft: "1px solid rgba(255,255,255,0.14)" }}>
                <div style={{ fontSize: 52, fontWeight: 300, letterSpacing: "-0.035em", color: DOURADO, lineHeight: 1, marginBottom: 16 }}>
                  {r.numero}
                </div>
                <p style={{ margin: "0 0 6px", fontSize: 16.5, lineHeight: 1.6, color: "#fff", fontWeight: 300, maxWidth: 250 }}>{r.texto}</p>
                <p style={{ margin: 0, fontSize: 14, color: "rgba(255,255,255,0.5)", fontWeight: 300 }}>{r.detalhe}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Módulos ──────────────────────────────────────────────── */}
      <section style={{ borderBottom: FIO }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "96px 32px" }}>
          <Sobrancelha>A suíte</Sobrancelha>
          <h2 style={{ margin: "0 0 20px", fontSize: 36, fontWeight: 300, letterSpacing: "-0.022em", maxWidth: 560, lineHeight: 1.25 }}>
            Seis módulos, uma operação
          </h2>
          <p style={{ margin: "0 0 56px", fontSize: 17, lineHeight: 1.75, color: TINTA, maxWidth: 520, fontWeight: 300 }}>
            Todos compartilham as mesmas unidades, as mesmas pessoas e os mesmos indicadores. Habilite só os que fazem
            sentido para o seu hotel.
          </p>
          <div>
            {MODULOS.map((m, i) => (
              <div
                key={m.nome}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(200px, 0.6fr) minmax(260px, 1.4fr)",
                  gap: 32,
                  padding: "26px 0",
                  borderTop: i === 0 ? "none" : FIO,
                  alignItems: "baseline",
                }}
              >
                <h3 style={{ margin: 0, fontSize: 19, fontWeight: 600 }}>{m.nome}</h3>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.7, color: TINTA, fontWeight: 300 }}>{m.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA / formulário ─────────────────────────────────────── */}
      <section id="demonstracao" style={{ borderBottom: FIO }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "96px 32px" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <Sobrancelha>Próximo passo</Sobrancelha>
            <h2 style={{ margin: "0 0 16px", fontSize: 36, fontWeight: 300, letterSpacing: "-0.022em", lineHeight: 1.25 }}>
              Veja a Praxis na sua operação
            </h2>
            <p style={{ margin: "0 auto", fontSize: 17, lineHeight: 1.75, color: TINTA, maxWidth: 480, fontWeight: 300 }}>
              Uma conversa de 30 minutos, com o sistema aberto e os cenários do seu hotel.
            </p>
          </div>
          <DemoForm />
        </div>
      </section>

      {/* ── Rodapé ───────────────────────────────────────────────── */}
      <footer>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "48px 32px 64px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 32,
            flexWrap: "wrap",
          }}
        >
          <div>
            <Marca altura={24} />
            <p style={{ margin: "18px 0 0", fontSize: 14, color: TINTA, lineHeight: 1.8, fontWeight: 300 }}>
              <a href="tel:+5584996532808" style={{ color: TINTA }}>
                (84) 99653-2808
              </a>
              <br />
              <a href="mailto:suporte@sistemaspraxis.com.br" style={{ color: TINTA }}>
                suporte@sistemaspraxis.com.br
              </a>
            </p>
          </div>
          <div style={{ textAlign: "right", fontSize: 14, color: TINTA, lineHeight: 1.8, fontWeight: 300 }}>
            <p style={{ margin: 0 }}>
              Já é cliente? Acesse por <code style={{ fontSize: 13.5 }}>sistemaspraxis.com.br/seu-hotel</code>
            </p>
            <a href="/privacidade" style={{ color: TINTA }}>
              Política de privacidade
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
