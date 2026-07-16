# Praxis v2 — fundação nova

Reconstrução da suíte Praxis Systems num monorepo único, desenhado desde o
início pra suportar múltiplos clientes (`sistemaspraxis.com.br/<slug>`) e
evitar a classe inteira de bugs que o sistema atual (`../apps/*`) acumulou.

Domínio próprio (`sistemaspraxis.com.br`) já registrado especificamente
pra esta v2 — não há necessidade de mover `praxis-systems.com.br` (v1)
mais tarde; os dois sistemas rodam em paralelo, cada um no seu domínio,
sem risco pra operação diária do hotel.

## Por que existe

O sistema atual (`../apps/gateway`, `../apps/housekeeping`,
`../apps/maintenance`, `../apps/booking-reviews`) nasceu como 4 apps
separados que foram "costurados" depois pra funcionar como cadastro único e
SSO. Isso causou bugs recorrentes: ids de usuário duplicados entre uma
tabela `User` local por app e o `suite_core.User` central, sessões que
dessincronizavam, lógica de sessão copiada e colada (e divergente) entre
apps, tenant "bnbflex" craveado no código em vários lugares.

`../apps/*` continua rodando como está — não foi tocado, é a referência
visual/funcional pra esta reconstrução e fica de pé até esta v2 estar
pronta pra assumir o domínio de produção.

## Decisões de arquitetura (diferente da v1)

1. **Um monorepo real.** `apps/` e `packages/` neste projeto são workspaces
   de um `pnpm-workspace.yaml` só — código compartilhado em
   `packages/core` é importado normalmente (`@praxis/core`), sem cópia
   manual entre apps.
2. **Um único id de usuário.** Não existe tabela `User` local por módulo.
   `suite_core.User.id` é o id da pessoa em qualquer lugar do sistema —
   qualquer dado operacional de qualquer módulo referencia esse id
   diretamente. Elimina a causa raiz do bug mais caro da v1 (ids
   suite_core vs. local trocados).
3. **Uma sessão só.** Um cookie assinado (`praxis_v2_session`, ver
   `packages/core/src/session.ts`) é a ÚNICA fonte de sessão — nenhum app
   mantém uma sessão paralela própria (v1 tinha NextAuth por app + o cookie
   compartilhado, sincronizados por uma "ponte" que quebrava). Qualquer
   app novo só chama `getSession()`.
4. **Multi-tenant desde a primeira linha.** Toda URL de tenant é
   `sistemaspraxis.com.br/<slug>`, resolvido dinamicamente — não existe
   (e não pode voltar a existir) nenhuma string de tenant craveada no
   código.
5. **Mesma UI, arquitetura nova.** As telas (login, hub, gestão de
   usuários) reproduzem o visual/fluxo já validado na v1 — o usuário final
   não deve notar diferença. Módulos de negócio (Governança, Manutenção,
   Avaliações) ainda NÃO foram portados — este momento do projeto é só a
   fundação (login + hub + cadastro de usuários).

## Estado atual

- [x] Monorepo (pnpm workspace)
- [x] Schema `suite_core` limpo (`packages/core/prisma/schema.prisma`)
- [x] Lib de sessão compartilhada (`packages/core/src/session.ts`)
- [x] App `gateway`: login, hub, gestão de usuários
- [ ] Deploy real (precisa de: repositório Git próprio, banco Postgres
      novo, projeto Vercel novo — ver "Próximos passos")
- [ ] Módulos de negócio (Governança/Manutenção/Avaliações) — não iniciado

## Próximos passos (fora do que dá pra fazer só com edição de código)

1. Criar um banco Postgres novo (Neon, por exemplo) — **não** reaproveitar
   o banco da v1, pra manter os dados de teste completamente isolados.
2. Criar um repositório Git novo (ex: `praxis-systems-v2`) e dar push
   neste código.
3. Criar um projeto Vercel novo apontando pra esse repositório, com as
   env vars (ver `.env.example` em `apps/gateway`), e apontar o domínio
   `sistemaspraxis.com.br` (já registrado) pra ele.
4. Rodar a migração do Prisma (`pnpm --filter @praxis/core prisma migrate deploy`)
   contra o banco novo.
