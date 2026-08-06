"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

// Seletor de Categoria por navegação da estrutura da DRE (pedido do
// Felipe, 06/08/2026: "são muitas categorias, fica ruim de selecionar...
// melhor selecionar pela navegação da estrutura da DRE, expandindo a
// super-categoria até encontrar a categoria, que deve estar em ordem
// alfabética") — nasceu no card "Novo lançamento" da tela de Conciliações,
// mas é genérico o bastante (só precisa de {id, nome, bloco}) pra
// substituir qualquer outro <select> de categoria no financeiro no futuro.

export type CategoriaSelecionavel = { id: string; nome: string; bloco: string };

export function SeletorCategoria({
  categoriaId,
  categorias,
  onChange,
}: {
  categoriaId: string;
  categorias: CategoriaSelecionavel[];
  onChange: (id: string) => void;
}) {
  const [blocosAbertos, setBlocosAbertos] = useState<Set<string>>(new Set());
  const itemSelecionadoRef = useRef<HTMLButtonElement>(null);

  const categoriaSelecionada = categorias.find((c) => c.id === categoriaId) ?? null;

  // Blocos em ordem alfabética, categorias dentro de cada um também em
  // ordem alfabética (pedido explícito do Felipe) — a ordem de exibição da
  // DRE (bloco.ordem/categoria.ordem) é pra LER a DRE de cima a baixo,
  // aqui o objetivo é achar rápido, então alfabético é melhor.
  const porBloco = useMemo(() => {
    const map = new Map<string, CategoriaSelecionavel[]>();
    for (const c of categorias) {
      const arr = map.get(c.bloco) ?? [];
      arr.push(c);
      map.set(c.bloco, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR")));
  }, [categorias]);

  // Abre automaticamente o bloco da categoria já selecionada (ex.: editando
  // algo que já veio com categoria, ou sugestão automática — ver
  // sugestao-categoria.ts) — só na troca de categoria, não atrapalha o
  // usuário que já abriu/fechou blocos manualmente depois.
  useEffect(() => {
    if (categoriaSelecionada) setBlocosAbertos((prev) => new Set(prev).add(categoriaSelecionada.bloco));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaId]);

  // Rola a lista até o item selecionado ficar visível (pedido do Felipe,
  // 06/08/2026: com a sugestão automática, o item selecionado às vezes cai
  // fora da área visível — o usuário via só o bloco aberto, sem entender
  // que já tinha algo escolhido lá embaixo). Depende também de
  // `blocosAbertos` porque, no primeiro render após trocar de item, o
  // bloco ainda não estava aberto (o ref só existe depois que o efeito
  // acima abre o bloco e o botão é renderizado).
  useEffect(() => {
    itemSelecionadoRef.current?.scrollIntoView({ block: "nearest" });
  }, [categoriaId, blocosAbertos]);

  function toggleBloco(bloco: string) {
    setBlocosAbertos((prev) => {
      const next = new Set(prev);
      next.has(bloco) ? next.delete(bloco) : next.add(bloco);
      return next;
    });
  }

  return (
    <div>
      <label className="label">Categoria</label>
      <div className="border border-gray-300 rounded-lg max-h-56 overflow-y-auto divide-y divide-gray-50">
        {[...porBloco.entries()].map(([bloco, cats]) => {
          const aberto = blocosAbertos.has(bloco);
          return (
            <div key={bloco}>
              <button
                type="button"
                onClick={() => toggleBloco(bloco)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                {aberto ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />}
                <span className="truncate">{bloco}</span>
              </button>
              {aberto &&
                cats.map((c) => (
                  <button
                    key={c.id}
                    ref={c.id === categoriaId ? itemSelecionadoRef : undefined}
                    type="button"
                    onClick={() => onChange(c.id)}
                    className={`w-full text-left pl-7 pr-2 py-1.5 text-sm ${
                      c.id === categoriaId ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {c.nome}
                  </button>
                ))}
            </div>
          );
        })}
        {categorias.length === 0 && <p className="text-xs text-gray-400 px-2 py-3">Nenhuma categoria disponível.</p>}
      </div>
      {categoriaSelecionada && (
        <p className="text-xs text-gray-400 mt-1">
          {categoriaSelecionada.bloco} — <span className="text-gray-600 font-medium">{categoriaSelecionada.nome}</span>
        </p>
      )}
    </div>
  );
}
