import { useState } from 'react';
import { Janela, Campo, Botao, useToast } from '@mercado/shared';
import { auth } from './api.js';

const BFF = import.meta.env.VITE_BFF_URL;

export default function Login({ titulo, aoEntrar, pedirFilial = true, aoRegistrar }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [filial, setFilial] = useState('par');
  const [modoEmail, setModoEmail] = useState(false); // false = login por usuário, true = login por email

  async function entrar(e) {
    e.preventDefault();
    try {
      const body = modoEmail
        ? { email, senha, filial }
        : { usuario, senha, filial };

      const r = await fetch(`${BFF}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados.erro || `Erro ${r.status}`);
      auth.set(dados.token);
      aoEntrar(dados);
    } catch (err) {
      toast(err.message);
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--azul)', padding: 16 }}>
      <form onSubmit={entrar} style={{ width: '100%', maxWidth: 420 }}>
        <Janela titulo={titulo}>
          {pedirFilial && (
            <Campo label="Filial">
              <select value={filial} onChange={(e) => setFilial(e.target.value)}>
                <option value="par">1 — Parnamirim</option>
                <option value="mac">2 — Macaíba</option>
                <option value="nat">3 — Natal</option>
              </select>
            </Campo>
          )}
          {modoEmail ? (
            <Campo label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
          ) : (
            <Campo label="Usuário" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus required />
          )}
          <Campo label="Senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setModoEmail(!modoEmail)}
              style={{ background: 'none', border: 'none', color: 'var(--azul)', textDecoration: 'underline', cursor: 'pointer', fontSize: 12 }}>
              {modoEmail ? 'Login por usuário' : 'Login com e-mail (gestor)'}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              {aoRegistrar && (
                <Botao type="button" onClick={aoRegistrar}>Criar conta</Botao>
              )}
              <Botao primario type="submit">Entrar</Botao>
            </div>
          </div>
        </Janela>
      </form>
    </div>
  );
}
