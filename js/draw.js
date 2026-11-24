// Trash Royal - cartoon drawings. Everything is drawn in "tile" units with the
// unit's feet at (0,0), facing right (+x). y goes up as it gets more negative.
const OUT = '#1a1a1a';
const TEAM = ['#2f7bff', '#ff3b3b'];

// ---- "3D-ish" shading: every solid colour gets light from the top, a darker
// underside and a shiny highlight, so flat shapes read like chunky 3D toys.
const SHADE = { on: true, lx: -1 };   // lx: which side the light comes from (-1 = left)
const _cc = {};
function tint(hex, k) {
  const key = hex + k;
  if (_cc[key]) return _cc[key];
  if (typeof hex !== 'string' || hex[0] !== '#' || hex.length !== 7) return hex;
  const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const o = v.map(c => Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k)));
  return (_cc[key] = `rgb(${o[0]},${o[1]},${o[2]})`);
}
const _solid = f => SHADE.on && typeof f === 'string' && f[0] === '#' && f.length === 7;
function _radial(c, fill, x, y, rx, ry) {
  if (!_solid(fill)) return fill;
  const r = Math.max(rx, ry);
  const g = c.createRadialGradient(x + SHADE.lx * rx * 0.35, y - ry * 0.45, r * 0.05, x, y, r * 1.08);
  g.addColorStop(0, tint(fill, 0.5)); g.addColorStop(0.45, fill); g.addColorStop(1, tint(fill, -0.42));
  return g;
}
function _boxGrad(c, fill, x, y, w, h) {
  if (!_solid(fill)) return fill;
  let g;
  if (h > w * 1.15) { // tall things shade like cylinders
    g = c.createLinearGradient(x, 0, x + w, 0);
    if (SHADE.lx < 0) { g.addColorStop(0, tint(fill, -0.2)); g.addColorStop(0.28, tint(fill, 0.42)); g.addColorStop(0.62, fill); g.addColorStop(1, tint(fill, -0.45)); }
    else { g.addColorStop(0, tint(fill, -0.45)); g.addColorStop(0.38, fill); g.addColorStop(0.72, tint(fill, 0.42)); g.addColorStop(1, tint(fill, -0.2)); }
  } else {
    g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, tint(fill, 0.42)); g.addColorStop(0.35, tint(fill, 0.08)); g.addColorStop(1, tint(fill, -0.4));
  }
  return g;
}
function _shine(c, x, y, rx, ry) {
  c.fillStyle = 'rgba(255,255,255,0.42)';
  c.beginPath(); c.ellipse(x + SHADE.lx * rx * 0.36, y - ry * 0.44, rx * 0.3, ry * 0.17, SHADE.lx * 0.5, 0, Math.PI * 2); c.fill();
}
function _lw(c, w) { c.lineWidth = w || 0.05; c.strokeStyle = OUT; c.lineJoin = 'round'; c.lineCap = 'round'; }
function circ(c, x, y, r, fill, stroke = true) {
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { c.fillStyle = _radial(c, fill, x, y, r, r); c.fill(); }
  if (stroke) { _lw(c); c.stroke(); }
  if (fill && r >= 0.09 && _solid(fill)) _shine(c, x, y, r, r);
}
function ell(c, x, y, rx, ry, fill, stroke = true, rot = 0) {
  rx = Math.abs(rx); ry = Math.abs(ry);
  c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  if (fill) { c.fillStyle = Math.abs(rot) < 0.01 ? _radial(c, fill, x, y, rx, ry) : _radial(c, fill, x, y, Math.max(rx, ry), Math.max(rx, ry)); c.fill(); }
  if (stroke) { _lw(c); c.stroke(); }
  if (fill && Math.min(rx, ry) >= 0.12 && Math.abs(rot) < 0.01 && _solid(fill)) _shine(c, x, y, rx, ry);
}
function rrect(c, x, y, w, h, r, fill, stroke = true) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r);
  c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.closePath();
  if (fill) { c.fillStyle = _boxGrad(c, fill, x, y, w, h); c.fill(); }
  if (stroke) { _lw(c); c.stroke(); }
}
function poly(c, pts, fill, stroke = true) {
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); if (i) c.lineTo(pts[i], pts[i + 1]); }
  c.closePath();
  if (fill) { c.fillStyle = _boxGrad(c, fill, x0, y0, Math.max(0.01, x1 - x0), Math.max(0.01, y1 - y0) * 0.9); c.fill(); }
  if (stroke) { _lw(c); c.stroke(); }
}
function line(c, x1, y1, x2, y2, w, col) {
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
  c.lineCap = 'round'; c.lineWidth = w + 0.06; c.strokeStyle = OUT; c.stroke();
  c.lineWidth = w; c.strokeStyle = _solid(col) ? tint(col, -0.22) : col; c.stroke();
  if (_solid(col) && w >= 0.06) {
    // lighter top edge so limbs look round
    const o = w * 0.2;
    c.beginPath(); c.moveTo(x1 + SHADE.lx * o, y1 - o); c.lineTo(x2 + SHADE.lx * o, y2 - o);
    c.lineWidth = w * 0.5; c.strokeStyle = tint(col, 0.25); c.stroke();
  }
}
function eyes(c, x, y, sp, r, angry, look = 0.3) {
  circ(c, x - sp, y, r, '#fff', true); circ(c, x + sp, y, r, '#fff', true);
  circ(c, x - sp + r * look, y, r * 0.5, OUT, false); circ(c, x + sp + r * look, y, r * 0.5, OUT, false);
  if (angry) {
    _lw(c, 0.05);
    c.beginPath(); c.moveTo(x - sp - r, y - r * 1.5); c.lineTo(x - sp + r, y - r * 0.8);
    c.moveTo(x + sp + r, y - r * 1.5); c.lineTo(x + sp - r, y - r * 0.8); c.stroke();
  }
}
function legs(c, a, col, spread = 0.14, top = -0.25, w = 0.13) {
  const s = Math.sin(a.walk) * 0.08;
  line(c, -spread, top, -spread - s, 0, w, col);
  line(c, spread, top, spread + s, 0, w, col);
}
function grin(c, x, y, w, gap) {
  c.beginPath(); c.arc(x, y - w * 0.4, w, 0.15 * Math.PI, 0.85 * Math.PI);
  c.closePath(); c.fillStyle = '#5a1010'; c.fill(); _lw(c, 0.04); c.stroke();
  c.fillStyle = '#fff';
  c.fillRect(x - w * 0.7, y - w * 0.05 + 0.02, w * 1.4, w * 0.25);
  if (gap) { c.fillStyle = '#5a1010'; c.fillRect(x - w * 0.15, y - w * 0.05 + 0.02, w * 0.25, w * 0.27); }
}

const Draw = {};
// Chunky big-head proportions: heads are drawn bigger around their own center.
const HEAD = 1.28;
function headOn(c, x, y) { c.save(); c.translate(x, y); c.scale(HEAD, HEAD); c.translate(-x, -y); }

// ---------- Erick's characters ----------
Draw.jshock = (c, a) => {
  const bob = Math.sin(a.walk * 2) * 0.03;
  const hb = a.atk * 0.28;
  legs(c, a, '#22253a', 0.14, -0.3, 0.15);
  // white tee + open navy dotted shirt
  rrect(c, -0.3, -0.92 + bob, 0.6, 0.66, 0.14, '#f4f4f4');
  rrect(c, -0.36, -0.93 + bob, 0.2, 0.66, 0.1, '#1d2a57');
  rrect(c, 0.16, -0.93 + bob, 0.2, 0.66, 0.1, '#1d2a57');
  c.fillStyle = '#e8ecff';
  for (let i = 0; i < 4; i++) { c.fillRect(-0.32, -0.86 + bob + i * 0.15, 0.04, 0.04); c.fillRect(-0.24, -0.8 + bob + i * 0.15, 0.04, 0.04); c.fillRect(0.2, -0.86 + bob + i * 0.15, 0.04, 0.04); c.fillRect(0.28, -0.8 + bob + i * 0.15, 0.04, 0.04); }
  // silver chains + cross
  c.lineWidth = 0.035; c.strokeStyle = '#cfd6de';
  c.beginPath(); c.arc(0, -0.95 + bob, 0.17, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
  c.beginPath(); c.arc(0, -0.95 + bob, 0.24, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
  c.fillStyle = '#e3e9ef'; c.fillRect(-0.025, -0.76 + bob, 0.05, 0.16); c.fillRect(-0.06, -0.72 + bob, 0.12, 0.045);
  // arm with big watch
  line(c, 0.3, -0.82 + bob, 0.42 + hb * 0.3, -0.55 + bob, 0.12, '#e3b48c');
  rrect(c, 0.36 + hb * 0.3, -0.66 + bob, 0.14, 0.1, 0.03, '#111');
  // bald head (lunges for the headbutt)
  const hx = hb, hy = -1.2 + bob;
  headOn(c, hx, hy);
  circ(c, hx - 0.27, hy + 0.02, 0.07, '#d9a67c');
  circ(c, hx, hy, 0.28, '#e3b48c');
  circ(c, hx - 0.28, hy + 0.08, 0.025, '#fff', false);
  eyes(c, hx + 0.1, hy - 0.02, 0.09, 0.055, a.atk > 0.1);
  c.beginPath(); c.arc(hx + 0.1, hy + 0.12, 0.07, 0.1, Math.PI - 0.1); _lw(c, 0.04); c.stroke();
  c.restore();
};

Draw.hillbilly = (c, a) => {
  const bob = Math.sin(a.walk * 2) * 0.03;
  legs(c, a, '#3a5d9c', 0.11, -0.25, 0.12);
  // plaid-ish shirt + overalls with one strap down
  rrect(c, -0.24, -0.78 + bob, 0.48, 0.55, 0.12, '#c0392b');
  rrect(c, -0.22, -0.55 + bob, 0.44, 0.34, 0.08, '#3f6fb5');
  line(c, 0.14, -0.55 + bob, 0.16, -0.78 + bob, 0.05, '#3f6fb5');
  line(c, -0.16, -0.55 + bob, -0.22, -0.4 + bob, 0.05, '#3f6fb5');
  // head
  const hy = -1.02 + bob;
  headOn(c, 0, hy);
  circ(c, 0, hy, 0.22, '#f0c29a');
  eyes(c, 0.07, hy - 0.03, 0.07, 0.045, false);
  // spit cheeks when attacking
  if (a.atk > 0.2) circ(c, 0.17, hy + 0.08, 0.06, '#b8e07a');
  grin(c, 0.06, hy + 0.08, 0.08, true);
  // straw in mouth
  line(c, 0.12, hy + 0.1, 0.3, hy + 0.04, 0.025, '#e8c84a');
  // straw hat
  ell(c, 0, hy - 0.16, 0.34, 0.07, '#e5c55a');
  rrect(c, -0.16, hy - 0.34, 0.32, 0.19, 0.06, '#e5c55a');
  c.fillStyle = '#8b5a2b'; c.fillRect(-0.16, hy - 0.21, 0.32, 0.04);
  c.restore();
};

Draw.orville = (c, a) => {
  const bob = Math.sin(a.walk * 2) * 0.04;
  // stink lines
  c.lineWidth = 0.05; c.strokeStyle = 'rgba(120,200,60,0.75)';
  for (let i = 0; i < 3; i++) {
    const x = -0.5 + i * 0.45, ph = a.t * 3 + i * 2;
    c.beginPath();
    for (let k = 0; k <= 8; k++) { const yy = -1.6 - k * 0.08; const xx = x + Math.sin(ph + k * 0.9) * 0.08; k ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
    c.stroke();
  }
  legs(c, a, '#3b3f52', 0.26, -0.45, 0.24);
  // big body in pizza shirt
  ell(c, 0, -0.9 + bob, 0.62, 0.6, '#f6a623');
  c.save(); c.beginPath(); c.ellipse(0, -0.9 + bob, 0.6, 0.58, 0, 0, Math.PI * 2); c.clip();
  for (let i = 0; i < 5; i++) {
    const px = -0.45 + (i % 3) * 0.42, py = -1.25 + bob + Math.floor(i / 3) * 0.45 + (i % 2) * 0.1;
    poly(c, [px, py, px + 0.22, py + 0.06, px + 0.08, py + 0.26], '#ffd76a', false);
    circ(c, px + 0.1, py + 0.08, 0.035, '#c0392b', false); circ(c, px + 0.08, py + 0.17, 0.03, '#c0392b', false);
  }
  c.restore();
  ell(c, 0, -0.9 + bob, 0.62, 0.6, null);
  // arms
  line(c, -0.55, -1.05 + bob, -0.7, -0.65 + bob, 0.18, '#f6d2b5');
  const kick = a.atk;
  line(c, 0.55, -1.05 + bob, 0.66, -0.7 + bob, 0.18, '#f6d2b5');
  if (kick > 0.05) line(c, 0.2, -0.45, 0.2 + kick * 0.55, -0.35 - kick * 0.2, 0.24, '#3b3f52');
  // head
  const hy = -1.66 + bob;
  headOn(c, 0, hy);
  circ(c, 0, hy, 0.3, '#f6d2b5');
  c.fillStyle = '#9b6b3c'; c.beginPath(); c.arc(0, hy - 0.05, 0.3, Math.PI * 1.05, Math.PI * 1.95); c.fill();
  eyes(c, 0.1, hy - 0.02, 0.1, 0.055, true);
  grin(c, 0.08, hy + 0.12, 0.1, false);
  c.restore();
  // speaker on shoulder, pulsing
  const pulse = 1 + Math.max(0, Math.sin(a.t * 14.6)) * 0.08;
  rrect(c, -0.78, -1.62 + bob, 0.42, 0.3, 0.08, '#202020');
  circ(c, -0.67, -1.47 + bob, 0.08 * pulse, '#555');
  circ(c, -0.47, -1.47 + bob, 0.08 * pulse, '#555');
  c.fillStyle = '#ff7a00'; c.fillRect(-0.62, -1.6 + bob, 0.1, 0.03);
  // music notes
  c.fillStyle = '#ffe14d'; c.font = 'bold 0.3px sans-serif';
  c.fillText('♪', -0.95 + Math.sin(a.t * 3) * 0.1, -1.75 + bob - (a.t * 0.8 % 0.4));
};

function pigeonBody(c, a, s, big) {
  const flap = Math.sin(a.t * (big ? 12 : 18)) * 0.5;
  c.save(); c.scale(s, s);
  // wings
  ell(c, -0.12, -0.42 - flap * 0.15, 0.26, 0.11, '#8a93a3', true, -0.6 - flap);
  ell(c, 0, -0.35, 0.3, 0.24, '#a9b2c2');
  ell(c, 0.18, -0.48, 0.15, 0.14, '#6f9a8c');
  circ(c, 0.26, -0.6, 0.14, '#a9b2c2');
  poly(c, [0.38, -0.62, 0.5, -0.58, 0.38, -0.55], '#e8a33d');
  circ(c, 0.3, -0.64, 0.045, '#ff8c1a', true);
  circ(c, 0.31, -0.64, 0.02, OUT, false);
  ell(c, 0.12, -0.42 - flap * 0.15, 0.24, 0.1, '#8a93a3', true, 0.5 + flap);
  poly(c, [-0.28, -0.35, -0.48, -0.42, -0.45, -0.25], '#6f7787');
  line(c, 0.02, -0.12, 0.0, 0.0, 0.03, '#e8743d'); line(c, 0.1, -0.12, 0.12, 0.0, 0.03, '#e8743d');
  c.restore();
}
Draw.pigeons = (c, a) => pigeonBody(c, a, 1, false);
Draw.hugepigeon = (c, a) => {
  pigeonBody(c, a, 1.9, true);
  // angry brow on the big one
  _lw(c, 0.06); c.beginPath(); c.moveTo(0.38, -1.36); c.lineTo(0.66, -1.28); c.stroke();
};

function skiMaskHead(c, x, y, r) {
  circ(c, x, y, r, '#1c1c1c');
  ell(c, x + r * 0.35, y - r * 0.15, r * 0.55, r * 0.22, '#f0c29a', false);
  circ(c, x + r * 0.15, y - r * 0.15, r * 0.12, '#fff', false); circ(c, x + r * 0.55, y - r * 0.15, r * 0.12, '#fff', false);
  circ(c, x + r * 0.18, y - r * 0.15, r * 0.06, OUT, false); circ(c, x + r * 0.58, y - r * 0.15, r * 0.06, OUT, false);
  ell(c, x + r * 0.4, y + r * 0.42, r * 0.22, r * 0.12, '#f0c29a', false);
  circ(c, x, y - r, r * 0.22, '#c0392b');
}
function dynamite(c, x, y, rot, t) {
  c.save(); c.translate(x, y); c.rotate(rot);
  rrect(c, -0.06, -0.18, 0.12, 0.3, 0.03, '#d63031');
  line(c, 0, -0.18, 0.05, -0.28, 0.02, '#555');
  const f = 0.04 + Math.sin(t * 40) * 0.02;
  circ(c, 0.05, -0.3, f + 0.02, '#ffd32a', false); circ(c, 0.05, -0.3, f, '#ff6b00', false);
  c.restore();
}
Draw.balloon = (c, a) => {
  const sway = Math.sin(a.t * 2) * 0.05;
  // ropes
  _lw(c, 0.03);
  c.beginPath(); c.moveTo(-0.25, -0.35); c.lineTo(-0.45 + sway, -1.0); c.moveTo(0.25, -0.35); c.lineTo(0.45 + sway, -1.0); c.stroke();
  // balloon (stripes)
  c.save(); c.translate(sway, -1.55);
  c.beginPath(); c.ellipse(0, 0, 0.72, 0.8, 0, 0, Math.PI * 2); c.save(); c.clip();
  for (let i = -4; i < 4; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#e74c3c'; c.fillRect(i * 0.2, -1, 0.2, 2); }
  c.restore(); _lw(c); c.stroke(); c.restore();
  // mad bomber in the basket
  skiMaskHead(c, 0.02, -0.58, 0.18 * HEAD);
  rrect(c, -0.32, -0.42, 0.64, 0.36, 0.06, '#a0672e');
  c.strokeStyle = '#7a4a1e'; c.lineWidth = 0.03;
  for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(-0.32 + i * 0.16, -0.42); c.lineTo(-0.32 + i * 0.16, -0.06); c.stroke(); }
  dynamite(c, 0.32, -0.5, 0.4, a.t);
};

Draw.matthew = (c, a) => {
  const flap = Math.sin(a.t * 16);
  const slam = a.atk * 0.25;
  c.translate(0, slam);
  // tiny wings
  ell(c, -0.55, -0.85 - flap * 0.12, 0.25, 0.1, '#f8f8ff', true, -0.5 - flap * 0.4);
  ell(c, 0.55, -0.85 - flap * 0.12, 0.25, 0.1, '#f8f8ff', true, 0.5 + flap * 0.4);
  // big round body
  ell(c, 0, -0.6, 0.55, 0.52, '#4caf50');
  ell(c, 0.05, -0.5, 0.3, 0.3, '#5cc160', false);
  line(c, -0.18, -0.15, -0.2, 0.0, 0.14, '#33415c'); line(c, 0.18, -0.15, 0.2, 0.0, 0.14, '#33415c');
  // head
  const hy = -1.3;
  headOn(c, 0, hy);
  circ(c, 0, hy, 0.3, '#f1c7a4');
  // curly hair
  for (let i = 0; i < 7; i++) { const ang = Math.PI * (1.05 + i * 0.15); circ(c, Math.cos(ang) * 0.27, hy + Math.sin(ang) * 0.27, 0.1, '#5b3a1e'); }
  circ(c, 0, hy - 0.26, 0.12, '#5b3a1e');
  // glasses
  _lw(c, 0.04);
  circ(c, 0.02, hy, 0.085, 'rgba(200,230,255,0.6)'); circ(c, 0.22, hy, 0.085, 'rgba(200,230,255,0.6)');
  c.beginPath(); c.moveTo(0.1, hy); c.lineTo(0.14, hy); c.stroke();
  circ(c, 0.04, hy, 0.03, OUT, false); circ(c, 0.24, hy, 0.03, OUT, false);
  c.beginPath(); c.arc(0.12, hy + 0.15, 0.07, 0.2, Math.PI - 0.2); _lw(c, 0.04); c.stroke();
  c.restore();
};

Draw.alejandro = (c, a) => {
  const bob = Math.sin(a.walk * 2) * 0.03;
  // skinny legs, shorts, slides with socks
  const s = Math.sin(a.walk) * 0.07;
  line(c, -0.09, -0.35, -0.09 - s, -0.04, 0.07, '#f3cfb0');
  line(c, 0.09, -0.35, 0.09 + s, -0.04, 0.07, '#f3cfb0');
  rrect(c, -0.13 - s, -0.15, 0.08, 0.13, 0.03, '#fff'); rrect(c, 0.05 + s, -0.15, 0.08, 0.13, 0.03, '#fff');
  rrect(c, -0.18 - s, -0.04, 0.17, 0.06, 0.03, '#222'); rrect(c, 0.02 + s, -0.04, 0.17, 0.06, 0.03, '#222');
  rrect(c, -0.2, -0.5 + bob, 0.4, 0.2, 0.06, '#5d6d7e');
  // hoodie
  rrect(c, -0.22, -0.95 + bob, 0.44, 0.5, 0.12, '#8e9aa6');
  rrect(c, -0.13, -0.66 + bob, 0.26, 0.12, 0.05, '#7f8b97');
  // throwing arm with bottle
  const th = a.atk;
  line(c, 0.2, -0.85 + bob, 0.32 - th * 0.15, -1.05 - th * 0.15 + bob, 0.08, '#8e9aa6');
  if (th < 0.3) { rrect(c, 0.28, -1.22 + bob, 0.09, 0.16, 0.03, '#eaf6ff'); circ(c, 0.325, -1.25 + bob, 0.04, '#ffb6c1'); }
  const hy = -1.17 + bob;
  headOn(c, 0, hy);
  circ(c, 0, hy, 0.2, '#f3cfb0');
  // hood up
  c.beginPath(); c.arc(0, hy, 0.24, Math.PI * 0.9, Math.PI * 2.1); _lw(c, 0.09); c.strokeStyle = '#8e9aa6'; c.stroke();
  eyes(c, 0.07, hy, 0.06, 0.04, false);
  c.beginPath(); c.arc(0.07, hy + 0.1, 0.05, 0.2, Math.PI - 0.2); _lw(c, 0.03); c.stroke();
  c.restore();
};

Draw.metro = (c, a) => {
  const bob = Math.sin(a.walk * 2) * 0.03;
  const s = Math.sin(a.walk) * 0.07;
  line(c, -0.08, -0.35, -0.08 - s, 0, 0.08, '#2c2c2c'); line(c, 0.08, -0.35, 0.08 + s, 0, 0.08, '#2c2c2c');
  rrect(c, -0.18, -0.92 + bob, 0.36, 0.6, 0.1, '#1b1b1b');
  c.fillStyle = '#c9a227'; c.fillRect(-0.06, -0.9 + bob, 0.12, 0.03);
  // sniper rifle
  const rec = a.atk * 0.08;
  c.save(); c.translate(0.05 - rec, -0.72 + bob);
  rrect(c, -0.15, -0.04, 0.35, 0.09, 0.02, '#4a3b2a');
  line(c, 0.2, 0, 0.75, 0, 0.04, '#333');
  rrect(c, 0.1, -0.13, 0.22, 0.07, 0.03, '#222');
  if (a.atk > 0.7) { circ(c, 0.82, 0, 0.08, '#ffde59', false); circ(c, 0.82, 0, 0.04, '#fff', false); }
  c.restore();
  const hy = -1.14 + bob;
  headOn(c, 0, hy);
  circ(c, 0, hy, 0.2, '#f1cdb0');
  c.fillStyle = '#3a2a1a'; c.beginPath(); c.arc(0, hy - 0.04, 0.2, Math.PI, Math.PI * 2); c.fill();
  // round shades
  circ(c, 0.03, hy, 0.065, '#111'); circ(c, 0.17, hy, 0.065, '#111');
  _lw(c, 0.03); c.beginPath(); c.moveTo(0.09, hy); c.lineTo(0.11, hy); c.stroke();
  circ(c, 0.01, hy - 0.02, 0.018, 'rgba(255,255,255,0.8)', false);
  c.beginPath(); c.moveTo(0.05, hy + 0.11); c.lineTo(0.15, hy + 0.1); _lw(c, 0.03); c.stroke();
  c.restore();
};

Draw.bomber = (c, a) => {
  const bob = Math.sin(a.walk * 2) * 0.03;
  legs(c, a, '#222', 0.1, -0.25, 0.11);
  rrect(c, -0.22, -0.78 + bob, 0.44, 0.55, 0.1, '#eee');
  c.fillStyle = '#222'; for (let i = 0; i < 4; i++) c.fillRect(-0.22, -0.72 + bob + i * 0.13, 0.44, 0.05);
  skiMaskHead(c, 0, -1.02 + bob, 0.22 * HEAD);
  if (a.atk < 0.3) dynamite(c, 0.3, -0.85 + bob, 0.3, a.t);
  line(c, 0.2, -0.7 + bob, 0.3, -0.8 + bob, 0.08, '#eee');
};

Draw.gamdom = (c, a) => {
  const bob = Math.abs(Math.sin(a.walk * 2)) * 0.06;
  // donkey
  const s = Math.sin(a.walk * 1.5) * 0.1;
  for (const lx of [-0.4, -0.25, 0.25, 0.4]) line(c, lx, -0.4, lx + (lx > 0 ? s : -s), 0, 0.09, '#7f8c8d');
  ell(c, 0, -0.55 - bob, 0.55, 0.25, '#95a5a6');
  line(c, -0.55, -0.6 - bob, -0.72, -0.4 - bob, 0.04, '#7f8c8d');
  // donkey head + long ears
  ell(c, 0.62, -0.8 - bob, 0.2, 0.13, '#95a5a6', true, 0.5);
  ell(c, 0.55, -1.02 - bob, 0.05, 0.18, '#95a5a6', true, -0.3);
  ell(c, 0.66, -1.02 - bob, 0.05, 0.18, '#95a5a6', true, 0.2);
  circ(c, 0.66, -0.84 - bob, 0.03, OUT, false);
  ell(c, 0.78, -0.72 - bob, 0.08, 0.06, '#c7c7c7', false);
  // Big Gamdom riding
  rrect(c, -0.3, -1.25 - bob, 0.52, 0.55, 0.2, '#8e44ad');
  const hy = -1.5 - bob;
  headOn(c, -0.04, hy);
  circ(c, -0.04, hy, 0.24, '#f0c8a4');
  c.fillStyle = '#2d2d2d'; c.beginPath(); c.arc(-0.04, hy - 0.04, 0.24, Math.PI, Math.PI * 2); c.fill();
  rrect(c, -0.2, hy - 0.32, 0.3, 0.12, 0.04, '#f1c40f'); // gold cap
  eyes(c, 0.04, hy, 0.07, 0.045, a.e && (a.e.flags & 32));
  c.beginPath(); c.arc(0.06, hy + 0.12, 0.06, 0.2, Math.PI - 0.2); _lw(c, 0.035); c.stroke();
  c.restore();
  // pool noodle lance
  const lunge = a.atk * 0.3 + ((a.e && a.e.flags & 32) ? 0.15 : 0);
  line(c, 0.05, -1.0 - bob, 0.95 + lunge, -1.05 - bob, 0.09, '#2ecc71');
};

// ---------- Claude's picks ----------
Draw.turd = (c, a) => {
  const sq = 1 + Math.sin(a.walk * 2) * 0.06;
  c.save(); c.scale(1 / sq, sq);
  ell(c, 0, -0.14, 0.3, 0.14, '#7b4a1f');
  ell(c, 0, -0.3, 0.22, 0.11, '#8a5526');
  ell(c, 0.02, -0.43, 0.13, 0.08, '#94602d');
  poly(c, [0, -0.58, 0.07, -0.48, -0.05, -0.48], '#94602d');
  c.restore();
  eyes(c, 0.05, -0.3, 0.07, 0.045, true);
  c.fillStyle = '#5a7d2a';
  circ(c, -0.25 + Math.sin(a.t * 9) * 0.1, -0.6 + Math.cos(a.t * 7) * 0.08, 0.025, OUT, false);
};

Draw.rats = (c, a) => {
  const s = Math.sin(a.walk * 3) * 0.04;
  c.lineWidth = 0.04; c.strokeStyle = '#e59aa0';
  c.beginPath(); c.moveTo(-0.22, -0.12); c.quadraticCurveTo(-0.45, -0.1 + s, -0.5, -0.25); c.stroke();
  ell(c, -0.02, -0.15, 0.24, 0.13, '#7d7f86');
  circ(c, 0.2, -0.2, 0.1, '#7d7f86');
  circ(c, 0.15, -0.31, 0.06, '#e59aa0');
  circ(c, 0.29, -0.2, 0.025, '#e59aa0', false);
  circ(c, 0.22, -0.23, 0.025, OUT, false);
  line(c, -0.1, -0.05, -0.1 + s, 0, 0.04, '#5d5f66'); line(c, 0.08, -0.05, 0.08 - s, 0, 0.04, '#5d5f66');
};

Draw.guard = (c, a) => {
  const bob = Math.sin(a.walk * 2) * 0.03;
  legs(c, a, '#2c3e50', 0.13, -0.3, 0.14);
  rrect(c, -0.3, -0.92 + bob, 0.6, 0.66, 0.12, '#34495e');
  rrect(c, -0.26, -0.88 + bob, 0.52, 0.32, 0.06, '#f4d03f');
  c.fillStyle = '#222'; c.font = 'bold 0.11px sans-serif'; c.textAlign = 'center'; c.fillText('SECURITY', 0, -0.68 + bob); c.textAlign = 'left';
  // flashlight swing
  const sw = a.atk;
  c.save(); c.translate(0.28, -0.75 + bob); c.rotate(-1.1 + sw * 1.8);
  rrect(c, -0.05, -0.55, 0.1, 0.5, 0.03, '#222');
  rrect(c, -0.08, -0.62, 0.16, 0.12, 0.03, '#444');
  if (sw > 0.4) { c.fillStyle = 'rgba(255,250,180,0.6)'; c.beginPath(); c.moveTo(-0.07, -0.62); c.lineTo(-0.25, -1.1); c.lineTo(0.25, -1.1); c.lineTo(0.07, -0.62); c.fill(); }
  c.restore();
  const hy = -1.17 + bob;
  headOn(c, 0, hy);
  circ(c, 0, hy, 0.24, '#e8b896');
  eyes(c, 0.08, hy, 0.08, 0.045, true);
  c.beginPath(); c.moveTo(0.02, hy + 0.12); c.lineTo(0.16, hy + 0.12); _lw(c, 0.035); c.stroke();
  rrect(c, -0.25, hy - 0.3, 0.5, 0.15, 0.05, '#2c3e50');
  rrect(c, -0.05, hy - 0.17, 0.42, 0.06, 0.03, '#2c3e50');
  circ(c, 0, hy - 0.22, 0.04, '#f1c40f', false);
  c.restore();
};

Draw.chihuahua = (c, a) => {
  const jit = Math.sin(a.t * 70) * 0.02;
  c.translate(jit, 0);
  line(c, -0.15, -0.15, -0.15, 0, 0.05, '#d9a066'); line(c, 0.12, -0.15, 0.12, 0, 0.05, '#d9a066');
  ell(c, -0.02, -0.22, 0.22, 0.12, '#d9a066');
  line(c, -0.22, -0.25, -0.32, -0.38, 0.04, '#d9a066');
  const bite = a.atk;
  circ(c, 0.2, -0.38, 0.15, '#e0ab70');
  poly(c, [0.1, -0.48, 0.02, -0.75, 0.2, -0.52], '#e0ab70');
  poly(c, [0.26, -0.5, 0.36, -0.76, 0.34, -0.45], '#e0ab70');
  circ(c, 0.17, -0.41, 0.065, '#fff'); circ(c, 0.29, -0.41, 0.065, '#fff');
  circ(c, 0.19, -0.41, 0.03, OUT, false); circ(c, 0.31, -0.41, 0.03, OUT, false);
  if (bite > 0.2) { ell(c, 0.32, -0.3, 0.07, 0.06 + bite * 0.04, '#5a1010'); c.fillStyle = '#fff'; c.fillRect(0.27, -0.35, 0.1, 0.02); }
  else circ(c, 0.35, -0.33, 0.025, OUT, false);
};

Draw.doordash = (c, a) => {
  const air = a.e && a.e.hop ? a.e.hop : 0;
  c.translate(0, -air);
  // scooter
  circ(c, -0.35, -0.12, 0.12, '#222'); circ(c, 0.38, -0.12, 0.12, '#222');
  rrect(c, -0.45, -0.3, 0.9, 0.12, 0.05, '#e74c3c');
  line(c, 0.35, -0.3, 0.45, -0.85, 0.06, '#555');
  line(c, 0.36, -0.86, 0.55, -0.86, 0.05, '#333');
  // driver + red delivery bag
  rrect(c, -0.55, -1.05, 0.34, 0.36, 0.06, '#d63031');
  c.fillStyle = '#fff'; c.fillRect(-0.47, -0.92, 0.18, 0.04);
  rrect(c, -0.22, -0.95, 0.38, 0.6, 0.1, '#e74c3c');
  line(c, 0.1, -0.85, 0.4, -0.83, 0.08, '#e74c3c');
  line(c, -0.08, -0.38, 0.05, -0.32, 0.1, '#2c3e50');
  const hy = -1.17;
  headOn(c, 0, hy);
  circ(c, 0, hy, 0.2, '#e8b896');
  rrect(c, -0.2, hy - 0.22, 0.4, 0.13, 0.05, '#e74c3c');
  rrect(c, 0.05, hy - 0.12, 0.25, 0.05, 0.02, '#e74c3c');
  eyes(c, 0.08, hy - 0.01, 0.06, 0.04, true);
  c.beginPath(); c.arc(0.09, hy + 0.1, 0.05, 0.2, Math.PI - 0.2); _lw(c, 0.03); c.stroke();
  c.restore();
  // speed lines
  c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 0.03;
  for (let i = 0; i < 3; i++) { const y = -0.3 - i * 0.25; const o = (a.t * 6 + i) % 1; c.beginPath(); c.moveTo(-0.7 - o * 0.3, y); c.lineTo(-0.95 - o * 0.3, y); c.stroke(); }
};

Draw.uncle = (c, a) => {
  const spin = a.atk > 0 ? (1 - a.atk) * Math.PI * 4 : 0;
  const sway = Math.sin(a.t * 2.5) * 0.06;
  const bob = Math.sin(a.walk * 2) * 0.03;
  legs(c, a, '#c7a17a', 0.13, -0.3, 0.13);
  rrect(c, -0.2, -0.06, 0.16, 0.06, 0.03, '#5d4037'); rrect(c, 0.06, -0.06, 0.16, 0.06, 0.03, '#5d4037');
  rrect(c, -0.25, -0.45, 0.5, 0.2, 0.06, '#e67e22');
  c.save(); c.translate(sway, 0);
  ell(c, 0, -0.75 + bob, 0.34, 0.36, '#f5f5f5');
  ell(c, 0.08, -0.65 + bob, 0.1, 0.07, '#e5d27a', false);
  // arm swinging beer
  const ang = spin + 0.4;
  const hx = Math.cos(ang) * 0.48, hy2 = -0.85 + bob + Math.sin(ang) * 0.12;
  line(c, 0.15, -0.9 + bob, hx, hy2, 0.1, '#f0c29a');
  rrect(c, hx - 0.06, hy2 - 0.14, 0.12, 0.2, 0.03, '#c9a227');
  c.fillStyle = '#fff'; c.fillRect(hx - 0.06, hy2 - 0.15, 0.12, 0.04);
  const hy = -1.3 + bob;
  headOn(c, 0, hy);
  circ(c, 0, hy, 0.24, '#f0c29a');
  c.fillStyle = '#888'; c.beginPath(); c.arc(0, hy - 0.02, 0.24, Math.PI * 1.1, Math.PI * 1.4); c.fill();
  circ(c, 0.17, hy + 0.04, 0.07, '#e57373');
  _lw(c, 0.04); c.beginPath(); c.moveTo(0.02, hy - 0.04); c.lineTo(0.1, hy - 0.02); c.moveTo(0.16, hy - 0.04); c.lineTo(0.24, hy - 0.02); c.stroke();
  c.beginPath(); c.arc(0.1, hy + 0.12, 0.06, 0.2, Math.PI - 0.2); c.stroke();
  c.restore();
  c.restore();
  if (a.atk > 0) {
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 0.05;
    c.beginPath(); c.ellipse(0, -0.8, 0.8, 0.3, 0, spin, spin + 2.5); c.stroke();
  }
};

Draw.geese = (c, a) => {
  const s = Math.sin(a.walk * 2) * 0.05;
  const peck = a.atk * 0.15;
  line(c, -0.06, -0.12, -0.06 - s, 0, 0.035, '#f39c12'); line(c, 0.06, -0.12, 0.06 + s, 0, 0.035, '#f39c12');
  ell(c, -0.05, -0.25, 0.24, 0.15, '#f6f6f6');
  poly(c, [-0.28, -0.3, -0.38, -0.36, -0.3, -0.2], '#ddd');
  line(c, 0.1, -0.3, 0.16 + peck, -0.58 + peck * 0.8, 0.09, '#f6f6f6');
  circ(c, 0.18 + peck, -0.62 + peck * 0.8, 0.09, '#f6f6f6');
  poly(c, [0.25 + peck, -0.65 + peck * 0.8, 0.4 + peck, -0.6 + peck * 0.8, 0.25 + peck, -0.57 + peck * 0.8], '#f39c12');
  circ(c, 0.2 + peck, -0.65 + peck * 0.8, 0.025, OUT, false);
  _lw(c, 0.035); c.beginPath(); c.moveTo(0.14 + peck, -0.72 + peck * 0.8); c.lineTo(0.25 + peck, -0.68 + peck * 0.8); c.stroke();
};

// ---------- buildings ----------
Draw.pizzacannon = (c, a) => {
  ell(c, 0, -0.1, 0.7, 0.3, '#7f8c8d');
  rrect(c, -0.55, -0.55, 1.1, 0.45, 0.08, '#e9d8a6');
  c.fillStyle = '#c0392b'; c.font = 'bold 0.16px sans-serif'; c.textAlign = 'center'; c.fillText('PIZZA', 0, -0.27); c.textAlign = 'left';
  const rec = a.atk * 0.12;
  c.save(); c.translate(0, -0.7); c.rotate(a.aim || 0);
  rrect(c, -0.2 - rec, -0.14, 0.8, 0.28, 0.1, '#5d6d7e');
  circ(c, 0.6 - rec, 0, 0.12, '#2c3e50');
  c.restore();
  circ(c, 0, -0.7, 0.22, '#f39c12');
  circ(c, 0.05, -0.75, 0.04, '#c0392b', false); circ(c, -0.07, -0.66, 0.04, '#c0392b', false);
};

Draw.penjamin = (c, a) => {
  const up = a.e ? (a.e.flags & 8 ? 0 : 1) : 1;
  ell(c, 0, -0.08, 0.6, 0.25, '#5a4630');
  ell(c, 0, -0.08, 0.42, 0.16, '#2a1f14', false);
  if (up) {
    rrect(c, -0.16, -1.6, 0.32, 1.5, 0.12, '#dfe6e9');
    rrect(c, -0.16, -1.75, 0.32, 0.3, 0.1, '#2d3436');
    const glow = 0.5 + Math.sin(a.t * 6) * 0.5;
    circ(c, 0, -0.5, 0.06, `rgba(0,230,255,${0.4 + glow * 0.6})`);
    c.fillStyle = '#636e72'; c.font = 'bold 0.12px sans-serif'; c.save(); c.translate(0.05, -0.65); c.rotate(-Math.PI / 2); c.fillText('PENJAMIN', 0, 0); c.restore();
    if (a.atk > 0.2) { circ(c, 0.05, -1.95, 0.18 * a.atk + 0.08, 'rgba(230,230,230,0.8)', false); circ(c, 0.25, -2.1, 0.12 * a.atk + 0.05, 'rgba(230,230,230,0.6)', false); }
  } else {
    c.fillStyle = 'rgba(220,220,220,0.4)';
    circ(c, Math.sin(a.t * 2) * 0.1, -0.3 - (a.t % 1) * 0.3, 0.08, 'rgba(220,220,220,0.5)', false);
  }
};

Draw.microwave = (c, a) => {
  rrect(c, -0.75, -1.15, 1.5, 1.0, 0.1, '#ecf0f1');
  const on = a.e && a.e.tid && !(a.e.flags & 16);
  rrect(c, -0.62, -1.02, 0.95, 0.74, 0.06, on ? '#ffb347' : '#2d3436');
  if (on) { c.fillStyle = `rgba(255,255,200,${0.3 + Math.sin(a.t * 20) * 0.2})`; c.fillRect(-0.6, -1.0, 0.9, 0.7); }
  rrect(c, 0.42, -1.0, 0.24, 0.72, 0.04, '#bdc3c7');
  for (let i = 0; i < 3; i++) circ(c, 0.54, -0.88 + i * 0.16, 0.04, '#7f8c8d');
  c.fillStyle = '#2ecc71'; c.font = 'bold 0.12px monospace'; c.fillText(on ? '0:0' + (Math.floor(a.t * 2) % 10) : '12:00', 0.42, -0.32);
  rrect(c, -0.7, -0.15, 0.2, 0.08, 0.02, '#95a5a6'); rrect(c, 0.5, -0.15, 0.2, 0.08, 0.02, '#95a5a6');
};

Draw.portapotty = (c, a) => {
  rrect(c, -0.55, -1.6, 1.1, 1.55, 0.08, '#3498db');
  ell(c, 0, -1.62, 0.6, 0.15, '#2980b9');
  rrect(c, -0.4, -1.4, 0.8, 1.3, 0.05, '#5dade2');
  circ(c, 0.28, -0.75, 0.05, '#ddd');
  c.fillStyle = '#e74c3c'; c.fillRect(-0.15, -1.3, 0.3, 0.1);
  c.fillStyle = '#fff'; c.font = 'bold 0.08px sans-serif'; c.fillText('BUSY', -0.11, -1.22);
  for (let i = 0; i < 3; i++) {
    const fx = Math.sin(a.t * 5 + i * 2) * 0.5, fy = -1.9 + Math.cos(a.t * 7 + i) * 0.2;
    circ(c, fx, fy, 0.035, '#222', false);
  }
  if (a.atk > 0.5) { c.fillStyle = 'rgba(140,200,80,0.5)'; circ(c, 0, -0.8, 0.5 * a.atk, 'rgba(140,200,80,0.35)', false); }
};

// ---------- towers ----------
function raccoon(c, x, y, s, crown, throwing) {
  c.save(); c.translate(x, y); c.scale(s, s);
  ell(c, 0, -0.18, 0.2, 0.18, '#8d8d8d');
  circ(c, 0, -0.45, 0.2, '#9e9e9e');
  poly(c, [-0.18, -0.55, -0.14, -0.72, -0.05, -0.6], '#8d8d8d');
  poly(c, [0.18, -0.55, 0.14, -0.72, 0.05, -0.6], '#8d8d8d');
  ell(c, 0, -0.46, 0.18, 0.07, '#2d2d2d', false);
  circ(c, -0.07, -0.46, 0.04, '#fff', false); circ(c, 0.07, -0.46, 0.04, '#fff', false);
  circ(c, -0.07, -0.46, 0.02, OUT, false); circ(c, 0.07, -0.46, 0.02, OUT, false);
  circ(c, 0, -0.36, 0.03, OUT, false);
  if (throwing) line(c, 0.15, -0.25, 0.3, -0.5, 0.06, '#8d8d8d');
  if (crown) poly(c, [-0.17, -0.62, -0.17, -0.82, -0.09, -0.7, 0, -0.85, 0.09, -0.7, 0.17, -0.82, 0.17, -0.62], '#f1c40f');
  c.restore();
}
Draw.princess = (c, a, owner) => {
  ell(c, 0, -0.1, 1.45, 0.6, 'rgba(0,0,0,0.25)', false);
  rrect(c, -1.1, -2.1, 2.2, 2.05, 0.15, '#95a5a6');
  c.strokeStyle = '#7f8c8d'; c.lineWidth = 0.06;
  for (let i = 1; i < 5; i++) { c.beginPath(); c.moveTo(-1.1 + i * 0.44, -2.0); c.lineTo(-1.1 + i * 0.44, -0.15); c.stroke(); }
  ell(c, 0, -2.15, 1.25, 0.32, '#bdc3c7');
  ell(c, 0, -2.2, 0.3, 0.1, '#7f8c8d');
  c.fillStyle = TEAM[owner]; c.fillRect(-1.1, -1.3, 2.2, 0.35);
  _lw(c, 0.05); c.strokeRect(-1.1, -1.3, 2.2, 0.35);
  raccoon(c, 0, -2.25, 1.6, false, a.atk > 0.5);
};
Draw.king = (c, a, owner) => {
  ell(c, 0, -0.1, 2.0, 0.8, 'rgba(0,0,0,0.25)', false);
  rrect(c, -1.8, -2.4, 3.6, 2.3, 0.15, '#27ae60');
  c.fillStyle = '#229954'; c.fillRect(-1.8, -2.4, 3.6, 0.3);
  rrect(c, -1.9, -2.6, 3.8, 0.35, 0.08, '#1e8449');
  c.fillStyle = TEAM[owner]; c.fillRect(-1.0, -1.6, 2.0, 0.6);
  _lw(c, 0.05); c.strokeRect(-1.0, -1.6, 2.0, 0.6);
  c.fillStyle = '#fff'; c.font = 'bold 0.32px sans-serif'; c.textAlign = 'center'; c.fillText('TRASH', 0, -1.18); c.textAlign = 'left';
  circ(c, -1.3, -0.15, 0.18, '#222'); circ(c, 1.3, -0.15, 0.18, '#222');
  raccoon(c, 0, -2.6, 2.0, true, a.atk > 0.5);
};
Draw.rubble = (c) => {
  ell(c, 0, -0.2, 1.4, 0.55, '#7f8c8d');
  circ(c, -0.5, -0.4, 0.3, '#95a5a6'); circ(c, 0.4, -0.35, 0.35, '#a4b0be'); circ(c, 0, -0.65, 0.3, '#7f8c8d');
  rrect(c, -0.2, -0.9, 0.25, 0.4, 0.05, '#c0392b');
  ell(c, 0.7, -0.6, 0.18, 0.1, '#bdc3c7', true, 0.8);
};

// ---------- spell icons (for cards) ----------
Draw.meteor = (c, a) => {
  c.fillStyle = 'rgba(255,140,0,0.8)';
  poly(c, [-0.55, -1.25, -0.05, -0.75, -0.25, -0.55], '#ff9f1a', false);
  poly(c, [-0.35, -1.35, 0.1, -0.85, -0.05, -0.65], '#ffd32a', false);
  circ(c, 0.15, -0.45, 0.38, '#6d4c41');
  circ(c, 0.05, -0.55, 0.08, '#4e342e', false); circ(c, 0.28, -0.4, 0.1, '#4e342e', false); circ(c, 0.12, -0.25, 0.06, '#4e342e', false);
};
Draw.akpigeons = (c, a) => {
  pigeonBody(c, { t: a.t, walk: 0 }, 1.3, false);
  c.save(); c.translate(0.2, -0.45);
  rrect(c, -0.1, -0.05, 0.5, 0.1, 0.02, '#4e342e');
  line(c, 0.35, 0, 0.62, 0, 0.04, '#333');
  poly(c, [0.12, 0.05, 0.22, 0.05, 0.2, 0.22, 0.12, 0.2], '#4e342e');
  circ(c, 0.68, 0, 0.06, '#ffde59', false);
  c.restore();
};
Draw.toot = (c, a) => {
  const w = Math.sin(a.t * 4) * 0.04;
  for (const [x, y, r] of [[-0.3, -0.5, 0.3], [0.15, -0.6, 0.35], [0.0, -0.3, 0.3], [0.35, -0.35, 0.25], [-0.15, -0.8, 0.22]])
    circ(c, x + w, y, r, '#9ccc65');
  eyes(c, 0.05, -0.55, 0.1, 0.06, false);
  c.fillStyle = OUT; c.font = 'bold 0.25px sans-serif'; c.fillText('~', -0.55, -0.95);
};
Draw.blinker = (c, a) => {
  poly(c, [-0.45, 0, 0.45, 0, 0.1, -1.0, -0.1, -1.0], '#ff7f27');
  c.fillStyle = '#fff'; c.fillRect(-0.28, -0.5, 0.56, 0.12); c.fillRect(-0.18, -0.78, 0.36, 0.1);
  const on = Math.floor(a.t * 4) % 2;
  circ(c, -0.22, -1.15, 0.12, on ? '#ff3b3b' : '#550000');
  circ(c, 0.22, -1.15, 0.12, on ? '#220055' : '#3b6bff');
};
Draw.steroids = (c, a) => {
  c.save(); c.rotate(-0.7); c.translate(0, -0.2);
  rrect(c, -0.12, -0.9, 0.24, 0.8, 0.04, 'rgba(220,240,255,0.9)');
  c.fillStyle = '#e74c3c'; c.fillRect(-0.1, -0.55, 0.2, 0.42);
  rrect(c, -0.2, -1.0, 0.4, 0.1, 0.03, '#95a5a6');
  line(c, 0, -0.1, 0, 0.25, 0.03, '#bdc3c7');
  c.restore();
  c.fillStyle = '#e74c3c'; c.font = 'bold 0.3px sans-serif'; c.fillText('!', 0.3, -0.8);
};

Draw.hurricane = (c, a) => {
  const t = a.t || 0;
  for (let k = 0; k < 4; k++) {
    c.save(); c.translate(0, -0.55); c.rotate(t * 3 + k * 1.57);
    c.lineWidth = 0.12 - k * 0.02; c.strokeStyle = ['#9fb3c8', '#c3d3e2', '#e6eef5', '#7f97ad'][k];
    c.beginPath(); c.arc(0, 0, 0.18 + k * 0.12, 0, 4.2); c.stroke();
    c.restore();
  }
  circ(c, 0, -0.55, 0.08, '#e6eef5');
  poly(c, [0.3, -0.25, 0.42, -0.1, 0.34, -0.12, 0.4, 0.02], '#ffd23f', false);
};

// Pre-rendered 3D sprites (sprites/<id>.png + .json), filled in by main.js when they load.
const SPR = {};

// draw a card's picture into a small canvas
function drawCardIcon(cv, id) {
  const ctx = cv.getContext('2d');
  const w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);
  const def = DEFS[id];
  const sp = SPR[id];
  if (sp) {
    // fit the character's visible pixels (front, first frame) into the card
    const F = sp.frame, bb = sp.bb || { x: 0, y: 0, w: F, h: F };
    const s = Math.min(w * 0.92 / bb.w, h * 0.92 / bb.h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sp.img, bb.x, bb.y, bb.w, bb.h, (w - bb.w * s) / 2, h * 0.97 - bb.h * s, bb.w * s, bb.h * s);
    return;
  }
  let s = w / 2.0;
  let y = h * 0.92;
  if (def.r >= 0.8 || id === 'orville') s = w / 2.9;
  if (id === 'balloon') { s = w / 3.0; }
  if (def.air && id !== 'balloon') y = h * 0.95;
  if (def.count > 2) s = w / 1.6;
  if (id === 'hugepigeon') s = w / 3.2;
  if (def.kind === 'building') s = w / 2.4;
  ctx.save(); ctx.translate(w / 2, y); ctx.scale(s, s);
  const fn = Draw[id];
  if (fn) fn(ctx, { walk: 0, atk: 0, t: performance.now() / 1000, e: null }, 0);
  ctx.restore();
}
