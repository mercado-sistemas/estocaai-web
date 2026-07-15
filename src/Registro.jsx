import { useState } from 'react';
import { Janela, Campo, Botao, useToast } from './shared';
import { validarForm, r } from './validar.js';

const BFF = import.meta.env.VITE_BFF_URL;

const FORM0 = {
  nome: '', email: '', senha: '', confirmar: '',
  telefone: '',
  cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
};

const UFs = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export default function Registro({ aoRegistrar, aoVoltar }) {
  const toast = useToast();
  const [form, setForm]       = useState(FORM0);
  const [erros, setErros]     = useState({});
  const [loading, setLoading] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);

  const set = (k) => (e) => {
    setForm((prev) => ({ ...prev, [k]: e.target.value }));
    setErros((prev) => ({ ...prev, [k]: undefined }));
  };

  async function buscarCep(cep) {
    const limpo = cep.replace(/\D/g, '');
    if (limpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const d = await resp.json();
      if (d.erro) { toast('CEP não encontrado'); return; }
      setForm((prev) => ({
        ...prev,
        rua:    d.logradouro || prev.rua,
        bairro: d.bairro     || prev.bairro,
        cidade: d.localidade || prev.cidade,
        estado: d.uf         || prev.estado,
      }));
    } catch { toast('Falha ao buscar CEP'); }
    finally { setBuscandoCep(false); }
  }

  async function registrar(e) {
    e.preventDefault();
    const falhas = validarForm(form, {
      nome:     [r.obrigatorio, r.minLen(2), r.maxLen(100)],
      email:    [r.obrigatorio, r.email],
      senha:    [r.obrigatorio, r.minLen(6), r.maxLen(128)],
      confirmar:[r.obrigatorio, r.igual(form.senha, 'senha')],
      telefone: [r.minLen(8)],
      cep:      [r.minLen(8)],
      rua:      [r.obrigatorio, r.minLen(2)],
      numero:   [r.obrigatorio],
      bairro:   [r.obrigatorio],
      cidade:   [r.obrigatorio],
      estado:   [r.obrigatorio],
    });
    if (falhas) { setErros(falhas); toast(Object.values(falhas)[0]); return; }

    setLoading(true);
    try {
      const resp = await fetch(`${BFF}/api/auth/registrar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome.trim(),
          email: form.email.trim(),
          senha: form.senha,
          telefone: form.telefone.trim(),
          endereco: {
            cep: form.cep.replace(/\D/g, ''),
            rua: form.rua.trim(),
            numero: form.numero.trim(),
            complemento: form.complemento.trim(),
            bairro: form.bairro.trim(),
            cidade: form.cidade.trim(),
            estado: form.estado,
          },
        }),
      });
      const dados = await resp.json();
      if (!resp.ok) throw new Error(dados.erro || `Erro ${resp.status}`);
      localStorage.setItem('token', dados.token);
      aoRegistrar(dados);
    } catch (err) {
      toast(err.message);
    } finally {
      setLoading(false);
    }
  }

  const EMsg = ({ campo }) =>
    erros[campo]
      ? <span style={{ fontSize: 11, color: 'var(--vermelho)', marginTop: 2, display: 'block' }}>{erros[campo]}</span>
      : null;

  const Sec = ({ titulo }) => (
    <div style={{ margin: '14px 0 6px', fontWeight: 700, fontSize: 12, color: 'var(--azul)', borderBottom: '1px solid var(--linha)', paddingBottom: 3 }}>
      {titulo}
    </div>
  );

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--azul)', padding: '16px 16px 40px' }}>
      <form onSubmit={registrar} style={{ width: '100%', maxWidth: 540 }}>
        <Janela titulo="Criar conta — Mercado Suite">

          <Sec titulo="DADOS DE ACESSO" />
          <Campo label="Nome completo *" value={form.nome} onChange={set('nome')} autoFocus />
          <EMsg campo="nome" />
          <Campo label="E-mail *" type="email" value={form.email} onChange={set('email')} />
          <EMsg campo="email" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div>
              <Campo label="Senha * (mín. 6 car.)" type="password" value={form.senha} onChange={set('senha')} />
              <EMsg campo="senha" />
            </div>
            <div>
              <Campo label="Confirmar senha *" type="password" value={form.confirmar} onChange={set('confirmar')} />
              <EMsg campo="confirmar" />
            </div>
          </div>

          <Sec titulo="CONTATO" />
          <Campo label="Telefone / WhatsApp" type="tel" value={form.telefone} onChange={set('telefone')} placeholder="(84) 99999-0000" />
          <EMsg campo="telefone" />

          <Sec titulo="ENDEREÇO DA EMPRESA" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 6, alignItems: 'end' }}>
            <div>
              <Campo
                label={`CEP * ${buscandoCep ? '(buscando…)' : ''}`}
                value={form.cep}
                onChange={(e) => { set('cep')(e); }}
                onBlur={(e) => buscarCep(e.target.value)}
                placeholder="00000-000"
                maxLength={9}
              />
              <EMsg campo="cep" />
            </div>
            <div>
              <Campo label="Rua / Logradouro *" value={form.rua} onChange={set('rua')} />
              <EMsg campo="rua" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 6 }}>
            <div>
              <Campo label="Número *" value={form.numero} onChange={set('numero')} />
              <EMsg campo="numero" />
            </div>
            <div>
              <Campo label="Complemento" value={form.complemento} onChange={set('complemento')} placeholder="Apto, sala, loja…" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 6 }}>
            <div>
              <Campo label="Bairro *" value={form.bairro} onChange={set('bairro')} />
              <EMsg campo="bairro" />
            </div>
            <div>
              <Campo label="Cidade *" value={form.cidade} onChange={set('cidade')} />
              <EMsg campo="cidade" />
            </div>
            <div>
              <Campo label="UF *">
                <select value={form.estado} onChange={set('estado')}>
                  <option value="">—</option>
                  {UFs.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </Campo>
              <EMsg campo="estado" />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, gap: 8 }}>
            <Botao type="button" onClick={aoVoltar}>Já tenho conta</Botao>
            <Botao primario type="submit" disabled={loading}>
              {loading ? 'Criando…' : 'Criar conta'}
            </Botao>
          </div>
        </Janela>
      </form>
    </div>
  );
}
