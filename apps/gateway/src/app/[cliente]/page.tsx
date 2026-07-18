import { notFound } from "next/navigation";
import { prisma, getSession, moduleToSlug, MODULE_LABELS, type SuiteModule } from "@praxis/core";
import { logoutAction } from "./actions";
import { LoginForm } from "./LoginForm";
import PushRegistration from "./PushRegistration";
import { IconBed, IconWrench, IconStar, IconGear } from "@/lib/icons";
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

  const session = await getSession();
  const boundLogout = logoutAction.bind(null, tenant.slug);

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/praxis-logo.png" alt="Praxis" className={styles.logo} />
        <h1 className={styles.title}>{tenant.name}</h1>
      </div>

      {!session ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LoginForm clienteSlug={tenant.slug} />
        </div>
      ) : tenant.modules.length === 0 ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, textAlign: "center" }}>
          <p style={{ color: "#6e6e73", margin: 0 }}>
            Nenhum módulo de negócio disponível ainda nesta fundação.
          </p>
          <a href={`/${tenant.slug}/configuracoes`} className={styles.tile} style={{ width: 96, height: 96 }}>
            <IconGear />
            <span className={styles.tileLabel}>Configurações</span>
          </a>
        </div>
      ) : (
        <div className={styles.buttonArea}>
          <div className={styles.grid}>
            {tenant.modules.map((m) => {
              const slug = moduleToSlug(m.module);
              const Icon = MODULE_ICON[m.module];
              return (
                <a key={m.id} href={`/${tenant.slug}/${slug}`} className={styles.tile}>
                  <Icon />
                  <span className={styles.tileLabel}>{MODULE_LABELS[m.module]}</span>
                </a>
              );
            })}

            <a href={`/${tenant.slug}/configuracoes`} className={`${styles.tile} ${styles.tileConfig}`}>
              <IconGear />
              <span className={styles.tileLabel}>Configurações</span>
            </a>
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
