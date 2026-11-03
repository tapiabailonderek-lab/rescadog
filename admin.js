(function () {
  function $(id) { return document.getElementById(id); }
  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function chip(t, cls) { return mk("span", "chip" + (cls ? " " + cls : ""), t); }

  var cfg = window.RESCADOG || {};
  var ready = !!(window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !/PEGA/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY));
  var sb = ready ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  var A = { filter: "pendientes", q: "", rows: null };
  var timer = null;

  function gmsg(t, err) { var m = $("g-msg"); m.textContent = t || ""; m.className = "rmsg" + (err ? " err" : ""); }

  function showPanel(on) {
    $("gate").hidden = on; $("panel").hidden = !on;
    clearInterval(timer);
    if (on) { load(); timer = setInterval(function () { if (!document.hidden) load(); }, 30000); }
  }

  function checkSession() {
    if (!sb) { gmsg("Falta conectar la base de datos. Revisa el archivo LEEME.md.", true); $("g-btn").disabled = true; return; }
    sb.auth.getSession().then(function (r) {
      if (r.data && r.data.session) verifyAdmin(); else showPanel(false);
    });
  }

  function verifyAdmin() {
    return sb.rpc("is_admin").then(function (r) {
      if (r.data === true) { showPanel(true); return; }
      return sb.auth.signOut().then(function () {
        showPanel(false);
        gmsg("Esta cuenta no tiene permiso de administrador.", true);
      });
    });
  }

  $("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!sb) return;
    var mail = $("g-mail").value.trim(), pass = $("g-pass").value;
    if (!mail || !pass) { gmsg("Escribe tu correo y tu contraseña.", true); return; }
    $("g-btn").disabled = true; gmsg("Verificando…");
    sb.auth.signInWithPassword({ email: mail, password: pass }).then(function (r) {
      if (r.error) { gmsg("Correo o contraseña incorrectos.", true); return; }
      $("g-pass").value = ""; gmsg("");
      return verifyAdmin();
    }).catch(function () {
      gmsg("No se pudo verificar. Revisa tu conexión.", true);
    }).then(function () { $("g-btn").disabled = false; });
  });

  $("adm-out").addEventListener("click", function () {
    sb.auth.signOut().then(function () { A.rows = null; showPanel(false); });
  });
  $("adm-refresh").addEventListener("click", load);
  $("adm-q").addEventListener("input", function () { A.q = this.value.trim(); render(); });
  Array.prototype.forEach.call(document.querySelectorAll("[data-f]"), function (b) {
    b.addEventListener("click", function () { A.filter = b.getAttribute("data-f"); render(); });
  });

  function load() {
    sb.from("reports")
      .select("id,created_at,place,size,since,cond,descr,handled,contacts(name,phone)")
      .order("created_at", { ascending: false }).limit(500)
      .then(function (r) {
        if (r.error) { if (A.rows === null) A.rows = []; }
        else A.rows = r.data || [];
        render();
      });
  }

  function waLink(phone) {
    var d = String(phone || "").replace(/\D/g, "");
    if (d.length === 9) d = "51" + d;
    return d.length >= 10 ? "https://wa.me/" + d : null;
  }
  function contactOf(r) {
    var c = r.contacts;
    if (Array.isArray(c)) c = c[0];
    return c || null;
  }

  function edit(op, id, handled) {
    var p = op === "delete"
      ? sb.from("reports").delete().eq("id", id)
      : sb.from("reports").update({ handled: handled }).eq("id", id);
    p.then(function (r) { if (r.error) alert("No se pudo guardar el cambio."); load(); });
  }

  function render() {
    var rows = A.rows || [];
    var pend = rows.filter(function (r) { return !r.handled; });
    var urg = pend.filter(function (r) { return /herido|enfermo/i.test(r.cond); });
    $("st-total").textContent = rows.length;
    $("st-pend").textContent = pend.length;
    $("st-done").textContent = rows.length - pend.length;
    $("st-urg").textContent = urg.length;
    Array.prototype.forEach.call(document.querySelectorAll("[data-f]"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-f") === A.filter));
    });
    var q = A.q.toLowerCase();
    var shown = rows.filter(function (r) {
      if (A.filter === "pendientes" && r.handled) return false;
      if (A.filter === "atendidos" && !r.handled) return false;
      if (q && ((r.place || "") + " " + (r.descr || "")).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var box = $("adm-list"); box.textContent = "";
    if (A.rows === null) { box.appendChild(mk("div", "empty", "Cargando reportes…")); return; }
    if (!shown.length) { box.appendChild(mk("div", "empty", rows.length ? "Ningún reporte coincide con este filtro." : "Aún no hay reportes.")); return; }
    shown.forEach(function (it) {
      var c = mk("article", "rep-card"), top = mk("div", "rep-top");
      top.appendChild(mk("h4", null, it.place));
      top.appendChild(mk("span", "rep-when", new Date(it.created_at).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })));
      c.appendChild(top);
      var chips = mk("div", "chips");
      chips.appendChild(chip(it.size));
      chips.appendChild(chip(it.cond, /herido|enfermo/i.test(it.cond) ? "warn" : ""));
      chips.appendChild(chip("Desde: " + String(it.since).toLowerCase()));
      chips.appendChild(it.handled ? chip("Atendido", "ok") : chip("Pendiente"));
      c.appendChild(chips);
      if (it.descr) c.appendChild(mk("p", "rep-desc", it.descr));

      var ad = mk("div", "admin"), who = mk("span", "who"), ct = contactOf(it);
      if (ct && (ct.phone || ct.name)) {
        who.appendChild(document.createTextNode("Contacto: " + [ct.name, ct.phone].filter(Boolean).join(" · ") + " "));
        var wl = waLink(ct.phone);
        if (wl) { var a = mk("a", null, "Abrir WhatsApp"); a.href = wl; a.target = "_blank"; a.rel = "noopener"; who.appendChild(a); }
      } else who.textContent = "Sin contacto";
      ad.appendChild(who);

      var b1 = mk("button", "btn btn-ghost btn-sm", it.handled ? "Marcar pendiente" : "Marcar atendido"); b1.type = "button";
      b1.addEventListener("click", function () { edit("toggle", it.id, !it.handled); });
      var b2 = mk("button", "btn btn-ghost btn-sm", "Eliminar"); b2.type = "button";
      var armed = false;
      b2.addEventListener("click", function () {
        if (!armed) { armed = true; b2.textContent = "¿Seguro? Eliminar"; setTimeout(function () { armed = false; b2.textContent = "Eliminar"; }, 4000); return; }
        edit("delete", it.id);
      });
      ad.appendChild(b1); ad.appendChild(b2); c.appendChild(ad);
      box.appendChild(c);
    });
  }

  checkSession();
})();
