import { useState } from 'react';
import { Janela, Campo, Botao, useToast } from '@mercado/shared';
import { auth } from './api.js';

const BFF = import.meta.env.VITE_BFF_URL;

const FILIAIS = [
  { id: 'par', nome: '1 — Parnamirim' },
  { id: 'mac', nome: '2 — Macaíba' },
  { id: 'nat', nome: '3 — Natal' },
];

// modo: 'func' = funcionário (username) | 'chefe' = dono de loja (email)
export default function Login({ titulo, aoEntrar, pedirFilial = true, aoRegistrar }) {
  const toast    = useToast();
  const [modo, setModo]     = useState('func');
  const [email, setEmail]   = useState('');
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha]   = useState('');
  const [filial, setFilial] = useState('par');
  const [loading, setLoading] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    if (!senha) return toast('Informe a senha');
    if (modo === 'func' && !usuario) return toast('Informe o nome de usuário');
    if (modo === 'chefe' && !email) return toast('Informe o e-mail');

    setLoading(true);
    try {
      const body = modo === 'chefe'
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
    } finally {
      setLoading(false);
    }
  }

  const abas = [
    { id: 'func',  label: 'Funcionário' },
    { id: 'chefe', label: 'Gestor / Dono' },
  ];

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--azul)', padding: 16 }}>
      <form onSubmit={entrar} style={{ width: '100%', maxWidth: 420 }}>
        <Janela titulo={titulo}>

          {/* Seletor de modo */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 14, border: '1.5px solid var(--linha)', borderRadius: 8, overflow: 'hidden' }}>
            {abas.map((a) => (
              <button key={a.id} type="button"
                onClick={() => setModo(a.id)}
                style={{
                  flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
                  fontWeight: modo === a.id ? 700 : 400,
                  background: modo === a.id ? 'var(--azul)' : 'var(--amarelo-bg)',
                  color: modo === a.id ? '#fff' : 'var(--texto)',
                  fontSize: 13, transition: 'background .15s',
                }}>
                {a.label}
              </button>
            ))}
          </div>

          {pedirFilial && (
            <Campo label="Filial">
              <select value={filial} onChange={(e) => setFilial(e.target.value)}>
                {FILIAIS.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </Campo>
          )}

          {modo === 'func' ? (
            <>
              <Campo label="Usuário" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus required
                placeholder="nome de usuário criado pelo gestor" />
              <p style={{ fontSize: 11, color: 'var(--cinza)', margin: '2px 0 8px' }}>
                Seu usuário e senha são criados pelo chefe/gestor.
              </p>
            </>
          ) : (
            <Campo label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required
              placeholder="email de cadastro da conta" />
          )}

          <Campo label="Senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
            {aoRegistrar && modo === 'chefe' && (
              <Botao type="button" onClick={aoRegistrar}>Criar conta</Botao>
            )}
            {modo === 'func' && <span />}
            <Botao primario type="submit" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</Botao>
          </div>
        </Janela>
      </form>
    </div>
  );
}
