"use client";
import { useState } from "react";
import { Settings, ClipboardList, ShieldCheck } from "lucide-react";
import ProgramasTab from "./tabs/ProgramasTab";
import GeralTab from "./tabs/GeralTab";
import InspecaoTab from "./tabs/InspecaoTab";

// Portado de apps/housekeeping/src/app/configuracoes/page.tsx (v1), que lá
// era o próprio client component com useSession. Aqui vira um client
// component separado (role chega por prop do page.tsx server) — mesmo
// padrão das outras views desta reconstrução (AtribuicaoView, GovernantaView).
//
// Diferenças conscientes desta fatia:
//   - Aba "Telegram" (bot/contatos) não foi portada — depende de infra de
//     bot que ainda não existe em v2 (mesmo escopo deferido das notificações
//     em geral, ver TODOs nas rotas de API).
//   - Abas "Usuários" e "Unidades (UHs)" foram removidas daqui — eram só
//     redirect pro hub (cadastro único, válido pra Governança, Manutenção e
//     Avaliações — ver apps/gateway/src/app/[cliente]/configuracoes/
//     usuarios/ e /uhs/), pra evitar a mesma duplicação de cadastro que a v1
//     tinha (id local vs suite_core, causava bugs de FK). Quem precisa
//     gerenciar usuários ou UHs acessa direto pelo hub, não por aqui.

const ALL_TABS = [
  { id: "geral",     label: "Geral",                  icon: Settings },
  { id: "programas", label: "Programas de Limpeza",    icon: ClipboardList },
  { id: "inspecao",  label: "Checklist de Inspeção",   icon: ShieldCheck },
];

export default function ConfiguracoesClient({ role, podeOperar }: { role: string; podeOperar: boolean }) {
  const TABS = ALL_TABS;
  const [tab, setTab] = useState("");
  // ATENDIMENTO tem as mesmas permissões de GERENTE no resto do módulo
  // Governança (ver comentário em api/selecao-uhs/route.ts), mas
  // Configurações é a exceção explícita — aqui fica somente leitura, igual
  // MANUTENÇÃO. !podeOperar (falta de acesso ao módulo — ver comentário em
  // apps/maintenance/src/app/page.tsx) entra na mesma variável porque as
  // abas já tratam somenteLeitura mostrando um banner "modo somente leitura"
  // em vez do formulário de escrita — mesmo tratamento visual, causa diferente.
  const somenteLeitura = role === "MANUTENCAO" || role === "ATENDIMENTO" || !podeOperar;

  const tabAtiva = tab || TABS[0]?.id || "";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
        <p className="text-sm text-gray-500 mt-1">Programas de limpeza e checklist de inspeção</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-3 md:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
              tabAtiva === id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{label.split(" ")[0]}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {tabAtiva === "geral" && <GeralTab somenteLeitura={somenteLeitura} />}
      {tabAtiva === "programas" && <ProgramasTab somenteLeitura={somenteLeitura} />}
      {tabAtiva === "inspecao" && <InspecaoTab somenteLeitura={somenteLeitura} />}
    </div>
  );
}
