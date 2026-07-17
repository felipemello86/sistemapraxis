/* eslint-disable jsx-a11y/alt-text */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import {
  Document, Page, Text, View, StyleSheet, Svg, Rect, Line, Polyline, G, Circle, Image,
} from "@react-pdf/renderer";
import type { RelatorioData } from "./relatorio-dados";

// Portado de apps/housekeeping/src/lib/relatorio-pdf.tsx (v1) 1:1 — é puro
// (função de dados → JSX de PDF, sem chamada a banco/rede), então não há
// nada específico de v2 pra ajustar. `cam.foto` sempre vem `null` de
// relatorio-dados.ts (v2), então os avatares sempre caem no círculo com
// iniciais em vez de <Image>.

// Alias para usar Text dentro de SVG (react-pdf aceita SVGTextProps no mesmo componente)
const SvgText = Text as React.ComponentType<any>;

// ── Cores ─────────────────────────────────────────────────────────────────────
const C = {
  blue: "#1e40af",
  indigo: "#6366f1",
  green: "#10b981",
  red: "#ef4444",
  amber: "#f59e0b",
  gray: "#6b7280",
  lightGray: "#f3f4f6",
  bg: "#f8fafc",
  white: "#ffffff",
  text: "#111827",
  textSm: "#374151",
};

// ── Estilos ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", padding: 30, fontSize: 9, color: C.text, backgroundColor: C.white },

  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, paddingBottom: 10, borderBottomWidth: 2, borderColor: C.blue },
  hotelNome: { fontSize: 15, fontFamily: "Helvetica-Bold", color: C.blue },
  relTitulo: { fontSize: 9, color: C.gray, marginTop: 2 },
  headerRight: { alignItems: "flex-end" },

  // Sections
  section: { marginBottom: 14 },
  secTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.blue, marginBottom: 6, paddingBottom: 3, borderBottomWidth: 1, borderColor: C.lightGray },
  subTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.indigo, marginTop: 10, marginBottom: 4 },
  subSubTitle: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.gray, marginBottom: 4 },
  colHeader: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.blue, marginBottom: 5, textAlign: "center" as const },

  // Cards
  cardsRow: { flexDirection: "row", gap: 6, marginBottom: 6, flexWrap: "wrap" },
  card: { backgroundColor: C.bg, borderRadius: 3, padding: 7, flex: 1, minWidth: 70 },
  cardLabel: { fontSize: 7, color: C.gray, marginBottom: 2 },
  cardVal: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  cardValSm: { fontSize: 10, fontFamily: "Helvetica-Bold" },

  // Tables
  tHead: { flexDirection: "row", backgroundColor: C.blue, paddingHorizontal: 5, paddingVertical: 4 },
  tRow: { flexDirection: "row", paddingHorizontal: 5, paddingVertical: 3, borderBottomWidth: 1, borderColor: C.lightGray },
  tRowAlt: { flexDirection: "row", paddingHorizontal: 5, paddingVertical: 3, borderBottomWidth: 1, borderColor: C.lightGray, backgroundColor: C.bg },
  th: { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: C.white },
  td: { fontSize: 8, color: C.textSm },
  tdB: { fontSize: 8, color: C.textSm, fontFamily: "Helvetica-Bold" },

  // Bar chart
  barRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  barLabel: { fontSize: 7.5, width: 85, color: C.textSm },
  barTrack: { height: 11, backgroundColor: C.lightGray, borderRadius: 2, flex: 1 },
  barVal: { fontSize: 7.5, marginLeft: 5, color: C.gray, width: 50 },

  // Footer
  footer: { position: "absolute", bottom: 20, left: 30, right: 30, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 7, color: C.gray },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(seg: number | null): string {
  if (seg === null || seg === undefined) return "—";
  if (seg < 60) return `${seg}s`;
  const m = Math.floor(seg / 60), ss = seg % 60;
  return ss > 0 ? `${m}m ${ss}s` : `${m}min`;
}

function fmtMmSs(seg: number | null): string {
  if (seg === null || seg === undefined) return "—";
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtDeltaPdf(absDelta: number): string {
  if (absDelta < 60) return `${absDelta}s`;
  const m = Math.floor(absDelta / 60);
  const s = absDelta % 60;
  return s > 0 ? `${m}m${s}s` : `${m}m`;
}

function scoreColor(score: number | null): string {
  if (!score) return C.gray;
  if (score >= 90) return C.green;
  if (score >= 75) return C.indigo;
  if (score >= 60) return C.amber;
  return C.red;
}

// Converte minutos desde 08:00 BRT em string de horário
function minToHora(min: number): string {
  const totalMin = 8 * 60 + min;
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Cores por camareira (mesma paleta da tela)
const CAM_COLORS = ["#6366f1", "#10b981", "#f97316", "#ec4899", "#8b5cf6", "#06b6d4"];

// ── Componentes ───────────────────────────────────────────────────────────────
function Footer({ hotel }: { hotel: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>Sistema de Gestão de Camareiras — {hotel}</Text>
      <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Pág. ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function HBarChart({ items, color, labelWidth = 85 }: { items: { label: string; value: number; display: string }[]; color: string; labelWidth?: number }) {
  if (!items.length) return null;
  const maxVal = Math.max(...items.map((i) => i.value), 1);
  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={s.barRow}>
          <Text style={[s.barLabel, { width: labelWidth, overflow: "hidden" }]}>{item.label}</Text>
          <View style={s.barTrack}>
            <View style={{ height: 11, borderRadius: 2, backgroundColor: color, width: `${(item.value / maxVal) * 100}%` }} />
          </View>
          <Text style={s.barVal}>{item.display}</Text>
        </View>
      ))}
    </View>
  );
}

function GroupedVBarChartSvg({
  etapas,
  nomes,
  tempos,
}: {
  etapas: string[];
  nomes: string[];
  tempos: (number | null)[][];
}) {
  const W = 475, H = 190;
  const PL = 32, PR = 8, PT = 10, PB = 52;
  const cW = W - PL - PR, cH = H - PT - PB;

  const allValues = tempos.flat().filter((v): v is number => v !== null);
  if (allValues.length === 0) return null;
  const maxVal = Math.max(...allValues);

  const nGroups = etapas.length;
  const nCams = nomes.length;
  const groupW = cW / nGroups;
  const innerPad = 1.5;
  const barW = Math.max(4, (groupW - innerPad * (nCams + 1)) / nCams);

  const toBarX = (gi: number, ci: number) =>
    PL + gi * groupW + innerPad * (ci + 1) + ci * barW;
  const toY = (val: number) => PT + (1 - val / maxVal) * cH;
  const toBarH = (val: number) => Math.max(1, (val / maxVal) * cH);

  const maxMin = Math.ceil(maxVal / 60);
  const yTickStep = maxMin <= 3 ? 1 : maxMin <= 8 ? 2 : 5;
  const yTicks: number[] = [];
  for (let m = 0; m <= maxMin; m += yTickStep) yTicks.push(m * 60);

  return (
    <Svg width={W} height={H} style={{ border: "1pt solid #e5e7eb" }}>
      {/* Eixos */}
      <Line x1={PL} y1={PT} x2={PL} y2={H - PB} stroke="#9ca3af" strokeWidth={0.8} />
      <Line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} stroke="#9ca3af" strokeWidth={0.8} />

      {/* Y grid + rótulos */}
      {yTicks.map((v) => (
        <G key={`y-${v}`}>
          <Line x1={PL} y1={toY(v)} x2={W - PR} y2={toY(v)} stroke="#e5e7eb" strokeWidth={0.5} />
          <SvgText x={PL - 3} y={toY(v) + 2.5} fontSize={6} fill={C.gray} textAnchor="end">
            {`${Math.floor(v / 60)}m`}
          </SvgText>
        </G>
      ))}

      {/* Barras + rótulos X rotacionados */}
      {etapas.map((etapa, gi) => {
        const labelX = PL + gi * groupW + groupW / 2;
        const label = etapa.length > 9 ? etapa.slice(0, 8) + "…" : etapa;
        return (
          <G key={`g-${gi}`}>
            {nomes.map((_, ci) => {
              const val = tempos[gi]?.[ci];
              if (val === null || val === undefined) return null;
              const x = toBarX(gi, ci);
              const y = toY(val);
              const h = toBarH(val);
              return (
                <Rect
                  key={`b-${gi}-${ci}`}
                  x={x} y={y} width={barW} height={h}
                  fill={CAM_COLORS[ci % CAM_COLORS.length]}
                  rx={1}
                />
              );
            })}
            <SvgText
              x={labelX}
              y={H - PB + 7}
              fontSize={5.5}
              fill={C.gray}
              textAnchor="end"
              transform={`rotate(-40, ${labelX}, ${H - PB + 7})`}
            >
              {label}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

function BurndownSvg({ eventos, totalUHs, totalMinutos }: {
  eventos: { minutos: number; uhsRestantes: number }[];
  totalUHs: number;
  totalMinutos: number;
}) {
  if (eventos.length < 2) return null;
  const W = 475, H = 150;
  const PL = 28, PR = 8, PT = 8, PB = 28;
  const cW = W - PL - PR, cH = H - PT - PB;
  const xMax = Math.max(totalMinutos, 60);

  const toX = (min: number) => PL + (min / xMax) * cW;
  const toY = (uhs: number) => PT + ((totalUHs - uhs) / totalUHs) * cH;

  // Step-function polyline: horizontal then vertical
  const pts: string[] = [];
  for (let i = 0; i < eventos.length; i++) {
    const ev = eventos[i];
    if (i > 0) {
      pts.push(`${toX(ev.minutos).toFixed(1)},${toY(eventos[i - 1].uhsRestantes).toFixed(1)}`);
    }
    pts.push(`${toX(ev.minutos).toFixed(1)},${toY(ev.uhsRestantes).toFixed(1)}`);
  }
  pts.push(`${toX(xMax).toFixed(1)},${toY(eventos[eventos.length - 1].uhsRestantes).toFixed(1)}`);

  // X ticks every 60 min
  const xTicks: number[] = [];
  for (let m = 0; m <= xMax; m += 60) xTicks.push(m);

  // Y ticks
  const yStep = totalUHs <= 10 ? 2 : totalUHs <= 20 ? 5 : 10;
  const yTicks: number[] = [0];
  for (let v = yStep; v <= totalUHs; v += yStep) yTicks.push(v);
  if (yTicks[yTicks.length - 1] !== totalUHs) yTicks.push(totalUHs);

  return (
    <Svg width={W} height={H} style={{ border: "1pt solid #e5e7eb" }}>
      {/* Eixos */}
      <Line x1={PL} y1={PT} x2={PL} y2={H - PB} stroke="#9ca3af" strokeWidth={0.8} />
      <Line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} stroke="#9ca3af" strokeWidth={0.8} />

      {/* Y grid + rótulos */}
      {yTicks.map((v) => (
        <G key={`y-${v}`}>
          <Line x1={PL} y1={toY(v)} x2={W - PR} y2={toY(v)} stroke="#e5e7eb" strokeWidth={0.5} />
          <SvgText x={PL - 3} y={toY(v) + 2.5} fontSize={6} fill={C.gray} textAnchor="end">{v}</SvgText>
        </G>
      ))}

      {/* X grid + rótulos de horário */}
      {xTicks.map((m) => (
        <G key={`x-${m}`}>
          <Line x1={toX(m)} y1={PT} x2={toX(m)} y2={H - PB} stroke="#e5e7eb" strokeWidth={0.5} />
          <SvgText x={toX(m)} y={H - PB + 9} fontSize={6} fill={C.gray} textAnchor="middle">{minToHora(m)}</SvgText>
        </G>
      ))}

      {/* Rótulo eixo Y */}
      <SvgText
        x={8}
        y={PT + cH / 2}
        fontSize={6}
        fill={C.gray}
        textAnchor="middle"
        transform={`rotate(-90, 8, ${PT + cH / 2})`}
      >
        UHs restantes
      </SvgText>

      {/* Burndown line */}
      <Polyline points={pts.join(" ")} stroke={C.indigo} strokeWidth={1.5} fill="none" />

      {/* Dots em cada inspeção concluída */}
      {eventos.slice(1).map((ev, i) => (
        <Rect key={i} x={toX(ev.minutos) - 2.5} y={toY(ev.uhsRestantes) - 2.5} width={5} height={5} rx={2.5} fill={C.green} />
      ))}
    </Svg>
  );
}

// ── Gráfico vertical para Performance (tempo ou falhas) ──────────────────────
function PerfVBarSvg({
  items,
  formatVal,
  barColor,
  width = 240,
}: {
  items: { nome: string; foto: string | null; valor: number; cor: string }[];
  formatVal: (v: number) => string;
  barColor?: string;
  width?: number;
}) {
  if (!items.length) return null;
  const W = width, H = 170;
  const PL = 20, PR = 8, PT = 10, PB = 52;
  const cW = W - PL - PR, cH = H - PT - PB;
  const maxVal = Math.max(...items.map((i) => i.valor), 1);
  const n = items.length;
  const step = cW / n;
  const barW = Math.min(28, step * 0.55);
  const R = 12; // avatar radius

  const toBarX = (i: number) => PL + i * step + step / 2 - barW / 2;
  const toY = (v: number) => PT + (1 - v / maxVal) * cH;
  const toBarH = (v: number) => Math.max(1, (v / maxVal) * cH);

  // Y ticks
  const maxMin = Math.ceil(maxVal / 60);
  const isTime = maxVal > 90; // heuristic: se >90s é tempo, senão é contagem
  let yTicks: number[] = [];
  if (isTime) {
    const step2 = maxMin <= 5 ? 1 : maxMin <= 15 ? 5 : 10;
    for (let m = 0; m <= maxMin; m += step2) yTicks.push(m * 60);
  } else {
    const maxInt = Math.ceil(maxVal);
    const step2 = maxInt <= 5 ? 1 : 2;
    for (let v = 0; v <= maxInt; v += step2) yTicks.push(v);
  }

  return (
    <Svg width={W} height={H}>
      {/* Eixos */}
      <Line x1={PL} y1={PT} x2={PL} y2={H - PB} stroke="#d1d5db" strokeWidth={0.6} />
      <Line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} stroke="#d1d5db" strokeWidth={0.6} />

      {/* Y grid */}
      {yTicks.map((v) => (
        <G key={`y-${v}`}>
          <Line x1={PL} y1={toY(v)} x2={W - PR} y2={toY(v)} stroke="#f3f4f6" strokeWidth={0.5} />
          <SvgText x={PL - 2} y={toY(v) + 2.5} fontSize={5.5} fill={C.gray} textAnchor="end">
            {isTime ? `${Math.floor(v / 60)}m` : `${v}`}
          </SvgText>
        </G>
      ))}

      {/* Barras + valor + avatares */}
      {items.map((item, i) => {
        const bx = toBarX(i);
        const by = toY(item.valor);
        const bh = toBarH(item.valor);
        const cx = PL + i * step + step / 2;
        const avatarY = H - PB + 8;
        const color = barColor ?? item.cor;

        return (
          <G key={i}>
            {/* Barra */}
            <Rect x={bx} y={by} width={barW} height={bh} fill={color} rx={2} />
            {/* Valor acima da barra */}
            <SvgText x={bx + barW / 2} y={by - 2} fontSize={5.5} fill={C.gray} textAnchor="middle">
              {formatVal(item.valor)}
            </SvgText>
            {/* Avatar circle */}
            <Circle cx={cx} cy={avatarY + R} r={R} fill={item.cor} />
            <SvgText x={cx} y={avatarY + R + 4} fontSize={8} fill="#ffffff" textAnchor="middle" fontFamily="Helvetica-Bold">
              {item.nome[0]?.toUpperCase()}
            </SvgText>
            {/* Nome abaixo */}
            <SvgText x={cx} y={avatarY + R * 2 + 8} fontSize={5.5} fill={C.gray} textAnchor="middle">
              {item.nome}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ── Item 4: Tempos por Etapa (barra + % + deltas por camareira) ───────────────
function Item4Etapas({ d }: { d: RelatorioData }) {
  if (d.etapas.length === 0) return null;

  const totalSeg = d.etapas.reduce((s, e) => s + e.mediaSegundos, 0) || 1;
  const maxEtapa = Math.max(...d.etapas.map((e) => e.mediaSegundos), 1);
  const nomes = d.etapasPorCamareira.nomes;
  const CAM_FLEX = 1.0;

  return (
    <View style={s.section}>
      <Text style={s.secTitle}>4. Tempos por Etapa</Text>

      {/* Cabeçalho */}
      <View style={[s.tHead, { alignItems: "center" }]}>
        <Text style={[s.th, { flex: 1.3 }]}>Etapa</Text>
        <Text style={[s.th, { flex: 2.8 }]}>Média geral</Text>
        {nomes.map((nome, i) => (
          <Text key={i} style={[s.th, { flex: CAM_FLEX, textAlign: "center" }]}>
            {nome}
          </Text>
        ))}
      </View>

      {/* Linhas por etapa */}
      {d.etapas.map((etapa, i) => {
        const barPct = Math.round((etapa.mediaSegundos / maxEtapa) * 100);
        const pct = Math.round((etapa.mediaSegundos / totalSeg) * 100);
        const camEtapa = d.etapasPorCamareira.etapas.find((e) => e.nome === etapa.nome);
        const rowStyle = i % 2 === 0 ? s.tRow : s.tRowAlt;

        return (
          <View key={i} style={[rowStyle, { alignItems: "center" }]} wrap={false}>
            {/* Nome */}
            <Text style={[s.td, { flex: 1.3 }]}>{etapa.nome}</Text>

            {/* Barra + tempo + % */}
            <View style={{ flex: 2.8, flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 1 }}>
              <View style={{ flex: 1, height: 9, backgroundColor: C.lightGray, borderRadius: 2 }}>
                <View
                  style={{
                    height: 9,
                    borderRadius: 2,
                    backgroundColor: C.green,
                    width: `${barPct}%`,
                  }}
                />
              </View>
              <View style={{ width: 44, alignItems: "flex-end" }}>
                <Text style={{ fontSize: 7.5, color: C.textSm, fontFamily: "Helvetica-Bold" }}>
                  {fmtMmSs(etapa.mediaSegundos)}
                </Text>
                <Text style={{ fontSize: 6, color: C.gray }}>({pct}%)</Text>
              </View>
            </View>

            {/* Colunas por camareira */}
            {nomes.map((_, ci) => {
              const val = camEtapa?.tempos[ci] ?? null;
              if (val === null) {
                return (
                  <Text key={ci} style={[s.td, { flex: CAM_FLEX, textAlign: "center", color: C.lightGray }]}>
                    —
                  </Text>
                );
              }
              const delta = val - etapa.mediaSegundos;
              const absDelta = Math.abs(Math.round(delta));
              const isAbove = delta > 10;
              const isBelow = delta < -10;

              return (
                <View key={ci} style={{ flex: CAM_FLEX, alignItems: "center" }}>
                  <Text style={{ fontSize: 7.5, color: C.textSm, fontFamily: "Helvetica-Bold" }}>
                    {fmtMmSs(val)}
                  </Text>
                  <Text
                    style={{
                      fontSize: 6,
                      color: isAbove ? C.red : isBelow ? C.green : C.lightGray,
                    }}
                  >
                    {isAbove
                      ? `(^ +${fmtDeltaPdf(absDelta)})`
                      : isBelow
                      ? `(v -${fmtDeltaPdf(absDelta)})`
                      : "="}
                  </Text>
                </View>
              );
            })}
          </View>
        );
      })}

      {/* Total médio */}
      <View style={[s.tRow, { backgroundColor: "#eef2ff", borderTopWidth: 1, borderTopColor: C.indigo, alignItems: "center" }]}>
        <Text style={[s.tdB, { flex: 1.3, color: C.blue }]}>TOTAL MÉDIO</Text>
        <View style={{ flex: 2.8, alignItems: "flex-end" }}>
          <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.blue }}>
            {fmtMmSs(totalSeg)}
          </Text>
          <Text style={{ fontSize: 6, color: C.gray }}>(100%)</Text>
        </View>
        {nomes.map((_, ci) => {
          const total = d.etapasPorCamareira.etapas.reduce(
            (sum, e) => sum + (e.tempos[ci] ?? 0), 0
          );
          const hasData = d.etapasPorCamareira.etapas.some((e) => e.tempos[ci] !== null);
          return (
            <Text key={ci} style={[s.tdB, { flex: CAM_FLEX, textAlign: "center", color: C.blue }]}>
              {hasData ? fmtMmSs(total) : "—"}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

// ── Documento principal ───────────────────────────────────────────────────────
export function RelatorioPDF({ d }: { d: RelatorioData }) {
  return (
    <Document title={`Relatório Gerencial — ${d.data}`} author={d.hotel.nome}>
      {/* ══════════════════════ PÁGINA 1: PERFORMANCE ═════════════════════════ */}
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.hotelNome}>{d.hotel.nome}</Text>
            <Text style={s.relTitulo}>Relatório Gerencial Diário — {d.data}</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={{ fontSize: 8, color: C.gray }}>Gerado em {d.geradoEm}</Text>
          </View>
        </View>

        {/* 1. Performance das Camareiras */}
        <View style={s.section}>
          <Text style={s.secTitle}>1. Performance das Camareiras</Text>

          {/* 1.1 Ranking */}
          <Text style={s.subTitle}>1.1 Ranking</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            {/* Coluna esquerda: Hoje */}
            <View style={{ flex: 1 }}>
              <Text style={s.colHeader}>Hoje</Text>
              {d.camareiras.map((cam, i) => {
                const scoreCol = scoreColor(cam.mediaScore);
                const cor = CAM_COLORS[i % CAM_COLORS.length];
                const inicial = cam.nome[0]?.toUpperCase() ?? "?";
                const scoreLabel = cam.mediaScore
                  ? cam.mediaScore >= 90 ? "Excelente"
                  : cam.mediaScore >= 75 ? "Bom"
                  : cam.mediaScore >= 60 ? "Regular"
                  : "Baixo"
                  : "Sem dados";
                const pos = ["1°", "2°", "3°"][i] ?? `${i + 1}°`;
                return (
                  <View key={i} wrap={false} style={{
                    flexDirection: "row", alignItems: "center", gap: 6,
                    padding: 6, marginBottom: 4,
                    backgroundColor: i === 0 ? "#fefce8" : C.bg,
                    borderRadius: 4, borderLeftWidth: 3, borderLeftColor: cor,
                  }}>
                    <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: C.gray, width: 16 }}>{pos}</Text>
                    {cam.foto ? (
                      <Image src={cam.foto} style={{ width: 22, height: 22, borderRadius: 11 } as any} />
                    ) : (
                      <Svg width={22} height={22}>
                        <Circle cx={11} cy={11} r={11} fill={cor} />
                        <SvgText x={11} y={15} fontSize={9} fill="#fff" textAnchor="middle" fontFamily="Helvetica-Bold">{inicial}</SvgText>
                      </Svg>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 1 }}>
                        <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.text }}>{cam.nome}</Text>
                        <View style={{ backgroundColor: cam.mediaScore ? (cam.mediaScore >= 90 ? "#dcfce7" : "#dbeafe") : C.lightGray, borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1 }}>
                          <Text style={{ fontSize: 5.5, color: cam.mediaScore ? (cam.mediaScore >= 90 ? "#16a34a" : C.blue) : C.gray }}>{scoreLabel}</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 6.5, color: C.gray }}>{cam.totalUHs} UH(s) · {fmt(cam.mediaLimpezaSegundos)}{cam.totalFalhas > 0 ? ` · ${cam.totalFalhas} falha(s)` : ""}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: scoreCol }}>{cam.mediaScore ?? "—"}</Text>
                      <Text style={{ fontSize: 5.5, color: C.gray }}>pts</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Coluna direita: Mês vigente */}
            <View style={{ flex: 1 }}>
              <Text style={s.colHeader}>Mês vigente</Text>
              {d.camareirasDoMes.length === 0 ? (
                <Text style={{ fontSize: 8, color: C.gray }}>Sem dados do mês.</Text>
              ) : d.camareirasDoMes.map((cam, i) => {
                const scoreCol = scoreColor(cam.mediaScore);
                const cor = CAM_COLORS[i % CAM_COLORS.length];
                const inicial = cam.nome[0]?.toUpperCase() ?? "?";
                const pos = ["1°", "2°", "3°"][i] ?? `${i + 1}°`;
                return (
                  <View key={i} wrap={false} style={{
                    flexDirection: "row", alignItems: "center", gap: 6,
                    padding: 6, marginBottom: 4,
                    backgroundColor: i === 0 ? "#f0f4ff" : C.bg,
                    borderRadius: 4, borderLeftWidth: 3, borderLeftColor: cor,
                  }}>
                    <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: C.gray, width: 16 }}>{pos}</Text>
                    {cam.foto ? (
                      <Image src={cam.foto} style={{ width: 22, height: 22, borderRadius: 11 } as any} />
                    ) : (
                      <Svg width={22} height={22}>
                        <Circle cx={11} cy={11} r={11} fill={cor} />
                        <SvgText x={11} y={15} fontSize={9} fill="#fff" textAnchor="middle" fontFamily="Helvetica-Bold">{inicial}</SvgText>
                      </Svg>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.text, marginBottom: 1 }}>{cam.nome}</Text>
                      <Text style={{ fontSize: 6.5, color: C.gray }}>{cam.totalUHs} UH(s) · {fmt(cam.mediaLimpezaSegundos)}{cam.totalFalhas > 0 ? ` · ${cam.totalFalhas} falha(s)` : ""}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: scoreCol }}>{cam.mediaScore ?? "—"}</Text>
                      <Text style={{ fontSize: 5.5, color: C.gray }}>pts</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {/* 1.2 Tempo Médio */}
          <Text style={[s.subTitle, { marginTop: 10 }]}>1.2 Tempo Médio</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={s.colHeader}>Hoje</Text>
              <PerfVBarSvg
                width={230}
                items={d.camareiras
                  .filter((c) => c.mediaLimpezaSegundos != null)
                  .map((c, i) => ({
                    nome: c.nome.split(" ")[0],
                    foto: c.foto,
                    valor: c.mediaLimpezaSegundos ?? 0,
                    cor: CAM_COLORS[i % CAM_COLORS.length],
                  }))}
                formatVal={(v) => fmt(v)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.colHeader}>Mês vigente</Text>
              <PerfVBarSvg
                width={230}
                items={d.camareirasDoMes
                  .filter((c) => c.mediaLimpezaSegundos != null)
                  .map((c, i) => ({
                    nome: c.nome.split(" ")[0],
                    foto: c.foto,
                    valor: c.mediaLimpezaSegundos ?? 0,
                    cor: CAM_COLORS[i % CAM_COLORS.length],
                  }))}
                formatVal={(v) => fmt(v)}
              />
            </View>
          </View>

          {/* 1.3 Falhas */}
          <Text style={[s.subTitle, { marginTop: 10 }]}>1.3 Falhas</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={s.colHeader}>Hoje</Text>
              <PerfVBarSvg
                width={230}
                items={d.camareiras.map((c, i) => ({
                  nome: c.nome.split(" ")[0],
                  foto: c.foto,
                  valor: c.totalFalhas,
                  cor: CAM_COLORS[i % CAM_COLORS.length],
                }))}
                formatVal={(v) => `${v}`}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.colHeader}>Mês vigente</Text>
              <PerfVBarSvg
                width={230}
                items={d.camareirasDoMes.map((c, i) => ({
                  nome: c.nome.split(" ")[0],
                  foto: c.foto,
                  valor: c.totalFalhas,
                  cor: CAM_COLORS[i % CAM_COLORS.length],
                }))}
                formatVal={(v) => `${v}`}
              />
            </View>
          </View>
        </View>

        <Footer hotel={d.hotel.nome} />
      </Page>

      {/* ════════════════════════════════ PÁGINA 2 ════════════════════════════ */}
      <Page size="A4" style={s.page}>
        {/* 2. Informações gerais */}
        <View style={s.section}>
          <Text style={s.secTitle}>2. Informações Gerais</Text>
          <View style={s.cardsRow}>
            <View style={s.card}>
              <Text style={s.cardLabel}>Total UHs</Text>
              <Text style={[s.cardVal, { color: C.blue }]}>{d.geral.totalUHs}</Text>
            </View>
            <View style={s.card}>
              <Text style={s.cardLabel}>Início geral</Text>
              <Text style={[s.cardVal, { color: C.blue }]}>{d.geral.inicioGeral ?? "—"}</Text>
            </View>
            <View style={s.card}>
              <Text style={s.cardLabel}>Fim geral</Text>
              <Text style={[s.cardVal, { color: C.blue }]}>{d.geral.fimGeral ?? "—"}</Text>
            </View>
            <View style={s.card}>
              <Text style={s.cardLabel}>Desl. médio</Text>
              <Text style={[s.cardValSm, { color: C.blue }]}>{fmt(d.geral.mediaDeslocamentoSegundos)}</Text>
            </View>
            <View style={s.card}>
              <Text style={s.cardLabel}>Falhas camareira</Text>
              <Text style={[s.cardVal, { color: d.geral.totalFalhasCamareiras > 0 ? C.red : C.green }]}>
                {d.geral.totalFalhasCamareiras}
              </Text>
            </View>
            <View style={s.card}>
              <Text style={s.cardLabel}>Falhas gerenciais</Text>
              <Text style={[s.cardVal, { color: d.geral.totalFalhasGerenciais > 0 ? C.amber : C.green }]}>
                {d.geral.totalFalhasGerenciais}
              </Text>
            </View>
          </View>

          {/* UHs em manutenção */}
          {d.geral.uhsManutencao.length > 0 && (
            <View style={{ marginTop: 6, backgroundColor: C.bg, borderRadius: 3, padding: 8, borderLeftWidth: 3, borderLeftColor: C.amber }}>
              <Text style={{ fontSize: 7, color: C.gray, fontFamily: "Helvetica-Bold", marginBottom: 6 }}>
                UHS EM MANUTENÇÃO
              </Text>
              {d.geral.uhsManutencao.map((uh, i) => (
                <View key={i} style={{ marginBottom: i < d.geral.uhsManutencao.length - 1 ? 5 : 0 }}>
                  <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: C.amber }}>{uh.numero}</Text>
                  {uh.descricao ? (
                    <Text style={{ fontSize: 8, color: C.textSm, marginTop: 1 }}>{uh.descricao}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 3. Detalhe por UH */}
        <View style={s.section}>
          <Text style={s.secTitle}>3. Detalhe por UH</Text>

          {/* Gráfico burndown */}
          {d.burndown.eventos.length >= 2 && (
            <View style={{ marginBottom: 10 }}>
              <BurndownSvg
                eventos={d.burndown.eventos}
                totalUHs={d.geral.totalUHs}
                totalMinutos={d.burndown.totalMinutos}
              />
              <View style={{ flexDirection: "row", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <View style={{ width: 14, height: 2, backgroundColor: C.indigo }} />
                  <Text style={{ fontSize: 7, color: C.gray }}>Burndown</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.green }} />
                  <Text style={{ fontSize: 7, color: C.gray }}>Check-in liberado</Text>
                </View>
                <Text style={{ fontSize: 7, color: C.gray }}>Eixo X: horário (BRT)  ·  Eixo Y: UHs restantes</Text>
              </View>
            </View>
          )}

          {/* Tabela por UH */}
          <View style={s.tHead}>
            <Text style={[s.th, { flex: 0.8 }]}>UH</Text>
            <Text style={[s.th, { flex: 1.2 }]}>Camareira</Text>
            <Text style={[s.th, { flex: 0.68 }]}>Lib.</Text>
            <Text style={[s.th, { flex: 0.68 }]}>Início</Text>
            <Text style={[s.th, { flex: 0.68 }]}>Fim</Text>
            <Text style={[s.th, { flex: 0.85 }]}>Duração</Text>
            <Text style={[s.th, { flex: 0.68 }]}>Ch-in</Text>
            <Text style={[s.th, { flex: 0.55 }]}>Fl.cam</Text>
            <Text style={[s.th, { flex: 0.55 }]}>Fl.ger</Text>
            <Text style={[s.th, { flex: 2.3 }]}>Falhas</Text>
          </View>

          {d.linhasUH.map((uh, i) => {
            const rowStyle = i % 2 === 0 ? s.tRow : s.tRowAlt;
            return (
              <View key={i} wrap={false}>
                <View style={rowStyle}>
                  <Text style={[s.tdB, { flex: 0.8, color: uh.emManutencao ? C.amber : C.textSm }]}>
                    {uh.emManutencao ? "[M] " : ""}{uh.numero}
                  </Text>
                  <Text style={[s.td, { flex: 1.2 }]}>{uh.camareira}</Text>
                  <Text style={[s.td, { flex: 0.68 }]}>{uh.liberadaEm ?? "—"}</Text>
                  <Text style={[s.td, { flex: 0.68 }]}>{uh.inicioLimpeza ?? "—"}</Text>
                  <Text style={[s.td, { flex: 0.68 }]}>{uh.fimLimpeza ?? "—"}</Text>
                  <Text style={[s.td, { flex: 0.85 }]}>{fmt(uh.duracaoSegundos)}</Text>
                  <Text style={[s.td, { flex: 0.68 }]}>{uh.checkInLiberadoEm ?? "—"}</Text>
                  <Text style={[s.td, { flex: 0.55, color: uh.falhasCamareira > 0 ? C.red : C.green }]}>
                    {uh.falhasCamareira}
                  </Text>
                  <Text style={[s.td, { flex: 0.55, color: uh.falhasGerenciais > 0 ? C.amber : C.green }]}>
                    {uh.falhasGerenciais}
                  </Text>
                  <Text style={[s.td, { flex: 2.3, fontSize: 7, color: uh.falhas.length ? C.red : C.gray }]}>
                    {uh.falhas.length > 0 ? uh.falhas.join(" · ") : "—"}
                  </Text>
                </View>

                {uh.observacaoGovernanta ? (
                  <View style={[rowStyle, { paddingTop: 2, paddingBottom: 4 }]}>
                    <Text style={{ flex: 0.8 }} />
                    <Text style={{ flex: 7.27, fontSize: 7, color: C.indigo }}>
                      Obs. governanta: {uh.observacaoGovernanta}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <Item4Etapas d={d} />

        {/* 5. Falhas de Lavanderia */}
        {d.falhasLavanderia.length > 0 && (
          <View style={s.section}>
            <Text style={s.secTitle}>5. Falhas de Lavanderia</Text>
            <View style={s.tHead}>
              <Text style={[s.th, { flex: 0.6 }]}>UH</Text>
              <Text style={[s.th, { flex: 0.7 }]}>Hora</Text>
              <Text style={[s.th, { flex: 1.2 }]}>Reportado por</Text>
              <Text style={[s.th, { flex: 3.5 }]}>Ocorrência</Text>
            </View>
            {d.falhasLavanderia.map((f, i) => (
              <View key={i} style={i % 2 === 0 ? s.tRow : s.tRowAlt}>
                <Text style={[s.tdB, { flex: 0.6 }]}>{f.uhNumero}</Text>
                <Text style={[s.td, { flex: 0.7 }]}>{f.hora ?? "—"}</Text>
                <Text style={[s.td, { flex: 1.2 }]}>
                  {f.reportadoPorNome} ({f.reportadoPorRole === "CAMAREIRA" ? "Cam." : "Gov."})
                </Text>
                <Text style={[s.td, { flex: 3.5, color: C.amber }]}>{f.descricao}</Text>
              </View>
            ))}
          </View>
        )}

        <Footer hotel={d.hotel.nome} />
      </Page>

    </Document>
  );
}
