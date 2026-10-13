// Generates profile SVGs from data/stats.json.
// Refresh data with: node scripts/generate.mjs --fetch  (requires an authenticated gh CLI)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url);
const dataPath = new URL('data/stats.json', root);
let data = JSON.parse(readFileSync(dataPath, 'utf8'));

const gql = (query) => JSON.parse(execFileSync('gh', ['api', 'graphql', '-f', 'query=' + query], { encoding: 'utf8', maxBuffer: 64 << 20 })).data.viewer;

if (process.argv.includes('--fetch')) {
  const me = gql('query{viewer{id createdAt pullRequests{totalCount} issues{totalCount} contributionsCollection{contributionYears}}}');
  const yearsQ = me.contributionsCollection.contributionYears.map(y => 'y' + y + ':contributionsCollection(from:"' + y + '-01-01T00:00:00Z",to:"' + y + '-12-31T23:59:59Z"){contributionCalendar{totalContributions}}').join(' ');
  const yrs = gql('query{viewer{' + yearsQ + '}}');
  const hist = 'defaultBranchRef{target{... on Commit{history(author:{id:"' + me.id + '"}){totalCount}}}}';
  const r = gql('query{viewer{repositories(first:100,ownerAffiliations:[OWNER,COLLABORATOR,ORGANIZATION_MEMBER]){nodes{nameWithOwner owner{login} isFork ' + hist + ' languages(first:10,orderBy:{field:SIZE,direction:DESC}){edges{size node{name color}}}}} repositoriesContributedTo(first:100,includeUserRepositories:false,contributionTypes:[COMMIT,PULL_REQUEST,ISSUE,REPOSITORY]){nodes{nameWithOwner ' + hist + '}}}}');
  const commits = new Map();
  for (const n of [...r.repositories.nodes, ...r.repositoriesContributedTo.nodes]) commits.set(n.nameWithOwner, n.defaultBranchRef?.target?.history?.totalCount || 0);
  const own = r.repositories.nodes.filter(n => n.owner.login === data.login);
  const others = new Set([...commits.entries()].filter(([k, v]) => !k.startsWith(data.login + '/') && v > 0).map(([k]) => k));
  const langs = {};
  for (const n of own) if (!n.isFork) for (const e of n.languages.edges) { langs[e.node.name] ??= { size: 0, color: e.node.color }; langs[e.node.name].size += e.size; }
  const perYear = Object.fromEntries(Object.entries(yrs).map(([k, v]) => [k.slice(1), v.contributionCalendar.totalContributions]).sort());
  const thisYear = String(new Date().getFullYear());
  data = { ...data, generatedAt: new Date().toISOString().slice(0, 10),
    totals: { commits: [...commits.values()].reduce((a, b) => a + b, 0), pullRequests: me.pullRequests.totalCount, issues: me.issues.totalCount,
      contributions: Object.values(perYear).reduce((a, b) => a + b, 0), ownRepos: own.length, contributedTo: others.size, yearContributions: perYear[thisYear] || 0 },
    perYear, languages: Object.entries(langs).sort((a, b) => b[1].size - a[1].size).map(([name, v]) => ({ name, ...v })) };
  writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n');
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SANS = "'Segoe UI', Inter, system-ui, -apple-system, Helvetica, Arial, sans-serif";
const MONO = "'JetBrains Mono', 'Cascadia Code', Consolas, 'SFMono-Regular', Menlo, monospace";
const fmt = n => n.toLocaleString('en-US');
const STATIC = process.env.STATIC_OUT; // preview mode: final frame, no animations
const A = str => (STATIC ? '' : str);
const HID = STATIC ? '' : ' opacity="0"';

/* ---------- header ---------- */
function header() {
  const roles = ['backend services', 'Telegram bots', 'AI agents & pipelines', 'e-commerce integrations', 'smart home automations', 'game tooling'];
  const T = roles.length * 3;
  const roleEls = roles.map((r, i) => '<text class="role" style="' + (STATIC ? (i ? 'display:none' : 'animation:none;opacity:1') : 'animation-delay:' + (i * 3) + 's') + '" x="0" y="0">' + esc(r) + '</text>').join('');
  const stars = Array.from({ length: 46 }, (_, i) => {
    const x = (i * 263) % 1200, y = (i * 137) % 340, r = (i % 3) * 0.5 + 0.6;
    return '<circle class="star" style="animation-delay:' + ((i % 7) * 0.6).toFixed(1) + 's" cx="' + x + '" cy="' + y + '" r="' + r + '"/>';
  }).join('');
  const chips = ['Java', 'Spring', 'Python', 'TypeScript', 'Node.js', 'C#', 'LLM agents'];
  let cx = 72; const chipEls = chips.map(c => { const w = c.length * 8.4 + 26; const s = '<g transform="translate(' + cx + ',262)"><rect width="' + w + '" height="28" rx="14" class="chip"/><text x="' + w / 2 + '" y="19" class="chipt">' + esc(c) + '</text></g>'; cx += w + 10; return s; }).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="340" viewBox="0 0 1200 340" role="img" aria-label="Artur Safonov">' +
  '<title>Artur Safonov</title><defs>' +
  '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#090c16"/><stop offset="1" stop-color="#121733"/></linearGradient>' +
  '<linearGradient id="name" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7aa2f7"><animate attributeName="stop-color" values="#7aa2f7;#bb9af7;#2ac3de;#7aa2f7" dur="8s" repeatCount="indefinite"/></stop><stop offset="1" stop-color="#2ac3de"><animate attributeName="stop-color" values="#2ac3de;#7aa2f7;#bb9af7;#2ac3de" dur="8s" repeatCount="indefinite"/></stop></linearGradient>' +
  '<filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="50"/></filter>' +
  '<filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
  '<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#7aa2f7" stroke-opacity=".07"/></pattern>' +
  '<linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".6" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
  '<mask id="gm"><rect width="1200" height="340" fill="url(#fade)"/></mask>' +
  '<clipPath id="card"><rect width="1200" height="340" rx="22"/></clipPath>' +
  '<clipPath id="roleclip"><rect x="0" y="-40" width="560" height="56"/></clipPath>' +
  '</defs><style>' +
  '.blob{animation:drift 14s ease-in-out infinite alternate}.b2{animation-duration:18s;animation-direction:alternate-reverse}.b3{animation-duration:22s}' +
  '@keyframes drift{0%{transform:translate(0,0)}50%{transform:translate(60px,-30px)}100%{transform:translate(-40px,25px)}}' +
  '.star{fill:#c0caf5;opacity:.15;animation:tw 4s ease-in-out infinite}@keyframes tw{50%{opacity:.7}}' +
  '.hello{font:500 18px ' + MONO + ';fill:#565f89}.name{font:800 76px ' + SANS + ';letter-spacing:-1.5px}' +
  '.pre{font:500 26px ' + MONO + ';fill:#a9b1d6}.role{font:700 26px ' + MONO + ';fill:#2ac3de;opacity:0;animation:roll ' + T + 's infinite}' +
  '@keyframes roll{0%{opacity:0;transform:translateY(22px)}' + (100 / roles.length * 0.12).toFixed(2) + '%{opacity:1;transform:translateY(0)}' + (100 / roles.length * 0.85).toFixed(2) + '%{opacity:1;transform:translateY(0)}' + (100 / roles.length).toFixed(2) + '%{opacity:0;transform:translateY(-22px)}100%{opacity:0}}' +
  '.cursor{fill:#bb9af7;animation:blink 1s steps(1) infinite}@keyframes blink{50%{opacity:0}}' +
  '.chip{fill:#1a1f3a;stroke:#2f3a66}.chipt{font:600 13px ' + MONO + ';fill:#a9b1d6;text-anchor:middle}' +
  '.orb{transform-origin:950px 170px;animation:spin 24s linear infinite}.o2{animation-duration:36s;animation-direction:reverse}.o3{animation-duration:16s}' +
  '@keyframes spin{to{transform:rotate(360deg)}}' +
  '.ring{fill:none;stroke:#7aa2f7;stroke-opacity:.18}.mono{font:800 46px ' + SANS + ';text-anchor:middle;fill:url(#name)}' +
  '.pulse{transform-origin:950px 158px;animation:pulse 3.2s ease-out infinite}@keyframes pulse{0%{transform:scale(.8);opacity:.5}100%{transform:scale(1.7);opacity:0}}' +
  '</style><g clip-path="url(#card)">' +
  '<rect width="1200" height="340" fill="url(#bg)"/>' +
  '<g filter="url(#blur)" opacity=".55"><circle class="blob" cx="260" cy="60" r="150" fill="#3d59a1"/><circle class="blob b2" cx="900" cy="300" r="170" fill="#6b3fa0"/><circle class="blob b3" cx="1080" cy="40" r="120" fill="#1a7a8c"/></g>' +
  '<rect width="1200" height="340" fill="url(#grid)" mask="url(#gm)"/>' + stars +
  '<text x="72" y="84" class="hello">// hello, world — I am</text>' +
  '<text x="68" y="160" class="name" fill="url(#name)" filter="url(#glow)">Artur Safonov</text>' +
  '<text x="72" y="218" class="pre">&gt; I build</text>' +
  '<g transform="translate(232,218)" clip-path="url(#roleclip)">' + roleEls + '</g>' +
  chipEls +
  '<circle class="ring" cx="950" cy="170" r="70"/><circle class="ring" cx="950" cy="170" r="108" stroke-dasharray="4 8"/><circle class="ring" cx="950" cy="170" r="146"/>' +
  '<circle class="pulse" cx="950" cy="158" r="56" fill="none" stroke="#2ac3de" stroke-width="2">' + cycle('stroke') + '</circle>' +
  '<g class="orb"><circle cx="1020" cy="170" r="6" fill="#2ac3de" filter="url(#glow)"/></g>' +
  '<g class="orb o2"><circle cx="950" cy="62" r="5" fill="#bb9af7" filter="url(#glow)"/><circle cx="950" cy="278" r="4" fill="#7aa2f7"/></g>' +
  '<g class="orb o3"><circle cx="804" cy="170" r="5" fill="#9ece6a" filter="url(#glow)"/><circle cx="1096" cy="170" r="3.5" fill="#e0af68"/></g>' +
  bulb() +
  '<rect width="1199" height="339" x=".5" y=".5" rx="22" fill="none" stroke="#2f3a66"/>' +
  '</g></svg>';
}

/* ---------- smart bulb (header centerpiece, a nod to yeelight-bridge) ---------- */
const RGB = ['#7aa2f7', '#bb9af7', '#f7768e', '#e0af68', '#9ece6a', '#2ac3de', '#7aa2f7'];
const cycle = attr => A('<animate attributeName="' + attr + '" values="' + RGB.join(';') + '" dur="12s" repeatCount="indefinite"/>');
function bulb() {
  const cx = 950, cy = 158, R = 42, c0 = RGB[0];
  let g = '<defs><radialGradient id="glass" cx=".5" cy=".42" r=".62">' +
    '<stop offset="0" stop-color="#fff" stop-opacity=".95"/>' +
    '<stop offset=".32" stop-color="' + c0 + '" stop-opacity=".85">' + cycle('stop-color') + '</stop>' +
    '<stop offset="1" stop-color="' + c0 + '" stop-opacity=".22">' + cycle('stop-color') + '</stop></radialGradient>' +
    '<filter id="halo" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="20"/></filter></defs>';
  // halo
  g += '<circle cx="' + cx + '" cy="' + cy + '" r="74" fill="' + c0 + '" filter="url(#halo)" opacity=".45">' + cycle('fill') +
    A('<animate attributeName="opacity" values=".35;.6;.35" dur="3s" repeatCount="indefinite"/>') + '</circle>';
  // rays
  const angs = [-170, -140, -112, -90, -68, -40, -10, 190, 10];
  g += '<g stroke="' + c0 + '" stroke-width="2.5" stroke-linecap="round" opacity=".8">' + cycle('stroke') +
    A('<animate attributeName="opacity" values=".35;.9;.35" dur="3s" repeatCount="indefinite"/>') +
    angs.map(a => { const r = a * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r); return '<line x1="' + (cx + c * 54).toFixed(1) + '" y1="' + (cy + sn * 54).toFixed(1) + '" x2="' + (cx + c * 66).toFixed(1) + '" y2="' + (cy + sn * 66).toFixed(1) + '"/>'; }).join('') + '</g>';
  // glass
  const glass = 'M932 196 C932 184 ' + (cx - R) + ' 176 ' + (cx - R) + ' ' + cy + ' A' + R + ' ' + R + ' 0 1 1 ' + (cx + R) + ' ' + cy + ' C' + (cx + R) + ' 176 968 184 968 196 Z';
  g += '<path d="' + glass + '" fill="url(#glass)" stroke="' + c0 + '" stroke-width="1.5" stroke-opacity=".9">' + cycle('stroke') + '</path>';
  // filament
  g += '<circle cx="950" cy="164" r="12" fill="#fff" opacity=".55" filter="url(#glow)"/>';
  g += '<path d="M943 196 L943 166 M957 196 L957 166" stroke="#8890b5" stroke-width="1.2" fill="none"/>';
  g += '<path d="M943 166 q2.3 -7 4.7 0 q2.3 -7 4.7 0 q2.3 -7 4.6 0" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" filter="url(#glow)"/>';
  g += '<path d="M923 140 A30 30 0 0 1 940 124" stroke="#fff" stroke-opacity=".55" stroke-width="3" fill="none" stroke-linecap="round"/>';
  // screw base
  g += '<rect x="931" y="195" width="38" height="7" rx="2" fill="#a9b1d6"/>';
  [203, 210, 217].forEach((y, i) => { g += '<rect x="' + (933 + (i % 2)) + '" y="' + y + '" width="' + (34 - 2 * (i % 2)) + '" height="6" rx="3" fill="' + (i % 2 ? '#565f89' : '#787c99') + '"/>'; });
  g += '<path d="M940 224 L960 224 L955 232 L945 232 Z" fill="#3b4261"/>';
  return g;
}

/* ---------- rocket line chart ---------- */
function rocketChart(bx, by, bw, bh) {
  const yrs = Object.entries(data.perYear); const n = yrs.length; const max = Math.max(...yrs.map(([, v]) => v));
  const base = by + bh - 26, top = by + 40, slot = bw / n;
  const P = yrs.map(([y, v], i) => ({ y, v, x: bx + slot * (i + 0.5), py: base - (v / max) * (base - top) }));
  let d = 'M' + P[0].x.toFixed(1) + ' ' + P[0].py.toFixed(1);
  for (let i = 0; i < n - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2, k = 0.18;
    const c1x = p1.x + (p2.x - p0.x) * k, c1y = Math.min(base, p1.py + (p2.py - p0.py) * k);
    const c2x = p2.x - (p3.x - p1.x) * k, c2y = Math.min(base, p2.py - (p3.py - p1.py) * k);
    d += ' C' + [c1x, c1y, c2x, c2y, p2.x, p2.py].map(v => v.toFixed(1)).join(' ');
  }
  const last = P[n - 1], prev = P[n - 2];
  const DUR = 2.4, BEG = 0.4;
  const t = i => (BEG + DUR * (i / (n - 1))).toFixed(2) + 's';
  let g = '<defs><linearGradient id="lineg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3d59a1"/><stop offset=".6" stop-color="#7aa2f7"/><stop offset="1" stop-color="#2ac3de"/></linearGradient>' +
    '<linearGradient id="areag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2ac3de" stop-opacity=".35"/><stop offset="1" stop-color="#7aa2f7" stop-opacity="0"/></linearGradient>' +
    '<radialGradient id="flame"><stop offset="0" stop-color="#fff3c4"/><stop offset=".45" stop-color="#e0af68"/><stop offset="1" stop-color="#ff7a45" stop-opacity="0"/></radialGradient></defs>';
  for (const f of [0.33, 0.66, 1]) g += '<line x1="' + bx + '" x2="' + (bx + bw) + '" y1="' + (base - f * (base - top)).toFixed(1) + '" y2="' + (base - f * (base - top)).toFixed(1) + '" stroke="#232a4d" stroke-dasharray="3 6"/>';
  g += '<line x1="' + bx + '" x2="' + (bx + bw) + '" y1="' + base + '" y2="' + base + '" stroke="#2f3a66"/>';
  g += '<path d="' + d + ' L' + last.x.toFixed(1) + ' ' + base + ' L' + P[0].x.toFixed(1) + ' ' + base + ' Z" fill="url(#areag)"' + HID + '>' + A('<animate attributeName="opacity" from="0" to="1" begin="' + (BEG + DUR * 0.8).toFixed(2) + 's" dur="1s" fill="freeze"/>') + '</path>';
  g += '<path d="' + d + '" fill="none" stroke="url(#lineg)" stroke-width="3" stroke-linecap="round" filter="url(#lglow)" pathLength="1" stroke-dasharray="1"' + (STATIC ? '' : ' stroke-dashoffset="1"') + '>' +
    A('<animate attributeName="stroke-dashoffset" from="1" to="0" begin="' + BEG + 's" dur="' + DUR + 's" fill="freeze"/>') + '</path>';
  P.forEach((p, i) => {
    const isLast = i === n - 1;
    const steep = !isLast && P[i + 1].py < p.py - 30; // next point shoots up: keep the label clear of the line
    g += '<g' + HID + '>' + A('<animate attributeName="opacity" from="0" to="1" begin="' + t(i) + '" dur=".3s" fill="freeze"/>') +
      '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.py.toFixed(1) + '" r="' + (isLast ? 5 : 3.5) + '" fill="#0d1122" stroke="' + (isLast ? '#2ac3de' : '#7aa2f7') + '" stroke-width="2"/>' +
      '<text class="yv' + (isLast ? ' hot' : '') + '" x="' + (isLast ? p.x - 14 : steep ? p.x - 8 : p.x).toFixed(1) + '" y="' + (isLast ? p.py + 5 : p.py - 12).toFixed(1) + '"' + (isLast ? ' style="text-anchor:end;font-size:15px"' : steep ? ' style="text-anchor:end"' : '') + '>' + p.v + '</text></g>';
  });
  P.forEach(p => { g += '<text class="yl" x="' + p.x.toFixed(1) + '" y="' + (base + 20) + '">\u2019' + p.y.slice(2) + '</text>'; });
  g += A('<circle cx="' + last.x.toFixed(1) + '" cy="' + last.py.toFixed(1) + '" r="5" fill="none" stroke="#2ac3de" stroke-width="2" opacity="0"><animate attributeName="r" values="5;22" begin="' + (BEG + DUR).toFixed(2) + 's" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values=".8;0" begin="' + (BEG + DUR).toFixed(2) + 's" dur="1.8s" repeatCount="indefinite"/></circle>');
  const flame = '<g transform="translate(-12,0)"><ellipse cx="-7" cy="0" rx="10" ry="4.5" fill="url(#flame)">' +
    A('<animate attributeName="rx" values="10;14;8;12;10" dur=".35s" repeatCount="indefinite"/><animate attributeName="ry" values="4.5;5.5;3.8;5;4.5" dur=".35s" repeatCount="indefinite"/>') + '</ellipse></g>';
  const body = flame +
    '<path d="M-12 -6 L-17 -12 L-6 -6 Z M-12 6 L-17 12 L-6 6 Z" fill="#f7768e"/>' +
    '<path d="M16 0 C10 -7 -4 -8 -12 -6.5 L-12 6.5 C-4 8 10 7 16 0 Z" fill="#c0caf5"/>' +
    '<path d="M16 0 C13 -3.5 10 -5 7 -6 L7 6 C10 5 13 3.5 16 0 Z" fill="#f7768e"/>' +
    '<circle cx="1" cy="0" r="3" fill="#2ac3de" stroke="#0d1122" stroke-width="1.5"/>';
  const ang = Math.atan2(last.py - prev.py, last.x - prev.x) * 180 / Math.PI;
  if (STATIC) g += '<g transform="translate(' + (last.x - 8).toFixed(1) + ',' + (last.py - 26).toFixed(1) + ') rotate(' + ang.toFixed(1) + ')">' + body + '</g>';
  else g += '<g transform="translate(-8,-26)"><g>' + '<animateMotion begin="' + BEG + 's" dur="' + DUR + 's" fill="freeze" rotate="auto" path="' + d + '" keyPoints="0;1" keyTimes="0;1" calcMode="linear"/>' +
    '<g>' + '<animateTransform attributeName="transform" type="translate" values="0 0;-2 -3;0 0" begin="' + (BEG + DUR).toFixed(2) + 's" dur="1.6s" repeatCount="indefinite"/>' + body + '</g></g></g>';
  return g;
}

/* ---------- stats ---------- */
function stats() {
  const t = data.totals; const W = 1200, H = 432;
  const cards = [
    ['Commits', t.commits, 'all time', '#7aa2f7'],
    ['Pull requests', t.pullRequests, 'opened, all repos', '#bb9af7'],
    ['Contributions', t.contributions, 'since ' + Object.keys(data.perYear)[0], '#2ac3de'],
    ['Repos', t.ownRepos, 'built and owned', '#9ece6a'],
    ['Contributed to', t.contributedTo, 'other teams\u2019 repos', '#e0af68'],
    ['Issues', t.issues, 'opened', '#f7768e'],
  ];
  const cw = 196, ch = 104;
  const cardEls = cards.map(([label, v, sub, c], i) => {
    const x = 40 + (i % 3) * (cw + 14), y = 78 + Math.floor(i / 3) * (ch + 14);
    return '<g transform="translate(' + x + ',' + y + ')"><g' + HID + '>' + A('<animate attributeName="opacity" from="0" to="1" begin="' + (i * 0.12).toFixed(2) + 's" dur=".6s" fill="freeze"/>') + '<rect width="' + cw + '" height="' + ch + '" rx="14" class="tile"/><rect width="4" height="40" y="18" rx="2" fill="' + c + '"/>' +
      '<text x="20" y="34" class="lbl">' + esc(label) + '</text><text x="20" y="72" class="big" fill="' + c + '">' + fmt(v) + '</text><text x="20" y="92" class="sub">' + esc(sub) + '</text></g></g>';
  }).join('');
  // per-year rocket chart
  const bx = 690, by = 78, bw = 470, bh = 222;
  const bars = rocketChart(bx, by, bw, bh);
  // languages
  const total = data.languages.reduce((a, l) => a + l.size, 0); const top = data.languages.slice(0, 8);
  const other = total - top.reduce((a, l) => a + l.size, 0);
  const segs = [...top, ...(other > 0 ? [{ name: 'Other', size: other, color: '#3b4261' }] : [])];
  let lx = 40; const lw = W - 80; const ly = 364;
  const segEls = segs.map(s => { const w = (s.size / total) * lw; const r = '<rect x="' + lx.toFixed(1) + '" y="' + ly + '" width="' + Math.max(w - 2, 1).toFixed(1) + '" height="12" fill="' + s.color + '"/>'; lx += w; return r; }).join('');
  const legend = segs.map((s, i) => { const x = 40 + (i % 9) * 126; return '<g transform="translate(' + x + ',' + (ly + 40) + ')"><circle r="5" cx="5" cy="-4" fill="' + s.color + '"/><text x="16" y="0" class="lg">' + esc(s.name) + ' <tspan class="lgp">' + (s.size / total * 100).toFixed(1) + '%</tspan></text></g>'; }).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="GitHub stats"><title>GitHub stats</title><defs>' +
    '<linearGradient id="cold" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#3d59a1"/><stop offset="1" stop-color="#7aa2f7"/></linearGradient>' +
    '<linearGradient id="hot" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#7aa2f7"/><stop offset="1" stop-color="#2ac3de"/></linearGradient>' +
    '<filter id="lglow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><clipPath id="lc"><rect x="40" y="' + ly + '" width="' + lw + '" height="12" rx="6"/></clipPath></defs><style>' +
    '.tile{fill:#161b30;stroke:#232a4d}.lbl{font:600 13px ' + SANS + ';fill:#787c99;text-transform:uppercase;letter-spacing:1px}' +
    '.big{font:800 34px ' + SANS + '}.sub{font:500 12px ' + SANS + ';fill:#565f89}' +
    '.h{font:700 18px ' + SANS + ';fill:#c0caf5}.hs{font:500 13px ' + MONO + ';fill:#565f89}' +
    '.yv{font:700 12px ' + MONO + ';fill:#a9b1d6;text-anchor:middle}.hot{fill:#2ac3de}.yl{font:500 12px ' + MONO + ';fill:#565f89;text-anchor:middle}' +
    '.lg{font:600 13px ' + SANS + ';fill:#a9b1d6}.lgp{fill:#565f89;font-weight:500}' +
    '</style><rect width="' + (W - 1) + '" height="' + (H - 1) + '" x=".5" y=".5" rx="22" fill="#0d1122" stroke="#232a4d"/>' +
    '<text x="40" y="50" class="h">By the numbers</text><text x="' + (40 + 3 * cw + 28) + '" y="50" class="hs" text-anchor="end">all repos \u00b7 public + private</text>' +
    cardEls +
    '<text x="' + bx + '" y="50" class="h">Contributions per year</text><text x="' + (bx + bw) + '" y="50" class="hs" text-anchor="end">' + fmt(t.yearContributions) + ' in ' + Object.keys(data.perYear).at(-1) + '</text>' + bars +
    '<text x="40" y="' + (ly - 16) + '" class="h">Languages across ' + t.ownRepos + ' repos</text>' +
    '<g clip-path="url(#lc)"><rect x="40" y="' + ly + '" width="' + lw + '" height="12" fill="#1a1f3a"/>' + segEls + '</g>' + legend +
    '</svg>';
}

/* ---------- pinned cards ---------- */
function pin(p) {
  const words = p.desc.split(' '); const lines = ['']; for (const w of words) { if ((lines.at(-1) + ' ' + w).trim().length > 52) lines.push(w); else lines[lines.length - 1] = (lines.at(-1) + ' ' + w).trim(); }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="590" height="170" viewBox="0 0 590 170" role="img" aria-label="' + esc(p.name) + '"><title>' + esc(p.name) + '</title><defs>' +
    '<linearGradient id="e" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + p.color + '"/><stop offset="1" stop-color="#7aa2f7"/></linearGradient></defs><style>' +
    '.n{font:700 22px ' + SANS + ';fill:#c0caf5}.d{font:500 15px ' + SANS + ';fill:#9aa5ce}.m{font:600 13px ' + MONO + ';fill:#787c99}.k{font:600 12px ' + MONO + ';fill:#565f89}' +
    '.edge{animation:sh 4s ease-in-out infinite alternate}@keyframes sh{from{opacity:.5}to{opacity:1}}</style>' +
    '<clipPath id="c"><rect width="590" height="170" rx="18"/></clipPath>' +
    '<g clip-path="url(#c)"><rect width="590" height="170" fill="#0d1122"/><rect class="edge" x="0" y="0" width="590" height="4" fill="url(#e)"/></g><rect x=".5" y=".5" width="589" height="169" rx="18" fill="none" stroke="#232a4d"/>' +
    '<g transform="translate(28,46)"><path d="M2 0h11l5 5v15H2z" fill="none" stroke="#7aa2f7" stroke-width="1.8" stroke-linejoin="round"/><text x="30" y="17" class="n">' + esc(p.name) + '</text></g>' +
    lines.map((l, i) => '<text x="28" y="' + (100 + i * 22) + '" class="d">' + esc(l) + '</text>').join('') +
    '<circle cx="34" cy="' + (lines.length > 1 ? 150 : 136) + '" r="6" fill="' + p.color + '"/><text x="48" y="' + (lines.length > 1 ? 155 : 141) + '" class="m">' + esc(p.lang) + '</text>' +
    '<text x="562" y="' + (lines.length > 1 ? 155 : 141) + '" class="k" text-anchor="end">pinned \u2197</text></svg>';
}

const outDir = STATIC ? STATIC.replace(/[\\/]?$/, '/') : new URL('assets/', root);
const out = f => (STATIC ? outDir + f : new URL(f, outDir));
mkdirSync(outDir, { recursive: true });
writeFileSync(out('header.svg'), header());
writeFileSync(out('stats.svg'), stats());
for (const p of data.pinned) writeFileSync(out('pin-' + p.name + '.svg'), pin(p));
console.log('generated', data.generatedAt, JSON.stringify(data.totals));



