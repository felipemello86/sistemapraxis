"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp, ArrowRight, Layers } from "lucide-react";
import { SeletorCategoriaPopup } from "@/components/SeletorCategoriaPopup";
import { SeletorCentroCustoPopup } from "@/components/SeletorCentroCustoPopup";
import type { Empreendimento, Unidade } from "@/components/SeletorCentroCusto";
import type { ContaParaSelect } from "@/components/RepetirLancamentoModal";
import { ConciliacaoDetalhe, type ItemPendente, pareceParcelado } from "./ConciliacaoDetalhe";
import type { PropostaLote } from "./ConciliacoesView";

// Card compacto de UM lançamento pendente, pra tela de Conciliações em
// lote (pedido do Felipe, 06/08/2026: "esse tabelão deveria ser composto
// por cards compactos, de forma que o usuário consiga visualizar o máximo
// de cards possível de uma só vez"). Cada card é uma linha só (banco à
// esquerda, proposta à direita) com um checkbox de "incluir na conciliação
// em lote" — categoria e centro de custo abrem em popup pra não derrubar a
// altura do card. Quando precisa de algo que não cabe aqui (recorrência,
// anexos, buscar lançamento manualmente), o botão de expandir abre o
// editor completo (ConciliacaoDetalhe) embutido, empurrando os cards
// abaixo — o mesmo padrão de "conciliar 1 por 1" de antes, só que agora é
// uma exceção, não o fluxo principal.

type Categoria = { id: string; nome: string; tipo: string; bloco: string };

function formatBRL(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDataBR(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

export function ConciliacaoCardCompacto({
  item,
  categorias,
  empreendimentos,
  unidades,
  contas,
  proposta,
  pronta,
  onChangeProposta,
  onConciliado,
}: {
  item: ItemPendente;
  categorias: Categoria[];
  empreendimentos: Empreendimento[];
  unidades: Unidade[];
  contas: ContaParaSelect[];
  proposta: PropostaLote;
  pronta: boolean;
  onChangeProposta: (updates: Partial<PropostaLote>) => void;
  onConciliado: () => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const [popupCategoria, setPopupCategoria] = useState(false);
  const [popupCentroCusto, setPopupCentroCusto] = useState(false);

  const valorNum = Number(item.lancamento.valor);
  const categoriasFiltradas = categorias.filter((c) => c.tipo === (valorNum >= 0 ? "RECEITA" : "DESPESA"));
  const categoriaEscolhida = categorias.find((c) => c.id === proposta.categoriaId) ?? null;
  // Sem previsto já esperando por ela, uma compra parcelada não pode ser
  // resolvida no card compacto — falta o nº de parcelas, que só dá pra
  // informar no editor completo (ver pareceParcelado em ConciliacaoDetalhe.tsx).
  const precisaAbrirParaParcelar = proposta.modo === "novo" && pareceParcelado(item.lancamento.descricao);

  const resumoCentroCusto =
    proposta.centroCustoTipo === "ADMINISTRACAO"
      ? "Administração"
      : proposta.centroCustoTipo === "EMPREENDIMENTO"
        ? empreendimentos.find((e) => e.id === proposta.propertyId)?.nome || "Empreendimento..."
        : unidades.find((u) => u.id === proposta.uhId)?.nome || "Unidade...";

  function selecionarPrevistoOuNovo(valor: string) {
    if (valor === "novo") {
      onChangeProposta({ modo: "novo" });
    } else {
      onChangeProposta({ modo: "previsto", previstoId: valor, checked: true });
    }
  }

  return (
    <div className={`border rounded-lg px-3 py-2 ${pronta && proposta.checked ? "border-blue-200 bg-blue-50/30" : "border-gray-100"}`}>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={proposta.checked && pronta}
          disabled={!pronta}
          onChange={(e) => onChangeProposta({ checked: e.target.checked })}
          className="w-4 h-4 flex-shrink-0 accent-blue-700 disabled:opacity-30"
          title={pronta ? "Incluir na conciliação em lote" : "Complete a proposta (categoria/centro de custo) pra poder incluir"}
        />

        <div className="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-center">
          {/* Lançamento do banco */}
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[11px] text-gray-400 flex-shrink-0">{formatDataBR(item.lancamento.dataVencimento)}</span>
              <span className="text-sm text-gray-800 truncate">{item.lancamento.descricao}</span>
            </div>

            {/* Proposta */}
            <div className="flex items-center gap-1.5 mt-0.5 text-xs">
              <ArrowRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
              {item.sugestoes.length > 0 || proposta.modo === "previsto" ? (
                <select
                  value={proposta.modo === "previsto" ? proposta.previstoId : "novo"}
                  onChange={(e) => selecionarPrevistoOuNovo(e.target.value)}
                  className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white max-w-[220px] truncate"
                >
                  <option value="novo">+ Novo lançamento...</option>
                  {item.sugestoes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.confianca}% · {s.descricao} ({formatBRL(s.valor)})
                    </option>
                  ))}
                </select>
              ) : null}

              {precisaAbrirParaParcelar ? (
                <button type="button" onClick={() => setExpandido(true)} className="flex items-center gap-1 text-amber-600 font-medium hover:underline">
                  <Layers className="w-3 h-3" /> Compra parcelada — abrir detalhe pra configurar
                </button>
              ) : (
                proposta.modo === "novo" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPopupCategoria(true)}
                      className={`truncate font-medium hover:underline ${categoriaEscolhida ? "text-blue-700" : "text-amber-600"}`}
                    >
                      {categoriaEscolhida?.nome || "Escolher categoria"}
                    </button>
                    <span className="text-gray-300">·</span>
                    <button type="button" onClick={() => setPopupCentroCusto(true)} className="text-gray-500 hover:underline truncate">
                      {resumoCentroCusto}
                    </button>
                  </>
                )
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-sm font-semibold ${valorNum >= 0 ? "text-green-700" : "text-red-600"}`}>{formatBRL(item.lancamento.valor)}</span>
            <button type="button" onClick={() => setExpandido((v) => !v)} className="text-gray-400 hover:text-gray-700" title="Editar detalhes (recorrência, anexos, buscar lançamento...)">
              {expandido ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {expandido && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <ConciliacaoDetalhe
            item={item}
            categorias={categorias}
            empreendimentos={empreendimentos}
            unidades={unidades}
            contas={contas}
            onConciliado={() => {
              setExpandido(false);
              onConciliado();
            }}
          />
        </div>
      )}

      <SeletorCategoriaPopup
        open={popupCategoria}
        onClose={() => setPopupCategoria(false)}
        categoriaId={proposta.categoriaId}
        categorias={categoriasFiltradas}
        onChange={(id) => onChangeProposta({ categoriaId: id, modo: "novo", checked: true })}
      />
      <SeletorCentroCustoPopup
        open={popupCentroCusto}
        onClose={() => setPopupCentroCusto(false)}
        tipo={proposta.centroCustoTipo}
        empreendimentoId={proposta.propertyId}
        unidadeId={proposta.uhId}
        empreendimentos={empreendimentos}
        unidades={unidades}
        onChange={(v) => onChangeProposta({ centroCustoTipo: v.centroCustoTipo, propertyId: v.empreendimentoId, uhId: v.unidadeId })}
      />
    </div>
  );
}
