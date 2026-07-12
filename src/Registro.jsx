import { useState } from 'react';
import { Janela, Campo, Botao, useToast } from '@mercado/shared';

const BFF = import.meta.env.VITE_BFF_URL;

export default function Registro({ aoRegistrar, aoVoltar }) {
  const toast = useToast();
  const [form, setForm] = useState({ nome: '', email: '', senha: '', confirmar: '' });
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function registrar(e) {
    e.preventDefault();
    if (form.senha !== form.confirmar) return toast('As senhas não coincidem.');
    setLoading(true);
    try {
      const r = await fetch(`${BFF}/api/auth/registrar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nome: form.nome, email: form.email, senha: form.senha }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados.erro || `Erro ${r.status}`);
      localStorage.setItem('token', dados.token);
      toast('Conta criada com sucesso!');
      aoRegistrar(dados);
    } catch (err) {
      toast(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--azul)', padding: 16 }}>
      <form onSubmit={registrar} style={{ width: '100%', maxWidth: 420 }}>
        <Janela titulo="Criar conta — Mercado Suite">
          <Campo label="Nome completo *" value={form.nome} onChange={set('nome')} required autoFocus />
          <Campo label="E-mail *" type="email" value={form.email} onChange={set('email')} required />
          <Campo label="Senha * (mín. 6 caracteres)" type="password" value={form.senha} onChange={set('senha')} required minLength={6} />
          <Campo label="Confirmar senha *" type="password" value={form.confirmar} onChange={set('confirmar')} required />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, gap: 8 }}>
            <Botao type="button" onClick={aoVoltar}>Já tenho conta</Botao>
            <Botao primario type="submit" disabled={loading}>{loading ? 'Criando…' : 'Criar conta'}</Botao>
          </div>
        </Janela>
      </form>
    </div>
  );
}
