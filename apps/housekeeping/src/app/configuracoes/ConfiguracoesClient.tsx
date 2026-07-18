"use client";
import { useState } from "react";
import { Settings, Users, Hotel, ClipboardList, ShieldCheck, ExternalLink } from "lucide-react";
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
//   - Abas "Usuários" e "UHs" viraram redirect pro hub (cadastro único,
//     válido pra Governança, Manutenção e Avaliações — ver
//     apps/gateway/src/app/[cliente]/configuracoes/usuarios/ e /uhs/). UHs
//     era CRUD local até esta fatia; passou a redirect pra evitar a mesma
//     duplicação de cadastro que a v1 tinha com usuários (id local vs
//     suite_core, causava bugs de FK).

const ALL_TABS = [
  { id: "geral",     label: "Geral",                  icon: Settings },
  { id: "uhs",       label: "Unidades (UHs)",          icon: Hotel },
  { id: "usuarios",  label: "Usuários",                icon: Users },
  { id: "programas", label: "Programas de Limpeza",    icon: ClipboardList },
  { id: "inspecao",  label: "Checklist de Inspeção",   icon: ShieldCheck },
];

function RedirectTab({ titulo, descricao, path }: { titulo: string; descricao: string; path: string }) {
  // Extrai o slug do tenant da própria URL do navegador (ex:
  // "/bnbflex/governance/configuracoes" -> "bnbflex") — a sessão v2 até tem
  // tenantSlug, mas usar a URL direto evita precisar passar mais uma prop
  // só pra isso.
  const slug = typeof window !== "undefined" ? window.location.pathname.split("/")[1] : "";
  const href = slug ? `/${slug}/${path}` : "/";

  return (
    <div className="max-w-md">
      <div className="card">
        <h3 className="font-semibold mb-2">{titulo}</h3>
        <p className="text-sm text-gray-500 mb-4">{descricao}</p>
        <a href={href} className="btn-primary inline-flex items-center gap-2">
          <ExternalLink className="w-4 h-4" />
          Ir pro hub
        </a>
      </div>
    </div>
  );
}

export default function ConfiguracoesClient({ role }: { role: string }) {
  const TABS = ALL_TABS;
  const [tab, setTab] = useState("");
  // ATENDIMENTO tem as mesmas permissões de GERENTE no resto do módulo
  // Governança (ver comentário em api/selecao-uhs/route.ts), mas
  // Configurações é a exceção explícita — aqui fica somente leitura, igual
  // MANUTENÇÃO.
  const somenteLeitura = role === "MANUTENCAO" || role === "ATENDIMENTO";

  const tabAtiva = tab || TABS[0]?.id || "";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
        <p className="text-sm text-gray-500 mt-1">Gerencie UHs, usuários e programas de limpeza</p>
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
      {tabAtiva === "uhs" && (
        <RedirectTab
          titulo="Cadastro de UHs mudou de lugar"
          descricao="Criar, editar e desativar UHs agora é feito em um lugar só, no hub — válido para Governança, Manutenção e Avaliações."
          path="configuracoes/uhs"
        />
      )}
      {tabAtiva === "usuarios" && (
        <RedirectTab
          titulo="Gestão de usuários mudou de lugar"
          descricao="Cadastrar, editar cargo e liberar acesso por módulo agora é feito em um lugar só, no hub — válido para Governança, Manutenção e Avaliações."
          path="configuracoes/usuarios"
        />
      )}
      {tabAtiva === "programas" && <ProgramasTab somenteLeitura={somenteLeitura} />}
      {tabAtiva === "inspecao" && <InspecaoTab somenteLeitura={somenteLeitura} />}
    </div>
  );
}
