import { notFound } from "next/navigation";
import { prisma, getSession, moduleToSlug, MODULE_LABELS, type SuiteModule } from "@praxis/core";
import { logoutAction } from "./actions";
import { LoginForm } from "./LoginForm";
import PushRegistration from "./PushRegistration";
import ModuleTile from "./ModuleTile";
import { IconBed, IconWrench, IconStar, IconBox, IconCloche, IconSparkle, IconGear, IconCalendar, IconCoin } from "@/lib/icons";
import styles from "./page.module.css";

// Nota: a v1 tinha um componente LockBodyScroll aqui pra travar o scroll
// de fundo no app nativo (Capacitor) — foi fonte de várias regressões
// (Sair quebrado, footer sumindo, etc, ver histórico na v1). Deliberadamente
// omitido por enquanto nesta reconstrução; se o scroll de fundo incomodar
// de verdade quando o app nativo for portado pra cá, resolver com CSS
// simples (overflow: hidden direto no .main, sem mexer em html/body) em
// vez de reintroduzir aquela complexidade.

const MODULE_ICON: Record<SuiteModule, (props: { size?: number }) => JSX.Element> = {
  HOUSEKEEPING: IconBed,
  MAINTENANCE: IconWrench,
  BOOKING_REVIEWS: IconStar,
  STOCK: IconBox,
  RESTAURANT: IconCloche,
  INTELLIGENCE: IconSparkle,
  RECEPTION: IconCalendar,
  FINANCE: IconCoin,
};

const ROLE_LABEL: Record<string, string> = {
  MASTER: "Master",
  GERENTE: "Gerente",
  GOVERNANTA: "Governanta",
  CAMAREIRA: "Camareira",
  LAVANDERIA: "Lavanderia",
  MANUTENCAO: "Manutenção",
  ATENDIMENTO: "Atendimento",
};

export default async function ClienteHub({
  params,
}: {
  params: { cliente: string };
}) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.cliente },
    include: { modules: { where: { enabled: true } } },
  });

  if (!tenant) notFound();

  // A sessão é única pra suíte inteira (um cookie só, ver session.ts) — um
  // usuário pode ter feito login num tenant (ex: bnbflex) e depois navegado
  // pra URL de outro tenant (ex: avel) sem sair antes (cookie de 30 dias,
  // troca de tenant só editando a URL). Sem essa checagem, esse hub
  // renderizava os tiles do tenant da URL só por existir QUALQUER sessão
  // válida — mas cada módulo (Governança, Manutenção, ...) descobre o
  // tenant pela sessão, não pela URL (ver next.config.js), então o clique
  // no tile acabava abrindo os dados do tenant ERRADO (o da sessão antiga).
  // Mesmo guard já usado em configuracoes/uhs e configuracoes/usuarios.
  const sessionBruta = await getSession();
  const session = sessionBruta && sessionBruta.tenantId === tenant.id ? sessionBruta : null;
  const boundLogout = logoutAction.bind(null, tenant.slug);

  // Quando há módulos (o caso normal, com os tiles), o logo + nome do tenant
  // entra dentro de .buttonArea junto com o grid — pedido explícito pra
  // ficar mais perto dos tiles em vez de grudado no topo da tela, já que
  // .buttonArea centraliza tudo verticalmente no espaço livre abaixo do
  // topo. Nos outros dois casos (login, sem módulos) o header continua fixo
  // no topo, como sempre foi.
  const hasTiles = !!session && tenant.modules.length > 0;

  const header = (
    <div className={styles.header}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/praxis-logo.png" alt="Praxis" className={styles.logo} />
      <h1 className={styles.title}>{tenant.name}</h1>
    </div>
  );

  return (
    <main className={styles.main}>
      {session?.viaAdmin && (
        <div
          style={{
            background: "#1d1d1f",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            textAlign: "center",
            padding: "6px 12px",
          }}
        >
          Modo admin — acessando como {tenant.name}.{" "}
          <a href="/admin" style={{ color: "#fff", textDecoration: "underline" }}>
            Voltar ao painel
          </a>
        </div>
      )}

      {!hasTiles && header}

      {!session ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LoginForm clienteSlug={tenant.slug} />
        </div>
      ) : tenant.modules.length === 0 ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, textAlign: "center" }}>
          <p style={{ color: "#6e6e73", margin: 0 }}>
            Nenhum módulo de negócio disponível ainda nesta fundação.
          </p>
          <ModuleTile href={`/${tenant.slug}/configuracoes`} className={styles.tile} style={{ width: 96, height: 96 }}>
            <IconGear />
            <span className={styles.tileLabel}>Configurações</span>
          </ModuleTile>
        </div>
      ) : (
        <div className={styles.buttonArea}>
          <div className={`${styles.header} ${styles.headerAboveTiles}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/praxis-logo.png" alt="Praxis" className={styles.logo} />
            <h1 className={styles.title}>{tenant.name}</h1>
          </div>
          <div className={styles.grid}>
            {tenant.modules.map((m) => {
              const slug = moduleToSlug(m.module);
              const Icon = MODULE_ICON[m.module];
              return (
                <ModuleTile key={m.id} href={`/${tenant.slug}/${slug}`} className={styles.tile}>
                  <Icon />
                  <span className={styles.tileLabel}>{MODULE_LABELS[m.module]}</span>
                </ModuleTile>
              );
            })}

            <ModuleTile href={`/${tenant.slug}/configuracoes`} className={`${styles.tile} ${styles.tileConfig}`}>
              <IconGear />
              <span className={styles.tileLabel}>Configurações</span>
            </ModuleTile>
          </div>
        </div>
      )}

      {session && <PushRegistration />}

      {session && (
        <form action={boundLogout} className={styles.footer}>
          <span>
            {session.nome} · {ROLE_LABEL[session.role] ?? session.role}
          </span>
          <span>·</span>
          <button type="submit" className={styles.logoutBtn}>
            Sair
          </button>
        </form>
      )}
    </main>
  );
}
