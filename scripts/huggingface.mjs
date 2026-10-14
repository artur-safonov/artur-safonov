// Builds assets/huggingface.svg from public Hugging Face API data.
// Run: node scripts/huggingface.mjs   (Node 18+, no dependencies)
import { writeFileSync, mkdirSync } from 'node:fs';

const AUTHOR = 'BattleGhost';
const root = new URL('..', import.meta.url);
const api = p => fetch('https://huggingface.co/api/' + p, { headers: { 'User-Agent': 'artur-safonov-profile' } }).then(r => { if (!r.ok) throw new Error(p + ' -> ' + r.status); return r.json(); });

const list = await api('models?author=' + AUTHOR + '&limit=100');
const models = [];
for (const m of list.filter(m => !m.private)) {
  const x = await api('models/' + m.id + '?expand[]=downloads&expand[]=downloadsAllTime&expand[]=likes&expand[]=pipeline_tag&expand[]=library_name&expand[]=tags&expand[]=lastModified');
  models.push({ id: m.id, name: m.id.split('/')[1], downloads: x.downloads || 0, allTime: x.downloadsAllTime ?? x.downloads ?? 0, likes: x.likes || 0, pipeline: x.pipeline_tag || '', library: x.library_name || '', tags: x.tags || [], updated: (x.lastModified || '').slice(0, 10) });
}
models.sort((a, b) => b.allTime - a.allTime);
const totals = models.reduce((t, m) => ({ allTime: t.allTime + m.allTime, month: t.month + m.downloads, likes: t.likes + m.likes }), { allTime: 0, month: 0, likes: 0 });
const today = new Date().toISOString().slice(0, 10);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = n => n.toLocaleString('en-US');
const SANS = "'Segoe UI', Inter, system-ui, -apple-system, Helvetica, Arial, sans-serif";
const MONO = "'JetBrains Mono', 'Cascadia Code', Consolas, Menlo, monospace";
const QUANT = /^(iq\d|q\d|bf16|f16|fp16|fp8|q8)/i;

const W = 1200, rowH = 96, top = 214, H = top + models.length * rowH + 28;
const max = Math.max(1, ...models.map(m => m.allTime));
const tiles = [['Downloads, all time', totals.allTime, '#ffd21e'], ['Last 30 days', totals.month, '#2ac3de'], ['Likes', totals.likes, '#f7768e'], ['Public models', models.length, '#bb9af7']];
const tg = 16, tw = (W - 80 - 3 * tg) / 4;
let s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Hugging Face models by ' + AUTHOR + '"><title>Hugging Face models by ' + AUTHOR + '</title>' +
  '<defs><linearGradient id="hfbar" x1="0" x2="1"><stop offset="0" stop-color="#ff9d00"/><stop offset="1" stop-color="#ffd21e"/></linearGradient></defs><style>' +
  '.h{font:700 18px ' + SANS + ';fill:#c0caf5}.hs{font:500 13px ' + MONO + ';fill:#565f89}.lbl{font:600 12px ' + SANS + ';fill:#787c99;letter-spacing:1px}.big{font:800 32px ' + SANS + '}' +
  '.n{font:700 16px ' + SANS + ';fill:#c0caf5}.t{font:600 11px ' + MONO + ';fill:#a9b1d6}.m{font:600 12px ' + MONO + ';fill:#787c99}.v{font:700 14px ' + MONO + ';fill:#ffd21e}</style>' +
  '<rect x=".5" y=".5" width="' + (W - 1) + '" height="' + (H - 1) + '" rx="22" fill="#0d1122" stroke="#232a4d"/>' +
  '<text x="40" y="52" class="h">🤗  Models on Hugging Face</text><text x="' + (W - 40) + '" y="52" class="hs" text-anchor="end">huggingface.co/' + AUTHOR + ' · updated ' + today + '</text>';
tiles.forEach(([l, v, c], i) => {
  const x = 40 + i * (tw + tg);
  s += '<g transform="translate(' + x + ',78)"><rect width="' + tw + '" height="96" rx="14" fill="#161b30" stroke="#232a4d"/><rect width="4" height="40" y="18" rx="2" fill="' + c + '"/>' +
    '<text x="20" y="34" class="lbl">' + esc(l.toUpperCase()) + '</text><text x="20" y="74" class="big" fill="' + c + '">' + fmt(v) + '</text></g>';
});
models.forEach((m, i) => {
  const y = top + i * rowH;
  const chips = [m.library, ...m.tags.filter(t => QUANT.test(t)).map(t => t.toUpperCase()), m.pipeline].filter(Boolean).slice(0, 4);
  let cx = 60;
  const chipEls = chips.map(c => { const w = c.length * 7.4 + 18; const e = '<g transform="translate(' + cx + ',' + (y + 40) + ')"><rect width="' + w + '" height="22" rx="11" fill="#1a1f3a" stroke="#2f3a66"/><text x="' + w / 2 + '" y="15" class="t" text-anchor="middle">' + esc(c) + '</text></g>'; cx += w + 8; return e; }).join('');
  const bw = 330 * m.allTime / max;
  s += '<g><rect x="40" y="' + y + '" width="' + (W - 80) + '" height="' + (rowH - 14) + '" rx="14" fill="#11162b" stroke="#1e2440"/>' +
    '<text x="60" y="' + (y + 28) + '" class="n">' + esc(m.name) + '</text>' + chipEls +
    '<text x="' + (W - 400) + '" y="' + (y + 28) + '" class="m">DOWNLOADS</text><rect x="' + (W - 400) + '" y="' + (y + 42) + '" width="330" height="8" rx="4" fill="#1a1f3a"/><rect x="' + (W - 400) + '" y="' + (y + 42) + '" width="' + Math.max(6, bw).toFixed(1) + '" height="8" rx="4" fill="url(#hfbar)"/>' +
    '<text x="' + (W - 60) + '" y="' + (y + 28) + '" class="v" text-anchor="end">' + fmt(m.allTime) + '</text>' +
    '<text x="' + (W - 400) + '" y="' + (y + 70) + '" class="m">' + fmt(m.downloads) + ' last 30 days · ♥ ' + m.likes + '</text></g>';
});
s += '</svg>';

mkdirSync(new URL('assets/', root), { recursive: true });
mkdirSync(new URL('data/', root), { recursive: true });
writeFileSync(new URL('assets/huggingface.svg', root), s);
writeFileSync(new URL('data/huggingface.json', root), JSON.stringify({ updated: today, author: AUTHOR, totals, models }, null, 2) + '\n');
console.log('huggingface', today, JSON.stringify(totals), models.length + ' models');

