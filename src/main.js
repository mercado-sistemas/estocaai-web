// ─── Config ───────────────────────────────────────────────────────────────────
const BFF = import.meta.env.VITE_BFF_URL;

// ─── Auth ─────────────────────────────────────────────────────────────────────
let _token = localStorage.getItem('ea_token') || null;
const auth = {
  set(t) { _token = t; localStorage.setItem('ea_token', t); },
  clear() { _token = null; localStorage.removeItem('ea_token'); },
};

async function apiFetch(path, { method = 'GET', body } = {}) {
  const r = await fetch(`${BFF}/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(_token ? { authorization: `Bearer ${_token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.erro || `Erro ${r.status}`);
  return data;
}

// ─── Estado ───────────────────────────────────────────────────────────────────
let FILIAIS = [];
let PRODUTOS = [];
let filialAtual = 'todas';
let prodSel = null;
let consCampo = 'nome';
let exibirSemEstoque = true;
let sessao = null;
let _searchTimer = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const $ = s => document.querySelector(s);
const brl = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nomeFil = id => id === 'todas' ? 'Todas' : (FILIAIS.find(f => f.id === id)?.nome || id);
const saldoTotal = p => FILIAIS.reduce((s, f) => s + ((p.saldo ?? {})[f.id] || 0), 0);
const saldoVisto = p => filialAtual === 'todas' ? saldoTotal(p) : ((p.saldo ?? {})[filialAtual] || 0);

function toast(m) {
  const t = $('#toast');
  t.innerHTML = m;
  t.classList.add('mostra');
  clearTimeout(t._x);
  t._x = setTimeout(() => t.classList.remove('mostra'), 2800);
}

function stub(nome) {
  abrirJanela(nome, `
    <div style="padding:26px 10px; text-align:center; color:var(--cinza)">
      <div style="font-size:34px; margin-bottom:10px">🚧</div>
      <b style="color:var(--azul); font-size:15px">${nome}</b><br>
      Este módulo existe no menu para manter o mapa completo,<br>mas ainda não faz parte do escopo atual.
    </div>
    <div class="rodape-form"><button class="btn-acao" onclick="fecharJanela()">(ESC) Fechar</button></div>`);
}

// ─── Janelas ──────────────────────────────────────────────────────────────────
function abrirJanela(titulo, html, larg) {
  fecharJanela();
  const j = document.createElement('div');
  j.className = 'janela'; j.id = 'janela-ativa';
  if (larg) j.style.maxWidth = larg + 'px';
  j.innerHTML = `<div class="janela-cab"><div class="dobra"></div><div class="tit">${titulo}</div>
    <button class="fechar" onclick="fecharJanela()" aria-label="Fechar">✕</button></div>
    <div class="janela-corpo">${html}</div>`;
  $('#mesa').appendChild(j);
}
function fecharJanela() { $('#janela-ativa')?.remove(); }

// ─── Login — abas ─────────────────────────────────────────────────────────────
let _modoLogin = 'func'; // 'func' | 'chefe'

function trocarAba(modo) {
  _modoLogin = modo;
  $('#aba-func').classList.toggle('aba-ativa', modo === 'func');
  $('#aba-chefe').classList.toggle('aba-ativa', modo === 'chefe');
  $('#campo-usr').classList.toggle('hide', modo !== 'func');
  $('#campo-email').classList.toggle('hide', modo !== 'chefe');
  $('#btn-cadastro').classList.toggle('hide', modo !== 'chefe');
  // foco no campo visível
  setTimeout(() => (modo === 'func' ? $('#lg-usr') : $('#lg-email'))?.focus(), 40);
}

function abrirCadastroGestor() {
  let v = $('#veu-cadastro');
  if (!v) {
    v = document.createElement('div');
    v.id = 'veu-cadastro';
    v.className = 'veu-login';
    v.style.cssText = 'z-index:300;overflow-y:auto';
    v.innerHTML = `
      <div class="janela-login" style="max-width:500px;width:100%">
        <div class="janela-cab"><div class="dobra"></div><div class="tit">CRIAR CONTA — GESTOR / DONO</div></div>
        <div style="padding:22px;">
          <div class="form-linha"><label>Nome *</label><input id="cad-nome" placeholder="Seu nome completo"></div>
          <div class="form-linha"><label>E-mail *</label><input id="cad-email" type="email" placeholder="email@empresa.com"></div>
          <div class="form-linha"><label>Senha *</label><input id="cad-sen" type="password" placeholder="mínimo 6 caracteres"></div>
          <div class="form-linha"><label>Telefone *</label><input id="cad-tel" type="tel" placeholder="(00) 00000-0000"></div>
          <div style="border-top:1px solid var(--linha);margin:10px 0 8px;padding-top:8px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--azul)">Endereço</div>
          <div class="form-linha">
            <label>CEP *</label>
            <div style="display:flex;gap:8px;align-items:center">
              <input id="cad-cep" placeholder="00000-000" maxlength="9" style="width:140px" oninput="buscarCepCadastro(this.value)">
              <span id="cad-cep-st" style="font-size:12px;color:var(--cinza)"></span>
            </div>
          </div>
          <div class="form-linha"><label>Rua *</label><input id="cad-rua" placeholder="Preenchido pelo CEP"></div>
          <div class="form-linha"><label>Número *</label><input id="cad-num" style="width:100px"></div>
          <div class="form-linha"><label>Complemento</label><input id="cad-comp" placeholder="Apto, sala…"></div>
          <div class="form-linha"><label>Bairro *</label><input id="cad-bairro"></div>
          <div class="form-linha"><label>Cidade *</label><input id="cad-cidade"></div>
          <div class="form-linha"><label>Estado (UF) *</label><input id="cad-uf" maxlength="2" style="width:60px" placeholder="SP"></div>
          <div class="rodape-form">
            <button class="btn-acao" onclick="fecharCadastro()">Cancelar</button>
            <button class="btn-acao primario" onclick="registrarGestor()">Criar conta</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(v);
  }
  ['cad-nome','cad-email','cad-sen','cad-sen-conf','cad-tel','cad-cep','cad-rua','cad-num','cad-comp','cad-bairro','cad-cidade','cad-uf']
    .forEach(id => { const el = $(`#${id}`); if (el) el.value = ''; });
  v.classList.remove('hide');
  setTimeout(() => $('#cad-nome')?.focus(), 40);
}

async function buscarCepCadastro(valor) {
  const cep = valor.replace(/\D/g, '');
  const st = $('#cad-cep-st');
  if (cep.length !== 8) return;
  if (st) st.textContent = 'Buscando…';
  try {
    const d = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then(r => r.json());
    if (d.erro) { if (st) st.textContent = 'CEP não encontrado'; return; }
    if ($('#cad-rua'))    $('#cad-rua').value    = d.logradouro || '';
    if ($('#cad-bairro')) $('#cad-bairro').value = d.bairro     || '';
    if ($('#cad-cidade')) $('#cad-cidade').value = d.localidade || '';
    if ($('#cad-uf'))     $('#cad-uf').value     = d.uf         || '';
    if (st) st.textContent = '✓';
    setTimeout(() => $('#cad-num')?.focus(), 40);
  } catch { if (st) st.textContent = 'Erro'; }
}

function fecharCadastro() {
  $('#veu-cadastro')?.classList.add('hide');
}

async function registrarGestor() {
  const nome  = $('#cad-nome').value.trim();
  const email = $('#cad-email').value.trim();
  const senha = $('#cad-sen').value;
  const senhaConf = $('#cad-sen-conf')?.value;
  const telefone = $('#cad-tel')?.value.trim();
  const cep     = $('#cad-cep')?.value.trim();
  const rua     = $('#cad-rua')?.value.trim();
  const numero  = $('#cad-num')?.value.trim();
  const bairro  = $('#cad-bairro')?.value.trim();
  const cidade  = $('#cad-cidade')?.value.trim();
  const estado  = $('#cad-uf')?.value.trim().toUpperCase();

  if (!nome)            return toast('Informe seu nome.');
  if (!email)           return toast('Informe o e-mail.');
  if (senha.length < 6)  return toast('Senha deve ter ao menos 6 caracteres.');
  if (senha !== senhaConf) return toast('As senhas não conferem.');
  if (!telefone)        return toast('Informe o telefone.');
  if (!cep)             return toast('Informe o CEP.');
  if (!rua)             return toast('Informe a rua.');
  if (!numero)          return toast('Informe o número.');
  if (!bairro)          return toast('Informe o bairro.');
  if (!cidade)          return toast('Informe a cidade.');
  if (!estado)          return toast('Informe o estado (UF).');

  const body = {
    nome, email, senha, telefone,
    endereco: {
      cep, rua, numero,
      complemento: $('#cad-comp')?.value.trim() || undefined,
      bairro, cidade, estado,
    },
  };

  try {
    const r = await fetch(`${BFF}/api/auth/registrar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erro || d.message || `Erro ${r.status}`);
    fecharCadastro();
    toast(`Conta criada! Faça login com <b>${email}</b>.`);
    trocarAba('chefe');
    setTimeout(() => { if ($('#lg-email')) $('#lg-email').value = email; }, 100);
  } catch (err) {
    toast(err.message);
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function entrar() {
  const loginVal = _modoLogin === 'chefe'
    ? ($('#lg-email')?.value || '').trim()
    : ($('#lg-usr')?.value || '').trim();
  const senhaVal = $('#lg-sen').value.trim();
  if (!loginVal) return toast(_modoLogin === 'chefe' ? 'Informe o e-mail.' : 'Informe o usuário.');
  if (!senhaVal) return toast('Informe a senha.');

  const btn = $('#btn-entrar');
  btn.disabled = true; btn.textContent = 'Verificando…';

  try {
    const r = await fetch(`${BFF}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: loginVal, senha: senhaVal }),
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados.erro || dados.message || `Erro ${r.status}`);

    auth.set(dados.token);
    sessao = dados;

    // Owner (ADMIN) loads all lojas from /lojas endpoint
    // Employee only gets assigned lojas from login response
    if (dados.role === 'ADMIN') {
      try {
        const lojas = await apiFetch('/lojas');
        if (lojas && lojas.length > 0) FILIAIS = lojas;
      } catch (_) {
        if (dados.lojas?.length > 0) FILIAIS = dados.lojas;
      }
    } else {
      FILIAIS = dados.lojas || [];
    }

    $('#veu-login').classList.add('hide');

    if (FILIAIS.length === 0) {
      filialAtual = 'todas';
      entrarNoSistema(dados, loginVal);
    } else if (FILIAIS.length === 1) {
      filialAtual = FILIAIS[0].id;
      entrarNoSistema(dados, loginVal);
    } else {
      // Show filial picker
      const lista = $('#lista-filiais-picker');
      const lojasBtns = FILIAIS.map((f, i) =>
        `<button class="btn-acao" style="text-align:left; padding:12px 16px; font-size:14px"
           onclick="selecionarFilialLogin('${f.id}')">
           <b>${i + 1}</b> — ${f.nome}
         </button>`
      ).join('');
      lista.innerHTML = lojasBtns;
      $('#veu-filial').classList.remove('hide');
      window._dadosLogin = dados;
      window._loginVal = loginVal;
    }
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Ok';
  }
}

function selecionarFilialLogin(id) {
  filialAtual = id;
  $('#veu-filial').classList.add('hide');
  entrarNoSistema(window._dadosLogin, window._loginVal);
}

function entrarNoSistema(dados, loginVal) {
  $('#st-usuario').textContent = dados.nome || loginVal.toUpperCase();
  $('#st-filial').textContent = nomeFil(filialAtual);
  toast(`Bem-vindo(a), <b>${dados.nome || loginVal}</b>! Tecle <b>F7</b> para abrir Produtos.`);
}

// ─── Opções auxiliares ────────────────────────────────────────────────────────
const optsProd = sel => PRODUTOS.map(p =>
  `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${p.cod} — ${p.nome}</option>`
).join('');

const optsFil = sel => FILIAIS.map(f =>
  `<option value="${f.id}" ${f.id === (sel || filialAtual === 'todas' ? FILIAIS[0]?.id : filialAtual) ? 'selected' : ''}>${f.nome}</option>`
).join('');

// ─── F7 Produtos ──────────────────────────────────────────────────────────────
function janelaProdutos() {
  abrirJanela('Produtos', `
    <div class="moldura-grid"><table class="tabela" id="grid-prod">
      <thead><tr>
        <th>Código</th><th>Cód. Fábrica</th><th>Descrição do Produto</th>
        <th class="num">Quantia</th><th class="num">Preço Venda</th>
      </tr></thead>
      <tbody><tr><td colspan="5" style="text-align:center;color:var(--cinza);padding:18px">Carregando…</td></tr></tbody>
    </table></div>

    <div class="painel-det" id="det-prod"></div>

    <div class="grade-botoes">
      <button class="btn-acao" onclick="abrirNovoProduto()">Incluir</button>
      <button class="btn-acao" onclick="abrirEditarProduto()">Alterar</button>
      <button class="btn-acao" onclick="stub('Ativar/Desativar')">Ativar/Desativar</button>
      <button class="btn-acao" onclick="detalhesEstoque()"><kbd>7</kbd>-Detalhes de Estoque</button>
      <button class="btn-acao" onclick="produtoSimilar()"><kbd>9</kbd>-Produto Similar</button>
      <button class="btn-acao" onclick="totaliza()">Totaliza</button>
      <button class="btn-acao" onclick="analisaProduto()">Analisa Produto</button>
      <button class="btn-acao" onclick="janelaPrecificar()"><kbd>L</kbd>-Formação do Preço de Venda</button>
      <button class="btn-acao" onclick="stub('Duplicar Produto')"><kbd>M</kbd>-Duplicar Produto</button>
      <button class="btn-acao" onclick="stub('Imagens do Produto')"><kbd>6</kbd>-Imagens</button>
      <button class="btn-acao" onclick="stub('Detalhes do Custo')"><kbd>0</kbd>-Detalhes do Custo</button>
      <button class="btn-acao primario" onclick="detalhesEstoque()">Estoque das Filiais</button>
    </div>

    <div class="consulta">
      <div class="radios"><b>Cons:</b>
        <label><input type="radio" name="cons" onchange="consCampo='cod'; buscarProdutos()"> Código</label>
        <label><input type="radio" name="cons" onchange="consCampo='nome'; buscarProdutos()" checked> Descrição</label>
        <label><input type="radio" name="cons" onchange="consCampo='barras'; buscarProdutos()"> Cód de Barras</label>
        <label style="margin-left:auto">
          <input type="checkbox" checked onchange="exibirSemEstoque=this.checked; renderGridProd()">
          Exibir sem estoque
        </label>
      </div>
      <div class="linha-consulta">
        <input type="text" id="in-cons" placeholder="Digite e tecle Enter para consultar… (use % como curinga)" autocomplete="off">
        <button class="btn-acao" onclick="fecharJanela()">(ESC) Fechar</button>
      </div>
    </div>`, 980);

  $('#in-cons').addEventListener('input', () => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(buscarProdutos, 400);
  });
  $('#in-cons').addEventListener('keydown', e => {
    if (e.key === 'Enter') { clearTimeout(_searchTimer); buscarProdutos(); }
  });

  buscarProdutos();
  setTimeout(() => $('#in-cons')?.focus(), 60);
}

async function buscarProdutos() {
  const q = ($('#in-cons')?.value || '').trim();
  const tb = document.querySelector('#grid-prod tbody');
  if (!tb) return;

  tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--cinza);padding:18px">Carregando…</td></tr>';
  try {
    PRODUTOS = await apiFetch(`/produtos${q ? '?busca=' + encodeURIComponent(q) : ''}`);
    if (!prodSel && PRODUTOS.length > 0) prodSel = PRODUTOS[0].id;
    renderGridProd();
  } catch (e) {
    tb.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--vermelho);padding:18px">${e.message}</td></tr>`;
  }
}

function renderGridProd() {
  const q = ($('#in-cons')?.value || '').trim().toLowerCase();
  const tb = document.querySelector('#grid-prod tbody');
  if (!tb) return;

  const lista = PRODUTOS.filter(p => {
    if (!exibirSemEstoque && saldoVisto(p) === 0) return false;
    if (!q) return true;
    const campo = consCampo === 'cod' ? p.cod : (consCampo === 'barras' ? (p.barras || '') : p.nome);
    return String(campo || '').toLowerCase().includes(q);
  });

  tb.innerHTML = lista.map(p => `
    <tr class="${p.id === prodSel ? 'sel' : ''}" onclick="prodSel='${p.id}'; renderGridProd()">
      <td class="num">${p.cod}</td>
      <td>${p.fab || ''}</td>
      <td>${p.nome}</td>
      <td class="num ${saldoVisto(p) === 0 ? 'neg' : ''}">${saldoVisto(p).toFixed(2).replace('.', ',')}</td>
      <td class="num">${brl(p.preco)}</td>
    </tr>`).join('') ||
    `<tr><td colspan="5" style="text-align:center;color:var(--cinza);padding:18px">Nenhum produto encontrado.</td></tr>`;

  renderDetProd();
}

function renderDetProd() {
  const p = PRODUTOS.find(x => x.id === prodSel);
  const c = $('#det-prod');
  if (!c || !p) return;
  c.innerHTML = `
    <div class="bloco-det" style="grid-column:1/-1">
      <div class="lin"><span>Descrição…:</span><b style="color:var(--azul)">${p.nome}</b></div>
    </div>
    <div class="bloco-det"><div class="bloco-tit">Custo e Preços de Venda</div>
      <div class="lin"><span>C. Aquisição..:</span><b>${brl(p.custo)}</b></div>
      <div class="lin"><span>Markup……..:</span><b>${p.markup ? p.markup.toFixed(4).replace('.', ',') : '—'}</b></div>
      <div class="lin"><span>Preço de Venda:</span><b>${brl(p.preco)}</b></div>
      <div class="lin"><span>Preço Mínimo..:</span><b>${brl(p.precoMin)}</b></div>
      <div class="lin"><span>% IPI / Sit.Trib:</span><b>${p.ipi != null ? p.ipi.toFixed(2) : '—'} / ${p.sit != null ? p.sit.toFixed(2) : '—'}</b></div>
    </div>
    <div class="bloco-det"><div class="bloco-tit">Datas e Localização</div>
      <div class="lin"><span>Dt.Últ.Alt…:</span><b>${p.dtAlt || '—'}</b></div>
      <div class="lin"><span>Data Cadastro:</span><b>${p.dtCad || '—'}</b></div>
      <div class="lin"><span>Local:</span><b>—</b></div>
    </div>
    <div class="bloco-det"><div class="bloco-tit">Qtdes e Departamento</div>
      <div class="lin"><span>Estoque Mínimo:</span><b>${(p.min || 0).toFixed(3).replace('.', ',')}</b></div>
      <div class="lin"><span>Estoque Máximo:</span><b>${(p.max || 0).toFixed(3).replace('.', ',')}</b></div>
      <div class="lin"><span>Grupo / Dpto:</span><b>${p.grupo || '—'}</b></div>
    </div>
    <div class="bloco-det"><div class="bloco-tit">Outras</div>
      <div class="lin"><span>Unidade..:</span><b>${p.un || '—'}</b></div>
      <div class="lin"><span>NCM……….:</span><b>${p.ncm || '—'}</b></div>
      <div class="lin"><span>Cod.Barra:</span><b>${p.barras || '—'}</b></div>
      <div class="lin"><span>CST/CSOSN:</span><b>${p.cst || '—'}</b></div>
      <div class="lin"><span>CEST……:</span><b>${p.cest || '—'}</b></div>
    </div>`;
}

// ─── Incluir / Alterar Produto ────────────────────────────────────────────────
function abrirNovoProduto() {
  _formProduto(null);
}
function abrirEditarProduto() {
  const p = PRODUTOS.find(x => x.id === prodSel);
  if (!p) return toast('Selecione um produto para alterar.');
  _formProduto(p);
}
/* ─── Incluir/Alterar Produto ──────────────────────────────────────────────────
   O campo Código também busca: digitou um código já cadastrado (ou o nome), a
   tela vira "Alterar" e mostra o estoque. A faixa de quantidade grava cadastro e
   entrada de estoque de uma vez, e o painel da NF-e traz os itens do fornecedor
   sem digitação. */
let FP = { produto: null, nota: null, buscaTimer: null };

function _formProduto(p) {
  FP = { produto: p || null, nota: null, buscaTimer: null };
  abrirJanela('Incluir Produto', `
    <div style="display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:14px; align-items:start">
      <form onsubmit="salvarProduto(event)">
        <div class="form-linha">
          <label>Código *</label>
          <div style="position:relative; flex:1">
            <div style="display:flex; gap:6px">
              <input id="fp-cod" placeholder="Bipe, digite o código ou o nome…" autocomplete="off" required style="flex:1">
              <button class="btn-acao primario" type="button" onclick="escanearPeloCelular()"
                      title="Escanear o código do produto pelo celular">📷</button>
            </div>
            <div id="fp-sug"></div>
          </div>
        </div>
        <div class="form-linha"><label>Descrição *</label><input id="fp-nome" required></div>
        <div class="form-linha"><label>UN</label><input id="fp-un" value="UN" list="fp-uns">
          <datalist id="fp-uns"><option>UN</option><option>KG</option><option>CX</option><option>LT</option><option>MT</option><option>PC</option></datalist>
        </div>
        <div class="form-linha"><label>Grupo</label><input id="fp-grupo" list="fp-grupos">
          <datalist id="fp-grupos"></datalist>
        </div>
        <div class="form-linha"><label>Est. Mínimo</label><input id="fp-min" type="number" min="0" value="0"></div>
        <div class="form-linha"><label>Custo (R$)</label><input id="fp-custo" type="number" step="any" min="0"></div>
        <div class="form-linha"><label>Preço Venda *</label><input id="fp-preco" type="number" step="any" min="0.01" required></div>
        <div class="form-linha"><label>Preço Mínimo</label><input id="fp-precoMin" type="number" step="any" min="0"></div>

        <div id="fp-estoque" style="margin-top:10px"></div>

        <div class="rodape-form">
          <button class="btn-acao" type="button" onclick="janelaProdutos()">(ESC) Voltar</button>
          <button class="btn-acao primario" type="submit" id="btn-salvar-prod">Gravar e continuar</button>
        </div>
      </form>

      <div id="fp-nfe"></div>
    </div>`, 940);

  $('#fp-cod').addEventListener('input', fpBuscaCodigo);
  $('#fp-cod').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const s = document.querySelector('#fp-sug .fp-sug-item');
      if (s) s.click(); else $('#fp-nome').focus();
    }
  });
  fpGrupos();
  if (p) fpCarregar(p); else fpRender();
  setTimeout(() => $('#fp-cod')?.focus(), 60);
}

/** Alimenta o datalist de grupos com os que já existem no cadastro. */
function fpGrupos() {
  const grupos = [...new Set(PRODUTOS.map(x => x.grupo).filter(Boolean))].sort();
  const dl = $('#fp-grupos');
  if (dl) dl.innerHTML = grupos.map(g => `<option>${g}</option>`).join('');
}

function fpBuscaCodigo() {
  const q = $('#fp-cod').value.trim();
  clearTimeout(FP.buscaTimer);
  if (!q) { FP.produto = null; fpRender(); fpSugestoes([]); return; }

  FP.buscaTimer = setTimeout(async () => {
    try {
      const achados = await apiFetch(`/produtos?busca=${encodeURIComponent(q)}`);
      const exato = achados.find(x => (x.cod || '').toLowerCase() === q.toLowerCase());
      if (exato) { fpSugestoes([]); return fpCarregar(exato); }

      if (FP.produto) { FP.produto = null; fpLimparCampos(false); }
      fpRender();
      fpSugestoes(achados.slice(0, 6));
    } catch (e) {
      // busca é auxiliar: falha não pode travar a digitação
    }
  }, 250);
}

function fpSugestoes(lista) {
  const alvo = $('#fp-sug');
  if (!alvo) return;
  if (!lista.length) { alvo.innerHTML = ''; return; }
  alvo.innerHTML = `<div style="position:absolute; z-index:9; width:100%; background:#fff; border:1px solid var(--linha);
      border-radius:6px; box-shadow:0 8px 20px rgba(20,33,61,.18); overflow:hidden">
    ${lista.map(x => `<div class="fp-sug-item" onclick="fpEscolher('${x.id}')"
        style="display:flex; gap:10px; align-items:center; padding:7px 10px; cursor:pointer; border-bottom:1px solid var(--linha); font-size:13px">
        <b style="min-width:70px">${x.cod}</b><span style="flex:1">${x.nome}</span>
        <span style="font-size:11px; color:var(--cinza)">${fpTotal(x)} un</span>
      </div>`).join('')}</div>`;
  alvo.querySelectorAll('.fp-sug-item').forEach(el => {
    el.onmouseenter = () => el.style.background = '#DCE6FA';
    el.onmouseleave = () => el.style.background = '';
  });
}

const fpTotal = (x) => FILIAIS.reduce((s, f) => s + ((x.saldo ?? {})[f.id] || 0), 0);

async function fpEscolher(id) {
  fpSugestoes([]);
  let achado = PRODUTOS.find(x => x.id === id);
  if (!achado) {
    try { PRODUTOS = await apiFetch('/produtos'); achado = PRODUTOS.find(x => x.id === id); }
    catch (e) { return toast(e.message); }
  }
  if (achado) fpCarregar(achado);
}

function fpCarregar(p) {
  FP.produto = p;
  $('#fp-cod').value = p.cod || '';
  $('#fp-nome').value = p.nome || '';
  $('#fp-un').value = p.un || 'UN';
  $('#fp-grupo').value = p.grupo || '';
  $('#fp-min').value = p.min ?? 0;
  $('#fp-custo').value = p.custo ?? '';
  $('#fp-preco').value = p.preco ?? '';
  $('#fp-precoMin').value = p.precoMin ?? '';
  fpRender();
}

function fpLimparCampos(limparCodigo) {
  if (limparCodigo) $('#fp-cod').value = '';
  ['fp-nome', 'fp-grupo', 'fp-custo', 'fp-preco', 'fp-precoMin'].forEach(id => { const el = $('#' + id); if (el) el.value = ''; });
  $('#fp-un').value = 'UN';
  $('#fp-min').value = 0;
}

function fpRender() {
  const p = FP.produto;
  const cab = document.querySelector('#janela-ativa .tit');
  if (cab) cab.textContent = p ? `Alterar Produto — ${p.cod}` : 'Incluir Produto';
  const btn = $('#btn-salvar-prod');
  if (btn) btn.textContent = p ? 'Salvar e lançar' : 'Gravar e continuar';
  const est = $('#fp-estoque'); if (est) est.innerHTML = fpPainelEstoque(p);
  const nfe = $('#fp-nfe'); if (nfe) nfe.innerHTML = fpPainelNfe();
}

function fpPainelEstoque(p) {
  const qtd = Number($('#fp-qtd')?.value) || 0;
  const filSel = $('#fp-fil')?.value || (filialAtual !== 'todas' ? filialAtual : FILIAIS[0]?.id);
  if (!FILIAIS.length) {
    return `<div style="border:1px solid var(--linha); border-radius:6px; padding:10px; font-size:12px; color:var(--cinza)">
      Cadastre uma filial para conseguir lançar estoque.</div>`;
  }

  const saldos = p ? FILIAIS.map(f => {
    const s = (p.saldo ?? {})[f.id] || 0;
    const cor = s === 0 ? 'var(--vermelho)' : (s <= (p.min || 0) ? '#9A6212' : 'var(--verde)');
    return `<span style="margin-right:12px"><b style="color:${cor}">${s}</b> <span style="color:var(--cinza)">${f.id}</span></span>`;
  }).join('') : '';

  return `<div style="border:1px solid var(--amarelo-2); background:var(--amarelo-bg); border-radius:6px; padding:10px 12px">
    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap">
      <b style="font-size:11px; letter-spacing:.5px; text-transform:uppercase">${p ? 'Entrada de estoque' : 'Estoque inicial'}</b>
      ${p ? `<span style="font-size:12px">Saldo atual: ${saldos}</span>` : ''}
    </div>
    <div style="display:flex; gap:10px; align-items:flex-end; margin-top:8px; flex-wrap:wrap">
      <div>
        <div style="font-size:11px; color:var(--cinza); margin-bottom:3px">Quantidade</div>
        <input id="fp-qtd" type="number" min="0" step="1" value="${qtd}" style="width:110px; font-size:16px; font-weight:700">
      </div>
      <div style="flex:1; min-width:160px">
        <div style="font-size:11px; color:var(--cinza); margin-bottom:3px">Filial</div>
        <select id="fp-fil">${FILIAIS.map(f => `<option value="${f.id}" ${f.id === filSel ? 'selected' : ''}>${f.nome} (${f.id})</option>`).join('')}</select>
      </div>
      ${p ? `<button type="button" class="btn-acao" onclick="fpSoLancar()">Só lançar entrada</button>` : ''}
    </div>
    <div style="font-size:11.5px; color:var(--cinza); margin-top:6px">
      Deixe <b>0</b> para ${p ? 'apenas salvar o cadastro' : 'cadastrar sem estoque'}. A entrada vira movimentação, com histórico.
    </div>
  </div>`;
}

/** Entrada de estoque sem tocar no cadastro — quando só chegou mercadoria. */
async function fpSoLancar() {
  const p = FP.produto;
  if (!p) return;
  const qtd = Number($('#fp-qtd').value) || 0;
  const filial = $('#fp-fil').value;
  if (qtd <= 0) return toast('Informe uma quantidade maior que zero.');
  try {
    await apiFetch('/movimentacoes', {
      method: 'POST',
      body: { tipo: 'entrada', produtoId: p.id, filial, qtd, obs: 'Entrada pelo cadastro de produto' },
    });
    toast(`Entrada de <b>${qtd}</b> un em ${filial} registrada.`);
    await fpRecarregar(p.id);
  } catch (e) { toast(e.message); }
}

async function fpRecarregar(id) {
  try {
    PRODUTOS = await apiFetch('/produtos');
    const atual = PRODUTOS.find(x => x.id === id);
    if (atual) fpCarregar(atual);
  } catch (e) {
    // mantém a tela como está: o lançamento já foi gravado
  }
}

/* ── NF-e ── */
function fpPainelNfe() {
  const n = FP.nota;
  if (!n) {
    return `<div style="border:1px solid var(--linha); border-radius:6px; padding:11px 12px">
      <b style="font-size:11px; letter-spacing:.5px; text-transform:uppercase">Nota fiscal</b>
      <div style="font-size:11.5px; color:var(--cinza); margin:5px 0 8px">Traga os produtos direto da NF-e do fornecedor, em vez de digitar um a um.</div>
      <textarea id="fp-xml" rows="5" placeholder="Cole aqui o XML da NF-e" spellcheck="false"
        style="width:100%; font-family:monospace; font-size:11px; padding:7px; border:1px solid var(--linha); border-radius:5px; background:#FAFBFD; resize:vertical"></textarea>
      <button type="button" class="btn-acao primario" style="width:100%; margin-top:7px" id="btn-ler-nfe" onclick="fpLerNfe()">Ler NF-e</button>
      <div style="font-size:11px; color:var(--cinza); margin-top:6px">O XML costuma vir por e-mail do fornecedor.</div>
    </div>`;
  }

  const novos = n.novos || [];
  const existentes = n.itens || [];
  const linha = (i, ehNovo, idx) => `<div onclick="fpUsarItemNfe(${ehNovo ? 1 : 0}, ${idx})"
      style="padding:6px 4px; border-bottom:1px solid var(--linha); cursor:pointer; display:flex; gap:8px; align-items:center">
      <div style="flex:1; min-width:0">
        <div style="font-weight:700; font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${i.nome || i.descricao || ''}</div>
        <div style="font-size:11px; color:var(--cinza)">${i.cod || i.codigo || ''} · ${i.quantidade ?? 0} ${i.unidade || ''} · R$ ${Number(i.valorUnitario || 0).toFixed(2)}</div>
      </div>
      <span style="font-size:10px; font-weight:800; padding:1px 6px; border-radius:99px; white-space:nowrap;
        background:${ehNovo ? '#DCE6FA' : 'var(--verde-bg)'}; color:${ehNovo ? 'var(--azul)' : 'var(--verde)'}">${ehNovo ? 'novo' : 'existe'}</span>
    </div>`;

  return `<div style="border:1px solid var(--linha); border-radius:6px; padding:11px 12px">
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px">
      <b style="font-size:11px; letter-spacing:.5px; text-transform:uppercase">NF-e ${n.numero || ''}</b>
      <button type="button" class="btn-acao" style="padding:2px 8px; font-size:11px" onclick="fpTrocarNota()">Trocar</button>
    </div>
    ${n.fornecedor ? `<div style="font-size:12.5px; font-weight:700; margin-top:3px">${n.fornecedor}</div>` : ''}
    <div style="font-size:11px; color:var(--cinza); margin:2px 0 8px">
      ${n.cnpj ? 'CNPJ ' + n.cnpj : ''}${n.emissao ? ' · ' + String(n.emissao).slice(0, 10).split('-').reverse().join('/') : ''}
    </div>
    <div style="font-size:11px; color:var(--cinza); font-weight:700; margin-bottom:4px">
      ${existentes.length + novos.length} itens · ${novos.length} novo(s)
    </div>
    <div style="max-height:240px; overflow:auto">
      ${existentes.map((i, k) => linha(i, false, k)).join('')}
      ${novos.map((i, k) => linha(i, true, k)).join('')}
    </div>
    <div style="display:flex; gap:6px; align-items:center; margin-top:9px">
      <span style="font-size:11px; color:var(--cinza)">Margem</span>
      <input id="fp-margem" type="number" min="0" step="1" value="40" style="width:64px; padding:4px 6px">
      <span style="font-size:11px; color:var(--cinza)">%</span>
      <button type="button" class="btn-acao primario" style="flex:1" id="btn-nota-toda" onclick="fpLancarNotaToda()">Lançar nota inteira</button>
    </div>
    <div style="font-size:11px; color:var(--cinza); margin-top:6px">
      Clique num item para carregá-lo no formulário. "Lançar nota inteira" cria os novos com preço = custo + margem e dá entrada em todos.
    </div>
  </div>`;
}

function fpTrocarNota() { FP.nota = null; fpRender(); }

async function fpLerNfe() {
  const xml = $('#fp-xml').value.trim();
  if (!xml) return toast('Cole o XML da NF-e primeiro.');
  const btn = $('#btn-ler-nfe');
  btn.disabled = true; btn.textContent = 'Lendo…';
  try {
    const nota = await apiFetch('/nfe/validar', { method: 'POST', body: { xmlNfe: xml } });
    nota.xml = xml;
    FP.nota = nota;
    fpRender();
    toast(`NF-e lida: <b>${(nota.itens?.length || 0) + (nota.novos?.length || 0)}</b> item(ns).`);
  } catch (e) {
    toast(e.message);
    btn.disabled = false; btn.textContent = 'Ler NF-e';
  }
}

function fpUsarItemNfe(ehNovo, idx) {
  const i = ehNovo ? FP.nota.novos[idx] : FP.nota.itens[idx];
  const custo = Number(i.valorUnitario || 0);
  const margem = Number($('#fp-margem')?.value ?? 40) / 100;

  if (!ehNovo) {
    const p = PRODUTOS.find(x => x.id === i.produtoId);
    if (p) fpCarregar(p);
    // o que muda numa compra é o custo; o preço de venda continua sendo seu
    if (custo) $('#fp-custo').value = custo;
  } else {
    FP.produto = null;
    $('#fp-cod').value = i.codigo || '';
    $('#fp-nome').value = i.descricao || '';
    $('#fp-un').value = i.unidade || 'UN';
    $('#fp-grupo').value = '';
    $('#fp-min').value = 0;
    $('#fp-custo').value = custo || '';
    $('#fp-preco').value = custo ? (custo * (1 + margem)).toFixed(2) : '';
    $('#fp-precoMin').value = custo ? (custo * 1.05).toFixed(2) : '';
    fpRender();
  }
  const q = $('#fp-qtd');
  if (q) q.value = i.quantidade || 0;
  fpSugestoes([]);
}

/** Cria os produtos que faltam e usa o /nfe/entrada para dar entrada em todos. */
async function fpLancarNotaToda() {
  const n = FP.nota;
  if (!n) return;
  const filial = $('#fp-fil')?.value || FILIAIS[0]?.id;
  if (!filial) return toast('Cadastre uma filial antes de lançar a nota.');
  const margem = Number($('#fp-margem').value ?? 40) / 100;
  const novos = n.novos || [];

  const semValor = novos.find(i => !Number(i.valorUnitario));
  if (semValor) return toast(`O item ${semValor.codigo} veio sem valor na nota — cadastre-o manualmente antes.`);

  const btn = $('#btn-nota-toda');
  btn.disabled = true; btn.textContent = 'Lançando…';
  try {
    for (const i of novos) {
      const custo = Number(i.valorUnitario);
      await apiFetch('/produtos', {
        method: 'POST',
        body: {
          cod: i.codigo, nome: i.descricao, un: i.unidade || 'UN', grupo: '',
          min: 0, custo, preco: +(custo * (1 + margem)).toFixed(2), precoMin: +(custo * 1.05).toFixed(2),
        },
      });
    }
    const r = await apiFetch('/nfe/entrada', { method: 'POST', body: { xmlNfe: n.xml, filial } });
    toast(`Nota lançada: <b>${novos.length}</b> produto(s) criado(s), <b>${r.itens?.length || 0}</b> com entrada em ${filial}.`);
    PRODUTOS = await apiFetch('/produtos');
    FP.nota = null; FP.produto = null;
    fpLimparCampos(true);
    fpRender();
    $('#fp-cod').focus();
  } catch (e) {
    toast(e.message);
    btn.disabled = false; btn.textContent = 'Lançar nota inteira';
  }
}

async function salvarProduto(e, id) {
  e.preventDefault();
  const cod = $('#fp-cod').value.trim();
  const nome = $('#fp-nome').value.trim();
  const preco = Number($('#fp-preco').value);
  if (!cod) return toast('Código é obrigatório.');
  if (!nome || nome.length < 2) return toast('Descrição deve ter ao menos 2 caracteres.');
  if (!preco || preco <= 0) return toast('Preço de venda deve ser maior que zero.');

  const body = {
    cod, nome,
    un: $('#fp-un').value.trim() || 'UN',
    grupo: $('#fp-grupo').value.trim(),
    min: Number($('#fp-min').value || 0),
    custo: Number($('#fp-custo').value || 0),
    preco,
    precoMin: Number($('#fp-precoMin').value || preco),
  };

  const qtd = Number($('#fp-qtd')?.value) || 0;
  const filial = $('#fp-fil')?.value;

  const btn = $('#btn-salvar-prod');
  btn.disabled = true; btn.textContent = 'Gravando…';
  try {
    // 1) cadastro
    let produtoId = FP.produto?.id;
    if (produtoId) {
      await apiFetch(`/produtos/${produtoId}`, { method: 'PUT', body });
    } else {
      const criado = await apiFetch('/produtos', { method: 'POST', body });
      produtoId = criado?.id;
    }

    // 2) estoque, se foi informada quantidade — falha aqui não desfaz o cadastro,
    //    então o aviso precisa deixar claro o que gravou e o que não gravou
    if (qtd > 0 && produtoId && filial) {
      try {
        await apiFetch('/movimentacoes', {
          method: 'POST',
          body: { tipo: 'entrada', produtoId, filial, qtd, obs: 'Entrada pelo cadastro de produto' },
        });
        toast(`<b>${nome}</b> gravado e <b>${qtd}</b> un lançadas em ${filial}.`);
      } catch (err) {
        toast(`Produto gravado, mas a entrada de estoque falhou: ${err.message}`);
      }
    } else {
      toast(`<b>${nome}</b> gravado.`);
    }

    // 3) segue para o próximo, sem fechar a janela
    PRODUTOS = await apiFetch('/produtos');
    FP.produto = null;
    fpLimparCampos(true);
    fpGrupos();
    fpRender();
    $('#fp-cod').focus();
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = FP.produto ? 'Salvar e lançar' : 'Gravar e continuar';
  }
}

// ─── Detalhes de Estoque ──────────────────────────────────────────────────────
function detalhesEstoque() {
  const p = PRODUTOS.find(x => x.id === prodSel);
  if (!p) return toast('Selecione um produto primeiro (F7).');
  abrirJanela('Estoque das Filiais — ' + p.nome, `
    <div class="moldura-grid" style="max-height:none"><table class="tabela">
      <thead><tr><th>Filial</th><th class="num">Saldo</th><th class="num">Mínimo</th><th>Situação</th></tr></thead>
      <tbody>${FILIAIS.map(f => {
        const s = (p.saldo ?? {})[f.id] || 0;
        const ok = s >= (p.min || 0);
        return `<tr>
          <td>${f.nome}</td>
          <td class="num" style="font-weight:900">${s}</td>
          <td class="num">${p.min || 0}</td>
          <td><b style="color:${ok ? 'var(--verde)' : 'var(--vermelho)'}">${ok ? 'OK' : 'REPOR — faltam ' + ((p.min || 0) - s)}</b></td>
        </tr>`;
      }).join('')}
      <tr><td style="font-weight:800">TOTAL</td><td class="num" style="font-weight:900">${saldoTotal(p)}</td><td></td><td></td></tr>
      </tbody></table></div>
    <div class="rodape-form">
      <button class="btn-acao" onclick="janelaTransferencia('${p.id}')">Transferir entre Filiais</button>
      <button class="btn-acao" onclick="janelaEntradaSaida('${p.id}')">Entrada/Saída Manual</button>
      <button class="btn-acao primario" onclick="janelaProdutos()">Voltar aos Produtos</button>
    </div>`, 720);
}

function produtoSimilar() {
  const p = PRODUTOS.find(x => x.id === prodSel);
  if (!p) return toast('Selecione um produto primeiro.');
  const similares = PRODUTOS.filter(x => x.grupo === p.grupo && x.id !== p.id);
  abrirJanela('Produto Similar — ' + p.grupo, `
    <div class="moldura-grid" style="max-height:none"><table class="tabela">
      <thead><tr><th>Código</th><th>Descrição</th><th class="num">Saldo</th><th class="num">Preço</th></tr></thead>
      <tbody>${similares.map(s => `
        <tr onclick="prodSel='${s.id}'; janelaProdutos()">
          <td class="num">${s.cod}</td><td>${s.nome}</td>
          <td class="num ${saldoVisto(s) === 0 ? 'neg' : ''}">${saldoVisto(s)}</td>
          <td class="num">${brl(s.preco)}</td>
        </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--cinza);padding:14px">Sem similares no grupo.</td></tr>'}
      </tbody></table></div>
    <div class="rodape-form"><button class="btn-acao primario" onclick="janelaProdutos()">Voltar</button></div>`, 720);
}

async function totaliza() {
  try {
    const prods = PRODUTOS.length > 0 ? PRODUTOS : await apiFetch('/produtos');
    const valorCusto = prods.reduce((s, p) => s + saldoVisto(p) * (p.custo || 0), 0);
    const valorVenda = prods.reduce((s, p) => s + saldoVisto(p) * (p.preco || 0), 0);
    toast(`Filial <b>${nomeFil(filialAtual)}</b>: ${prods.length} itens · custo <b>R$ ${brl(valorCusto)}</b> · venda <b>R$ ${brl(valorVenda)}</b>`);
  } catch (e) { toast(e.message); }
}

async function analisaProduto() {
  const p = PRODUTOS.find(x => x.id === prodSel);
  if (!p) return toast('Selecione um produto primeiro.');
  abrirJanela('Analisa Produto — ' + p.nome, `
    <div class="moldura-grid" style="max-height:none"><table class="tabela">
      <thead><tr><th>Tipo</th><th>Filial</th><th class="num">Qtd</th><th>Obs</th><th>Quando</th></tr></thead>
      <tbody><tr><td colspan="5" style="text-align:center;color:var(--cinza);padding:18px">Carregando…</td></tr></tbody>
    </table></div>
    <div class="rodape-form"><button class="btn-acao primario" onclick="janelaProdutos()">Voltar</button></div>`, 760);
  try {
    const movs = await apiFetch('/movimentacoes');
    const meusMov = movs.filter(m => m.produtoId === p.id);
    const tb = document.querySelector('#janela-ativa .tabela tbody');
    if (!tb) return;
    tb.innerHTML = meusMov.map(m => `<tr>
      <td><b>${(m.tipo || '').toUpperCase()}</b></td>
      <td>${nomeFil(m.filial)}${m.destino ? ' → ' + nomeFil(m.destino) : ''}</td>
      <td class="num">${m.qtd}</td>
      <td>${m.obs || ''}</td>
      <td style="font-size:11px">${m.em ? new Date(m.em).toLocaleString('pt-BR') : '—'}</td>
    </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--cinza);padding:14px">Sem movimentações.</td></tr>';
  } catch (e) { toast(e.message); }
}

// ─── Entrada e Saída Manual ───────────────────────────────────────────────────
function janelaEntradaSaida(pid) {
  if (PRODUTOS.length === 0) return toast('Abra os Produtos (F7) antes de movimentar.');
  const defPid = pid || prodSel || PRODUTOS[0]?.id;
  const defFil = filialAtual !== 'todas' ? filialAtual : (FILIAIS[0]?.id || 'par');
  abrirJanela('Entrada e Saída Manual de Estoque', `
    <div class="form-linha"><label>Tipo</label>
      <select id="es-tipo">
        <option value="entrada">1 — Entrada</option>
        <option value="saida">2 — Saída</option>
      </select>
    </div>
    <div class="form-linha"><label>Produto</label><select id="es-prod">${optsProd(defPid)}</select></div>
    <div class="form-linha"><label>Filial</label><select id="es-fil">${optsFil(defFil)}</select></div>
    <div class="form-linha"><label>Quantidade</label><input id="es-qtd" type="number" min="1" inputmode="numeric" placeholder="0"></div>
    <div class="form-linha"><label>Documento/Obs</label><input id="es-obs" placeholder="NF 4521, quebra, uso interno…"></div>
    <div class="rodape-form">
      <button class="btn-acao" onclick="fecharJanela()">(ESC) Fechar</button>
      <button class="btn-acao primario" id="btn-es" onclick="gravarES()"><u>G</u>ravar</button>
    </div>`, 620);
}

async function gravarES() {
  const tipo = $('#es-tipo').value;
  const pid = $('#es-prod').value;
  const p = PRODUTOS.find(x => x.id === pid);
  const f = $('#es-fil').value;
  const q = parseFloat($('#es-qtd').value);
  const obs = $('#es-obs').value.trim();

  if (!q || q <= 0) return toast('Informe uma quantidade válida.');
  if (tipo === 'saida' && p && ((p.saldo ?? {})[f] || 0) < q)
    return toast(`Saldo insuficiente em <b>${nomeFil(f)}</b>: só ${(p.saldo ?? {})[f] || 0}.`);

  const btn = $('#btn-es');
  btn.disabled = true; btn.textContent = 'Gravando…';
  try {
    await apiFetch('/movimentacoes', { method: 'POST', body: { tipo, produtoId: pid, filial: f, qtd: q, obs } });
    toast(`<b>${tipo === 'entrada' ? 'Entrada' : 'Saída'}</b> de ${q} × ${p?.cod || pid} gravada em ${nomeFil(f)}.`);
    fecharJanela();
  } catch (e) {
    toast(e.message);
    btn.disabled = false; btn.textContent = 'Gravar';
  }
}

// ─── Transferência entre Filiais ──────────────────────────────────────────────
function janelaTransferencia(pid) {
  if (PRODUTOS.length === 0) return toast('Abra os Produtos (F7) antes de transferir.');
  const defPid = pid || prodSel || PRODUTOS[0]?.id;
  abrirJanela('Operações com Filiais — Transferência', `
    <div class="form-linha"><label>Produto</label><select id="tr-prod">${optsProd(defPid)}</select></div>
    <div class="form-linha"><label>Filial de Origem</label>
      <select id="tr-ori">${FILIAIS.map(f => `<option value="${f.id}">${f.nome}</option>`).join('')}</select>
    </div>
    <div class="form-linha"><label>Filial de Destino</label>
      <select id="tr-des">${FILIAIS.map((f, i) => `<option value="${f.id}" ${i === 1 ? 'selected' : ''}>${f.nome}</option>`).join('')}</select>
    </div>
    <div class="form-linha"><label>Quantidade</label><input id="tr-qtd" type="number" min="1" inputmode="numeric" placeholder="0"></div>
    <div class="form-linha"><label>Obs</label><input id="tr-obs" placeholder="Pedido da filial, remanejamento…"></div>
    <div class="rodape-form">
      <button class="btn-acao" onclick="fecharJanela()">(ESC) Fechar</button>
      <button class="btn-acao primario" id="btn-tr" onclick="gravarTransf()"><u>G</u>ravar Transferência</button>
    </div>`, 620);
}

async function gravarTransf() {
  const pid = $('#tr-prod').value;
  const p = PRODUTOS.find(x => x.id === pid);
  const o = $('#tr-ori').value;
  const d = $('#tr-des').value;
  const q = parseFloat($('#tr-qtd').value);
  const obs = $('#tr-obs').value.trim();

  if (o === d) return toast('Origem e destino precisam ser filiais diferentes.');
  if (!q || q <= 0) return toast('Informe uma quantidade válida.');
  if (p && ((p.saldo ?? {})[o] || 0) < q)
    return toast(`Saldo insuficiente em <b>${nomeFil(o)}</b>: só ${(p.saldo ?? {})[o] || 0}.`);

  const btn = $('#btn-tr');
  btn.disabled = true; btn.textContent = 'Gravando…';
  try {
    await apiFetch('/movimentacoes', { method: 'POST', body: { tipo: 'transferencia', produtoId: pid, filial: o, destino: d, qtd: q, obs } });
    toast(`Transferidos <b>${q} × ${p?.cod || pid}</b>: ${nomeFil(o)} → ${nomeFil(d)}.`);
    fecharJanela();
  } catch (e) {
    toast(e.message);
    btn.disabled = false; btn.textContent = 'Gravar Transferência';
  }
}

// ─── Conferências e Ajustes ───────────────────────────────────────────────────
function janelaAjuste() {
  if (PRODUTOS.length === 0) return toast('Abra os Produtos (F7) antes de ajustar.');
  const defPid = prodSel || PRODUTOS[0]?.id;
  const defFil = filialAtual !== 'todas' ? filialAtual : (FILIAIS[0]?.id || 'par');
  abrirJanela('Conferências e Ajustes de Estoque', `
    <div class="form-linha"><label>Produto</label>
      <select id="aj-prod" onchange="mostraSaldoAj()">${optsProd(defPid)}</select>
    </div>
    <div class="form-linha"><label>Filial</label>
      <select id="aj-fil" onchange="mostraSaldoAj()">${optsFil(defFil)}</select>
    </div>
    <div class="form-linha"><label>Saldo no Sistema</label><input id="aj-sis" disabled></div>
    <div class="form-linha"><label>Saldo Contado</label><input id="aj-cont" type="number" min="0" inputmode="numeric" placeholder="0"></div>
    <div class="form-linha"><label>Obs</label><input id="aj-obs" placeholder="Balanço mensal, item avariado…"></div>
    <div class="rodape-form">
      <button class="btn-acao" onclick="fecharJanela()">(ESC) Fechar</button>
      <button class="btn-acao primario" id="btn-aj" onclick="gravarAjuste()"><u>G</u>ravar Ajuste</button>
    </div>`, 620);
  mostraSaldoAj();
}

function mostraSaldoAj() {
  const pid = $('#aj-prod')?.value;
  const f = $('#aj-fil')?.value;
  const p = PRODUTOS.find(x => x.id === pid);
  if ($('#aj-sis')) $('#aj-sis').value = p ? ((p.saldo ?? {})[f] || 0) : '';
}

async function gravarAjuste() {
  const pid = $('#aj-prod').value;
  const p = PRODUTOS.find(x => x.id === pid);
  const f = $('#aj-fil').value;
  const q = parseInt($('#aj-cont').value);
  const obs = $('#aj-obs').value.trim();

  if (isNaN(q) || q < 0) return toast('Informe o saldo contado.');

  const btn = $('#btn-aj');
  btn.disabled = true; btn.textContent = 'Gravando…';
  try {
    await apiFetch('/movimentacoes', { method: 'POST', body: { tipo: 'ajuste', produtoId: pid, filial: f, qtd: q, obs: obs || `ajuste para ${q}` } });
    toast(`Ajuste gravado: <b>${p?.cod || pid}</b> em ${nomeFil(f)} → <b>${q}</b>.`);
    fecharJanela();
  } catch (e) {
    toast(e.message);
    btn.disabled = false; btn.textContent = 'Gravar Ajuste';
  }
}

// ─── Ponto de Reposição ───────────────────────────────────────────────────────
async function janelaReposicao() {
  abrirJanela('Ponto de Reposição — Itens Abaixo do Mínimo', `
    <div class="moldura-grid" style="max-height:340px"><table class="tabela">
      <thead><tr>
        <th>Código</th><th>Descrição</th><th>Filial</th>
        <th class="num">Saldo</th><th class="num">Mínimo</th><th class="num">Repor</th>
      </tr></thead>
      <tbody><tr><td colspan="6" style="text-align:center;color:var(--cinza);padding:18px">Carregando…</td></tr></tbody>
    </table></div>
    <div class="rodape-form">
      <button class="btn-acao" onclick="toast('No sistema final: gera Pedido de Compra agrupado por fornecedor')">Gerar Pedido de Compra</button>
      <button class="btn-acao primario" onclick="fecharJanela()">(ESC) Fechar</button>
    </div>`, 860);
  try {
    const rep = await apiFetch('/movimentacoes/reposicao');
    const tb = document.querySelector('#janela-ativa .tabela tbody');
    if (!tb) return;
    tb.innerHTML = rep.map(r => `
      <tr onclick="prodSel='${r.produtoId || ''}'; janelaProdutos()">
        <td class="num">${r.cod}</td><td>${r.nome}</td>
        <td>${nomeFil(r.filial) || r.filial}</td>
        <td class="num neg">${r.saldo}</td>
        <td class="num">${r.min}</td>
        <td class="num" style="font-weight:900; color:var(--vermelho)">+${r.repor ?? (r.min - r.saldo)}</td>
      </tr>`).join('') ||
      '<tr><td colspan="6" style="text-align:center;color:var(--verde);padding:18px;font-weight:700">Nenhum item abaixo do mínimo ✓</td></tr>';
  } catch (e) { toast(e.message); }
}

// ─── Entrada por NF-e ─────────────────────────────────────────────────────────
function janelaEntradaNF() {
  const defFil = filialAtual !== 'todas' ? filialAtual : (FILIAIS[0]?.id || 'par');
  abrirJanela('Lançar Notas de Compras — Importar NF-e', `
    <div class="form-linha"><label>Filial de Entrada</label>
      <select id="nf-fil">${optsFil(defFil)}</select>
    </div>
    <div class="form-linha"><label style="align-self:flex-start;margin-top:6px">XML da NF-e</label>
      <textarea id="nf-xml" rows="8" placeholder="<nfeProc>…</nfeProc>" style="width:100%;font-family:monospace;font-size:11px;padding:8px;border:1.5px solid var(--linha);border-radius:7px;background:#FAFBFC;resize:vertical"></textarea>
    </div>
    <div style="background:var(--amarelo-bg); border:1px solid var(--amarelo-2); border-radius:7px; padding:11px 13px; font-size:12.5px; margin:4px 0 2px">
      Cole o XML da NF-e aqui — o sistema lerá os itens, localizará no cadastro e dará entrada automática no estoque.
    </div>
    <div class="rodape-form">
      <button class="btn-acao" onclick="fecharJanela()">(ESC) Fechar</button>
      <button class="btn-acao primario" id="btn-nfe" onclick="importarNfe()"><u>I</u>mportar XML</button>
    </div>`, 660);
}

async function importarNfe() {
  const xmlNfe = $('#nf-xml').value.trim();
  const filial = $('#nf-fil').value;
  if (!xmlNfe) return toast('Cole o XML da NF-e primeiro.');
  const btn = $('#btn-nfe');
  btn.disabled = true; btn.textContent = 'Importando…';
  try {
    const r = await apiFetch('/nfe/entrada', { method: 'POST', body: { xmlNfe, filial } });
    toast(`NF-e importada: <b>${r.itens?.length || 0}</b> item(ns) | não encontrados: ${r.naoEncontrados?.length || 0}`);
    fecharJanela();
  } catch (e) {
    toast(e.message);
    btn.disabled = false; btn.textContent = 'Importar XML';
  }
}

// ─── Busca Preço ──────────────────────────────────────────────────────────────
function janelaBuscaPreco() {
  abrirJanela('Busca Preço', `
    <div class="linha-consulta" style="margin-bottom:12px">
      <input type="text" id="bp-in" placeholder="Descrição, código ou código de barras…" autocomplete="off">
    </div>
    <div id="bp-res" style="text-align:center; color:var(--cinza); padding:16px">Digite para consultar o preço.</div>
    <div class="rodape-form"><button class="btn-acao" onclick="fecharJanela()">(ESC) Fechar</button></div>`, 560);

  let _bpTimer = null;
  $('#bp-in').addEventListener('input', () => {
    clearTimeout(_bpTimer);
    _bpTimer = setTimeout(async () => {
      const q = $('#bp-in')?.value.trim();
      if (!q) { $('#bp-res').innerHTML = '<span style="color:var(--cinza)">Digite para consultar o preço.</span>'; return; }
      try {
        const prods = await apiFetch(`/produtos?busca=${encodeURIComponent(q)}`);
        const p = prods[0];
        if (!p) {
          $('#bp-res').innerHTML = '<span style="color:var(--vermelho); font-weight:700">Produto não encontrado.</span>';
        } else {
          $('#bp-res').innerHTML = `
            <div style="font-weight:800; color:var(--azul); margin-bottom:4px">${p.nome}</div>
            <div style="font-size:40px; font-weight:900; color:var(--azul)">R$ ${brl(p.preco)}</div>
            <div style="font-size:12.5px; color:var(--cinza); margin-top:4px">
              mínimo R$ ${brl(p.precoMin)} · saldo ${nomeFil(filialAtual)}: <b>${saldoVisto(p)}</b>
            </div>`;
        }
      } catch (e) {
        if ($('#bp-res')) $('#bp-res').innerHTML = `<span style="color:var(--vermelho)">${e.message}</span>`;
      }
    }, 350);
  });
  setTimeout(() => $('#bp-in')?.focus(), 60);
}

// ─── Precificaí — Formação de Preço de Venda ─────────────────────────────────
const PF_CATALOGO = [
  { id: 'ipi',       nome: 'IPI',                   tipo: 'compra', aliquota: 10,   destaque: true, desc: 'Sobre produtos industrializados — alíquota depende do NCM (tabela TIPI)' },
  { id: 'icms',      nome: 'ICMS',                  tipo: 'compra', aliquota: 18,   desc: 'Imposto estadual sobre circulação de mercadorias' },
  { id: 'icmsst',    nome: 'ICMS-ST',               tipo: 'compra', aliquota: 7,    desc: 'Substituição tributária — recolhido antecipadamente na compra' },
  { id: 'pis',       nome: 'PIS',                   tipo: 'venda',  aliquota: 0.65, desc: 'Programa de Integração Social' },
  { id: 'cofins',    nome: 'COFINS',                tipo: 'venda',  aliquota: 3,    desc: 'Financiamento da Seguridade Social' },
  { id: 'simples',   nome: 'Simples Nacional',      tipo: 'venda',  aliquota: 6,    desc: 'Guia única (DAS) — % sobre o faturamento, varia por anexo e faixa' },
  { id: 'iss',       nome: 'ISS',                   tipo: 'venda',  aliquota: 5,    desc: 'Imposto municipal sobre serviços' },
  { id: 'ii',        nome: 'Imposto de Importação', tipo: 'compra', aliquota: 60,   desc: 'Para produtos importados' },
  { id: 'frete',     nome: 'Frete',                 tipo: 'compra', aliquota: 5,    desc: 'Custo de transporte sobre o valor da compra' },
  { id: 'maq',       nome: 'Taxa da maquininha',    tipo: 'venda',  aliquota: 3.5,  desc: 'Taxa do cartão sobre o valor da venda' },
  { id: 'embalagem', nome: 'Embalagem',             tipo: 'venda',  aliquota: 1.5,  desc: 'Custo de sacola/embalagem por venda' },
];
const PF_CORES = ['#E4572E', '#F28F3B', '#C8452C', '#B36A5E', '#E89005', '#A4243B'];

let PF = null; // estado da janela de precificação (null quando fechada)
let _pfSeq = 1;
const pfFmt = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pfPc  = v => (v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';

function pfRoundNice(p, mode) {
  if (!isFinite(p) || p <= 0) return 0;
  const cents = Math.ceil(p * 100) / 100, int = Math.floor(cents);
  const up = f => { let b = int + f; if (b < cents - 1e-9) b = int + 1 + f; return b; };
  if (mode === 'exato') return cents;
  if (mode === '00') return cents === int ? int : int + 1;
  if (mode === '90') return up(0.9);
  if (mode === '50') return up(0.5);
  return Math.min(up(0.9), cents === int ? int : int + 1);
}
function pfMkTax(cat, aliquota) {
  return { uid: 'pt' + (_pfSeq++), nome: cat.nome, aliquota: aliquota ?? cat.aliquota, tipo: cat.tipo, destaque: !!cat.destaque };
}
function pfNovoCenario(nome, base) {
  return {
    key: 'ps' + (_pfSeq++), nome,
    taxes: base ? base.taxes.map(t => ({ ...t, uid: 'pt' + (_pfSeq++) })) : [pfMkTax(PF_CATALOGO[0]), pfMkTax(PF_CATALOGO[5])],
    modo: base ? base.modo : 'margem',
    margem: base ? base.margem : 50,
    precoManual: base ? base.precoManual : 0,
    term: base ? base.term : 'auto',
  };
}
function pfCalc(sc) {
  const custo = PF.custo;
  const compra = sc.taxes.filter(t => t.tipo === 'compra').map(t => ({ ...t, valor: custo * t.aliquota / 100 }));
  const custoReal = custo + compra.reduce((s, t) => s + t.valor, 0);
  const taxaVenda = sc.taxes.filter(t => t.tipo === 'venda').reduce((s, t) => s + t.aliquota, 0) / 100;
  let preco;
  if (sc.modo === 'margem') { const teorico = custoReal * (1 + sc.margem / 100) / (1 - taxaVenda); preco = pfRoundNice(teorico, sc.term); }
  else preco = sc.precoManual || 0;
  const venda = sc.taxes.filter(t => t.tipo === 'venda').map(t => ({ ...t, valor: preco * t.aliquota / 100 }));
  const lucro = preco - custoReal - venda.reduce((s, t) => s + t.valor, 0);
  return { compra, venda, custoReal, preco, lucro,
    mCusto: custoReal > 0 ? lucro / custoReal * 100 : 0, mVenda: preco > 0 ? lucro / preco * 100 : 0 };
}
function pfMelhorKey() {
  const rs = PF.scens.map(sc => ({ key: sc.key, l: pfCalc(sc).lucro })).filter(x => x.l > 0);
  if (rs.length < 2) return null;
  return rs.reduce((a, b) => a.l >= b.l ? a : b).key;
}

function pfArcPath(cx, cy, rO, rI, a0, a1) {
  const P = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const large = (a1 - a0) > Math.PI ? 1 : 0;
  const [x0, y0] = P(rO, a0), [x1, y1] = P(rO, a1), [x2, y2] = P(rI, a1), [x3, y3] = P(rI, a0);
  return `M${x0} ${y0} A${rO} ${rO} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${rI} ${rI} 0 ${large} 0 ${x3} ${y3} Z`;
}
function pfDonutSVG(slices) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return `<svg width="88" height="88"></svg>`;
  let a = -Math.PI / 2, paths = '';
  for (const s of slices) {
    const frac = s.value / total; let a1 = a + frac * 2 * Math.PI;
    const gap = slices.length > 1 ? 0.03 : 0;
    if (frac >= 0.9999) paths += `<circle cx="44" cy="44" r="32" fill="none" stroke="${s.color}" stroke-width="20"/>`;
    else paths += `<path d="${pfArcPath(44, 44, 42, 22, a + gap / 2, Math.max(a1 - gap / 2, a + gap / 2 + 0.001))}" fill="${s.color}"/>`;
    a = a1;
  }
  return `<svg width="88" height="88" viewBox="0 0 88 88">${paths}</svg>`;
}
function pfPieData(r) {
  const arr = [{ name: 'Custo do produto', value: Math.max(PF.custo, 0), color: '#14213D' }];
  [...r.compra, ...r.venda].forEach((t, i) => arr.push({ name: `${t.nome} (${t.tipo})`, value: Math.max(t.valor, 0), color: PF_CORES[i % PF_CORES.length] }));
  if (r.lucro > 0) arr.push({ name: 'Seu lucro', value: r.lucro, color: '#1E7A52' });
  return arr.filter(s => s.value > 0.005);
}

function pfColResultadoHTML(sc, r) {
  const pie = pfPieData(r);
  const int = Math.floor(r.preco), cent = String(Math.round((r.preco % 1) * 100)).padStart(2, '0');
  const legenda = pie.map(s => `<div><span class="sw" style="background:${s.color}"></span><span class="nm">${s.name}</span><b>${pfFmt(s.value)}</b></div>`).join('');
  const lucro = r.lucro >= 0
    ? `<div class="pf-lucrobox ok"><b>Sobra ${pfFmt(r.lucro)}</b><span style="opacity:.7"> · ${pfPc(r.mCusto)} s/ custo · ${pfPc(r.mVenda)} da venda</span></div>`
    : `<div class="pf-lucrobox ruim"><b style="color:var(--vermelho)">Prejuízo de ${pfFmt(-r.lucro)} por unidade</b></div>`;
  return `<div style="display:flex;align-items:center;gap:8px">
      <div class="pf-etiqueta"><div class="t">PREÇO</div>
        <div class="p"><span style="font-size:10px;vertical-align:top">R$</span><span style="font-size:28px">${int}</span><span style="font-size:13px;vertical-align:top">,${cent}</span></div>
      </div>
      <div>${pfDonutSVG(pie)}</div>
    </div>
    <div class="pf-legenda">${legenda}</div>${lucro}`;
}

function pfTaxRowHTML(sc, t) {
  return `<div class="pf-taxrow${t.destaque ? ' destaque' : ''}">
    <span class="nome">${t.nome}</span>
    <input type="number" min="0" step="0.5" value="${t.aliquota}" class="inp"
      style="width:52px;padding:3px 5px;font-size:12px;text-align:right;font-weight:700"
      data-pf-act="aliq" data-sc="${sc.key}" data-tax="${t.uid}">
    <span style="font-size:11px;font-weight:700">%</span>
    <button class="pf-mini" style="font-size:9px;padding:3px 5px" data-pf-act="tipo" data-sc="${sc.key}" data-tax="${t.uid}"
      title="Trocar entre compra e venda">${t.tipo === 'compra' ? 'COMPRA' : 'VENDA'}</button>
    <button class="pf-mini red" style="padding:3px 6px" data-pf-act="rmtax" data-sc="${sc.key}" data-tax="${t.uid}" title="Tirar imposto">✕</button>
  </div>`;
}

function pfColHTML(sc) {
  const taxes = sc.taxes.length
    ? sc.taxes.map(t => pfTaxRowHTML(sc, t)).join('')
    : `<div style="font-size:12px;opacity:.55;padding:6px 2px;margin-bottom:5px">Nenhum imposto — o preço será só custo + lucro.</div>`;
  const chips = [['auto', ',90/,00'], ['90', ',90'], ['00', ',00'], ['50', ',50'], ['exato', 'exato']]
    .map(([v, l]) => `<button class="pf-chip${sc.term === v ? ' on' : ''}" data-pf-act="term" data-sc="${sc.key}" data-v="${v}">${l}</button>`).join('');
  const controle = sc.modo === 'margem'
    ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <input type="range" min="5" max="200" step="5" value="${sc.margem}" style="flex:1" data-pf-act="margem" data-sc="${sc.key}">
        <input type="number" value="${sc.margem}" class="inp" style="width:52px;padding:3px 5px;text-align:right;font-weight:700" data-pf-act="margemN" data-sc="${sc.key}">
        <b style="font-size:12px">%</b></div>
       <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px">${chips}</div>`
    : `<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px"><b>R$</b>
        <input type="number" min="0" step="0.1" value="${sc.precoManual}" class="inp" style="width:100px;font-weight:700;font-size:16px" data-pf-act="precoM" data-sc="${sc.key}"></div>`;
  return `<div class="pf-col" data-pf-col="${sc.key}">
    <div class="pf-badge">★ MAIOR LUCRO</div>
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:10px">
      <input value="${sc.nome}" class="inp" style="border:2px dashed var(--linha);flex:1;font-weight:700;min-width:0" data-pf-act="nome" data-sc="${sc.key}">
      <button class="pf-mini" data-pf-act="dup" data-sc="${sc.key}" title="Duplicar">⧉</button>
      ${PF.scens.length > 1 ? `<button class="pf-mini red" data-pf-act="rmsc" data-sc="${sc.key}" title="Remover simulação">✕</button>` : ''}
    </div>
    <div>${taxes}</div>
    <button class="pf-ghost" style="margin-bottom:10px" data-pf-act="openpicker" data-sc="${sc.key}">+ Adicionar imposto ou custo</button>
    <div class="pf-modo">
      <button class="${sc.modo === 'margem' ? 'on' : ''}" data-pf-act="modo" data-sc="${sc.key}" data-v="margem">Lucro %</button>
      <button class="${sc.modo === 'preco' ? 'on' : ''}" data-pf-act="modo" data-sc="${sc.key}" data-v="preco">Preço fixo</button>
    </div>
    ${controle}
    <div data-pf-res="${sc.key}"></div>
  </div>`;
}

function pfRenderRail() {
  const rail = $('#pf-rail'); if (!rail) return;
  rail.innerHTML = PF.scens.map(pfColHTML).join('') +
    `<div class="pf-col" style="display:flex;align-items:stretch;background:transparent;border:none;padding:0">
      <button data-pf-act="addsc" style="width:100%;min-height:220px;border:2px dashed var(--azul);border-radius:16px;background:transparent;font-weight:700;font-size:15px;cursor:pointer">+ Nova simulação</button>
    </div>`;
  pfUpdateResultados();
}

function pfUpdateResultados() {
  const mk = pfMelhorKey();
  const rs = {};
  for (const sc of PF.scens) {
    const r = pfCalc(sc); rs[sc.key] = r;
    const el = $(`[data-pf-res="${sc.key}"]`);
    if (el) el.innerHTML = pfColResultadoHTML(sc, r);
    const col = $(`[data-pf-col="${sc.key}"]`);
    if (col) col.classList.toggle('melhor', sc.key === mk);
  }
  const sel = $('#pf-savesel'); if (!sel) return;
  const atual = PF.scens.some(s => s.key === PF.saveSel) ? PF.saveSel : '';
  PF.saveSel = atual;
  sel.innerHTML = `<option value="">Escolha a simulação…</option>` +
    PF.scens.map(sc => `<option value="${sc.key}"${sc.key === atual ? ' selected' : ''}>${sc.nome} → ${pfFmt(rs[sc.key].preco)}${sc.key === mk ? ' ★' : ''}</option>`).join('');
  const btn = $('#pf-savebtn'); if (btn) btn.classList.toggle('on', !!atual);
}

function pfRenderCard() {
  const host = $('#pf-card'); if (!host) return;
  if (!PF.produto) { host.innerHTML = `<div style="text-align:center;padding:28px 0;color:var(--cinza)">Busque um produto acima para começar a simulação de preço.</div>`; return; }
  const p = PF.produto;
  host.innerHTML = `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:#FAFBFC;border:1.5px solid var(--linha);border-radius:10px;padding:10px 14px;margin-bottom:10px">
    <div style="flex:1;min-width:160px">
      <div style="font-weight:700">${p.nome}</div>
      <div style="font-size:11px;color:var(--cinza)">cód. ${p.cod}</div>
    </div>
    <label style="font-size:12px;font-weight:700;color:var(--azul)">Custo de compra</label>
    <div style="display:flex;align-items:center;gap:4px"><b>R$</b>
      <input type="number" min="0" step="0.01" value="${PF.custo}" class="inp" style="width:90px;font-weight:700;text-align:right" data-pf-act="custo">
    </div>
  </div>`;
}

function pfRenderDrop() {
  const drop = $('#pf-drop'); if (!drop) return;
  const q = PF.busca.trim().toLowerCase();
  const lista = q ? PF.produtos.filter(p => p.nome.toLowerCase().includes(q) || (p.cod || '').toLowerCase().includes(q)) : PF.produtos.slice(0, 12);
  drop.innerHTML = lista.length
    ? lista.map(p => `<button class="pf-droprow" data-pf-act="pickprod" data-id="${p.id}">
        <div style="flex:1"><div style="font-weight:700;font-size:14px">${p.nome}</div>
        <div style="font-size:11px;color:var(--cinza)">cód. ${p.cod}</div></div>
        <b style="font-size:13px">${pfFmt(p.custo || 0)}</b></button>`).join('')
    : `<div style="padding:14px;font-size:13px;color:var(--cinza)">Nenhum produto encontrado.</div>`;
  drop.style.display = 'block';
}

function pfRenderPicker() {
  const host = $('#pf-picker-host'); if (!host) return;
  if (!PF.picker) { host.innerHTML = ''; return; }
  const q = PF.pickQ.trim().toLowerCase();
  let corpo = '';
  if (PF.pickTab === 'lista') {
    const f = !q ? PF_CATALOGO : PF_CATALOGO.filter(c => c.nome.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));
    corpo = f.map(c => `<button class="pf-pickrow" data-pf-act="addcat" data-id="${c.id}">
      <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:14px">${c.nome}
        <span class="pf-tag ${c.tipo}">${c.tipo === 'compra' ? 'NA COMPRA' : 'NA VENDA'}</span></div>
        <div style="font-size:11px;color:var(--cinza)">${c.desc}</div></div>
      <b style="font-size:13px;flex-shrink:0">${c.aliquota}%</b></button>`).join('');
  } else {
    corpo = `<div style="display:flex;flex-direction:column;gap:8px">
      <input id="pf-cx-nome" class="inp" placeholder="Nome (ex: Comissão do vendedor)" style="width:100%">
      <div style="display:flex;gap:8px">
        <input id="pf-cx-aliq" class="inp" type="number" min="0" placeholder="Alíquota %" style="width:110px">
        <select id="pf-cx-tipo" class="inp" style="flex:1">
          <option value="venda">incide na venda (desconta do preço)</option>
          <option value="compra">incide na compra (entra no custo)</option>
        </select>
      </div>
      <button data-pf-act="addcustom" class="btn-acao primario">Adicionar à simulação</button>
    </div>`;
  }
  host.innerHTML = `<div class="pf-overlay" data-pf-act="closepicker">
    <div class="pf-sheet" onclick="event.stopPropagation()">
      <div style="display:flex;align-items:center;margin-bottom:10px">
        <b style="flex:1;font-size:16px">Adicionar imposto ou custo</b>
        <button class="pf-mini" data-pf-act="closepicker">✕</button>
      </div>
      <div class="pf-tabs">
        <button class="${PF.pickTab === 'lista' ? 'on' : ''}" data-pf-act="picktab" data-v="lista">Lista</button>
        <button class="${PF.pickTab === 'custom' ? 'on' : ''}" data-pf-act="picktab" data-v="custom">Criar novo</button>
      </div>
      ${PF.pickTab !== 'custom' ? `<input id="pf-pickq" class="inp" style="width:100%;margin-bottom:10px" value="${PF.pickQ}" placeholder="Buscar imposto pelo nome…">` : ''}
      <div style="overflow-y:auto;flex:1">${corpo}</div>
    </div></div>`;
  const pq = $('#pf-pickq');
  if (pq) pq.addEventListener('input', e => { PF.pickQ = e.target.value; const pos = e.target.selectionStart; pfRenderPicker(); const el = $('#pf-pickq'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } });
}

function pfRenderConfirm() {
  const host = $('#pf-confirm-host'); if (!host) return;
  const sc = PF.scens.find(s => s.key === PF.saveSel);
  if (!PF.confirm || !sc) { host.innerHTML = ''; return; }
  const r = pfCalc(sc);
  host.innerHTML = `<div class="pf-overlay center" data-pf-act="closeconfirm">
    <div class="pf-modal" onclick="event.stopPropagation()">
      <div style="font-weight:900;font-size:18px;margin-bottom:4px">Confirmar novo preço?</div>
      <div style="font-size:13px;color:var(--cinza);margin-bottom:14px">O preço abaixo será salvo no cadastro do produto.</div>
      <div style="background:var(--fundo);border-radius:12px;padding:12px 14px;margin-bottom:14px">
        <div style="font-weight:700;font-size:14px">${PF.produto.nome}</div>
        <div style="font-size:11px;color:var(--cinza);margin-bottom:8px">cód. ${PF.produto.cod} · simulação: <b>${sc.nome}</b></div>
        <div style="display:flex;align-items:center;gap:12px">
          <div style="background:var(--amarelo);border-radius:8px;padding:6px 12px;font-weight:900;font-size:22px">${pfFmt(r.preco)}</div>
          <div style="font-size:12px">
            <div>Lucro: <b style="color:${r.lucro >= 0 ? 'var(--verde)' : 'var(--vermelho)'}">${pfFmt(r.lucro)}</b> por unidade</div>
            <div style="color:var(--cinza)">${pfPc(r.mCusto)} sobre o custo</div>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-acao" style="flex:1" data-pf-act="closeconfirm">Cancelar</button>
        <button class="btn-acao primario" style="flex:1" data-pf-act="doconfirm" id="pf-confirm-btn">Confirmar</button>
      </div>
    </div></div>`;
}

function pfRenderNfe() {
  const host = $('#pf-nfe-host'); if (!host) return;
  if (!PF.nfeAberto) { host.innerHTML = ''; return; }
  const resultado = PF.nfeResultado;
  host.innerHTML = `<div class="pf-overlay" data-pf-act="closenfe">
    <div class="pf-sheet" onclick="event.stopPropagation()">
      <div style="display:flex;align-items:center;margin-bottom:10px">
        <b style="flex:1;font-size:16px">🧾 Importar produto da NF-e</b>
        <button class="pf-mini" data-pf-act="closenfe">✕</button>
      </div>
      ${!resultado ? `
        <div style="font-size:12px;color:var(--cinza);margin-bottom:8px">Cole o XML da nota fiscal eletrônica (NF-e) recebida do fornecedor — vamos ler os itens e mostrar quais já existem no seu cadastro de produtos.</div>
        <textarea id="pf-nfe-xml" rows="8" placeholder="<nfeProc>…</nfeProc>" style="width:100%;font-family:monospace;font-size:11px;padding:8px;border:1.5px solid var(--linha);border-radius:7px;background:#FAFBFC;resize:vertical;margin-bottom:10px">${PF.nfeXml || ''}</textarea>
        <button class="btn-acao primario" style="width:100%" data-pf-act="consultarnfe" ${PF.nfeCarregando ? 'disabled' : ''}>${PF.nfeCarregando ? 'Lendo XML…' : 'Ler NF-e'}</button>
      ` : `
        <div style="font-size:12px;color:var(--cinza);margin-bottom:8px">${resultado.numero ? 'NF-e nº ' + resultado.numero + ' — ' : ''}clique num item para carregá-lo na simulação.</div>
        <div style="overflow-y:auto;flex:1">
          ${resultado.itens.length ? resultado.itens.map(it => `
            <button class="pf-pickrow" data-pf-act="picknfeitem" data-id="${it.produtoId}">
              <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:14px">${it.nome}</div>
              <div style="font-size:11px;color:var(--cinza)">cód. ${it.cod} · qtd. na nota: ${it.quantidade}</div></div>
            </button>`).join('') : `<div style="padding:10px;font-size:12px;color:var(--cinza)">Nenhum item da nota bateu com produtos já cadastrados.</div>`}
          ${resultado.naoEncontrados.length ? `
            <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--linha)">
              <div style="font-size:11px;font-weight:700;color:var(--vermelho);margin-bottom:6px">NÃO ENCONTRADOS NO CADASTRO (${resultado.naoEncontrados.length})</div>
              ${resultado.naoEncontrados.map(n => `<div style="font-size:12px;color:var(--cinza);padding:3px 0">${n}</div>`).join('')}
            </div>` : ''}
        </div>
        <button class="btn-acao" style="margin-top:10px" data-pf-act="voltarnfe">← Ler outra nota</button>
      `}
    </div></div>`;
}

async function pfConsultarNfe() {
  const xml = $('#pf-nfe-xml')?.value.trim();
  if (!xml) return toast('Cole o XML da NF-e primeiro.');
  const filial = filialAtual !== 'todas' ? filialAtual : FILIAIS[0]?.id;
  if (!filial) { toast('Cadastre uma filial antes de importar a NF-e.'); return; }
  PF.nfeXml = xml; PF.nfeCarregando = true; pfRenderNfe();
  try {
    PF.nfeResultado = await apiFetch('/nfe/validar', { method: 'POST', body: { xmlNfe: xml, filial } });
  } catch (e) {
    toast(e.message);
  } finally {
    PF.nfeCarregando = false; pfRenderNfe();
  }
}

async function janelaPrecificar() {
  abrirJanela('Precificaí — Formação de Preço de Venda', `
    <div style="display:flex;gap:8px;margin-bottom:10px;align-items:flex-start">
      <div style="position:relative;flex:1">
        <input id="pf-busca" class="inp" style="width:100%;padding:11px 12px;font-size:14px" placeholder="🔍 Buscar produto por nome ou código…" autocomplete="off">
        <div id="pf-drop" class="pf-drop" style="display:none"></div>
      </div>
      <button class="btn-acao" style="white-space:nowrap;flex-shrink:0" data-pf-act="opennfe">🧾 Importar da NF-e</button>
    </div>
    <div id="pf-card"></div>
    <div style="font-size:12px;color:var(--cinza);margin:6px 2px 8px">Monte simulações lado a lado e compare — deslize para o lado →</div>
    <div id="pf-rail" class="pf-rail"></div>
    <div class="pf-savebar">
      <div class="in">
        <select id="pf-savesel" class="inp"><option value="">Escolha a simulação…</option></select>
        <button id="pf-savebtn" class="btn">Salvar novo preço</button>
      </div>
    </div>
    <div id="pf-picker-host"></div>
    <div id="pf-confirm-host"></div>
    <div id="pf-nfe-host"></div>`, 1040);

  PF = { produtos: [], produto: null, custo: 0, busca: '', scens: [pfNovoCenario('Simulação 1')], saveSel: '', picker: null, pickTab: 'lista', pickQ: '', confirm: false,
    nfeAberto: false, nfeXml: '', nfeResultado: null, nfeCarregando: false };
  pfRenderCard(); pfRenderRail();

  try { PF.produtos = await apiFetch('/produtos'); } catch (e) { toast(e.message); }
  pfRenderDrop();

  $('#pf-busca').addEventListener('focus', () => pfRenderDrop());
  $('#pf-busca').addEventListener('input', e => { PF.busca = e.target.value; pfRenderDrop(); });
  $('#pf-savesel').addEventListener('change', e => { PF.saveSel = e.target.value; pfUpdateResultados(); });
  $('#pf-savebtn').addEventListener('click', () => {
    if (!PF.scens.some(s => s.key === PF.saveSel)) return;
    PF.confirm = true; pfRenderConfirm();
  });
}

async function pfSalvarPreco() {
  const sc = PF.scens.find(s => s.key === PF.saveSel);
  if (!sc || !PF.produto) return;
  const r = pfCalc(sc);
  const btn = $('#pf-confirm-btn'); if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
  try {
    await apiFetch(`/produtos/${PF.produto.id}/preco`, { method: 'PATCH', body: { preco: r.preco, precoMin: +(r.preco * 0.9).toFixed(2) } });
    toast(`${PF.produto.nome} atualizado: novo preço de venda <b>${pfFmt(r.preco)}</b>`);
    PF.confirm = false; pfRenderConfirm();
    const idx = PF.produtos.findIndex(p => p.id === PF.produto.id);
    if (idx >= 0) { PF.produtos[idx].preco = r.preco; PF.produtos[idx].precoMin = r.preco * 0.9; }
  } catch (e) {
    toast(e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar'; }
  }
}

// Delegação de eventos da janela de Precificaí
document.addEventListener('click', e => {
  if (!PF) return;
  const el = e.target.closest('[data-pf-act]'); if (!el) return;
  const act = el.dataset.pfAct;
  const sc = el.dataset.sc ? PF.scens.find(s => s.key === el.dataset.sc) : null;
  switch (act) {
    case 'pickprod': {
      const p = PF.produtos.find(x => x.id === el.dataset.id);
      PF.produto = p; PF.custo = p.custo || 0;
      $('#pf-busca').value = ''; PF.busca = '';
      $('#pf-drop').style.display = 'none';
      pfRenderCard(); pfUpdateResultados(); break;
    }
    case 'tipo': { const t = sc.taxes.find(t => t.uid === el.dataset.tax); t.tipo = t.tipo === 'compra' ? 'venda' : 'compra'; pfRenderRail(); break; }
    case 'rmtax': sc.taxes = sc.taxes.filter(t => t.uid !== el.dataset.tax); pfRenderRail(); break;
    case 'dup': PF.scens.push(pfNovoCenario(sc.nome + ' (cópia)', sc)); pfRenderRail(); break;
    case 'rmsc': PF.scens = PF.scens.filter(s => s.key !== sc.key); pfRenderRail(); break;
    case 'addsc': PF.scens.push(pfNovoCenario('Simulação ' + (PF.scens.length + 1))); pfRenderRail(); break;
    case 'modo': sc.modo = el.dataset.v; pfRenderRail(); break;
    case 'term': sc.term = el.dataset.v; pfRenderRail(); break;
    case 'openpicker': PF.picker = el.dataset.sc; PF.pickTab = 'lista'; PF.pickQ = ''; pfRenderPicker(); break;
    case 'closepicker': PF.picker = null; pfRenderPicker(); break;
    case 'picktab': PF.pickTab = el.dataset.v; PF.pickQ = ''; pfRenderPicker(); break;
    case 'addcat': { const c = PF_CATALOGO.find(x => x.id === el.dataset.id); PF.scens.find(s => s.key === PF.picker).taxes.push(pfMkTax(c)); PF.picker = null; pfRenderPicker(); pfRenderRail(); break; }
    case 'addcustom': {
      const nome = $('#pf-cx-nome').value.trim();
      const a = parseFloat(String($('#pf-cx-aliq').value).replace(',', '.'));
      const tipo = $('#pf-cx-tipo').value;
      if (!nome || !isFinite(a) || a <= 0) return;
      PF.scens.find(s => s.key === PF.picker).taxes.push({ uid: 'pt' + (_pfSeq++), nome, aliquota: a, tipo, destaque: false });
      PF.picker = null; pfRenderPicker(); pfRenderRail(); break;
    }
    case 'closeconfirm': PF.confirm = false; pfRenderConfirm(); break;
    case 'doconfirm': pfSalvarPreco(); break;
    case 'opennfe': PF.nfeAberto = true; PF.nfeResultado = null; pfRenderNfe(); break;
    case 'closenfe': PF.nfeAberto = false; pfRenderNfe(); break;
    case 'voltarnfe': PF.nfeResultado = null; pfRenderNfe(); break;
    case 'consultarnfe': pfConsultarNfe(); break;
    case 'picknfeitem': {
      const p = PF.produtos.find(x => x.id === el.dataset.id);
      if (p) { PF.produto = p; PF.custo = p.custo || 0; pfRenderCard(); pfUpdateResultados(); }
      PF.nfeAberto = false; pfRenderNfe();
      break;
    }
  }
});
document.addEventListener('input', e => {
  if (!PF) return;
  const el = e.target.closest('[data-pf-act]'); if (!el) return;
  const sc = el.dataset.sc ? PF.scens.find(s => s.key === el.dataset.sc) : null;
  const v = parseFloat(el.value);
  switch (el.dataset.pfAct) {
    case 'custo': PF.custo = isFinite(v) ? v : 0; pfUpdateResultados(); break;
    case 'aliq': { const t = sc.taxes.find(t => t.uid === el.dataset.tax); t.aliquota = isFinite(v) ? v : 0; pfUpdateResultados(); break; }
    case 'margem': case 'margemN': {
      sc.margem = isFinite(v) ? v : 0;
      const col = $(`[data-pf-col="${sc.key}"]`);
      col.querySelectorAll('[data-pf-act="margem"],[data-pf-act="margemN"]').forEach(i => { if (i !== el) i.value = sc.margem; });
      pfUpdateResultados(); break;
    }
    case 'precoM': sc.precoManual = isFinite(v) ? v : 0; pfUpdateResultados(); break;
    case 'nome': sc.nome = el.value; pfUpdateResultados(); break;
  }
});

// ─── Relatórios ───────────────────────────────────────────────────────────────
async function janelaRelEstoque() {
  abrirJanela('Estoque Atual por Filial', `
    <div class="moldura-grid" style="max-height:380px"><table class="tabela">
      <thead><tr>
        <th>Código</th><th>Descrição</th>
        ${FILIAIS.map(f => `<th class="num">${f.nome}</th>`).join('')}
        <th class="num">Total</th>
      </tr></thead>
      <tbody><tr><td colspan="${3 + FILIAIS.length}" style="text-align:center;color:var(--cinza);padding:18px">Carregando…</td></tr></tbody>
    </table></div>
    <div class="rodape-form"><button class="btn-acao primario" onclick="fecharJanela()">(ESC) Fechar</button></div>`, 900);
  try {
    const prods = await apiFetch('/produtos');
    const tb = document.querySelector('#janela-ativa .tabela tbody');
    if (!tb) return;
    tb.innerHTML = prods.map(p => `
      <tr onclick="prodSel='${p.id}'; fecharJanela(); janelaProdutos()">
        <td class="num">${p.cod}</td><td>${p.nome}</td>
        ${FILIAIS.map(f => `<td class="num ${((p.saldo ?? {})[f.id] || 0) < (p.min || 0) ? 'neg' : ''}">${(p.saldo ?? {})[f.id] || 0}</td>`).join('')}
        <td class="num" style="font-weight:900">${saldoTotal(p)}</td>
      </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--cinza);padding:18px">Nenhum produto.</td></tr>';
  } catch (e) { toast(e.message); }
}

async function janelaHistorico() {
  abrirJanela('Movimentações de Estoque', `
    <div class="moldura-grid" style="max-height:380px"><table class="tabela">
      <thead><tr><th>Tipo</th><th>Produto</th><th>Filial</th><th class="num">Qtd</th><th>Obs</th><th>Quando</th></tr></thead>
      <tbody><tr><td colspan="6" style="text-align:center;color:var(--cinza);padding:18px">Carregando…</td></tr></tbody>
    </table></div>
    <div class="rodape-form"><button class="btn-acao primario" onclick="fecharJanela()">(ESC) Fechar</button></div>`, 900);
  try {
    const params = filialAtual !== 'todas' ? `?filial=${filialAtual}` : '';
    const movs = await apiFetch(`/movimentacoes${params}`);
    const tb = document.querySelector('#janela-ativa .tabela tbody');
    if (!tb) return;
    tb.innerHTML = movs.map(m => {
      const p = PRODUTOS.find(x => x.id === m.produtoId);
      return `<tr>
        <td><b>${(m.tipo || '').toUpperCase()}</b></td>
        <td>${p ? `${p.cod} — ${p.nome}` : (m.produtoId || '—')}</td>
        <td>${nomeFil(m.filial)}${m.destino ? ' → ' + nomeFil(m.destino) : ''}</td>
        <td class="num">${m.qtd}</td>
        <td>${m.obs || ''}</td>
        <td style="font-size:11px">${m.em ? new Date(m.em).toLocaleString('pt-BR') : '—'}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--cinza);padding:18px">Sem movimentações.</td></tr>';
  } catch (e) { toast(e.message); }
}

async function janelaFiliais() {
  abrirJanela('Filiais', `
    <div class="moldura-grid" style="max-height:none"><table class="tabela">
      <thead><tr><th>ID (login Caixa)</th><th>Filial</th><th class="num">Itens abaixo do mínimo</th><th class="num">Valor de estoque (custo)</th></tr></thead>
      <tbody><tr><td colspan="4" style="text-align:center;color:var(--cinza);padding:18px">Carregando…</td></tr></tbody>
    </table></div>
    <div style="font-size:11.5px;color:var(--cinza);margin-top:8px">
      O funcionário usa o <b>ID</b> da filial junto com usuário e senha para entrar no Caixa.
    </div>
    <div class="rodape-form">
      <button class="btn-acao" onclick="abrirNovaFilial()">Incluir</button>
      <button class="btn-acao primario" onclick="fecharJanela()">(ESC) Fechar</button>
    </div>`, 720);
  try {
    const prods = await apiFetch('/produtos');
    const tb = document.querySelector('#janela-ativa .tabela tbody');
    if (!tb) return;
    tb.innerHTML = FILIAIS.length ? FILIAIS.map(f => {
      const abaixo = prods.filter(p => ((p.saldo ?? {})[f.id] || 0) < (p.min || 0)).length;
      const valor = prods.reduce((s, p) => s + ((p.saldo ?? {})[f.id] || 0) * (p.custo || 0), 0);
      return `<tr>
        <td><b>${f.id}</b></td><td>${f.nome}</td>
        <td class="num ${abaixo ? 'neg' : ''}">${abaixo}</td>
        <td class="num">R$ ${brl(valor)}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--cinza);padding:18px">Nenhuma filial cadastrada. Clique em "Incluir" para criar a primeira.</td></tr>';
  } catch (e) { toast(e.message); }
}

function abrirNovaFilial() {
  abrirJanela('Incluir Filial', `
    <div class="form-linha"><label>Nome da filial *</label><input id="nf-nome" placeholder="Ex: Loja Centro"></div>
    <div style="border-top:1px solid var(--linha);margin:10px 0 8px;padding-top:8px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--azul)">Endereço (opcional)</div>
    <div class="form-linha">
      <label>CEP</label>
      <div style="display:flex;gap:8px;align-items:center">
        <input id="nf-cep" placeholder="00000-000" maxlength="9" style="width:140px" oninput="buscarCepFilial(this.value)">
        <span id="nf-cep-st" style="font-size:12px;color:var(--cinza)"></span>
      </div>
    </div>
    <div class="form-linha"><label>Rua</label><input id="nf-rua" placeholder="Preenchido pelo CEP"></div>
    <div class="form-linha"><label>Número</label><input id="nf-num" style="width:100px"></div>
    <div class="form-linha"><label>Complemento</label><input id="nf-comp" placeholder="Sala, galpão…"></div>
    <div class="form-linha"><label>Bairro</label><input id="nf-bairro"></div>
    <div class="form-linha"><label>Cidade</label><input id="nf-cidade"></div>
    <div class="form-linha"><label>Estado (UF)</label><input id="nf-uf" maxlength="2" style="width:60px" placeholder="SP"></div>
    <div class="rodape-form">
      <button class="btn-acao" onclick="janelaFiliais()">Voltar</button>
      <button class="btn-acao primario" id="btn-nf" onclick="salvarFilial()">Gravar</button>
    </div>`, 560);
  setTimeout(() => $('#nf-nome')?.focus(), 60);
}

async function buscarCepFilial(valor) {
  const cep = valor.replace(/\D/g, '');
  const st = $('#nf-cep-st');
  if (cep.length !== 8) return;
  if (st) st.textContent = 'Buscando…';
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const d = await r.json();
    if (d.erro) { if (st) st.textContent = 'CEP não encontrado'; return; }
    if ($('#nf-rua'))    $('#nf-rua').value    = d.logradouro || '';
    if ($('#nf-bairro')) $('#nf-bairro').value = d.bairro     || '';
    if ($('#nf-cidade')) $('#nf-cidade').value = d.localidade || '';
    if ($('#nf-uf'))     $('#nf-uf').value     = d.uf         || '';
    if (st) st.textContent = '✓';
    setTimeout(() => $('#nf-num')?.focus(), 40);
  } catch { if (st) st.textContent = 'Erro ao buscar CEP'; }
}

async function salvarFilial() {
  const nome = $('#nf-nome').value.trim();
  if (!nome) return toast('Informe o nome da filial.');

  const body = { nome };
  const rua = $('#nf-rua')?.value.trim();
  if (rua) {
    body.endereco = {
      cep:         $('#nf-cep')?.value.trim()    || undefined,
      rua,
      numero:      $('#nf-num')?.value.trim()    || undefined,
      complemento: $('#nf-comp')?.value.trim()   || undefined,
      bairro:      $('#nf-bairro')?.value.trim() || undefined,
      cidade:      $('#nf-cidade')?.value.trim() || undefined,
      estado:      $('#nf-uf')?.value.trim().toUpperCase() || undefined,
    };
  }

  const btn = $('#btn-nf'); btn.disabled = true; btn.textContent = 'Gravando…';
  try {
    const loja = await apiFetch('/lojas', { method: 'POST', body });
    FILIAIS.push(loja);
    toast(`Filial <b>${loja.nome}</b> criada! ID para login no Caixa: <b>${loja.id}</b>`);
    janelaFiliais();
  } catch (e) {
    toast(e.message);
    btn.disabled = false; btn.textContent = 'Gravar';
  }
}

function trocarFilial() {
  abrirJanela('Trocar Filial', `
    <div class="form-linha"><label>Filial</label>
      <select id="tf-sel">
        <option value="todas">Todas as filiais</option>
        ${FILIAIS.map(f => `<option value="${f.id}" ${f.id === filialAtual ? 'selected' : ''}>${f.nome}</option>`).join('')}
      </select>
    </div>
    <div class="rodape-form">
      <button class="btn-acao" onclick="fecharJanela()">(ESC) Fechar</button>
      <button class="btn-acao primario" onclick="
        filialAtual=document.getElementById('tf-sel').value;
        document.getElementById('st-filial').textContent=nomeFil(filialAtual);
        fecharJanela();
        toast('Filial ativa: <b>'+nomeFil(filialAtual)+'</b>')">Ok</button>
    </div>`, 480);
}

// ─── Cadastro de Clientes ─────────────────────────────────────────────────────
async function janelaClientes() {
  abrirJanela('Clientes', `
    <div class="linha-consulta" style="margin-bottom:10px">
      <input type="text" id="cli-busca" placeholder="Nome, CPF/CNPJ ou código…" autocomplete="off">
      <button class="btn-acao" onclick="buscarClientes()">Buscar</button>
    </div>
    <div class="moldura-grid" style="max-height:260px"><table class="tabela" id="grid-cli">
      <thead><tr><th class="num">Cód</th><th>Nome/Razão</th><th>Fantasia</th><th>CPF/CNPJ</th><th>Cidade</th></tr></thead>
      <tbody><tr><td colspan="5" style="text-align:center;color:var(--cinza);padding:18px">Carregando…</td></tr></tbody>
    </table></div>
    <div class="grade-botoes" style="margin-top:10px">
      <button class="btn-acao" onclick="novoCliente()">Incluir</button>
      <button class="btn-acao" onclick="editarCliente()">Alterar</button>
      <button class="btn-acao" onclick="stub('Ativar/Desativar Cliente')">Ativar/Desativar</button>
    </div>
    <div class="rodape-form"><button class="btn-acao primario" onclick="fecharJanela()">(ESC) Fechar</button></div>`, 900);
  buscarClientes();
  setTimeout(() => $('#cli-busca')?.focus(), 60);
}

let _cliSel = null;
let _clientes = [];
async function buscarClientes() {
  const q = ($('#cli-busca')?.value || '').trim();
  const tb = document.querySelector('#grid-cli tbody');
  if (!tb) return;
  tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--cinza);padding:18px">Carregando…</td></tr>';
  try {
    _clientes = await apiFetch(`/clientes${q ? '?busca=' + encodeURIComponent(q) : ''}`);
    if (_clientes.length > 0) _cliSel = _clientes[0].id;
    tb.innerHTML = _clientes.map(c => `
      <tr class="${c.id === _cliSel ? 'sel' : ''}" onclick="_cliSel='${c.id}'; document.querySelectorAll('#grid-cli tbody tr').forEach(r=>r.classList.remove('sel')); this.classList.add('sel')">
        <td class="num">${c.cod || c.id}</td><td>${c.nome}</td><td>${c.fantasia || '—'}</td>
        <td>${c.cpfCnpj || '—'}</td><td>${c.cidade || '—'}</td>
      </tr>`).join('') ||
      '<tr><td colspan="5" style="text-align:center;color:var(--cinza);padding:18px">Nenhum cliente encontrado.</td></tr>';
  } catch (e) {
    tb.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--vermelho);padding:18px">${e.message}</td></tr>`;
  }
}
function novoCliente() { _formCliente(null); }
function editarCliente() {
  const c = _clientes.find(x => x.id === _cliSel);
  if (!c) return toast('Selecione um cliente para alterar.');
  _formCliente(c);
}
function _formCliente(c) {
  abrirJanela(c ? `Alterar Cliente — ${c.nome}` : 'Incluir Cliente', `
    <form onsubmit="salvarCliente(event,'${c?.id || ''}')">
      <div class="form-linha"><label>Nome/Razão *</label><input id="fc-nome" value="${c?.nome || ''}" required></div>
      <div class="form-linha"><label>Fantasia</label><input id="fc-fantasia" value="${c?.fantasia || ''}"></div>
      <div class="form-linha"><label>CPF/CNPJ</label><input id="fc-cpfcnpj" value="${c?.cpfCnpj || ''}"></div>
      <div class="form-linha"><label>Telefone</label><input id="fc-tel" value="${c?.telefone || ''}"></div>
      <div class="form-linha"><label>Celular / WhatsApp</label><input id="fc-cel" value="${c?.celular || ''}"></div>
      <div class="form-linha"><label>E-mail</label><input id="fc-email" type="email" value="${c?.email || ''}"></div>
      <div style="border-top:1px solid var(--linha); margin:10px 0 8px; padding-top:8px; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:var(--azul)">Endereço</div>
      <div class="form-linha">
        <label>CEP</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="fc-cep" value="${c?.cep || ''}" placeholder="00000-000" maxlength="9" style="width:130px" oninput="buscarCep(this.value)">
          <span id="fc-cep-status" style="font-size:12px;color:var(--cinza)"></span>
        </div>
      </div>
      <div class="form-linha"><label>Rua / Logradouro</label><input id="fc-rua" value="${c?.rua || ''}"></div>
      <div class="form-linha"><label>Número</label><input id="fc-num" value="${c?.numero || ''}" style="width:100px"></div>
      <div class="form-linha"><label>Complemento</label><input id="fc-comp" value="${c?.complemento || ''}" placeholder="Apto, sala…"></div>
      <div class="form-linha"><label>Bairro</label><input id="fc-bairro" value="${c?.bairro || ''}"></div>
      <div class="form-linha"><label>Cidade</label><input id="fc-cidade" value="${c?.cidade || ''}"></div>
      <div class="form-linha"><label>Estado (UF)</label><input id="fc-estado" value="${c?.estado || ''}" maxlength="2" style="width:60px" placeholder="SP"></div>
      <div class="form-linha"><label>Observação</label><input id="fc-obs" value="${c?.obs || ''}"></div>
      <div class="rodape-form">
        <button class="btn-acao" type="button" onclick="janelaClientes()">Voltar</button>
        <button class="btn-acao primario" type="submit" id="btn-fc">Gravar</button>
      </div>
    </form>`, 720);
  setTimeout(() => $('#fc-nome')?.focus(), 60);
}

async function buscarCep(valor) {
  const cep = valor.replace(/\D/g, '');
  const status = $('#fc-cep-status');
  if (cep.length !== 8) return;
  if (status) status.textContent = 'Buscando…';
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const d = await r.json();
    if (d.erro) { if (status) status.textContent = 'CEP não encontrado'; return; }
    if ($('#fc-rua'))    $('#fc-rua').value    = d.logradouro || '';
    if ($('#fc-bairro')) $('#fc-bairro').value = d.bairro     || '';
    if ($('#fc-cidade')) $('#fc-cidade').value = d.localidade || '';
    if ($('#fc-estado')) $('#fc-estado').value = d.uf         || '';
    if (status) status.textContent = '✓';
    setTimeout(() => $('#fc-num')?.focus(), 40);
  } catch { if (status) status.textContent = 'Erro ao buscar CEP'; }
}

async function salvarCliente(e, id) {
  e.preventDefault();
  const nome = $('#fc-nome').value.trim();
  if (!nome || nome.length < 2) return toast('Nome deve ter ao menos 2 caracteres.');
  const body = {
    nome,
    fantasia:    $('#fc-fantasia').value.trim(),
    cpfCnpj:    $('#fc-cpfcnpj').value.trim(),
    telefone:   $('#fc-tel').value.trim(),
    celular:    $('#fc-cel').value.trim(),
    email:      $('#fc-email').value.trim(),
    cep:        $('#fc-cep').value.trim(),
    rua:        $('#fc-rua').value.trim(),
    numero:     $('#fc-num').value.trim(),
    complemento: $('#fc-comp').value.trim(),
    bairro:     $('#fc-bairro').value.trim(),
    cidade:     $('#fc-cidade').value.trim(),
    estado:     $('#fc-estado').value.trim().toUpperCase(),
    obs:        $('#fc-obs').value.trim(),
  };
  const btn = $('#btn-fc'); btn.disabled = true; btn.textContent = 'Gravando…';
  try {
    if (id) { await apiFetch(`/clientes/${id}`, { method: 'PUT', body }); toast('Cliente atualizado.'); }
    else { await apiFetch('/clientes', { method: 'POST', body }); toast('Cliente criado.'); }
    janelaClientes();
  } catch (err) { toast(err.message); btn.disabled = false; btn.textContent = 'Gravar'; }
}

// ─── Cadastro de Vendedores / Funcionários ────────────────────────────────────
// ─── Funcionários ─────────────────────────────────────────────────────────────
async function janelaVendedores() {
  abrirJanela('Funcionários', `
    <div class="linha-consulta" style="margin-bottom:10px">
      <input type="text" id="vend-busca" placeholder="Username…" autocomplete="off">
      <button class="btn-acao" onclick="buscarVendedores()">Buscar</button>
    </div>
    <div class="moldura-grid" style="max-height:260px"><table class="tabela" id="grid-vend">
      <thead><tr><th>Username</th><th>Perfil</th><th>Filiais</th><th>Situação</th></tr></thead>
      <tbody><tr><td colspan="4" style="text-align:center;color:var(--cinza);padding:18px">Carregando…</td></tr></tbody>
    </table></div>
    <div class="grade-botoes" style="margin-top:10px">
      <button class="btn-acao" onclick="novoVendedor()">Incluir</button>
      <button class="btn-acao" onclick="editarVendedor()">Alterar</button>
    </div>
    <div class="rodape-form"><button class="btn-acao primario" onclick="fecharJanela()">(ESC) Fechar</button></div>`, 820);
  buscarVendedores();
  setTimeout(() => $('#vend-busca')?.focus(), 60);
}

let _vendSel = null;
let _vendedores = [];
async function buscarVendedores() {
  const tb = document.querySelector('#grid-vend tbody');
  if (!tb) return;
  tb.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--cinza);padding:18px">Carregando…</td></tr>';
  try {
    _vendedores = await apiFetch('/funcionarios');
    if (_vendedores.length > 0) _vendSel = _vendedores[0].id;
    tb.innerHTML = _vendedores.map(v => `
      <tr class="${v.id === _vendSel ? 'sel' : ''}" onclick="_vendSel='${v.id}'; document.querySelectorAll('#grid-vend tbody tr').forEach(r=>r.classList.remove('sel')); this.classList.add('sel')">
        <td>${v.nome}</td>
        <td>${v.role === 'GESTAO' ? 'Gestão' : 'Caixa'}</td>
        <td>${(v.lojas || []).join(', ') || '—'}</td>
        <td><b style="color:${v.ativo !== false ? 'var(--verde)' : 'var(--vermelho)'}">${v.ativo !== false ? 'Ativo' : 'Inativo'}</b></td>
      </tr>`).join('') ||
      '<tr><td colspan="4" style="text-align:center;color:var(--cinza);padding:18px">Nenhum funcionário encontrado.</td></tr>';
  } catch (e) {
    tb.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--vermelho);padding:18px">${e.message}</td></tr>`;
  }
}
function novoVendedor() { _formVendedor(null); }
function editarVendedor() {
  const v = _vendedores.find(x => x.id === _vendSel);
  if (!v) return toast('Selecione um funcionário para alterar.');
  _formVendedor(v);
}
function _formVendedor(v) {
  const lojasCheck = FILIAIS.map(f => {
    const marcado = v?.lojas?.includes(f.id) ? 'checked' : '';
    return `<label style="display:flex;align-items:center;gap:6px;font-weight:400;text-transform:none;letter-spacing:0">
      <input type="checkbox" name="loja" value="${f.id}" ${marcado}> ${f.nome}
    </label>`;
  }).join('');

  abrirJanela(v ? `Alterar Funcionário — ${v.nome}` : 'Incluir Funcionário', `
    <form onsubmit="salvarVendedor(event,'${v?.id || ''}')">
      <div class="form-linha"><label>Nome *</label><input id="fv-login" value="${v?.nome || ''}" required autocomplete="off"></div>
      <div class="form-linha"><label>${v ? 'Nova Senha' : 'Senha *'}</label>
        <input id="fv-senha" type="password" autocomplete="new-password" ${!v ? 'required minlength="6"' : 'minlength="6"'}
          placeholder="${v ? 'deixe em branco para manter' : 'mínimo 6 caracteres'}"></div>
      <div class="form-linha"><label>Perfil</label>
        <select id="fv-perfil">
          <option value="caixa" ${v?.role==='CAIXA'?'selected':''}>Caixa</option>
          <option value="gestao" ${v?.role==='GESTAO'?'selected':''}>Gestão</option>
        </select>
      </div>
      ${FILIAIS.length > 0 ? `<div class="form-linha" style="align-items:flex-start">
        <label style="padding-top:4px">Filiais</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px 16px;padding:6px 0">${lojasCheck}</div>
      </div>` : ''}
      <div class="rodape-form">
        <button class="btn-acao" type="button" onclick="janelaVendedores()">Voltar</button>
        <button class="btn-acao primario" type="submit" id="btn-fv">Gravar</button>
      </div>
    </form>`, 620);
}
async function salvarVendedor(e, id) {
  e.preventDefault();
  const nome = $('#fv-login').value.trim();
  const senha = $('#fv-senha').value;
  if (!nome) return toast('Nome é obrigatório.');
  if (!id && !senha) return toast('Senha é obrigatória para novo funcionário.');
  const lojas = [...document.querySelectorAll('input[name="loja"]:checked')].map(c => c.value);
  const body = { nome, role: $('#fv-perfil').value, lojas };
  if (senha) body.senha = senha;
  const btn = $('#btn-fv'); btn.disabled = true; btn.textContent = 'Gravando…';
  try {
    if (id) { await apiFetch(`/funcionarios/${id}`, { method: 'PUT', body }); toast('Funcionário atualizado.'); }
    else { await apiFetch('/funcionarios', { method: 'POST', body }); toast('Funcionário criado.'); }
    janelaVendedores();
  } catch (err) { toast(err.message); btn.disabled = false; btn.textContent = 'Gravar'; }
}

// ─── Menus ────────────────────────────────────────────────────────────────────
const MENUS = [
  { rot: 'Cadastros', itens: [
    { rot: '1 - Clientes…', ac: janelaClientes },
    { rot: '2 - Vendedores e Usuários…', ac: janelaVendedores },
    { rot: '3 - Produtos', sub: [
      { rot: '1 - Produtos…', tecla: 'F7', ac: janelaProdutos },
      { rot: 'B - Formação de Preço Padrão…', tecla: 'F6', ac: janelaPrecificar },
    ]},
    { rot: '5 - Fornecedores…', tecla: 'F3', ac: () => stub('Fornecedores') },
    { rot: 'A - Filiais…', ac: janelaFiliais },
  ]},
  { rot: 'Manutenção', itens: [
    { rot: '5 - Compras', sub: [
      { rot: '1 - Lançar Notas de Compras…', tecla: 'Ctrl+F6', ac: janelaEntradaNF },
      { rot: '4 - Pedido de Compra…', tecla: 'Ctrl+F9', ac: () => stub('Pedido de Compra') },
    ]},
    { rot: '7 - Manutenção de Estoque', sub: [
      { rot: '1 - Entrada e Saída Manual…', ac: () => janelaEntradaSaida() },
      { rot: '2 - Ponto de Reposição…', ac: janelaReposicao },
      { rot: '3 - Conferências e ajustes', ac: janelaAjuste },
    ]},
    { rot: '8 - Manutenção de Preços', tecla: 'F6', ac: janelaPrecificar },
    { rot: '9 - Operações com Filiais', sub: [
      { rot: '1 - Transferência entre Filiais…', ac: () => janelaTransferencia() },
    ]},
  ]},
  { rot: 'Relatórios', itens: [
    { rot: '1 - Estoque Atual por Filial…', ac: janelaRelEstoque },
    { rot: '2 - Itens Abaixo do Mínimo…', ac: janelaReposicao },
    { rot: '3 - Movimentações de Estoque…', ac: janelaHistorico },
  ]},
  { rot: 'Utilitários', itens: [
    { rot: '1 - Importar XML de NF-e…', ac: janelaEntradaNF },
    { rot: '2 - Trocar Filial…', ac: trocarFilial },
  ]},
  { rot: 'Ajuda', itens: [
    { rot: '1 - Sobre o Estocaaí…', ac: () => toast('<b>Estocaaí</b> — Sistema de Gestão de Estoque Multi-Lojas') },
  ]},
  { rot: 'Sair', itens: [
    { rot: '1 - Trocar Usuário…', ac: () => { auth.clear(); location.reload(); } },
  ]},
];

function montarMenus() {
  const bar = $('#menubar'); bar.innerHTML = '';
  MENUS.forEach(m => {
    const raiz = document.createElement('div'); raiz.className = 'menu-raiz';
    const b = document.createElement('button');
    b.innerHTML = `<u>${m.rot[0]}</u>${m.rot.slice(1)}`;
    b.onclick = e => { e.stopPropagation(); fecharMenus(raiz); raiz.classList.toggle('aberto'); render1oNivel(raiz, m); };
    raiz.appendChild(b); bar.appendChild(raiz);
  });
  document.addEventListener('click', () => fecharMenus());
}

function fecharMenus(exceto) {
  document.querySelectorAll('.menu-raiz').forEach(r => {
    if (r !== exceto) { r.classList.remove('aberto'); r.querySelectorAll('.submenu').forEach(s => s.remove()); }
  });
  if (exceto) exceto.querySelectorAll('.submenu').forEach(s => s.remove());
}

function render1oNivel(raiz, m) {
  if (!raiz.classList.contains('aberto')) return;
  raiz.appendChild(criarSubmenu(m.itens));
}

function criarSubmenu(itens) {
  const sm = document.createElement('div'); sm.className = 'submenu';
  itens.forEach(it => {
    const b = document.createElement('button'); b.className = 'item';
    b.innerHTML = `<span>${it.rot}</span>` + (it.sub ? `<span class="seta">▶</span>` : (it.tecla ? `<kbd class="tecla">${it.tecla}</kbd>` : ''));
    if (it.sub) {
      b.onclick = e => {
        e.stopPropagation();
        sm.querySelectorAll(':scope > .submenu').forEach(s => s.remove());
        const filho = criarSubmenu(it.sub);
        filho.style.top = (b.offsetTop - 4) + 'px';
        sm.appendChild(filho);
      };
    } else {
      b.onclick = e => { e.stopPropagation(); fecharMenus(); (it.ac || (() => stub(it.rot.replace(/^.{0,4}- /, '').replace('…', ''))))(); };
    }
    sm.appendChild(b);
  });
  return sm;
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────
const FERRAMENTAS = [
  { ico: '📦', atalho: 'F7', rot: 'Produtos', ac: janelaProdutos },
  { ico: '🏷️', atalho: 'Ctrl+F7', rot: 'Busca Preço', ac: janelaBuscaPreco },
  { ico: '🧺', atalho: 'Ctrl+F6', rot: 'Compras', ac: janelaEntradaNF },
  { ico: '↔️', atalho: 'Ctrl+T', rot: 'Transferir', ac: () => janelaTransferencia() },
  { ico: '💰', atalho: 'F6', rot: 'Precificar', ac: janelaPrecificar },
  { ico: '📊', atalho: 'F5', rot: 'Rel.Estoque', ac: janelaRelEstoque },
  { ico: '⚠️', atalho: 'F4', rot: 'Reposição', ac: janelaReposicao },
  { ico: '📋', atalho: 'F3', rot: 'Histórico', ac: janelaHistorico },
  { ico: '🧾', atalho: 'F8', rot: 'Caixa', ac: abrirCaixa },
];

// ─── Caixa (PDV) ──────────────────────────────────────────────────────────────
// Abre o caixa já autenticado com a sessão atual do estoque: o token é o mesmo
// JWT, emitido pela estocaai-api, que a caixa-api também valida. Vai no hash da
// URL para não aparecer em log de servidor nem no header Referer.
function abrirCaixa() {
  if (!_token) return toast('Faça login para abrir o caixa.');
  const base = import.meta.env.VITE_CAIXA_URL;
  if (!base) return toast('URL do caixa não configurada (VITE_CAIXA_URL).');
  window.open(`${base}/#sso=${encodeURIComponent(_token)}`, '_blank', 'noopener');
}

// ─── Escanear pelo celular ────────────────────────────────────────────────────
// Botão reservado: a leitura pelo celular ainda não foi implementada.
function escanearPeloCelular() {
  toast('Leitura pelo celular ainda não disponível.');
}

function montarToolbar() {
  $('#toolbar').innerHTML = '';
  FERRAMENTAS.forEach(f => {
    const b = document.createElement('button'); b.className = 'ferramenta';
    b.innerHTML = `<span class="ico">${f.ico}</span><span class="atalho">${f.atalho}</span><span class="rot">${f.rot}</span>`;
    b.onclick = f.ac;
    $('#toolbar').appendChild(b);
  });
}

// ─── Atalhos de Teclado ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const combo = (e.ctrlKey ? 'Ctrl+' : '') + e.key.toUpperCase();
  const mapa = {
    'F7': janelaProdutos, 'CTRL+F7': janelaBuscaPreco,
    'CTRL+F6': janelaEntradaNF, 'CTRL+T': () => janelaTransferencia(),
    'F6': janelaPrecificar,
    'F4': janelaReposicao, 'F5': janelaRelEstoque, 'F3': janelaHistorico,
    'F8': abrirCaixa,
  };
  const fn = mapa[combo];
  if (fn) { e.preventDefault(); fn(); }
  if (e.key === 'Escape') { fecharMenus(); fecharJanela(); }
});

// ─── Relógio e Init ───────────────────────────────────────────────────────────
function relogio() {
  const d = new Date();
  $('#st-relogio').textContent = d.toLocaleDateString('pt-BR') + ' - ' + d.toLocaleTimeString('pt-BR');
}
setInterval(relogio, 1000); relogio();
montarMenus(); montarToolbar();
$('#lg-sen').addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); });
$('#lg-usr').addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); });
// lg-email criado dinamicamente mas escuta keydown via delegação
document.addEventListener('keydown', e => {
  if (e.target.id === 'lg-email' && e.key === 'Enter') entrar();
});

// ─── Expor funções ao escopo global (chamadas por onclick no HTML) ─────────────
Object.assign(window, {
  entrar, trocarAba, abrirCadastroGestor, registrarGestor, fecharCadastro, buscarCepCadastro,
  selecionarFilialLogin,
  fecharJanela, fecharMenus, stub,
  janelaProdutos, janelaBuscaPreco, janelaEntradaNF, janelaPrecificar,
  janelaEntradaSaida, janelaTransferencia, janelaAjuste,
  janelaReposicao, janelaRelEstoque, janelaHistorico, janelaFiliais,
  abrirNovaFilial, buscarCepFilial, salvarFilial,
  trocarFilial, detalhesEstoque, produtoSimilar, totaliza, analisaProduto,
  buscarProdutos, renderGridProd, mostraSaldoAj,
  gravarES, gravarTransf, gravarAjuste, importarNfe,
  abrirNovoProduto, abrirEditarProduto, salvarProduto,
  fpEscolher, fpSoLancar, fpLerNfe, fpUsarItemNfe, fpLancarNotaToda, fpTrocarNota,
  abrirCaixa, escanearPeloCelular,
  // Clientes
  janelaClientes, buscarClientes, novoCliente, editarCliente, salvarCliente, buscarCep,
  // Vendedores
  janelaVendedores, buscarVendedores, novoVendedor, editarVendedor, salvarVendedor,
  nomeFil,
});
