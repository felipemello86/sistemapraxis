"use client";

// Campo de valor em formato de moeda — pedido do Felipe, 07/08/2026: "o
// formato de valor tem q ser de moeda e n de numero comum" (reação aos
// campos de Valor de Transações Automatizadas, que eram <input
// type="number"> puro mostrando "1" em vez de "R$ 1,00"). Mascara por
// dígitos, padrão de campo de valor em BRL: os últimos 2 dígitos digitados
// são sempre os centavos, o resto é a parte inteira — evita o usuário
// precisar digitar ponto/vírgula manualmente e o campo sempre mostra
// "R$ X,XX" formatado enquanto digita.
//
// value/onChange trafegam como string numérica com ponto decimal (ex.:
// "1234.56"), mesmo formato que os outros formulários de valor do app já
// usam (ver form.valor em LancamentosView.tsx etc.) — só a EXIBIÇÃO muda,
// não o formato de dado trafegado, pra não precisar mexer em nenhum outro
// lugar que já lê/grava esse valor.

export function InputMoeda({
  value,
  onChange,
  className = "input",
  placeholder = "R$ 0,00",
  autoFocus,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  function formatarExibicao(v: string): string {
    if (!v) return "";
    const n = Number(v);
    if (Number.isNaN(n)) return "";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function aoDigitar(e: React.ChangeEvent<HTMLInputElement>) {
    const digitos = e.target.value.replace(/\D/g, "");
    if (!digitos) {
      onChange("");
      return;
    }
    // Remove zeros à esquerda demais (limita a magnitude só por sanidade de
    // digitação, não é uma validação de negócio — isso já é feito no
    // salvar()/validarDadosRegra de cada tela).
    const numero = Number(digitos) / 100;
    onChange(numero.toFixed(2));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      className={className}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      value={formatarExibicao(value)}
      onChange={aoDigitar}
    />
  );
}
