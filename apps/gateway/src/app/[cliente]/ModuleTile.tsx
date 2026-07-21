"use client";
import type { ReactNode } from "react";
import { pushRegistrationSettled } from "./PushRegistration";

// Tile clicável do hub. Em vez de um <a href> puro — que dispara navegação
// de DOCUMENTO completa (o hub e cada módulo são apps Next.js separados,
// não dá pra usar next/link SPA entre eles) e mata na hora qualquer JS em
// andamento —, intercepta o clique e só navega depois que o registro de
// push termina (sucesso, negado, não-nativo, ou timeout de segurança — ver
// PushRegistration.tsx). Sem isso, o diálogo de permissão de notificação
// nunca chegava a aparecer pra quem tem um só módulo: o redirect acontecia
// rápido demais.
export default function ModuleTile({
  href,
  className,
  style,
  children,
}: {
  href: string;
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    pushRegistrationSettled.finally(() => {
      window.location.href = href;
    });
  }

  return (
    <a href={href} className={className} style={style} onClick={handleClick}>
      {children}
    </a>
  );
}
