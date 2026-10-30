# تعديلات الـ Preview الثانية على comp/index.html (تُشغَّل مرةً واحدة)
p = 'comp/index.html'; s = open(p, encoding='utf8').read()
def rep(a, b):
    global s
    assert a in s, a[:80]; s = s.replace(a, b)

# ── الترويسة كما في التطبيق: الشعار الحقيقي يساراً والسؤال يميناً؛ «؟» تنكمش إلى نقطتها خرزةً ──
a = s.index("// ── الترويسة: السؤال الحقيقي"); b = s.index("let DOT0 = null;")
s = s[:a] + r'''// ── الترويسة كما في التطبيق: الشعار يساراً والسؤال يميناً على أخضر العلامة ──
// «؟» تُرسم وحدها: 1.55–2.05 تنكمش نحو نقطتها وتصير خرزةً بيضاء، ثم سكون قصير قبل السقوط
const Q = ['طلبك', 'وين', 'ماشي', 'اليوم'], QT = [0.35, 0.6, 0.85, 1.1], QS = 112, QY = 560, QR = 1780;
function header(t) {
  const dip = Math.sin(seg(t, 2.05, 2.28) * Math.PI) * 12;                       // Anticipation
  const up = eIn(seg(t, 2.22, 2.95)) * 0.6 + eOut(seg(t, 2.22, 2.95)) * 0.4;
  const oy = dip - up * (H + 40);
  if (oy <= -H - 30) return null;
  g.save(); g.translate(0, oy);
  g.fillStyle = COL.green; g.fillRect(0, -40, W, H + 40);
  // الشعار الحقيقي — جزءٌ من الترويسة منذ الإطار الأول، لا شاشة شعار
  if (IM.logo) { const la = eOut(seg(t, 0.0, 0.45)), lw = 380, lh = lw * IM.logo.height / IM.logo.width;
    g.globalAlpha = la; g.drawImage(IM.logo, 140, QY - lh * 0.62 + (1 - la) * 10, lw, lh); g.globalAlpha = 1; }
  g.font = `700 ${QS}px Cairo`; g.textBaseline = 'alphabetic'; g.direction = 'rtl'; g.textAlign = 'right';
  const sp = g.measureText(' ').width; let x = QR;
  Q.forEach((w, i) => { const p = eOut(seg(t, QT[i], QT[i] + 0.45)); g.globalAlpha = p; g.fillStyle = '#fff'; g.fillText(w, x, QY + (1 - p) * 18); x -= g.measureText(w).width + (i < 3 ? sp : 0); });
  const qw = g.measureText('؟').width, qx = x - qw / 2, dotY = QY - QS * 0.07;
  const p = eOut(seg(t, QT[3] + 0.12, QT[3] + 0.57)), col = seg(t, 1.55, 2.05);
  g.globalAlpha = p * (1 - seg(col, 0.55, 1));
  g.save(); g.translate(qx, dotY); g.scale(lerp(1, 0.5, ease(col)), lerp(1, 0.12, ease(col))); g.translate(-qx, -dotY);
  g.fillStyle = '#fff'; g.fillText('؟', x, QY + (1 - p) * 18); g.restore();
  g.globalAlpha = 1;
  const bead = { x: qx, y: dotY + oy, r: 15 * eOut(seg(col, 0.25, 1)) };
  g.restore();
  return bead;
}

''' + s[b:]

# ── الخرزة والخيط: سقوطٌ أبطأ (0.85 ث)، خيطٌ أعرض (7px)، سكونٌ بعد الهبوط ──
a = s.index("  // الخيط يتدلّى من نقطة «؟»"); b = s.index("  radar(c, t);")
s = s[:a] + r'''  // الخرزة تتدلّى من مكان «؟» بخيطٍ مشدود، الترويسة ترتفع، والخرزة تهبط على A الموضوعة تحتها تماماً
  const aS = P(c, A[0], A[1]);
  const hb = header(t); if (hb && t < 2.0) { DOT0 = { x: hb.x, y: hb.y }; DOTX = hb.x; }
  const d0 = DOT0 || { x: DOTX, y: QY };
  if (t >= 1.7 && t < 3.75) {
    const fall = seg(t, 2.25, 3.1), by = lerp(d0.y, aS.y, fall * fall), bx = d0.x;
    const top = hb ? hb.y : -40, free = seg(t, 2.85, 3.25), tipY = lerp(top, by, eOut(free) * 1.03);
    const onMap = t > 2.6;
    g.save(); g.lineCap = 'round'; g.strokeStyle = onMap ? COL.ui : '#fff'; g.lineWidth = 7;
    if (tipY < by - 4 && t >= 2.25) { g.beginPath(); g.moveTo(bx + (hb ? 0 : 5 * Math.sin(free * 8) * (1 - free)), tipY); g.lineTo(bx, by); g.stroke(); }
    const sq = t > 3.1 ? Math.sin(seg(t, 3.1, 3.3) * Math.PI) * 0.36 : 0;
    const r = t < 2.05 && hb ? hb.r : 15;
    g.fillStyle = onMap ? COL.ui : '#fff'; g.beginPath(); g.ellipse(bx, by + r * sq, r * (1 + sq), r * (1 - sq), 0, 0, 7); g.fill();
    if (onMap) { g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke(); }
    g.restore();
  }
  if (t < 3.0) header(t);
''' + s[b:]

# الكاميرا والتوقيتات الجديدة (كل ما بعد الهبوط يتأخّر ≈ 1 ث؛ سكون 3.1–3.6)
rep("const camTY0 = kf([[0, A[1]], [3.6, A[1]], [4.6, A[1] + 40], [8.2, A[1] + 40]]);", "const camTY0 = kf([[0, A[1]], [4.4, A[1]], [5.3, A[1] + 40], [8.35, A[1] + 40]]);")
rep("const camTX0 = kf([[0, A[0]], [8.2, A[0]]]);", "const camTX0 = kf([[0, A[0]], [8.35, A[0]]]);")
rep("const camD = kf([[0, 640], [2.6, 640], [3.4, 700], [4.6, 1180, x => eOut(x)], [7.6, 1220], [10, 860]]);", "const camD = kf([[0, 600], [3.6, 600], [4.4, 640], [5.4, 1080, x => eOut(x)], [7.8, 1110], [10, 820]]);")
rep("const camP = kf([[0, 0], [2.6, 0], [3.7, 52, x => spring(x * 0.9, 9, 0.92)], [8.2, 52], [10, 57]]);", "const camP = kf([[0, 0], [3.6, 0], [4.6, 52, x => spring(x * 0.9, 9, 0.92)], [8.35, 52], [10, 57]]);")
rep("const camY = kf([[0, 180], [2.6, 180], [3.7, 166, x => spring(x * 0.9, 9, 0.92)], [7.6, 170], [10, 162]]);", "const camY = kf([[0, 180], [3.6, 180], [4.6, 166, x => spring(x * 0.9, 9, 0.92)], [7.8, 170], [10, 162]]);")
rep("cx: lerp(DOTX, W / 2, ease(seg(t, 2.6, 3.7))), cy: lerp(H / 2 + 120, H / 2 + 170, ease(seg(t, 2.6, 3.7)))", "cx: lerp(DOTX, W / 2, ease(seg(t, 3.6, 4.6))), cy: lerp(H / 2 + 140, H / 2 + 190, ease(seg(t, 3.6, 4.6)))")
rep("const t = i / 60; const tgt = t <= 8.2 ? null", "const t = i / 60; const tgt = t <= 8.35 ? null")
rep("  city(c, seg(t, 1.75, 2.3));", "  city(c, seg(t, 2.2, 2.7));")
rep("const t0 = 3.2 + k * 0.7; if (t < t0 || t0 > 4.3) continue;", "const t0 = 4.0 + k * 0.7; if (t < t0 || t0 > 5.1) continue;")
rep("op = (1 - u) * 0.9 * (1 - seg(t, 4.3, 4.7));", "op = (1 - u) * 0.9 * (1 - seg(t, 5.1, 5.5));")
rep("g.lineWidth = 2.5; poly(c, pts); g.stroke(); g.restore();", "g.lineWidth = 3.5; poly(c, pts); g.stroke(); g.restore();")
rep("const g1 = eOut(seg(t, 3.6, 4.35)) * L1[L1.length - 1], g2 = ease(seg(t, 3.7, 4.55)) * L2[L2.length - 1];", "const g1 = eOut(seg(t, 4.4, 5.15)) * L1[L1.length - 1], g2 = ease(seg(t, 4.5, 5.35)) * L2[L2.length - 1];")
rep("const ret2 = ease(seg(t, 7.6, 8.25)) * L2[L2.length - 1];", "const ret2 = ease(seg(t, 7.7, 8.35)) * L2[L2.length - 1];")
rep("const dv = driveS(t), drive = t > 8.2 ?", "const dv = driveS(t), drive = t > 8.35 ?")
rep("  if (t >= 3.6) {\n    if (g2 - ret2 > 1)", "  if (t >= 4.4) {\n    if (g2 - ret2 > 1)")
rep("thread(c, sub(S2, L2, ret2, g2), 4, COL.ui);", "thread(c, sub(S2, L2, ret2, g2), 6, COL.ui);")
rep("    if (t <= 8.2) { if (g1 > 1) thread(c, sub(S1, L1, 0, g1), 4.5, COL.ui); }", "    if (t <= 8.35) { if (g1 > 1) thread(c, sub(S1, L1, 0, g1), 6.5, COL.ui); }")
rep("      if (lead - dv > 1) thread(c, sub(DRV, LD, dv, lead), 4.5, COL.ui);", "      if (lead - dv > 1) thread(c, sub(DRV, LD, dv, lead), 6.5, COL.ui);")
rep("      const lead = LR + eOut(seg(t, 9.0, 10.4))", "      const lead = LR + eOut(seg(t, 9.1, 10.4))")
rep("function driveS(t) { if (t <= 8.2) return 0; if (t <= 9.3) return LR * ease(seg(t, 8.2, 9.3)); return LR + 260 * eIn(seg(t, 9.3, 9.7)) * 0.4 + 260 * Math.max(0, t - 9.7); }",
    "function driveS(t) { if (t <= 8.35) return 0; if (t <= 9.35) return LR * ease(seg(t, 8.35, 9.35)); return LR + 260 * eIn(seg(t, 9.35, 9.75)) * 0.4 + 260 * Math.max(0, t - 9.75); }")
rep("  pin(c, 2.55, t);", "  pin(c, 3.6, t);\n  searchLabel(c, t);")
rep("const a1 = t >= 4.3 ? captain(c, drive || WD.C1, 4.3, t,", "const a1 = t >= 5.1 ? captain(c, drive || WD.C1, 5.1, t,")
rep("const a2 = t >= 4.5 ? captain(c, WD.C2, 4.5, t,", "const a2 = t >= 5.3 ? captain(c, WD.C2, 5.3, t,")
rep("1 - 0.55 * seg(t, 7.8, 8.3)", "1 - 0.55 * seg(t, 7.9, 8.4)")
rep("  const s = P(c, pos[0], pos[1]); const r = 30 * p;", "  const s = P(c, pos[0], pos[1]); const r = 36 * p;")
rep("  const s = P(c, A[0], A[1]); const sz = 70 * p;", "  const s = P(c, A[0], A[1]); const sz = 84 * p;")

# ── «جاري البحث عن كابتن» (نص التطبيق الحقيقي) تحت الدبوس أثناء البحث ──
rep("// بطاقة عرض حقيقية تنهض من كابتنها", r'''function searchLabel(c, t) {
  const a = eOut(seg(t, 4.05, 4.4)) * (1 - seg(t, 5.15, 5.45)); if (a <= 0) return;
  const s = P(c, A[0], A[1]);
  g.save(); g.globalAlpha = a; g.font = '700 44px Cairo'; g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = g.measureText('جاري البحث عن كابتن').width + 64, y = s.y + 92 + (1 - a) * 10;
  g.fillStyle = '#fff'; g.shadowColor = 'rgba(16,36,28,.12)'; g.shadowBlur = 24; g.shadowOffsetY = 8; rr(s.x - w / 2, y - 38, w, 76, 38); g.fill(); g.shadowBlur = 0;
  g.fillStyle = COL.green; g.fillText('جاري البحث عن كابتن', s.x, y + 2); g.restore();
}
// بطاقة عرض حقيقية تنهض من كابتنها''')

# ── بطاقة العرض: تُبنى بأنماط بطاقة التطبيق الحقيقية، بلا اسم ولا تقييم ولا عدّاد ──
a = s.index("function offer(im, anchor, t0, t, side, out) {"); b = s.index("function touch(")
s = s[:a] + r'''// نص الاسم «كابتن» هو ما يعرضه التطبيق حين لا يكون للكابتن اسم (client-my-orders.html)،
// «عرضه» تسمية صندوق السعر نفسها، ونوع المركبة من utils/vehicleTypes.js. لا أرقام.
const CARD_W = 640, CARD_H = 330;
function drawCard(x, y, sc, d) {
  const w = CARD_W * sc, h = CARD_H * sc, u = v => v * sc;
  g.save(); g.shadowColor = 'rgba(4,140,91,.14)'; g.shadowBlur = u(36); g.shadowOffsetY = u(14);
  g.fillStyle = '#fff'; rr(x, y, w, h, u(28)); g.fill(); g.shadowBlur = 0; g.shadowOffsetY = 0;
  g.strokeStyle = 'rgba(4,140,91,.22)'; g.lineWidth = u(2.5); g.stroke();
  g.direction = 'rtl'; g.textBaseline = 'middle';
  // الصورة الرمزية: تدرّج التطبيق (primary ← #10b981) وأيقونة المركبة
  const ax = x + w - u(78), ay = y + u(78), ar = u(48);
  const gr = g.createLinearGradient(ax - ar, ay - ar, ax + ar, ay + ar); gr.addColorStop(0, '#04553A'); gr.addColorStop(1, '#10b981');
  g.fillStyle = '#fff'; g.beginPath(); g.arc(ax, ay, ar + u(4), 0, 7); g.fill(); g.fillStyle = gr; g.beginPath(); g.arc(ax, ay, ar, 0, 7); g.fill();
  glyph(d.icon, ax, ay + u(2), u(50), '#fff');
  g.textAlign = 'right'; g.fillStyle = '#0f172a'; g.font = `800 ${u(50)}px Cairo`; g.fillText('كابتن', ax - ar - u(24), y + u(60));
  g.fillStyle = '#64748b'; g.font = `600 ${u(34)}px Cairo`; g.fillText(d.vehicle, ax - ar - u(24), y + u(112));
  // صندوق السعر
  const bx = x + u(26), by = y + u(26), bw = u(190), bh = u(130);
  g.fillStyle = '#f0fdf4'; rr(bx, by, bw, bh, u(18)); g.fill(); g.strokeStyle = '#bbf7d0'; g.lineWidth = u(2); g.stroke();
  g.textAlign = 'center'; g.fillStyle = '#166534'; g.font = `700 ${u(30)}px Cairo`; g.fillText('عرضه', bx + bw / 2, by + u(34));
  g.fillStyle = '#16a34a'; g.font = `900 ${u(52)}px Cairo`; g.fillText(d.price, bx + bw / 2, by + u(88));
  // الأزرار: «قبول العرض» (bi-check-lg) و«رفض» (bi-x-lg)
  const kx = x + w - u(26), ky = y + h - u(108), kw = u(330), kh = u(82);
  g.fillStyle = d.pressed ? '#04553A' : '#198754'; rr(kx - kw, ky, kw, kh, u(41)); g.fill();
  g.fillStyle = '#fff'; g.font = `700 ${u(38)}px Cairo`; g.fillText('قبول العرض', kx - kw / 2 + u(16), ky + kh / 2 + u(2));
  glyph('', kx - kw + u(44), ky + kh / 2, u(34), '#fff');
  g.direction = 'rtl'; g.textAlign = 'center'; g.fillStyle = '#dc3545'; g.font = `700 ${u(36)}px Cairo`; g.fillText('رفض', x + u(150), ky + kh / 2 + u(2));
  glyph('', x + u(220), ky + kh / 2, u(28), '#dc3545');
  g.restore();
  return { price: { x: bx, y: by, w: bw, h: bh } };
}
// offerIn بشخصيته: البطاقة تنهض من كابتنها بوزنٍ يستقر، معلّقةً بالخيط
function offer(d, anchor, t0, t, side, out) {
  const p = spring(t - t0, 11, 0.86); if (p <= 0 || !anchor) return null;
  const w = CARD_W, h = CARD_H, tx = anchor.x + side * 24, ty = anchor.y - 50 - h;
  let x = lerp(anchor.x - w * 0.08, tx - w / 2, p), y = lerp(anchor.y - 20, ty, p), sc = lerp(0.12, 1, p), a = clamp(p * 1.6);
  if (out) { x = lerp(x, anchor.x, out.k); y = lerp(y, anchor.y, out.k); sc *= lerp(1, 0.05, out.k); a *= 1 - seg(out.k, 0.6, 1); y += out.sag || 0; }
  const cw = w * sc, ch = h * sc, cx = x + (w - cw) / 2, cy = y + (h - ch);
  g.save(); g.globalAlpha = a; g.strokeStyle = COL.ui; g.lineWidth = 4; g.beginPath(); g.moveTo(anchor.x, anchor.y);
  const sag = out ? (out.sag || 0) * 1.6 : 0;
  g.quadraticCurveTo(anchor.x + sag * 0.3, (anchor.y + cy + ch) / 2 + sag, cx + cw / 2, cy + ch - 2); g.stroke();
  const r = drawCard(cx, cy, sc, d);
  g.restore();
  return { x: cx, y: cy, w: cw, h: ch, sc, price: r.price };
}
''' + s[b:]
rep("  const o2 = a2 ? offer(IM.card2, a2, 5.15, t, -1, out2) : null;\n  const o1 = a1 ? offer(IM.card1, a1, 4.8, t, 1, out1) : null;",
    "  const o2 = a2 ? offer({ icon: '\\uf8ac', vehicle: 'ركشة', price: 'سعره' }, a2, 5.75, t, -1, out2) : null;\n  const o1 = a1 ? offer({ icon: '\\uf8ab', vehicle: 'دراجة نارية', price: 'سعرك', pressed: t > 7.5 && t < 7.62 }, a1, 5.4, t, 1, out1) : null;")
rep("const out2 = t >= 7.45 ? { k: ease(seg(t, 7.55, 8.15)), sag: Math.sin(seg(t, 7.45, 7.75) * Math.PI / 2) * 26 } : null;",
    "const out2 = t >= 7.6 ? { k: ease(seg(t, 7.7, 8.3)), sag: Math.sin(seg(t, 7.6, 7.9) * Math.PI / 2) * 26 } : null;")
rep("const out1 = t >= 7.7 ? { k: ease(seg(t, 7.7, 8.2)) } : null;", "const out1 = t >= 7.85 ? { k: ease(seg(t, 7.85, 8.35)) } : null;")

# ── حقل «سعرك»: أنماط حقل السعر في التطبيق (+/− أخضر، الحقل بإطارٍ داكن)، بلا رقم ──
a = s.index("  // حقل السعر الحقيقي: يرتفع من الدبوس"); b = s.index("  // العروض: تنهض من الكابتن")
s = s[:a] + r'''  // حقل «سعرك»: بأنماط حقل السعر في التطبيق (index.html#price)، بلا رقم؛ priceBump مرةً واحدة حين يثبت
  let pill = null;
  if (t >= 3.75) {
    const p = spring(t - 3.75, 12, 0.85), bump = Math.sin(seg(t, 3.95, 4.3) * Math.PI) * 0.06, shrink = ease(seg(t, 7.95, 8.4));
    const sc = (1 + bump) * lerp(1, 0.1, shrink), w = 470 * sc, h = 96 * sc;
    const x = aS.x - w / 2, y = lerp(aS.y - 20, aS.y + 60 + h / 2, p), py = lerp(y, aS.y - 40, shrink);
    g.save(); g.globalAlpha = clamp(p * 1.5) * (1 - seg(shrink, 0.7, 1));
    g.shadowColor = 'rgba(16,36,28,.14)'; g.shadowBlur = 30; g.shadowOffsetY = 12;
    g.fillStyle = '#198754'; rr(x, py - h / 2, w, h, 16 * sc); g.fill(); g.shadowBlur = 0;
    g.fillStyle = '#ecfdf3'; rr(x + 92 * sc, py - h / 2 + 8 * sc, w - 184 * sc, h - 16 * sc, 12 * sc); g.fill();
    g.strokeStyle = '#0b3d2a'; g.lineWidth = 4 * sc; g.stroke();
    g.fillStyle = '#fff'; g.font = `300 ${54 * sc}px Cairo`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('+', x + 46 * sc, py + 2 * sc); g.fillText('−', x + w - 46 * sc, py + 2 * sc);
    g.fillStyle = '#04553A'; g.direction = 'rtl'; g.font = `800 ${50 * sc}px Cairo`; g.fillText('سعرك', x + w / 2, py + 4 * sc);
    g.restore();
    pill = { x: x + w * 0.3, y: py - h / 2 };
  }

''' + s[b:]
# خيط السعر الذهبي: من «سعرك» إلى صندوق «سعرك» في العرض المطابق
rep("  if (pill && o1 && t >= 5.7 && t < 7.75) {\n    const pr = { x: o1.x + o1.w * 0.03, y: o1.y + o1.h * 0.2 };\n    const k = eOut(seg(t, 5.7, 6.3)), a = 1 - seg(t, 7.45, 7.75);",
    "  if (pill && o1 && o1.price && t >= 6.15 && t < 7.9) {\n    const pr = { x: o1.price.x, y: o1.price.y + o1.price.h * 0.6 };\n    const k = eOut(seg(t, 6.15, 6.75)), a = 1 - seg(t, 7.6, 7.9);")
rep("    if (k > 0.98) { g.lineWidth = 3; rr(o1.x + o1.w * 0.03, o1.y + o1.h * 0.04, o1.w * 0.22, o1.h * 0.33, 14 * o1.sc); g.stroke(); }",
    "    if (k > 0.98) { g.lineWidth = 4; rr(o1.price.x - 6, o1.price.y - 6, o1.price.w + 12, o1.price.h + 12, 22); g.stroke(); }")
rep("g.save(); g.globalAlpha = a; g.strokeStyle = COL.gold; g.lineWidth = 3; g.lineCap = 'round';", "g.save(); g.globalAlpha = a; g.strokeStyle = COL.gold; g.lineWidth = 5; g.lineCap = 'round';")
# الضغط على «قبول العرض»
rep("if (o1) touch(o1.x + o1.w * 0.72, o1.y + o1.h * 0.8, t, 7.35);", "if (o1) touch(o1.x + o1.w * 0.72, o1.y + o1.h * 0.8, t, 7.5);")
rep("const v = seg(t, 6.75, 6.95) * (1 - seg(t, 7.65, 7.85)); if (v <= 0) return;", "const v = seg(t, 6.95, 7.15) * (1 - seg(t, 7.8, 8.0)); if (v <= 0) return;")
# الصور: الشعار بدل لقطات البطاقات
rep("for (const k of ['card1', 'card2', 'price']) IM[k] = await load('../assets/' + k + '.png');", "IM.logo = await load('../assets/logo-white.png');")
# نسبة الخريطة تظهر مع المدينة
rep("const att = seg(t, 2.2, 2.6);", "const att = seg(t, 2.6, 3.0);")
open(p, 'w', encoding='utf8').write(s)
print('patched')
