import { sb, brl, num, esc, slug, soDig, waNumero, waFormat, waLink, enviarFoto, csvTexto, baixarArquivo, pixPayload, qrSvg } from './lib.js';
import { DEFAULTS, FIELDS } from './defaults.js';

const $ = id => document.getElementById(id);
const STATUS = ['Novo', 'Pago', 'Enviado', 'Entregue'];
const TABS = [['resumo', 'Resumo'], ['estoque', 'Estoque'], ['pedidos', 'Pedidos'], ['clientes', 'Clientes'], ['financeiro', 'Financeiro'], ['looks', 'Looks'], ['cupons', 'Cupons'], ['conteudo', 'Conteúdo']];
let tab = 'resumo', D = { produtos: [], pedidos: [], despesas: [], looks: [], cupons: [] }, site = {}, pix = { tipo: 'cpf', chave: '', nome: '', cidade: '' };
let editProd = null, editLook = null, editCup = null, editDesp = false, cobId = null, campAud = 'inativos', campMsg = 'Olá, {nome}! Chegaram novidades no Closet Ana Lu. Veja: {link}';
let mesFin = new Date().toISOString().slice(0, 7);
let buscaEst = '';
const dtBr = d => (d ? new Date(d).toLocaleDateString('pt-BR') : '');
const hoje = () => new Date().toISOString().slice(0, 10);

// ---------- toast e confirmação ----------
function toast(m) { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 4500); }
function confirmar(titulo, texto = '') {
  return new Promise(res => {
    $('mT').textContent = titulo; $('mM').textContent = texto;
    const d = $('dlgMsg');
    $('mOk').onclick = () => { d.close(); res(true); };
    $('mNao').onclick = () => { d.close(); res(false); };
    d.showModal();
  });
}

// ---------- sessão ----------
async function entrar() {
  const email = $('loginEmail').value.trim().toLowerCase();
  if (!email.includes('@')) { $('loginMsg').textContent = 'Digite um e-mail válido.'; return; }
  $('btnLink').disabled = true; $('loginMsg').textContent = 'Enviando...';
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  $('btnLink').disabled = false;
  $('loginMsg').textContent = error ? 'Não foi possível enviar o link agora. Tente em instantes.' : 'Pronto! Abra o link que chegou no seu e-mail neste aparelho.';
}
async function verificar() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { mostrar('login'); return; }
  const { data, error } = await sb.rpc('is_admin');
  if (error || !data) { mostrar('semAcesso'); return; }
  mostrar('app');
  await carregarTudo();
  renderTabs(); render();
}
function mostrar(qual) { ['login', 'semAcesso', 'app'].forEach(x => ($(x).hidden = x !== qual)); }

// ---------- dados ----------
async function carregarTudo() {
  const [p, ped, d, l, c, cfg] = await Promise.all([
    sb.from('produtos').select('*').order('created_at', { ascending: false }),
    sb.from('pedidos').select('*').order('created_at', { ascending: false }).limit(1000),
    sb.from('despesas').select('*').order('data', { ascending: false }),
    sb.from('looks').select('*').order('created_at', { ascending: false }),
    sb.from('cupons').select('*').order('created_at', { ascending: false }),
    sb.from('configuracoes').select('chave,valor').in('chave', ['site', 'pix']),
  ]);
  for (const r of [p, ped, d, l, c]) if (r.error) toast('Erro ao carregar: ' + r.error.message);
  D = { produtos: p.data || [], pedidos: ped.data || [], despesas: d.data || [], looks: l.data || [], cupons: c.data || [] };
  const s = (cfg.data || []).find(x => x.chave === 'site'), px = (cfg.data || []).find(x => x.chave === 'pix');
  site = { ...DEFAULTS, ...((s && s.valor) || {}) };
  pix = { ...pix, ...((px && px.valor) || {}) };
}
const clientes = () => {
  const m = {};
  D.pedidos.forEach(o => {
    if (o.status === 'Cancelado') return;
    const k = soDig(o.whatsapp) || o.cliente_nome;
    if (!k) return;
    const c = m[k] || (m[k] = { nome: o.cliente_nome, wa: o.whatsapp, n: 0, total: 0, ult: '' });
    c.n++; c.total += Number(o.total) || 0; if ((o.created_at || '') > c.ult) c.ult = o.created_at || '';
  });
  return Object.values(m).sort((a, b) => b.total - a.total);
};

// ---------- abas ----------
function renderTabs() {
  $('tabs').innerHTML = TABS.map(([k, t]) => `<button role="tab" data-tab="${k}" aria-selected="${tab === k}">${t}</button>`).join('');
}
function render() {
  renderTabs();
  const f = { resumo, estoque, pedidos, clientes, financeiro, looks, cupons, conteudo }[tab];
  $('view').innerHTML = f();
  if (tab === 'conteudo') { /* campos já montados em conteudo() */ }
}

// ---------- Resumo ----------
function resumo() {
  const mes = hoje().slice(0, 7);
  const ped = D.pedidos.filter(o => o.status !== 'Cancelado' && (o.created_at || '').slice(0, 7) === mes);
  const vendas = ped.filter(o => o.status !== 'Novo').reduce((s, o) => s + Number(o.total), 0);
  const pecas = D.produtos.reduce((s, p) => s + p.qtd, 0);
  const abertos = D.pedidos.filter(o => o.status === 'Novo' || o.status === 'Pago').length;
  const baixos = D.produtos.filter(p => p.qtd <= p.min_alerta);
  return `<div class="stats">
    <div class="stat"><b>${brl(vendas)}</b><span>Vendas do mês</span></div>
    <div class="stat"><b>${pecas}</b><span>Peças em estoque</span></div>
    <div class="stat"><b>${abertos}</b><span>Pedidos para cobrar ou enviar</span></div>
    <div class="stat"><b>${D.produtos.length}</b><span>Peças cadastradas</span></div></div>
    <div class="card"><h3>Repor estoque</h3>${baixos.length ? baixos.map(p => `<div class="linha"><span>${esc(p.nome)} ${p.tamanhos.length ? '(' + esc(p.tamanhos.join(', ')) + ')' : ''}</span><span class="${p.qtd ? 'warn' : 'bad'}">${p.qtd ? p.qtd + ' restante(s)' : 'esgotado'}</span></div>`).join('') : '<p class="meta">Nenhuma peça com estoque baixo.</p>'}</div>
    <div class="card"><h3>Backup</h3><p class="meta">Baixe produtos, pedidos, clientes e despesas em planilhas. Guarde em um lugar seguro: as planilhas têm dados pessoais.</p><div class="acoes"><button class="btn" data-a="backup">Baixar planilhas</button></div></div>`;
}

// ---------- Estoque ----------
function estoque() {
  const q = buscaEst.toLowerCase();
  const l = D.produtos.filter(p => !q || (p.nome + ' ' + p.categoria).toLowerCase().includes(q));
  return `<div class="acoes" style="margin-bottom:12px"><input class="campo" id="busca" placeholder="Buscar peça ou categoria" value="${esc(buscaEst)}" style="flex:1"><button class="btn" data-a="novaPeca">+ Peça</button></div>
  ${l.length ? l.map(p => {
    const mg = p.preco ? Math.round((p.preco - p.custo) / p.preco * 100) : 0;
    const st = p.qtd === 0 ? '<span class="pill bad">Esgotado</span>' : p.qtd <= p.min_alerta ? '<span class="pill warn">Estoque baixo</span>' : '<span class="pill ok">Em estoque</span>';
    return `<div class="card"><div style="display:flex;justify-content:space-between;gap:10px">
      <div>${p.foto_principal ? `<img class="thumb" src="${esc(p.foto_principal)}" alt="">` : ''}<h3>${esc(p.nome)}</h3>
      <div class="meta">${esc(p.categoria)} · ${esc((p.tamanhos || []).join(', '))} · ${esc(p.cor || '')}${p.no_site ? '' : ' · oculta no site'}</div>
      <div class="meta">Custo ${brl(p.custo)} · <span style="color:var(--gold)">${brl(p.preco)}</span> · margem ${mg}%</div></div>${st}</div>
      <div class="acoes"><button class="link" data-a="menos" data-id="${p.id}">−</button><b>${p.qtd}</b><button class="link" data-a="mais" data-id="${p.id}">+</button><span style="flex:1"></span><button class="link" data-a="editPeca" data-id="${p.id}">Editar</button><button class="link" data-a="delPeca" data-id="${p.id}">Excluir</button></div></div>`;
  }).join('') : '<div class="meta" style="text-align:center;padding:30px">Nenhuma peça cadastrada. Toque em + Peça para começar.</div>'}`;
}
function abrirPeca(id) {
  editProd = id || null;
  const p = id ? D.produtos.find(x => x.id === id) : { nome: '', categoria: '', cor: '', tamanhos: [], qtd: 1, min_alerta: 1, custo: '', preco: '', preco_de: '', descricao: '', composicao: '', medidas: '', colecoes: [], novo: false, no_site: true };
  $('tProd').textContent = id ? 'Editar peça' : 'Nova peça';
  $('pNome').value = p.nome; $('pCat').value = p.categoria; $('pCor').value = p.cor || ''; $('pTam').value = (p.tamanhos || []).join(', ');
  $('pQtd').value = p.qtd; $('pMin').value = p.min_alerta; $('pCusto').value = p.custo ?? ''; $('pPreco').value = p.preco ?? ''; $('pDe').value = p.preco_de || '';
  $('pCol').value = (p.colecoes || []).join(', '); $('pDesc').value = p.descricao || ''; $('pComp').value = p.composicao || ''; $('pMed').value = p.medidas || '';
  $('pNovo').checked = !!p.novo; $('pSite').checked = p.no_site !== false; $('pFoto').value = ''; $('pFotos').value = ''; $('pMsg').textContent = '';
  $('listaCats').innerHTML = [...new Set(D.produtos.map(x => x.categoria).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join('');
  $('dlgProd').showModal();
}
async function salvarPeca() {
  const nome = $('pNome').value.trim(); if (!nome) { $('pNome').focus(); return; }
  const row = {
    nome, categoria: $('pCat').value.trim() || 'Peças', cor: $('pCor').value.trim() || null,
    tamanhos: $('pTam').value.split(',').map(x => x.trim()).filter(Boolean),
    qtd: Math.max(0, parseInt($('pQtd').value) || 0), min_alerta: Math.max(0, parseInt($('pMin').value) || 0),
    custo: Math.max(0, parseFloat($('pCusto').value) || 0), preco: Math.max(0, parseFloat($('pPreco').value) || 0),
    preco_de: parseFloat($('pDe').value) || null, descricao: $('pDesc').value.trim() || null,
    composicao: $('pComp').value.trim() || null, medidas: $('pMed').value.trim() || null,
    colecoes: $('pCol').value.split(',').map(x => x.trim()).filter(Boolean),
    novo: $('pNovo').checked, no_site: $('pSite').checked,
  };
  try {
    $('pMsg').textContent = 'Salvando...';
    const atual = editProd ? D.produtos.find(x => x.id === editProd) : null;
    const f = $('pFoto').files[0];
    if (f) { $('pMsg').textContent = 'Enviando foto...'; row.foto_principal = await enviarFoto(f, 'produtos'); }
    else row.foto_principal = atual ? atual.foto_principal : null;
    const extras = [...$('pFotos').files].slice(0, 4);
    if (extras.length) { $('pMsg').textContent = 'Enviando fotos...'; row.fotos = []; for (const x of extras) row.fotos.push(await enviarFoto(x, 'produtos')); }
    else row.fotos = atual ? atual.fotos : [];
    const r = editProd ? await sb.from('produtos').update(row).eq('id', editProd) : await sb.from('produtos').insert(row);
    if (r.error) throw r.error;
    $('dlgProd').close(); toast('Peça salva.'); await carregarTudo(); render();
  } catch (e) { $('pMsg').textContent = 'Não foi possível salvar: ' + (e.message || e); }
}
async function ajustarQtd(id, d) {
  const p = D.produtos.find(x => x.id === id); if (!p) return;
  const { error } = await sb.from('produtos').update({ qtd: Math.max(0, p.qtd + d) }).eq('id', id);
  if (error) toast('Erro: ' + error.message); await carregarTudo(); render();
}
async function excluirPeca(id) {
  const p = D.produtos.find(x => x.id === id);
  if (!await confirmar('Excluir peça?', `"${p.nome}" sai do estoque e da loja. Pedidos antigos continuam guardados.`)) return;
  const { error } = await sb.from('produtos').delete().eq('id', id);
  if (error) toast('Erro: ' + error.message); else toast('Peça excluída.');
  await carregarTudo(); render();
}

// ---------- Pedidos ----------
function pedidos() {
  const l = D.pedidos.slice(0, 200);
  return `<div class="acoes" style="margin-bottom:12px"><span class="meta">Pedidos feitos pelo site aparecem aqui automaticamente.</span></div>
  ${l.length ? l.map(o => {
    const cor = o.status === 'Cancelado' ? 'bad' : o.status === 'Entregue' ? 'ok' : 'warn';
    const prox = STATUS[STATUS.indexOf(o.status) + 1];
    return `<div class="card"><div style="display:flex;justify-content:space-between;gap:10px">
      <div><h3>Nº ${o.numero} · ${esc(o.cliente_nome)}</h3>
      <div class="meta">${dtBr(o.created_at)} · ${esc(o.pagamento)} · ${waFormat(o.whatsapp)}${o.uf ? ' · ' + esc(o.uf) : ''}${o.cupom ? ' · cupom ' + esc(o.cupom) : ''}</div></div>
      <span class="pill ${cor}">${esc(o.status)}</span></div>
      <div class="meta" style="margin-top:6px">${(o.itens || []).map(i => `${i.qtd}× ${esc(i.nome)}${i.tamanho ? ' (' + esc(i.tamanho) + ')' : ''}`).join(', ')}</div>
      <div class="meta">${o.desconto > 0 ? `Desconto ${brl(o.desconto)} · ` : ''}${o.frete > 0 ? `Frete ${brl(o.frete)} · ` : ''}Peças ${brl(o.total)}</div>
      ${o.rastreio ? `<div class="meta">Rastreio: ${esc(o.rastreio)}</div>` : ''}
      <div class="acoes">
        <span class="price" style="color:var(--gold)">${brl(Number(o.total) + Number(o.frete || 0))}</span><span style="flex:1"></span>
        ${o.status === 'Novo' ? `<button class="link" data-a="cobrar" data-id="${o.id}">Cobrar</button>` : ''}
        ${prox && o.status !== 'Cancelado' ? `<button class="btn" data-a="avancar" data-id="${o.id}">Marcar como ${prox.toLowerCase()}</button>` : ''}
        ${o.status !== 'Cancelado' && o.status !== 'Entregue' ? `<button class="link" data-a="cancelar" data-id="${o.id}">Cancelar</button>` : ''}
        ${o.whatsapp ? `<a class="link" target="_blank" rel="noopener" href="${waLink(o.whatsapp, '')}">WhatsApp</a>` : ''}
      </div></div>`;
  }).join('') : '<div class="meta" style="text-align:center;padding:30px">Nenhum pedido ainda.</div>'}`;
}
async function avancar(id) {
  const o = D.pedidos.find(x => x.id === id); const ns = STATUS[STATUS.indexOf(o.status) + 1]; if (!ns) return;
  const patch = { status: ns };
  if (ns === 'Enviado') {
    const r = prompt('Código de rastreio (deixe em branco se não tiver)'); if (r && r.trim()) patch.rastreio = r.trim();
  }
  const { error } = await sb.from('pedidos').update(patch).eq('id', id);
  if (error) toast('Erro: ' + error.message); await carregarTudo(); render();
}
async function cancelar(id) {
  if (!await confirmar('Cancelar pedido?', 'As peças voltam para o estoque.')) return;
  const { error } = await sb.rpc('cancelar_pedido', { p_id: id });
  if (error) toast('Erro: ' + error.message); else toast('Pedido cancelado e estoque devolvido.');
  await carregarTudo(); render();
}
function abrirCobrar(id) {
  cobId = id; const o = D.pedidos.find(x => x.id === id); if (!o) return;
  $('cFrete').value = o.frete || 0; $('cLink').value = o.link_pagamento || '';
  $('cobRes').textContent = `${o.cliente_nome} · peças ${brl(o.total)}`;
  renderCobrar(); $('dlgCobrar').showModal();
}
function renderCobrar() {
  const o = D.pedidos.find(x => x.id === cobId); if (!o) return;
  const frete = Math.max(0, parseFloat($('cFrete').value) || 0), tot = Number(o.total) + frete;
  const temPix = pix.chave && pix.nome && pix.cidade;
  const code = temPix ? pixPayload(pix, tot) : '';
  $('cTotal').value = brl(tot);
  $('cPix').innerHTML = temPix
    ? `<div class="meta" style="margin-top:10px">Pix copia e cola</div><textarea class="campo" readonly style="min-height:70px">${esc(code)}</textarea><div class="qr">${qrSvg(code)}</div>`
    : '<div class="meta warn" style="margin-top:10px">Cadastre sua chave Pix na aba Conteúdo para gerar o QR code.</div>';
  const link = $('cLink').value.trim();
  const msg = `Olá, ${o.cliente_nome || 'tudo bem'}! Seu pedido nº ${o.numero} no Closet Ana Lu:\n` +
    (o.itens || []).map(i => `• ${i.qtd}x ${i.nome}${i.tamanho ? ' (tam. ' + i.tamanho + ')' : ''} - ${brl(i.preco * i.qtd)}`).join('\n') +
    `\nPeças: ${brl(o.total)}${o.desconto > 0 ? `\nDesconto: -${brl(o.desconto)}` : ''}\nFrete: ${brl(frete)}\nTotal: ${brl(tot)}` +
    (temPix ? `\n\nPague por Pix (copia e cola):\n${code}` : '') +
    (link ? `\n\nOu pague no cartão por este link:\n${link}` : '') +
    '\n\nAssim que o pagamento for confirmado, separamos e enviamos o seu pedido.';
  $('cMsg').value = msg;
  $('cEnviar').href = waLink(waNumero(o.whatsapp), msg);
}
async function salvarCobranca() {
  const frete = Math.max(0, parseFloat($('cFrete').value) || 0), link = $('cLink').value.trim() || null;
  const { error } = await sb.from('pedidos').update({ frete, link_pagamento: link }).eq('id', cobId);
  if (error) toast('Erro ao salvar frete: ' + error.message);
  await carregarTudo();
}

// ---------- Clientes ----------
function clientesTab() {
  const base = clientes().filter(c => {
    const dias = Math.floor((Date.now() - new Date(c.ult)) / 864e5);
    if (campAud === 'inativos') return dias >= 30;
    if (campAud === 'recorrentes') return c.n >= 2;
    return true;
  });
  const todas = clientes();
  return `<div class="card"><h3>Enviar novidade</h3><div class="meta">O WhatsApp envia uma mensagem por vez: toque em Enviar em cada cliente.</div>
    <label class="c">Quem recebe<select class="campo" id="campAud">
      <option value="todas" ${campAud === 'todas' ? 'selected' : ''}>Todas as clientes</option>
      <option value="inativos" ${campAud === 'inativos' ? 'selected' : ''}>Sem comprar há 30 dias ou mais</option>
      <option value="recorrentes" ${campAud === 'recorrentes' ? 'selected' : ''}>Compraram 2 vezes ou mais</option></select></label>
    <label class="c">Mensagem (use {nome} e {link})<textarea class="campo" id="campMsg" style="min-height:90px">${esc(campMsg)}</textarea></label>
    <div class="meta" style="margin-top:6px">${base.length} cliente(s) nesta lista</div>
    ${base.map(c => `<div class="linha"><span>${esc(c.nome || 'Cliente')}</span><a class="link" data-cwa="1" data-nome="${esc(c.nome || '')}" data-wa="${esc(c.wa || '')}" target="_blank" rel="noopener" href="${campHref(c.nome, c.wa)}">Enviar</a></div>`).join('')}
  </div>
  <div class="card"><h3>Clientes</h3><div class="meta">${todas.length} cliente(s) com pedido</div></div>
  ${todas.map(c => {
    const dias = Math.floor((Date.now() - new Date(c.ult)) / 864e5);
    return `<div class="card"><div style="display:flex;justify-content:space-between;gap:10px"><div><h3>${esc(c.nome || 'Cliente')}</h3><div class="meta">${c.n} pedido(s) · última compra há ${dias} dia(s) · ${waFormat(c.wa)}</div></div><span class="price" style="color:var(--gold)">${brl(c.total)}</span></div>
      <div class="acoes">${c.wa ? `<a class="link" target="_blank" rel="noopener" href="${waLink(waNumero(c.wa), '')}">Chamar no WhatsApp</a>` : ''}<span style="flex:1"></span><button class="link" data-a="excluirCli" data-wa="${esc(c.wa || '')}">Excluir dados (LGPD)</button></div></div>`;
  }).join('') || '<div class="meta" style="text-align:center;padding:30px">Os clientes aparecem aqui quando fizerem o primeiro pedido.</div>'}`;
}
function campHref(nome, wa) {
  const d = waNumero(wa), pn = (nome || '').trim().split(/\s+/)[0] || 'tudo bem';
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(campMsg.replace(/\{nome\}/g, pn).replace(/\{link\}/g, site.linkLoja || linkLoja()))}` : '#';
}
function linkLoja() { return location.origin + location.pathname.replace(/admin\.html$/, 'index.html'); }
async function excluirCli(wa) {
  if (!await confirmar('Excluir dados desta cliente?', 'Nome e WhatsApp saem dos pedidos e da lista de clientes. Os pedidos continuam para o controle financeiro. Não dá para desfazer.')) return;
  const { data, error } = await sb.rpc('excluir_dados_cliente', { p_whatsapp: wa });
  if (error) toast('Erro: ' + error.message); else toast(`Dados removidos de ${data} pedido(s).`);
  await carregarTudo(); render();
}

// ---------- Financeiro ----------
function financeiro() {
  const ped = D.pedidos.filter(o => o.status !== 'Cancelado' && (o.created_at || '').slice(0, 7) === mesFin);
  const rec = ped.filter(o => o.status !== 'Novo');
  const receita = rec.reduce((s, o) => s + Number(o.total), 0);
  const cmv = rec.reduce((s, o) => s + (o.itens || []).reduce((a, i) => a + (Number(i.custo) || 0) * i.qtd, 0), 0);
  const aReceber = ped.filter(o => o.status === 'Novo').reduce((s, o) => s + Number(o.total) + Number(o.frete || 0), 0);
  const desp = D.despesas.filter(d => (d.data || '').slice(0, 7) === mesFin);
  const est = desp.filter(d => d.categoria === 'Compra de estoque').reduce((s, d) => s + Number(d.valor), 0);
  const op = desp.filter(d => d.categoria !== 'Compra de estoque').reduce((s, d) => s + Number(d.valor), 0);
  const bruto = receita - cmv, liq = bruto - op, caixa = receita - op - est;
  const pg = {}; rec.forEach(o => { pg[o.pagamento] = (pg[o.pagamento] || 0) + Number(o.total); });
  const linha = (a, b, t) => `<div class="linha ${t ? 't' : ''}"><span>${a}</span><span>${b}</span></div>`;
  return `<div class="acoes" style="margin-bottom:12px"><input type="month" class="campo" id="mesFin" value="${mesFin}" style="max-width:200px"></div>
  <div class="stats"><div class="stat"><b>${brl(receita)}</b><span>Receita (pedidos pagos ou enviados)</span></div><div class="stat"><b>${brl(liq)}</b><span>Lucro líquido</span></div>
  <div class="stat"><b>${brl(caixa)}</b><span>Saldo de caixa</span></div><div class="stat"><b>${brl(aReceber)}</b><span>A receber (pedidos novos)</span></div></div>
  <div class="card"><h3>Resultado do mês</h3>${linha('Receita', brl(receita))}${linha('Custo das peças vendidas', '− ' + brl(cmv))}${linha('Lucro bruto', brl(bruto), 1)}${linha('Despesas', '− ' + brl(op))}${linha('Lucro líquido', brl(liq), 1)}
  <div class="meta" style="margin-top:8px">${rec.length} pedido(s) · ticket médio ${brl(rec.length ? receita / rec.length : 0)}</div></div>
  <div class="card"><h3>Caixa</h3>${linha('Entradas', brl(receita))}${linha('Despesas', '− ' + brl(op))}${linha('Compras de estoque', '− ' + brl(est))}${linha('Saldo', brl(caixa), 1)}
  <div class="meta" style="margin-top:8px">Compra de estoque sai do caixa, mas só vira custo quando a peça é vendida.</div></div>
  <div class="card"><h3>Por forma de pagamento</h3>${Object.keys(pg).map(k => linha(esc(k), brl(pg[k]))).join('') || '<div class="meta">Sem vendas pagas neste mês.</div>'}</div>
  <div class="acoes" style="margin-bottom:12px"><button class="btn" data-a="novaDesp" style="width:100%">+ Registrar despesa</button></div>
  ${desp.map(d => `<div class="card"><div style="display:flex;justify-content:space-between"><div><b style="font-weight:400">${esc(d.descricao || d.categoria)}</b><div class="meta">${esc(d.categoria)} · ${dtBr(d.data)}</div></div><span class="price" style="color:var(--gold)">${brl(d.valor)}</span></div><div class="acoes"><button class="link" data-a="delDesp" data-id="${d.id}">Excluir</button></div></div>`).join('') || '<div class="meta" style="text-align:center">Nenhuma despesa neste mês.</div>'}`;
}
async function salvarDesp() {
  const v = parseFloat($('dValor').value); if (!(v > 0)) { $('dValor').focus(); return; }
  const { error } = await sb.from('despesas').insert({ descricao: $('dDesc').value.trim() || null, categoria: $('dCat').value, valor: v, data: $('dData').value || hoje() });
  if (error) toast('Erro: ' + error.message); else $('dlgDesp').close();
  await carregarTudo(); render();
}

// ---------- Looks ----------
function looks() {
  return `<div class="acoes" style="margin-bottom:12px"><button class="btn" data-a="novoLook" style="width:100%">+ Look</button></div>
  <div class="meta" style="margin-bottom:10px">Looks aparecem no site na seção "Monte o look", com pelo menos 2 peças.</div>
  ${D.looks.map(l => `<div class="card"><div style="display:flex;justify-content:space-between"><div><h3>${esc(l.nome)}</h3><div class="meta">${(l.produto_ids || []).length} peça(s)</div></div></div>
    <div class="acoes"><button class="link" data-a="editLook" data-id="${l.id}">Editar</button><button class="link" data-a="delLook" data-id="${l.id}">Excluir</button></div></div>`).join('') || '<div class="meta" style="text-align:center;padding:30px">Nenhum look ainda.</div>'}`;
}
function abrirLook(id) {
  editLook = id || null; const l = id ? D.looks.find(x => x.id === id) : { nome: '', produto_ids: [] };
  $('lNome').value = l.nome;
  $('lLista').innerHTML = D.produtos.filter(p => p.no_site).map(p => `<label class="c" style="margin:6px 0;color:var(--ink)"><input type="checkbox" style="width:auto" value="${p.id}" ${(l.produto_ids || []).includes(p.id) ? 'checked' : ''}> ${esc(p.nome)}</label>`).join('') || '<div class="meta">Cadastre peças e marque "Mostrar no site" primeiro.</div>';
  $('dlgLook').showModal();
}
async function salvarLook() {
  const nome = $('lNome').value.trim(); const ids = [...document.querySelectorAll('#lLista input:checked')].map(x => x.value);
  if (!nome) { $('lNome').focus(); return; }
  if (ids.length < 2) { toast('Marque pelo menos 2 peças.'); return; }
  const r = editLook ? await sb.from('looks').update({ nome, produto_ids: ids }).eq('id', editLook) : await sb.from('looks').insert({ nome, produto_ids: ids });
  if (r.error) toast('Erro: ' + r.error.message); else $('dlgLook').close();
  await carregarTudo(); render();
}
async function excluirLook(id) {
  if (!await confirmar('Excluir este look?')) return;
  const { error } = await sb.from('looks').delete().eq('id', id); if (error) toast('Erro: ' + error.message);
  await carregarTudo(); render();
}

// ---------- Cupons ----------
function cupons() {
  return `<div class="acoes" style="margin-bottom:12px"><button class="btn" data-a="novoCupom" style="width:100%">+ Cupom</button></div>
  ${D.cupons.map(c => {
    const venc = c.validade && c.validade < hoje();
    return `<div class="card"><div style="display:flex;justify-content:space-between;gap:10px"><div><h3>${esc(c.codigo)}</h3>
    <div class="meta">${c.tipo === '%' ? c.valor + '%' : brl(c.valor)} de desconto${c.minimo > 0 ? ' · mínimo ' + brl(c.minimo) : ''}${c.validade ? ' · até ' + dtBr(c.validade) : ''}</div></div>
    <span class="pill ${!c.ativo || venc ? 'bad' : 'ok'}">${!c.ativo ? 'Desativado' : venc ? 'Vencido' : 'Ativo'}</span></div>
    <div class="acoes"><button class="link" data-a="editCupom" data-id="${c.id}">Editar</button><button class="link" data-a="delCupom" data-id="${c.id}">Excluir</button></div></div>`;
  }).join('') || '<div class="meta" style="text-align:center;padding:30px">Nenhum cupom ainda.</div>'}`;
}
function abrirCupom(id) {
  editCup = id || null; const c = id ? D.cupons.find(x => x.id === id) : { codigo: '', tipo: '%', valor: '', minimo: 0, validade: '', ativo: true };
  $('cCod').value = c.codigo; $('cTipo').value = c.tipo; $('cValor').value = c.valor; $('cMin').value = c.minimo; $('cVal').value = c.validade || ''; $('cAtivo').checked = c.ativo !== false;
  $('dlgCupom').showModal();
}
async function salvarCupom() {
  const codigo = $('cCod').value.trim().toUpperCase().replace(/\s+/g, '');
  const valor = parseFloat($('cValor').value);
  if (!codigo || !(valor > 0)) { toast('Informe o código e o valor do desconto.'); return; }
  const row = { codigo, tipo: $('cTipo').value, valor, minimo: parseFloat($('cMin').value) || 0, validade: $('cVal').value || null, ativo: $('cAtivo').checked };
  const r = editCup ? await sb.from('cupons').update(row).eq('id', editCup) : await sb.from('cupons').insert(row);
  if (r.error) toast('Erro: ' + r.error.message); else $('dlgCupom').close();
  await carregarTudo(); render();
}
async function excluirCupom(id) {
  if (!await confirmar('Excluir este cupom?')) return;
  const { error } = await sb.from('cupons').delete().eq('id', id); if (error) toast('Erro: ' + error.message);
  await carregarTudo(); render();
}

// ---------- Conteúdo (configurações do site) ----------
function conteudo() {
  const grupos = FIELDS.map(g => `<div class="card grupo"><h4>${esc(g[0])}</h4>${g[1].map(f => {
    const [k, rotulo, tipo] = f; const v = site[k] == null ? '' : site[k];
    if (tipo === 2) return `<label class="c">${esc(rotulo)}<input class="campo" type="file" accept="image/*" data-banner="1"></label>${v ? `<div class="meta">Foto atual: <a class="link" href="${esc(v)}" target="_blank" rel="noopener">ver</a> · <button class="link" data-a="rmBanner">remover</button></div>` : ''}`;
    if (tipo) return `<label class="c">${esc(rotulo)}<textarea class="campo" data-cfg="${k}" style="min-height:${tipo === 3 ? 180 : 70}px">${esc(v)}</textarea></label>`;
    return `<label class="c">${esc(rotulo)}<input class="campo" data-cfg="${k}" value="${esc(v)}"></label>`;
  }).join('')}</div>`).join('');
  return `<div class="meta" style="margin-bottom:10px">Altere os textos da loja e as políticas. Depois toque em Salvar. A loja atualiza na hora.</div>
  <div class="card"><h3>Recebimento por Pix</h3><div class="meta">Usado para gerar o copia e cola e o QR code nas cobranças. Não aparece na loja.</div>
    <label class="c">Tipo da chave<select class="campo" id="pxTipo"><option value="cpf" ${pix.tipo === 'cpf' ? 'selected' : ''}>CPF ou CNPJ</option><option value="tel" ${pix.tipo === 'tel' ? 'selected' : ''}>Celular</option><option value="email" ${pix.tipo === 'email' ? 'selected' : ''}>E-mail</option><option value="rand" ${pix.tipo === 'rand' ? 'selected' : ''}>Chave aleatória</option></select></label>
    <label class="c">Chave Pix<input class="campo" id="pxChave" value="${esc(pix.chave || '')}"></label>
    <label class="c">Nome do recebedor (como aparece no banco)<input class="campo" id="pxNome" maxlength="25" value="${esc(pix.nome || '')}"></label>
    <label class="c">Cidade<input class="campo" id="pxCidade" maxlength="15" value="${esc(pix.cidade || '')}"></label>
    <div class="acoes"><button class="btn ghost" data-a="salvarPix">Salvar Pix</button></div></div>
  ${grupos}
  <div class="acoes" style="position:sticky;bottom:0;background:var(--bg);padding:12px 0"><button class="btn" data-a="salvarSite" style="width:100%">Salvar alterações</button></div>`;
}
async function salvarSite() {
  const novo = { ...site };
  document.querySelectorAll('[data-cfg]').forEach(el => { novo[el.dataset.cfg] = el.value.trim(); });
  novo.wa = soDig(novo.wa);
  novo.ig = String(novo.ig || '').replace(/^.*instagram\.com\//, '').replace(/[@\/?].*$/, '');
  const file = document.querySelector('[data-banner]')?.files[0];
  try {
    if (file) { toast('Enviando foto do banner...'); novo.bannerImg = await enviarFoto(file, 'site', 1800); }
    const { error } = await sb.from('configuracoes').upsert({ chave: 'site', valor: novo, publico: true, updated_at: new Date().toISOString() });
    if (error) throw error;
    toast('Conteúdo salvo. A loja já mostra as mudanças.');
    await carregarTudo(); render();
  } catch (e) { toast('Não foi possível salvar: ' + (e.message || e)); }
}
async function salvarPix() {
  const p = { tipo: $('pxTipo').value, chave: $('pxChave').value.trim(), nome: $('pxNome').value.trim(), cidade: $('pxCidade').value.trim() };
  if (!p.chave || !p.nome || !p.cidade) { toast('Preencha a chave, o nome e a cidade.'); return; }
  const { error } = await sb.from('configuracoes').upsert({ chave: 'pix', valor: p, publico: false, updated_at: new Date().toISOString() });
  if (error) toast('Erro: ' + error.message); else toast('Pix salvo.');
  await carregarTudo();
}
async function removerBanner() {
  if (!await confirmar('Remover a foto do banner?')) return;
  const novo = { ...site, bannerImg: '' };
  await sb.from('configuracoes').upsert({ chave: 'site', valor: novo, publico: true, updated_at: new Date().toISOString() });
  await carregarTudo(); render();
}

// ---------- Backup ----------
function backup() {
  const hj = hoje();
  const cab = (a) => a;
  const prod = csvTexto(['Nome', 'Categoria', 'Tamanhos', 'Cor', 'Quantidade', 'Custo', 'Preço', 'Preço antigo', 'Coleções', 'No site'],
    D.produtos.map(p => [p.nome, p.categoria, (p.tamanhos || []).join(','), p.cor, p.qtd, num(p.custo), num(p.preco), p.preco_de ? num(p.preco_de) : '', (p.colecoes || []).join(','), p.no_site ? 'sim' : 'não']));
  const ped = csvTexto(['Nº', 'Data', 'Cliente', 'WhatsApp', 'Pagamento', 'Status', 'Itens', 'Desconto', 'Frete', 'Total', 'Rastreio'],
    D.pedidos.map(o => [o.numero, dtBr(o.created_at), o.cliente_nome, o.whatsapp, o.pagamento, o.status, (o.itens || []).map(i => i.qtd + 'x ' + i.nome).join(', '), num(o.desconto), num(o.frete), num(o.total), o.rastreio || '']));
  const cli = csvTexto(['Nome', 'WhatsApp', 'Pedidos', 'Total gasto', 'Última compra'],
    clientes().map(c => [c.nome, c.wa, c.n, num(c.total), dtBr(c.ult)]));
  const desp = csvTexto(['Data', 'Descrição', 'Categoria', 'Valor'], D.despesas.map(d => [dtBr(d.data), d.descricao, d.categoria, num(d.valor)]));
  baixarArquivo(`closet-produtos-${hj}.csv`, prod);
  setTimeout(() => baixarArquivo(`closet-pedidos-${hj}.csv`, ped), 400);
  setTimeout(() => baixarArquivo(`closet-clientes-${hj}.csv`, cli), 800);
  setTimeout(() => baixarArquivo(`closet-despesas-${hj}.csv`, desp), 1200);
  toast('Baixando 4 planilhas.');
}

// ---------- eventos ----------
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-tab],[data-a],[data-cwa]');
  if (!t) return;
  if (t.dataset.tab) { tab = t.dataset.tab; render(); return; }
  if (t.dataset.cwa) return;
  const a = t.dataset.a, id = t.dataset.id;
  if (a === 'backup') backup();
  else if (a === 'novaPeca') abrirPeca();
  else if (a === 'editPeca') abrirPeca(id);
  else if (a === 'delPeca') excluirPeca(id);
  else if (a === 'mais') ajustarQtd(id, 1);
  else if (a === 'menos') ajustarQtd(id, -1);
  else if (a === 'cobrar') abrirCobrar(id);
  else if (a === 'avancar') avancar(id);
  else if (a === 'cancelar') cancelar(id);
  else if (a === 'excluirCli') excluirCli(t.dataset.wa);
  else if (a === 'novaDesp') { $('dData').value = hoje(); $('dValor').value = ''; $('dDesc').value = ''; $('dlgDesp').showModal(); }
  else if (a === 'delDesp') { if (await confirmar('Excluir esta despesa?')) { await sb.from('despesas').delete().eq('id', id); await carregarTudo(); render(); } }
  else if (a === 'novoLook') abrirLook();
  else if (a === 'editLook') abrirLook(id);
  else if (a === 'delLook') excluirLook(id);
  else if (a === 'novoCupom') abrirCupom();
  else if (a === 'editCupom') abrirCupom(id);
  else if (a === 'delCupom') excluirCupom(id);
  else if (a === 'salvarSite') salvarSite();
  else if (a === 'salvarPix') salvarPix();
  else if (a === 'rmBanner') removerBanner();
});
document.addEventListener('input', e => {
  if (e.target.id === 'busca') { buscaEst = e.target.value; const p = e.target.selectionStart; $('view').innerHTML = estoque(); const b = $('busca'); b.focus(); b.setSelectionRange(p, p); }
  if (e.target.id === 'campMsg') { campMsg = e.target.value; document.querySelectorAll('a[data-cwa]').forEach(a => (a.href = campHref(a.dataset.nome, a.dataset.wa))); }
  if (e.target.id === 'cFrete' || e.target.id === 'cLink') renderCobrar();
});
document.addEventListener('change', e => {
  if (e.target.id === 'campAud') { campAud = e.target.value; render(); }
  if (e.target.id === 'mesFin') { mesFin = e.target.value || mesFin; render(); }
});
$('btnLink').onclick = entrar;
$('loginEmail').onkeydown = e => { if (e.key === 'Enter') entrar(); };
$('btnSair').onclick = $('btnSair2').onclick = async () => { await sb.auth.signOut(); location.href = 'admin.html'; };
$('pSalvar').onclick = salvarPeca; $('pCancel').onclick = () => $('dlgProd').close();
$('dSalvar').onclick = salvarDesp; $('dCancel').onclick = () => $('dlgDesp').close();
$('lSalvar').onclick = salvarLook; $('lCancel').onclick = () => $('dlgLook').close();
$('cSalvar').onclick = salvarCupom; $('cCancel').onclick = () => $('dlgCupom').close();
$('cCopiar').onclick = async () => { try { await navigator.clipboard.writeText($('cMsg').value); toast('Mensagem copiada.'); } catch (e) { $('cMsg').select(); toast('Selecione o texto e copie.'); } };
$('cFechar').onclick = async () => { $('dlgCobrar').close(); await carregarTudo(); render(); };
$('cEnviar').addEventListener('click', () => salvarCobranca());
$('lkX').onclick = () => $('dlgLink').close();
$('mNao').onclick = () => $('dlgMsg').close();
$('dlgProd').addEventListener('close', () => {});

sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT' || ev === 'INITIAL_SESSION') verificar(); });
verificar();
