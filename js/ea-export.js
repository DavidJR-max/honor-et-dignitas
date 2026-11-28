/* Exportador de estadísticas de Mysting Team FC desde la API pública de EA.
   Se ejecuta como marcador (bookmarklet) estando en una página de proclubs.ea.com:
   la API solo permite peticiones desde su propio dominio (CORS + CSP default-src 'self').
   Abre la web del club en otra pestaña y le envía los datos con postMessage; la web los combina
   con el historial y los publica en GitHub. Si no puede abrir la web, descarga mysting-export.json.
   SITE lo rellena estadisticas.html al generar el marcador.
   Usar solo comentarios de bloque: el archivo se convierte en una URL javascript:. */
(async function () {
  var PLATFORM = "common-gen5";
  var CLUB_ID = "2317755";
  var SITE = "__SITE__";

  if (location.hostname !== "proclubs.ea.com") {
    alert("Abre primero https://proclubs.ea.com/api/fc/clubs/info?platform=common-gen5&clubIds=2317755 y pulsa el marcador en esa pestaña.");
    return;
  }

  /* La pestaña se abre ya, durante el clic: si se abriera al terminar la descarga, el navegador la bloquearía */
  var siteOrigin = SITE.indexOf("http") === 0 ? new URL(SITE).origin : null;
  var win = siteOrigin ? window.open(SITE + "?r=" + Date.now() + "#recibir", "mysting-update") : null;
  var ready = new Promise(function (resolve) {
    function onMsg(e) {
      if (e.origin === siteOrigin && e.data && e.data.type === "mysting-ready") {
        window.removeEventListener("message", onMsg);
        resolve(true);
      }
    }
    if (!win) return resolve(false);
    window.addEventListener("message", onMsg);
    setTimeout(function () { resolve(false); }, 30000);
  });

  function api(path) {
    return fetch("/api/fc/" + path).then(function (r) {
      if (!r.ok) throw new Error(r.status + " en " + path);
      return r.json();
    });
  }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

  function trimMember(m) {
    return {
      name: m.name, proName: m.proName || "", proPos: m.proPos != null ? +m.proPos : null,
      proOverall: num(m.proOverall), favoritePosition: m.favoritePosition || "",
      gamesPlayed: num(m.gamesPlayed), goals: num(m.goals), assists: num(m.assists),
      mom: num(m.manOfTheMatch), ratingAve: num(m.ratingAve), winRate: num(m.winRate),
      passesMade: num(m.passesMade), passSuccessRate: num(m.passSuccessRate),
      shotSuccessRate: num(m.shotSuccessRate), tacklesMade: num(m.tacklesMade),
      tackleSuccessRate: num(m.tackleSuccessRate), cleanSheetsDef: num(m.cleanSheetsDef),
      cleanSheetsGK: num(m.cleanSheetsGK), redCards: num(m.redCards)
    };
  }

  function trimOverall(o) {
    o = o || {};
    return {
      gamesPlayed: num(o.gamesPlayed), wins: num(o.wins), ties: num(o.ties), losses: num(o.losses),
      goals: num(o.goals), goalsAgainst: num(o.goalsAgainst), skillRating: num(o.skillRating),
      bestDivision: o.bestDivision != null ? num(o.bestDivision) : null,
      currentDivision: o.currentDivision != null ? num(o.currentDivision) : null,
      promotions: num(o.promotions), relegations: num(o.relegations),
      wstreak: num(o.wstreak), unbeatenstreak: num(o.unbeatenstreak)
    };
  }

  function trimPlayer(p) {
    return {
      name: p.playername, pos: p.pos, rating: num(p.rating), goals: num(p.goals),
      assists: num(p.assists), shots: num(p.shots), passesMade: num(p.passesmade),
      passAttempts: num(p.passattempts), tacklesMade: num(p.tacklesmade),
      tackleAttempts: num(p.tackleattempts), saves: num(p.saves), mom: num(p.mom),
      redCards: num(p.redcards), cleanSheet: num(p.cleansheetsany),
      minutes: Math.round(num(p.secondsPlayed) / 60)
    };
  }

  function trimMatch(m, type) {
    var ids = Object.keys(m.clubs);
    var oppId = ids.filter(function (i) { return i !== CLUB_ID; })[0];
    var us = m.clubs[CLUB_ID] || {};
    var them = m.clubs[oppId] || {};
    var gf = num(us.goals), ga = num(us.goalsAgainst);
    function players(id) {
      var obj = (m.players || {})[id] || {};
      return Object.keys(obj).map(function (k) { return trimPlayer(obj[k]); })
        .sort(function (a, b) { return b.rating - a.rating; });
    }
    return {
      id: String(m.matchId), ts: m.timestamp, type: type,
      result: gf > ga ? "W" : gf < ga ? "L" : "D",
      dnf: us.winnerByDnf === "1" || them.winnerByDnf === "1",
      us: { goals: gf, players: players(CLUB_ID) },
      opp: {
        id: oppId, name: (them.details && them.details.name) || ("Club " + oppId),
        goals: ga, players: players(oppId)
      }
    };
  }

  var bar = document.createElement("div");
  bar.style.cssText = "position:fixed;top:0;left:0;right:0;padding:14px;background:#0b1230;color:#22c3a6;font:700 16px system-ui;z-index:99999;text-align:center";
  document.body.appendChild(bar);
  function say(t) { bar.textContent = "Mysting Team FC · " + t; }

  try {
    say("Descargando datos del club…");
    var q = "platform=" + PLATFORM;
    var info = await api("clubs/info?" + q + "&clubIds=" + CLUB_ID);
    var overall = await api("clubs/overallStats?" + q + "&clubIds=" + CLUB_ID);
    var members = await api("members/stats?" + q + "&clubId=" + CLUB_ID);

    var types = { leagueMatch: "league", playoffMatch: "playoff", friendlyMatch: "friendly" };
    var matches = [];
    for (var t in types) {
      say("Descargando partidos (" + types[t] + ")…");
      var list = await api("clubs/matches?" + q + "&clubIds=" + CLUB_ID + "&matchType=" + t);
      list.forEach(function (m) { matches.push(trimMatch(m, types[t])); });
    }

    var c = info[CLUB_ID] || {};
    var data = {
      version: 1, kind: "mysting-export", platform: PLATFORM, clubId: CLUB_ID,
      updatedAt: new Date().toISOString(),
      club: {
        name: c.name || "Mysting Team FC",
        stadium: (c.customKit && c.customKit.stadName) || "",
        overall: trimOverall(overall[0])
      },
      members: (members.members || []).map(trimMember),
      matches: matches.sort(function (a, b) { return b.ts - a.ts; })
    };
    window.__mystingExport = data;

    if (win && !win.closed) {
      say("Enviando los datos a la web del club…");
      if (await ready) {
        win.postMessage(data, siteOrigin);
        say("Enviado: " + matches.length + " partidos. Mira la pestaña de la web del club.");
        return;
      }
      say("La web no respondió; descargando el archivo para importarlo a mano…");
    }

    if (!window.__mystingNoDownload) {
      var blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "mysting-export.json";
      document.body.appendChild(a);
      a.click();
    }
    say("Listo: " + matches.length + " partidos y " + data.members.length + " jugadores. Importa el archivo en la web.");
  } catch (e) {
    say("Error: " + e.message);
  }
})();
