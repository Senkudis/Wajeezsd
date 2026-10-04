const cap = require('./capture');
(async () => {
  for (const [url, role] of [['index.html', 'client'], ['client-order.html', 'client'], ['shop-detail.html?id=p1', 'client'], ['captain-orders.html', 'captain'], ['captain-dashboard.html', 'captain'], ['merchant-dashboard.html', 'merchant']]) {
    const r = await cap.shot({ url, role, out: 'scout/' + url.replace(/[?=].*/, '').replace('.html', '') + '.png', logRequests: true, dpr: 1.5, wait: 2500 });
    console.log(url, r.errs.slice(0, 3), '\n  ', (r.seen || []).slice(0, 12).join('\n   '));
  }
  await cap.close();
})();
