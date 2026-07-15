// Retorna objeto { campo: mensagem } com os primeiros erros encontrados
export function validarForm(dados, schema) {
  const erros = {};
  for (const [campo, regras] of Object.entries(schema)) {
    const v = dados[campo];
    for (const regra of regras) {
      const msg = regra(v, campo);
      if (msg) { erros[campo] = msg; break; }
    }
  }
  return Object.keys(erros).length ? erros : null;
}

export const r = {
  obrigatorio: (v, c) => (!v && v !== 0) || String(v).trim() === '' ? `${c} é obrigatório` : null,
  email:       (v)    => v && !/^\S+@\S+\.\S+$/.test(v) ? 'E-mail inválido' : null,
  minLen: (n)  => (v, c) => v && String(v).trim().length < n ? `${c} deve ter ao menos ${n} caractere(s)` : null,
  maxLen: (n)  => (v, c) => v && String(v).trim().length > n ? `${c} deve ter no máximo ${n} caractere(s)` : null,
  positivo:    (v, c) => v != null && Number(v) <= 0 ? `${c} deve ser maior que zero` : null,
  naoNegativo: (v, c) => v != null && Number(v) < 0  ? `${c} não pode ser negativo` : null,
  igual: (outro, label) => (v) => v !== outro ? `Confirmação não confere com ${label}` : null,
};
