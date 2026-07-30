"use client";

// Botão de excluir com confirmação — mesmo padrão de EtapaCard/CampoCard
// (form + onSubmit com confirm(), sem useFormState porque não há erro pra
// mostrar: a única forma de falhar é o lead já não existir mais, e nesse
// caso excluirLeadAction só ignora e redireciona mesmo assim).
export function ExcluirLeadButton({
  nomeHotel,
  action,
}: {
  nomeHotel: string;
  action: () => Promise<void>;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            `Excluir o lead "${nomeHotel}"? Isso apaga o histórico e os campos personalizados dele também. Não tem como desfazer.`
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        style={{
          padding: "8px 14px",
          borderRadius: 9,
          border: "1px solid #ffd7d7",
          background: "#fff",
          color: "#d70015",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Excluir lead
      </button>
    </form>
  );
}
