import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export const SUPABASE_URL = 'https://iuwqdnivrjxjgcypzofr.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_6IxFxPwgm9PoP12MiSlVfA_DH75N6is';
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, detectSessionInUrl: true } });

export const brl = v => 'R$ ' + (Number(v) || 0).toFixed(2).replace('.', ',');
export const num = v => (Number(v) || 0).toFixed(2).replace('.', ',');
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const slug = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const soDig = v => String(v || '').replace(/\D/g, '');

// WhatsApp: aceita DDD + número, ou já com 55
export function waNumero(v) {
  let d = soDig(v);
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  return d.length >= 10 && d.length <= 11 ? '55' + d : '';
}
export function waFormat(v) {
  let d = soDig(v);
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v || '';
}
export const waLink = (numero, texto) => (numero ? `https://wa.me/${numero}` : '#') + (texto && numero ? '?text=' + encodeURIComponent(texto) : '');

// Textos do site (aba Conteúdo): padrão + o que foi salvo no banco
import { DEFAULTS } from './defaults.js';
export async function carregarSite() {
  const { data } = await sb.from('configuracoes').select('valor').eq('chave', 'site').maybeSingle();
  return { ...DEFAULTS, ...((data && data.valor) || {}) };
}

// Frete por estado. Formato por linha: SP = 22,00 | 2 a 4 dias úteis   (* = demais estados)
export function freteDe(tabela, uf) {
  let padrao = null, achou = null;
  String(tabela || '').split('\n').forEach(l => {
    const m = l.match(/^\s*([^=]+)=\s*([\d.,]+)\s*(?:\|\s*(.*))?$/);
    if (!m) return;
    const ufs = m[1].split(/[\s,;]+/).filter(Boolean).map(x => x.toUpperCase());
    const v = parseFloat(m[2].replace(/\./g, '').replace(',', '.'));
    const o = { v, prazo: (m[3] || '').trim() };
    if (ufs.includes('*')) padrao = o;
    if (ufs.includes(uf)) achou = o;
  });
  return achou || padrao;
}

// Pix copia e cola (BR Code estático com valor)
const tlv = (id, v) => id + ('0' + v.length).slice(-2) + v;
const semAcento = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
function crc16(x) { let c = 0xFFFF; for (let i = 0; i < x.length; i++) { c ^= x.charCodeAt(i) << 8; for (let j = 0; j < 8; j++) { c = (c & 0x8000) ? ((c << 1) ^ 0x1021) : (c << 1); c &= 0xFFFF; } } return ('000' + c.toString(16).toUpperCase()).slice(-4); }
function chavePix(tipo, chave) {
  const c = String(chave || '').trim();
  if (tipo === 'cpf') return soDig(c);
  if (tipo === 'tel') { let d = soDig(c); if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2); return '+55' + d; }
  if (tipo === 'email') return c.toLowerCase();
  return c;
}
export function pixPayload(pix, valor) {
  const gui = tlv('00', 'br.gov.bcb.pix') + tlv('01', chavePix(pix.tipo, pix.chave));
  const p = tlv('00', '01') + tlv('01', '11') + tlv('26', gui) + tlv('52', '0000') + tlv('53', '986') +
    tlv('54', Number(valor).toFixed(2)) + tlv('58', 'BR') + tlv('59', semAcento(pix.nome).slice(0, 25) || 'LOJA') +
    tlv('60', semAcento(pix.cidade).slice(0, 15) || 'BRASIL') + tlv('62', tlv('05', '***')) + '6304';
  return p + crc16(p);
}
export function qrSvg(texto) {
  if (!window.qrcode) return '';
  const q = window.qrcode(0, 'M'); q.addData(texto); q.make();
  const n = q.getModuleCount(), z = 4; let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + z},${r + z}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n + 2 * z} ${n + 2 * z}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" role="img" aria-label="QR code Pix"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

// Fotos: reduz no navegador e envia ao Supabase Storage
export function reduzirImagem(file, max = 1000) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        const s = Math.min(1, max / im.width), c = document.createElement('canvas');
        c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        c.toBlob(b => (b ? res(b) : rej(new Error('imagem'))), 'image/jpeg', 0.86);
      };
      im.onerror = rej; im.src = r.result;
    };
    r.onerror = rej; r.readAsDataURL(file);
  });
}
export async function enviarFoto(file, pasta = 'produtos', max = 1000) {
  const blob = await reduzirImagem(file, max);
  const caminho = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await sb.storage.from('fotos').upload(caminho, blob, { contentType: 'image/jpeg', cacheControl: '3600' });
  if (error) throw error;
  return sb.storage.from('fotos').getPublicUrl(caminho).data.publicUrl;
}

// Planilhas (CSV com ponto e vírgula, abre direto no Excel)
export function csvLinha(a) { return a.map(v => { const s = v == null ? '' : String(v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';'); }
export function csvTexto(cab, linhas) { return '\ufeff' + [csvLinha(cab)].concat(linhas.map(csvLinha)).join('\r\n'); }
export function baixarArquivo(nome, texto, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
