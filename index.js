(function () {
  function $(id) { return document.getElementById(id); }
  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  var cfg = window.RESCADOG || {};
  var ready = !!(window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !/PEGA/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY));
  var sb = ready ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  /* encuesta */
  var seenSi = $("seen-si"), seenNo = $("seen-no"), form = $("report-form"), noMsg = $("no-msg");
  function onSeen() { form.hidden = !seenSi.checked; noMsg.hidden = !seenNo.checked; }
  seenSi.addEventListener("change", onSeen);
  seenNo.addEventListener("change", onSeen);

  var rmsg = $("rmsg");
  function say(t, err) { rmsg.textContent = t || ""; rmsg.className = "rmsg" + (err ? " err" : ""); }

  function readForm() {
    var cond = document.querySelector('input[name="cond"]:checked');
    return {
      place: $("place").value.trim(), size: $("size").value, since: $("since").value,
      cond: cond ? cond.value : "", desc: $("desc").value.trim(),
      name: $("cname").value.trim(), phone: $("cphone").value
    };
  }
  function phoneDigits(v) {
    var d = String(v || "").replace(/\D/g, "");
    if (d.length === 11 && d.indexOf("51") === 0) d = d.slice(2);
    return d;
  }
  function phoneOk() { return /^9\d{8}$/.test(phoneDigits($("cphone").value)); }

  var busy = false, cooling = false;
  function applyAccess() {
    var ok = phoneOk();
    $("send").disabled = !ok || busy || cooling || !sb;
    $("phone-hint").hidden = ok;
  }
  $("cphone").addEventListener("input", applyAccess);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy || cooling) return;
    if (!sb) { say("Falta conectar la base de datos. Revisa el archivo LEEME.md.", true); return; }
    var r = readForm();
    if (r.place.length < 3) { say("Escribe dónde está el perrito (calle, parque o referencia).", true); $("place").focus(); return; }
    if (!phoneOk()) { say("Escribe tu número de WhatsApp para poder reportar.", true); $("cphone").focus(); return; }
    busy = true; applyAccess(); say("Enviando…");
    sb.rpc("submit_report", {
      p_place: r.place, p_size: r.size, p_since: r.since, p_cond: r.cond,
      p_descr: r.desc, p_name: r.name, p_phone: phoneDigits(r.phone), p_website: $("website").value
    }).then(function (res) {
      if (res.error) throw res.error;
      form.reset();
      say("¡Reporte enviado! Ya aparece en la lista. Gracias por avisar.");
      cooling = true; setTimeout(function () { cooling = false; applyAccess(); }, 8000);
      load();
    }).catch(function (err) {
      var m = String((err && err.message) || "");
      if (m.indexOf("telefono_invalido") >= 0) say("El número de WhatsApp no es válido. Debe tener 9 dígitos y empezar con 9.", true);
      else if (m.indexOf("demasiados_reportes") >= 0) say("Ya enviaste varios reportes hoy. Inténtalo mañana o escríbenos por el canal.", true);
      else say("No se pudo enviar el reporte. Revisa tu conexión e inténtalo otra vez.", true);
    }).then(function () { busy = false; applyAccess(); });
  });

  /* lista pública */
  var rows = null, failed = false;
  function ago(ts) {
    var s = Math.round((ts - Date.now()) / 1000), a = Math.abs(s);
    try {
      var f = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
      if (a < 3600) return f.format(Math.round(s / 60), "minute");
      if (a < 86400) return f.format(Math.round(s / 3600), "hour");
      return f.format(Math.round(s / 86400), "day");
    } catch (e) { return new Date(ts).toLocaleDateString("es-PE"); }
  }
  function chip(t, cls) { return mk("span", "chip" + (cls ? " " + cls : ""), t); }

  function render() {
    var list = $("list"); list.textContent = "";
    if (!sb) { list.appendChild(mk("div", "empty", "Falta conectar la base de datos (ver LEEME.md).")); $("count").textContent = ""; return; }
    if (rows === null) { list.appendChild(mk("div", "empty", failed ? "No se pudieron cargar los reportes. Revisa tu conexión." : "Cargando reportes…")); return; }
    $("count").textContent = rows.length ? rows.length + (rows.length === 1 ? " reporte" : " reportes") : "";
    if (!rows.length) { list.appendChild(mk("div", "empty", "Todavía no hay reportes. Si viste un perrito abandonado, sé la primera persona en avisar.")); return; }
    rows.forEach(function (it) {
      var c = mk("article", "rep-card"), top = mk("div", "rep-top");
      top.appendChild(mk("h4", null, it.place));
      top.appendChild(mk("span", "rep-when", ago(new Date(it.created_at).getTime())));
      c.appendChild(top);
      var chips = mk("div", "chips");
      chips.appendChild(chip(it.size));
      chips.appendChild(chip(it.cond, /herido|enfermo/i.test(it.cond) ? "warn" : ""));
      chips.appendChild(chip("Desde: " + String(it.since).toLowerCase()));
      chips.appendChild(it.handled ? chip("Atendido", "ok") : chip("Pendiente"));
      c.appendChild(chips);
      if (it.descr) c.appendChild(mk("p", "rep-desc", it.descr));
      list.appendChild(c);
    });
  }

  function load() {
    if (!sb) { render(); return; }
    sb.from("reports")
      .select("id,created_at,place,size,since,cond,descr,handled")
      .order("created_at", { ascending: false }).limit(60)
      .then(function (res) {
        if (res.error) { failed = true; } else { rows = res.data || []; failed = false; }
        render();
      });
  }

  render(); applyAccess(); load();
  setInterval(function () { if (!document.hidden) load(); }, 60000);
})();
