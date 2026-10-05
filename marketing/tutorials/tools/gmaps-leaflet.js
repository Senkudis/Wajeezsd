/* محوّل google.maps فوق Leaflet — لالتقاط شاشات التطبيق بخرائط حقيقية
   (OpenStreetMap) أثناء إنتاج الإعلان. المفتاح الحقيقي في الخادم فقط. */
(function () {
  function ll(p) { return (typeof p.lat === 'function') ? [p.lat(), p.lng()] : [p.lat, p.lng]; }
  function LatLng(a, b) { this._a = a; this._b = b; }
  LatLng.prototype.lat = function () { return this._a; };
  LatLng.prototype.lng = function () { return this._b; };
  function iconFor(o) {
    var ic = o.icon;
    if (ic && ic.url) return L.icon({ iconUrl: ic.url, iconSize: [ic.scaledSize.width, ic.scaledSize.height], iconAnchor: [ic.anchor.x, ic.anchor.y] });
    if (ic && ic.path === 0) {
      var d = ic.scale * 2, lbl = o.label ? o.label.text : '';
      return L.divIcon({ className: '', iconSize: [d, d], iconAnchor: [d / 2, d / 2],
        html: '<div style="width:' + d + 'px;height:' + d + 'px;border-radius:50%;background:' + ic.fillColor + ';border:' + ic.strokeWeight + 'px solid ' + ic.strokeColor + ';color:#fff;font:800 12px Cairo;display:flex;align-items:center;justify-content:center;box-sizing:border-box">' + lbl + '</div>' });
    }
    return new L.Icon.Default();
  }
  function mapOf(o) { return o && o.map && o.map._m; }
  window.google = { maps: {
    LatLng: LatLng,
    Size: function (w, h) { this.width = w; this.height = h; },
    Point: function (x, y) { this.x = x; this.y = y; },
    SymbolPath: { CIRCLE: 0 }, TravelMode: { DRIVING: 'DRIVING' }, DirectionsStatus: { OK: 'OK' },
    Animation: { DROP: 1, BOUNCE: 2 },
    InfoWindow: function () { this.open = function () {}; this.close = function () {}; this.setContent = function () {}; },
    DirectionsService: function () { this.route = function (r, cb) { cb && cb(null, 'ZERO_RESULTS'); }; },
    DirectionsRenderer: function () { this.setMap = function () {}; this.setDirections = function () {}; },
    geometry: {
      spherical: { computeDistanceBetween: function (a, b) { return L.latLng(ll(a)).distanceTo(L.latLng(ll(b))); } },
      poly: { containsLocation: function (p, poly) {
        var x = ll(p), pts = poly._pts || [], inside = false;
        for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          var yi = pts[i][0], xi = pts[i][1], yj = pts[j][0], xj = pts[j][1];
          if (((yi > x[0]) !== (yj > x[0])) && (x[1] < (xj - xi) * (x[0] - yi) / (yj - yi) + xi)) inside = !inside;
        }
        return inside;
      } }
    },
    event: { addListener: function () {}, trigger: function () {} },
    LatLngBounds: function () { this._b = L.latLngBounds([]); this.extend = function (p) { this._b.extend(ll(p)); return this; }; this.isEmpty = function () { return !this._b.isValid(); }; },
    Map: function (el, o) {
      var c = o.center || { lat: 15.59, lng: 32.53 };
      var m = L.map(el, { zoomControl: false, attributionControl: false }).setView(ll(c), o.zoom || 13);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m);
      this._m = m; window.__lmap = m;
      this.fitBounds = function (b, pad) { pad = pad || {}; if (typeof pad === 'number') pad = { top: pad, bottom: pad, left: pad, right: pad }; m.fitBounds(b._b, { paddingTopLeft: [pad.left || 0, pad.top || 0], paddingBottomRight: [pad.right || 0, pad.bottom || 0] }); };
      this.panTo = function (p) { m.panTo(ll(p)); }; this.setCenter = function (p) { m.setView(ll(p)); };
      this.setZoom = function (z) { m.setZoom(z); }; this.getZoom = function () { return m.getZoom(); };
      this.addListener = function () { return { remove: function () {} }; }; this.setOptions = function () {};
      this.getCenter = function () { var q = m.getCenter(); return new LatLng(q.lat, q.lng); };
    },
    Marker: function (o) {
      var mm = mapOf(o);
      var mk = L.marker(ll(o.position), { icon: iconFor(o), zIndexOffset: o.zIndex || 0, opacity: o.opacity == null ? 1 : o.opacity });
      if (mm) mk.addTo(mm);
      this.setPosition = function (p) { mk.setLatLng(ll(p)); };
      this.getPosition = function () { var q = mk.getLatLng(); return new LatLng(q.lat, q.lng); };
      this.setIcon = function (ic) { o.icon = ic; mk.setIcon(iconFor(o)); };
      this.setMap = function (x) { if (!x) mk.remove(); else if (x._m) mk.addTo(x._m); };
      this.addListener = function () {}; this.setAnimation = function () {}; this.setTitle = function () {}; this.setZIndex = function () {};
      if (o.zIndex === 999) window.__capMarker = this;
    },
    Polyline: function (o) {
      var mm = mapOf(o); var dashed = !!o.icons;
      var pl = L.polyline((o.path || []).map(ll), { color: o.strokeColor, weight: dashed ? 3 : (o.strokeWeight || 4), opacity: dashed ? 0.6 : (o.strokeOpacity || 1), dashArray: dashed ? '6 9' : null });
      if (mm) pl.addTo(mm);
      this.setMap = function (x) { if (!x) pl.remove(); }; this.setPath = function (p) { pl.setLatLngs(p.map(ll)); };
    },
    // منطقة التوصيل: مضلّع، وفحص «داخل المنطقة» كما في geometry.poly
    Polygon: function (o) {
      var mm = mapOf(o); var pts = (o.paths || []).map(ll);
      var pg = L.polygon(pts, { color: o.strokeColor, weight: o.strokeWeight || 2, opacity: o.strokeOpacity == null ? 1 : o.strokeOpacity, fillColor: o.fillColor, fillOpacity: o.fillOpacity == null ? .1 : o.fillOpacity, interactive: false });
      if (mm) pg.addTo(mm);
      this._pts = pts;
      this.setMap = function (x) { if (!x) pg.remove(); else if (x._m) pg.addTo(x._m); };
      this.getPath = function () { return { getArray: function () { return pts.map(function (q) { return new LatLng(q[0], q[1]); }); }, getLength: function () { return pts.length; } }; };
      this.getPaths = this.getPath; this.addListener = function () {}; this.setOptions = function () {};
    },
    Circle: function (o) {
      var mm = mapOf(o);
      var c = L.circle(ll(o.center), { radius: o.radius, color: o.strokeColor, weight: o.strokeWeight, fillColor: o.fillColor, fillOpacity: o.fillOpacity, opacity: o.strokeOpacity });
      if (mm) c.addTo(mm);
      this.setOptions = function (x) { if (x.radius != null) c.setRadius(x.radius); if (x.center) c.setLatLng(ll(x.center)); c.setStyle({ fillOpacity: x.fillOpacity, opacity: x.strokeOpacity }); };
      this.setRadius = function (r) { c.setRadius(r); }; this.setCenter = function (p) { c.setLatLng(ll(p)); };
      this.getCenter = function () { var q = c.getLatLng(); return new LatLng(q.lat, q.lng); }; this.setMap = function (x) { if (!x) c.remove(); };
    }
  } };
})();
