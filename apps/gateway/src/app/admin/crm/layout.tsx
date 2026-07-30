// Layout com parallel route @modal — necessário pro popup de lead (ver
// @modal/(.)[leadId]/page.tsx). `children` é a rota normal (board, etapas,
// campos, ou a página cheia de um lead); `modal` só renderiza algo quando a
// rota interceptadora bate.
export default function CrmLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
