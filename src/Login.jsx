import { useState } from 'react';
import { Janela, Campo, Botao, useToast } from './shared';

const BFF = import.meta.env.VITE_BFF_URL;

export default function Login({ titulo, aoEntrar, aoRegistrar }) {
  const toast = useToast();
  const [modo, setModo]     = useState('func');
  const [email, setEmail]   = useState('');
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha]   = useState('');
  const [loading, setLoading] = useState(false);

  // passo 2 — selecionar filial
  const [dadosAuth, setDadosAuth] = useState(null); // token + lojas retornados pela API
  const [filialSel, setFilialSel] = useState('');

  async function entrar(e) {
    e.preventDefault();
    if (!senha) return toast('Informe a senha');
    if (modo === 'func'  && !usuario) return toast('Informe o nome de usuário');
    if (modo === 'chefe' && !email)   return toast('Informe o e-mail');

    setLoading(true);
    try {
      const body = modo === 'chefe' ? { email, senha } : { usuario, senha };
      const r = await fetch(`${BFF}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const texto = await r.text();
      const dados = texto ? JSON.parse(texto) : {};
      if (!r.ok) throw new Error(dados.erro || dados.message || `Erro ${r.status}`);

      // Se a API já retornar as filiais, usa; senão busca
      const lojas = dados.lojas || await buscarLojas(dados.token);
      if (!lojas || lojas.length === 0) throw new Error('Nenhuma filial encontrada para este usuário.');

      if (lojas.length === 1) {
        // apenas uma filial → entra direto
        aoEntrar({ ...dados, filial: lojas[0].id, filialNome: lojas[0].nome });
      } else {
        setDadosAuth({ ...dados, lojas });
        setFilialSel(lojas[0].id);
      }
    } catch (err) {
      toast(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function buscarLojas(token) {
    try {
      const r = await fetch(`${BFF}/api/lojas`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const texto = await r.text();
      return texto ? JSON.parse(texto) : [];
    } catch {
      return [];
    }
  }

  function conectar(e) {
    e.preventDefault();
    const loja = dadosAuth.lojas.find((l) => l.id === filialSel);
    aoEntrar({ ...dadosAuth, filial: filialSel, filialNome: loja?.nome });
  }

  const abas = [
    { id: 'func',  label: 'Funcionário' },
    { id: 'chefe', label: 'Gestor / Dono' },
  ];

  // ── Passo 2: selecionar filial ───────────────────────────────────────────
  if (dadosAuth) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--azul)', padding: 16 }}>
        <form onSubmit={conectar} style={{ width: '100%', maxWidth: 400 }}>
          <Janela titulo="Selecione a filial">
            <p style={{ color: 'var(--cinza)', fontSize: 13, marginBottom: 16 }}>
              Olá, <b>{dadosAuth.nome || dadosAuth.usuario}</b>. Escolha a filial que deseja acessar:
            </p>
            <Campo label="Filial">
              <select value={filialSel} onChange={(e) => setFilialSel(e.target.value)} autoFocus>
                {dadosAuth.lojas.map((l) => (
                  <option key={l.id} value={l.id}>{l.nome}</option>
                ))}
              </select>
            </Campo>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, gap: 8 }}>
              <Botao type="button" onClick={() => setDadosAuth(null)}>← Voltar</Botao>
              <Botao primario type="submit">Entrar</Botao>
            </div>
          </Janela>
        </form>
      </div>
    );
  }

  // ── Passo 1: credenciais ─────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--azul)', padding: 16 }}>
      <form onSubmit={entrar} style={{ width: '100%', maxWidth: 420 }}>
        <Janela titulo={titulo}>

          <div style={{ display: 'flex', gap: 0, marginBottom: 16, border: '1.5px solid var(--linha)', borderRadius: 8, overflow: 'hidden' }}>
            {abas.map((a) => (
              <button key={a.id} type="button" onClick={() => setModo(a.id)}
                style={{
                  flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                  fontWeight: modo === a.id ? 700 : 400,
                  background: modo === a.id ? 'var(--azul)' : 'var(--amarelo-bg)',
                  color: modo === a.id ? '#fff' : 'var(--texto)',
                  fontSize: 14,
                }}>
                {a.label}
              </button>
            ))}
          </div>

          {modo === 'func' ? (
            <Campo label="Usuário" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus required
              placeholder="nome de usuário" />
          ) : (
            <Campo label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required
              placeholder="seu e-mail de cadastro" />
          )}

          <Campo label="Senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required
            placeholder="••••••" />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, gap: 8 }}>
            {aoRegistrar && modo === 'chefe' ? (
              <Botao type="button" onClick={aoRegistrar}>Criar conta</Botao>
            ) : <span />}
            <Botao primario type="submit" disabled={loading}>
              {loading ? 'Verificando…' : 'Continuar →'}
            </Botao>
          </div>
        </Janela>
      </form>
    </div>
  );
}
