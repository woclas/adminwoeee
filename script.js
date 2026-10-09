/* ============================================================
   WONDER.GG — данные (Firebase Realtime Database), рендер, интерактив
   ============================================================ */
"use strict";

/* ------------------------------------------------------------
   1. МОКОВЫЕ ДАННЫЕ (реалистичные, по материалам rankoff.org)
   ------------------------------------------------------------ */
/* ------------------------------------------------------------
   1. НАСТРОЙКИ И ПУСТАЯ БАЗА
   Контент (команды, игроки, турниры, матчи, новости) загружается
   через админ-панель в Firebase Realtime Database (или localStorage).
   ------------------------------------------------------------ */
const DB_KEY = "wonder_gg_db_v2"; // v2: без демо-данных, есть настройки сайта
const DEFAULT_SETTINGS = {
  siteName: "WONDER.GG",
  logoUrl: "",
  adminPin: "wonder2026"
};
const COLLECTIONS = ["teams", "players", "tournaments", "matches", "news"];

function emptyDB() {
  return {
    teams: [],
    players: [],
    tournaments: [],
    matches: [],
    news: [],
    settings: Object.assign({}, DEFAULT_SETTINGS)
  };
}

/* ------------------------------------------------------------
   2. БАЗА ДАННЫХ: Firebase Realtime Database (fallback — localStorage)
   Доступ по REST API (fetch) — SDK не требуется.
   ------------------------------------------------------------ */
function dbBase() {
  return String(window.FIREBASE_DB_URL || "").replace(/\/+$/, "");
}

function firebaseReady() {
  return !!(window.FIREBASE_ENABLED && dbBase());
}

const Store = {
  data: emptyDB(),
  backend: "local", // "firebase" | "local"
  _tree: null,

  async init() {
    if (firebaseReady()) {
      try {
        const res = await fetch(dbBase() + "/.json");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const tree = (await res.json()) || {};
        Store._tree = tree;
        COLLECTIONS.forEach((c) => {
          const obj = tree[c] || {};
          Store.data[c] = Object.keys(obj).map((k) => Object.assign({ id: k }, obj[k]));
        });
        if (tree.settings && tree.settings.site) {
          Store.data.settings = Object.assign({}, DEFAULT_SETTINGS, tree.settings.site);
        }
        Store.backend = "firebase";
        return;
      } catch (e) {
        console.warn("[WONDER] Realtime Database недоступна, работаем локально:", e && e.message);
      }
    }
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        Store.data = Object.assign(emptyDB(), parsed);
        Store.data.settings = Object.assign({}, DEFAULT_SETTINGS, parsed.settings || {});
      }
    } catch (e) { /* noop */ }
    Store.backend = "local";
  },

  async _put(path, value) {
    // PUT + null удаляет узел (спецификация Realtime Database REST)
    const res = await fetch(dbBase() + "/" + path + ".json", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value === undefined ? null : value)
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  },

  _localSave() {
    if (Store.backend !== "local") return;
    try { localStorage.setItem(DB_KEY, JSON.stringify(Store.data)); } catch (e) { /* noop */ }
  },

  async add(kind, item) {
    item.id = item.id || kind.slice(0, 2) + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    Store.data[kind].unshift(item);
    if (Store.backend === "firebase") await Store._put(kind + "/" + item.id, item);
    else Store._localSave();
    return item;
  },

  async update(kind, id, patch) {
    const it = Store.data[kind].find((x) => x.id === id);
    if (!it) return null;
    if (patch.stats && it.stats) patch.stats = Object.assign({}, it.stats, patch.stats);
    Object.assign(it, patch);
    if (Store.backend === "firebase") await Store._put(kind + "/" + id, it);
    else Store._localSave();
    return it;
  },

  async remove(kind, id) {
    Store.data[kind] = Store.data[kind].filter((x) => x.id !== id);
    if (Store.backend === "firebase") await Store._put(kind + "/" + id, null);
    else Store._localSave();
  },

  async saveSettings(patch) {
    Store.data.settings = Object.assign({}, Store.data.settings, patch);
    if (Store.backend === "firebase") await Store._put("settings/site", Store.data.settings);
    else Store._localSave();
    return Store.data.settings;
  },

  async importAll(json) {
    const parsed = JSON.parse(json);
    const next = Object.assign(emptyDB(), parsed);
    next.settings = Object.assign({}, DEFAULT_SETTINGS, parsed.settings || {});
    Store.data = next;
    if (Store.backend === "firebase") {
      const tree = { settings: { site: next.settings } };
      COLLECTIONS.forEach((c) => {
        tree[c] = {};
        next[c].forEach((it) => { if (it && it.id) tree[c][it.id] = it; });
      });
      await Store._put("", tree); // полная замена дерева базы
    } else Store._localSave();
  },

  async resetAll() {
    Store.data = emptyDB();
    if (Store.backend === "firebase") {
      await Store._put("", { settings: { site: DEFAULT_SETTINGS } });
    } else Store._localSave();
  }
};

/* ------------------------------------------------------------
   3. ХЕЛПЕРЫ
   ------------------------------------------------------------ */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function teamById(id) { return Store.data.teams.find((t) => t.id === id) || null; }
function playerById(id) { return Store.data.players.find((p) => p.id === id) || null; }
function tourById(id) { return Store.data.tournaments.find((t) => t.id === id) || null; }
function matchById(id) { return Store.data.matches.find((m) => m.id === id) || null; }

function teamLogo(team, size, shield) {
  const t = typeof team === "string" ? teamById(team) : team;
  const name = t ? t.name : "TBD";
  const short = t ? (t.short || t.name.slice(0, 3)) : "?";
  const color = t ? (t.color || "#00C853") : "#3A3C4A";
  const cls = "team-logo" + (shield ? " team-logo--shield" : "") + (size ? " team-logo--" + size : "");
  return `<span class="${cls}" style="background:${esc(color)}" title="${esc(name)}">${esc(short.slice(0, 3))}</span>`;
}

function avatarHTML(p, cls) {
  const klass = cls || "stat-tile__ava";
  const initials = esc(p.nick.slice(0, 2).toUpperCase());
  const img = p.avatar ? `images/player-${p.avatar === 1 ? "b" : "a"}.png` : "images/player-a.png";
  return `<span class="${klass} stat-tile__ava--initials" style="background-image:url('${img}');background-size:cover;background-position:top center;color:transparent">${initials}</span>`;
}

function fmtPrize(n) {
  if (n == null) return "—";
  return "$" + Number(n).toLocaleString("ru-RU").replace(/,/g, " ");
}

const MONTHS_SHORT = ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."];
const WEEKDAYS_SHORT = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const TODAY_ISO = isoDate(new Date());

function fmtDateRu(iso) {
  const d = new Date(iso + "T12:00:00");
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()} г.`;
}

function fmtDayLabel(d) {
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}.`;
}

function notFoundBlock(title, text, href, linkText) {
  return `${emptyState(title, text)}
    <div class="text-center" style="margin-top:16px"><a class="btn btn--outline" href="${esc(href)}">${esc(linkText)}</a></div>`;
}

function badgeStatus(status) {
  if (status === "live") return `<span class="badge badge--live"><span class="dot"></span>LIVE</span>`;
  if (status === "upcoming") return `<span class="badge badge--soon">Скоро</span>`;
  return `<span class="badge badge--done">Завершён</span>`;
}

function tourBadge(status) {
  if (status === "live") return `<span class="badge badge--live"><span class="dot"></span>Идёт</span>`;
  if (status === "upcoming") return `<span class="badge badge--soon">Скоро</span>`;
  return `<span class="badge badge--done">Завершён</span>`;
}

function matchRowHTML(m) {
  const a = teamById(m.teamA), b = teamById(m.teamB);
  const live = m.status === "live";
  const fin = m.status === "finished";
  const aWin = fin && m.scoreA > m.scoreB, bWin = fin && m.scoreB > m.scoreA;
  const rowCls = (win) => (fin ? (win ? " match-card__row--win" : " match-card__row--lose") : live ? " match-card__row--live" : "");
  return `
    <a class="match-card" href="tournament.html?t=${esc(m.tour)}">
      <div class="match-card__meta">
        <span class="match-card__time mono">${esc(m.time)}</span>
        <span class="match-card__note">${m.date === TODAY_ISO ? "сегодня" : fmtDateRu(m.date)}</span>
        <span class="match-card__stage">${esc(m.stage || "")} · ${esc((m.bo || "bo3").toUpperCase())}</span>
        ${live ? `<span class="badge badge--live"><span class="dot"></span>LIVE</span>` : fin ? `<span class="badge badge--done">Завершён</span>` : ""}
      </div>
      <div class="match-card__row${rowCls(aWin)}">
        ${teamLogo(a)}<span class="name">${esc(a ? a.name : "TBD")}</span>
        <span class="score">${fin || live ? m.scoreA : "–"}</span>
      </div>
      <div class="match-card__row${rowCls(bWin)}">
        ${teamLogo(b)}<span class="name">${esc(b ? b.name : "TBD")}</span>
        <span class="score">${fin || live ? m.scoreB : "–"}</span>
      </div>
    </a>`;
}

function emptyState(title, text) {
  return `
    <div class="empty">
      <div class="empty__icon">◎</div>
      <div class="empty__title">${esc(title)}</div>
      <div class="empty__text">${esc(text)}</div>
    </div>`;
}

function skeletonRows(n) {
  return `<div>${Array.from({ length: n }, () => `<div class="skeleton skeleton--row"></div>`).join("")}</div>`;
}

function toast(msg) {
  let el = $(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("toast--show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("toast--show"), 2200);
}

/* ------------------------------------------------------------
   4. ОБЩИЕ ЭЛЕМЕНТЫ: тикер, бургер, вкладки
   ------------------------------------------------------------ */
function renderTicker() {
  const track = $("#tickerTrack");
  if (!track) return;
  const ms = Store.data.matches;
  const items = ms.map((m) => {
    const a = teamById(m.teamA), b = teamById(m.teamB);
    const t = tourById(m.tour);
    return `
      <a class="ticker__item" href="tournament.html?t=${esc(m.tour)}">
        ${m.status === "live" ? `<span class="live-dot"></span>` : ""}
        <span class="team">${esc(a ? a.name : "TBD")}</span>
        <span class="vs">vs</span>
        <span class="team">${esc(b ? b.name : "TBD")}</span>
        <span class="meta">${esc(m.time)} · ${esc((m.bo || "bo3").toUpperCase())} · ${esc(t ? t.short : "")}${m.status === "live" ? " · LIVE " + m.scoreA + ":" + m.scoreB : ""}</span>
      </a>`;
  }).join("");
  const ticker = track.closest(".ticker");
  if (!items) {
    if (ticker) ticker.classList.add("hide");
    return;
  }
  if (ticker) ticker.classList.remove("hide");
  track.innerHTML = items + items; // дублируем для бесконечного скролла
}

function renderLogo() {
  const s = Store.data.settings || DEFAULT_SETTINGS;
  $$(".logo").forEach((el) => {
    if (s.logoUrl) {
      el.innerHTML = `<img class="logo__img" src="${esc(s.logoUrl)}" alt="${esc(s.siteName || "WONDER.GG")}">`;
    } else {
      el.textContent = s.siteName || "WONDER.GG";
    }
  });
}

function initChrome() {
  renderLogo();
  renderTicker();
  const burger = $("#burger");
  const nav = $("#mainNav");
  if (burger && nav) {
    burger.addEventListener("click", () => nav.classList.toggle("nav--open"));
  }
}

/* ------------------------------------------------------------
   5. ГЛАВНАЯ (index.html)
   ------------------------------------------------------------ */
function renderIndexMatches(filter) {
  const wrap = $("#matchesList");
  if (!wrap) return;
  const ms = Store.data.matches;
  let list;
  if (filter === "live") list = ms.filter((m) => m.status === "live");
  else list = ms.filter((m) => m.date === filter);
  const byTour = {};
  list.forEach((m) => { (byTour[m.tour] = byTour[m.tour] || []).push(m); });
  const keys = Object.keys(byTour);
  if (!keys.length) {
    wrap.innerHTML = emptyState("Матчей нет", "На выбранную дату матчей не запланировано. Выберите другую дату.");
    return;
  }
  wrap.innerHTML = keys.map((tid) => {
    const t = tourById(tid);
    return `
      <section class="group" data-group>
        <div class="group__head" data-group-toggle>
          <span class="group__logo">${teamLogo({ name: t ? t.short : "?", short: t ? t.short.slice(0, 2) : "?", color: "#00B140" }, "", true)}</span>
          <div>
            <div class="group__name">${esc(t ? t.name : "Турнир")}</div>
            <div class="group__dates">${esc(t ? t.dates + "." + t.year : "")}</div>
          </div>
          <button class="group__toggle" type="button" aria-label="Свернуть">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 4.25L6 7.75L9.5 4.25" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="group__body">
          ${byTour[tid].map(matchRowHTML).join("")}
        </div>
      </section>`;
  }).join("");
  $$("#matchesList [data-group-toggle]").forEach((el) => {
    el.addEventListener("click", () => el.closest("[data-group]").classList.toggle("group--collapsed"));
  });
}

function renderTopPlayers() {
  const wrap = $("#topPlayers");
  if (!wrap) return;
  const players = Store.data.players.slice().sort((a, b) => (b.stats ? b.stats.rating : 0) - (a.stats ? a.stats.rating : 0)).slice(0, 8);
  if (!players.length) {
    wrap.innerHTML = emptyState("Топ игроков пуст", "Игроки появятся после добавления в базу.");
    return;
  }
  wrap.innerHTML = players.map((p, i) => {
    const t = teamById(p.team);
    return `
      <a class="stat-tile stat-tile--mini" href="player.html?p=${esc(p.id)}">
        <span class="stat-tile__rank${i < 3 ? " stat-tile__rank--top" : ""}">${i + 1}</span>
        ${avatarHTML(p)}
        <div class="stat-tile__info">
          <div class="stat-tile__nick">${esc(p.nick)}</div>
          <div class="stat-tile__team">${esc(t ? t.name : "—")} ${p.flag || ""}</div>
        </div>
        <div class="stat-tile__value">
          <div class="stat-tile__rating">${p.stats ? p.stats.rating.toFixed(2) : "—"}</div>
          <div class="stat-tile__label">рейтинг</div>
        </div>
      </a>`;
  }).join("");
}

function renderUpcomingTours() {
  const wrap = $("#upcomingTours");
  if (!wrap) return;
  const ts = Store.data.tournaments.filter((t) => t.status !== "done").slice(0, 4);
  if (!ts.length) {
    wrap.innerHTML = emptyState("Турниров пока нет", "Турниры появятся после добавления в базу.");
    return;
  }
  wrap.innerHTML = ts.map((t) => `
    <a class="stat-tile stat-tile--mini" href="tournament.html?t=${esc(t.id)}">
      <span class="stat-tile__ava stat-tile__ava--initials" style="border-radius:10px">${esc(t.short.slice(0, 2))}</span>
      <div class="stat-tile__info">
        <div class="stat-tile__nick">${esc(t.short)}</div>
        <div class="stat-tile__team">${esc(t.dates)}.${t.year} · ${esc(t.format)}</div>
      </div>
      <div class="stat-tile__value">
        <div class="stat-tile__rating">${esc(t.prize)}</div>
        <div class="stat-tile__label">фонд</div>
      </div>
    </a>`).join("");
}

function initIndex() {
  const tabsWrap = $("#dateTabs");
  const dates = [{ id: "live", label: "LIVE", cls: "date-tab--live" }];
  for (let i = -1; i <= 3; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push({
      id: isoDate(d),
      label: (i === 0 ? '<span class="today">СЕГОДНЯ</span> ' : "") + fmtDayLabel(d)
    });
  }
  tabsWrap.innerHTML = dates.map((d, i) => `
    <button class="date-tab ${d.cls || ""}${i === 0 ? " date-tab--active" : ""}" data-date="${d.id}" type="button">${d.label}</button>
  `).join("") + `
    <button class="date-tab date-tab--icon" id="calBtn" type="button" aria-label="Выбрать дату">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M2 6.5H14M5.5 1.8V4M10.5 1.8V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
    </button>
    <input type="date" id="calInput" class="hide" value="${TODAY_ISO}">`;

  tabsWrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".date-tab");
    if (!btn || btn.id === "calBtn") return;
    $$(".date-tab", tabsWrap).forEach((b) => b.classList.remove("date-tab--active"));
    btn.classList.add("date-tab--active");
    renderIndexMatches(btn.dataset.date);
  });
  $("#calBtn").addEventListener("click", () => $("#calInput").classList.toggle("hide"));
  $("#calInput").addEventListener("change", (e) => {
    const v = e.target.value;
    if (!v) return;
    $$(".date-tab", tabsWrap).forEach((b) => b.classList.remove("date-tab--active"));
    renderIndexMatches(v);
    toast("Показаны матчи за " + fmtDateRu(v));
  });

  $("#matchesList").innerHTML = skeletonRows(3);
  setTimeout(() => {
    renderIndexMatches("live");
    renderTopPlayers();
    renderUpcomingTours();
  }, 220);
}

/* ------------------------------------------------------------
   6. ИГРОК (player.html) — структура offstage.ru
   ------------------------------------------------------------ */
function renderPlayerHeader(p) {
  const t = teamById(p.team);
  $("#breadcrumbs").innerHTML = `
    <a href="index.html">Главная</a><span class="sep">/</span>
    <a href="index.html">Standoff 2</a><span class="sep">/</span>
    <a href="players.html">Игроки</a><span class="sep">/</span>
    <span class="current">${esc(p.nick)}</span>`;
  document.title = `${p.nick} — WONDER.GG`;

  $$("[data-player-nick]").forEach((el) => { el.textContent = p.nick; });
  const titles = (p.titles || []).map((x) => `<span class="badge badge--tag">${esc(x)}</span>`).join("");
  $("#profileCard").innerHTML = `
    <div class="profile__photo" style="background-image:url('${p.avatar ? `images/player-${p.avatar === 1 ? "b" : "a"}.png` : "images/player-a.png"}');background-size:cover;background-position:top center;"></div>
    <div class="profile__main">
      <h1 class="profile__nick">${esc(p.nick)}</h1>
      <div class="profile__titles">${titles}</div>
      <div class="profile__country"><span style="font-size:17px">${esc(p.flag || "")}</span> ${esc(p.country || "")}</div>
      <div class="profile__facts">
        <div class="fact"><span class="k">Имя Фамилия</span><span class="v">${esc(p.realName)}</span></div>
        <div class="fact"><span class="k">Возраст</span><span class="v">${esc(p.age)} года (${esc(p.birth)})</span></div>
        <div class="fact"><span class="k">Дисциплина</span><span class="v">Standoff 2</span></div>
        <div class="fact"><span class="k">Статус</span><span class="v">${esc(p.status || "Игрок")}</span></div>
        <div class="fact"><span class="k">Команда</span><span class="v">
          ${t ? `<a href="team.html?t=${esc(t.id)}" class="flex">${teamLogo(t)} ${esc(t.name)}</a> ${t.flag || ""}` : "—"}
        </span></div>
      </div>
    </div>
    <div class="profile__prize">
      <span class="k">Заработано за карьеру</span>
      <span class="v">${fmtPrize(p.prize)}</span>
    </div>`;
}

function liveMatchForPlayer(p) {
  return Store.data.matches.find((m) =>
    m.status === "live" && [m.teamA, m.teamB].includes(p.team)
  ) || null;
}

function renderPlayerOverview(p) {
  /* Прямо сейчас */
  const live = liveMatchForPlayer(p);
  $("#nowBlock").innerHTML = live ? `
    <div class="live-score mb-12">
      <div class="live-score__team">${teamLogo(live.teamA, "lg")}<span>${esc(teamById(live.teamA).name)}</span></div>
      <div class="text-center">
        <div class="live-score__nums">${live.scoreA} : ${live.scoreB}</div>
        <div class="flex" style="justify-content:center;margin-top:6px">
          <span class="badge badge--live"><span class="dot"></span>LIVE</span>
          <span class="mono muted" style="font-size:11px">${esc(live.stage)} · ${esc((live.bo || "bo3").toUpperCase())}</span>
        </div>
      </div>
      <div class="live-score__team"><span>${esc(teamById(live.teamB).name)}</span>${teamLogo(live.teamB, "lg")}</div>
    </div>
    <a class="btn btn--primary btn--sm" href="tournament.html?t=${esc(live.tour)}">Открыть матч</a>`
    : emptyState("Нет активных матчей", `${p.nick} сейчас не играет. Следите за расписанием на главной.`);

  /* Последние матчи */
  const ms = Store.data.matches
    .filter((m) => [m.teamA, m.teamB].includes(p.team))
    .sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1))
    .slice(0, 4);
  $("#recentMatches").innerHTML = ms.length
    ? ms.map(matchRowHTML).join("")
    : emptyState("Матчей пока нет", "В базе ещё нет завершённых матчей игрока.");

  /* Активные турниры */
  const active = Store.data.tournaments.filter((t) => t.status === "live" && (t.teams || []).includes(p.team));
  $("#activeTours").innerHTML = active.length ? `
    <div class="grid-2">
      ${active.map((t) => `
        <a class="trophy-card" href="tournament.html?t=${esc(t.id)}">
          <div class="flex">
            <span class="trophy-card__place trophy-card__place--gold">★</span>
            <div>
              <div class="trophy-card__name">${esc(t.short)}</div>
              <div class="trophy-card__meta">${esc(t.dates)}.${t.year} · ${esc(t.format)}</div>
            </div>
          </div>
          <div class="flex"><span class="muted" style="font-size:12px">Призовой фонд</span><b class="mono green" style="margin-left:auto">${esc(t.prize)}</b></div>
        </a>`).join("")}
    </div>`
    : emptyState("Нет активных турниров", "Команда игрока сейчас не участвует в действующих турнирах.");
}

function renderPlayerMatches(p) {
  const selT = $("#filterTour"), selD = $("#filterDate");
  const tours = Store.data.tournaments;
  selT.innerHTML = `<option value="">Все турниры</option>` + tours.map((t) => `<option value="${t.id}">${esc(t.short)}</option>`).join("");
  const draw = () => {
    let ms = Store.data.matches.filter((m) => [m.teamA, m.teamB].includes(p.team));
    if (selT.value) ms = ms.filter((m) => m.tour === selT.value);
    if (selD.value) ms = ms.filter((m) => m.date === selD.value);
    $("#playerMatchesList").innerHTML = ms.length
      ? ms.map(matchRowHTML).join("")
      : emptyState("Нет матчей", "По выбранным фильтрам матчей не найдено.");
  };
  selT.addEventListener("change", draw);
  selD.addEventListener("change", draw);
  draw();
}

function renderPlayerCareer(p) {
  $("#careerTimeline").innerHTML = (p.career || []).length ? `
    <div class="timeline">
      ${p.career.map((c) => `
        <div class="timeline__item">
          <div class="timeline__top">
            ${teamLogo({ name: c.team, short: c.team.slice(0, 2), color: "#2A2C3A" })}
            <span class="timeline__team">${esc(c.team)}</span>
            <span class="timeline__period">${esc(c.period)}</span>
          </div>
          <div class="timeline__role">${esc(c.role)}</div>
        </div>`).join("")}
    </div>` : emptyState("История карьеры пуста", "Данные о прошлых командах появятся позже.");
}

function renderPlayerTrophies(p) {
  $("#trophiesGrid").innerHTML = (p.trophies || []).length ? `
    <div class="grid-3">
      ${p.trophies.map((t) => `
        <div class="trophy-card">
          <div class="flex">
            <span class="trophy-card__place${t.place === 1 ? " trophy-card__place--gold" : ""}">${t.place === 1 ? "🏆" : t.place}</span>
            ${t.extra ? `<span class="badge badge--tag">${esc(t.extra)}</span>` : ""}
          </div>
          <div class="trophy-card__name">${esc(t.event)}</div>
          <div class="trophy-card__meta">${esc(t.date)} · ${esc(t.prize)}</div>
        </div>`).join("")}
    </div>` : emptyState("Трофеев пока нет", "Турнирные достижения появятся после первых побед.");
}

function newsCardHTML(n, big) {
  return `
    <a class="news-card${big ? " news-card--lg" : ""}" href="news.html?id=${esc(n.id)}">
      <img class="news-card__thumb" src="${esc(n.cover || "images/tournament.jpg")}" alt="">
      <div class="news-card__body">
        <div><span class="badge badge--tag">${esc(n.tag || "Новость")}</span></div>
        <div class="news-card__title">${esc(n.title)}</div>
        ${big && n.excerpt ? `<div class="news-card--excerpt">${esc(n.excerpt)}</div>` : ""}
        <div class="news-card__meta">
          <span class="news-card__time">${esc(n.date ? fmtDateRu(n.date) : "")}${n.time ? ", " + esc(n.time) : ""}</span>
        </div>
      </div>
    </a>`;
}

function renderPlayerNews(p) {
  const list = Store.data.news.filter((n) => {
    const rel = n.related || [];
    return rel.includes(p.id) || rel.includes(p.team) || !rel.length;
  }).slice(0, 5);
  const html = list.length
    ? list.map((n) => newsCardHTML(n)).join("")
    : emptyState("Новостей пока нет", "Новости об игроке появятся позже.");
  $("#playerNews").innerHTML = html;
  const mirror = $("#playerNewsTab");
  if (mirror) mirror.innerHTML = html;
}

function initPlayer() {
  const id = new URLSearchParams(location.search).get("p");
  const p = (id && playerById(id)) || (!id && Store.data.players[0]) || null;
  if (!p) {
    $("#breadcrumbs").innerHTML = `<a href="index.html">Главная</a><span class="sep">/</span><span class="current">Игрок</span>`;
    $("#profileCard").innerHTML = notFoundBlock("Игрок не найден", "Возможно, профиль ещё не добавлен в базу.", "index.html", "На главную");
    $("#playerTabs").classList.add("hide");
    $$(".tab-panel").forEach((x) => x.classList.add("hide"));
    return;
  }
  renderPlayerHeader(p);
  renderPlayerOverview(p);
  renderPlayerMatches(p);
  renderPlayerCareer(p);
  renderPlayerTrophies(p);
  renderPlayerNews(p);

  const tabs = $("#playerTabs");
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (!b) return;
    $$(".tab", tabs).forEach((x) => x.classList.remove("tab--active"));
    b.classList.add("tab--active");
    $$(".tab-panel").forEach((pnl) => pnl.classList.remove("tab-panel--active"));
    const target = $("#" + b.dataset.tab);
    if (target) target.classList.add("tab-panel--active");
  });
}

/* ------------------------------------------------------------
   7. ТУРНИР (tournament.html)
   ------------------------------------------------------------ */
function bracketCellHTML(m) {
  const a = m.a ? teamById(m.a) : null;
  const b = m.b ? teamById(m.b) : null;
  const tbd = m.state === "tbd";
  const row = (team, score, win) => `
    <div class="bracket-cell__row${win ? " bracket-cell__row--win" : ""}${win === false ? " bracket-cell__row--lose" : ""}">
      ${team ? teamLogo(team) : `<span class="team-logo" style="background:#3A3C4A">?</span>`}
      <span class="name${team ? "" : " name--tbd"}">${team ? esc(team.name) : "TBD"}</span>
      <span class="sc">${score == null ? "–" : score}</span>
    </div>`;
  const aWin = m.state === "done" && m.sa > m.sb ? true : m.state === "done" ? false : null;
  return `
    <div class="bracket-cell${tbd ? " bracket-cell--tbd" : ""}">
      <div class="bracket-cell__head">
        <span>${m.state === "done" ? "Завершён" : m.state === "upcoming" ? "Скоро" : "Ожидается"}</span>
        <span>${esc((m.bo || "bo3").toUpperCase())}</span>
      </div>
      ${row(a, m.sa, aWin)}
      ${row(b, m.sb, m.state === "done" ? !aWin : null)}
    </div>`;
}

function renderBracket(t) {
  const wrap = $("#bracketWrap");
  const rounds = t.playoff || [];
  wrap.innerHTML = `
    <div class="bracket-scroll">
      <div class="bracket">
        ${rounds.map((r, ri) => {
          const isLast = ri === rounds.length - 1;
          // Разбиваем матчи раунда на пары (2 ячейки) для линий связей
          const pairs = [];
          for (let i = 0; i < r.matches.length; i += 2) pairs.push(r.matches.slice(i, i + 2));
          return `
            <div class="bracket__round">
              <div class="bracket__round-title">${esc(r.title)}</div>
              ${pairs.map((pair) => `
                <div class="bracket__pair${pair.length === 1 && isLast ? " bracket__pair--final" : ""}">
                  ${pair.map((m) => bracketCellHTML(m) + "").join("")}
                </div>`).join("")}
            </div>`;
        }).join("")}
      </div>
    </div>
    <div class="bracket-note">Сетка прокручивается горизонтально. TBD — участники определятся по итогам предыдущих раундов.</div>`;
  // финальной ячейке убираем линию
  $$(".bracket__pair--final .bracket-cell", wrap).forEach((c) => c.classList.add("bracket-cell--final"));
}

function renderGroups(t) {
  const wrap = $("#groupsWrap");
  const groups = t.groups || [];
  if (!groups.length) {
    wrap.innerHTML = emptyState("Групповой этап не заполнен", "Данные групп появятся ближе к старту турнира.");
    return;
  }
  wrap.innerHTML = `
    <div class="grid-2">
      ${groups.map((g) => `
        <div>
          <h4 class="mb-12" style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">${esc(g.name)}</h4>
          <div class="table-wrap">
            <table class="table group-table">
              <thead><tr><th>Команда</th><th>W</th><th>L</th><th>Очки</th></tr></thead>
              <tbody>
                ${g.rows.map((r) => {
                  const tm = teamById(r.team);
                  return `<tr>
                    <td><a class="flex" href="team.html?t=${esc(r.team)}">${teamLogo(tm)} ${esc(tm ? tm.name : r.team)}</a></td>
                    <td class="mono num--accent">${r.w}</td>
                    <td class="mono">${r.l}</td>
                    <td class="mono"><b>${r.pts}</b></td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>`).join("")}
    </div>`;
}

function renderTourMatches(t) {
  const ms = Store.data.matches.filter((m) => m.tour === t.id);
  $("#tourMatches").innerHTML = ms.length
    ? ms.map(matchRowHTML).join("")
    : emptyState("Матчей пока нет", "Расписание матчей турнира появится позже.");
}

function renderTourTeams(t) {
  const teams = (t.teams || []).map(teamById).filter(Boolean);
  $("#tourTeams").innerHTML = `
    <div class="grid-4">
      ${teams.map((tm) => `
        <a class="team-card" href="team.html?t=${esc(tm.id)}">
          ${teamLogo(tm, "lg", true)}
          <div class="team-card__name">${esc(tm.name)}</div>
          <div class="team-card__country">${esc(tm.flag)} ${esc(tm.country)}</div>
          <div class="team-card__points"><span>Мировой рейтинг</span>#${tm.rank} · ${tm.points} pts</div>
        </a>`).join("")}
    </div>`;
}

function renderTourNews(t) {
  const list = Store.data.news.filter((n) => (n.related || []).includes(t.id) || (n.tag || "").toLowerCase().includes("турнир")).slice(0, 6);
  $("#tourNews").innerHTML = list.length
    ? `<div class="grid-3">${list.map((n) => newsCardHTML(n)).join("")}</div>`
    : emptyState("Новостей пока нет", "Новости турнира появятся позже.");
}

function initTournament() {
  const id = new URLSearchParams(location.search).get("t");
  const t = (id && tourById(id)) || (!id && Store.data.tournaments[0]) || null;
  if (!t) {
    $("#breadcrumbs").innerHTML = `<a href="index.html">Главная</a><span class="sep">/</span><span class="current">Турнир</span>`;
    $("#tourHero").innerHTML = notFoundBlock("Турнир не найден", "Возможно, турнир ещё не добавлен в базу.", "index.html", "На главную");
    $("#tourTabs").classList.add("hide");
    $$(".tab-panel").forEach((x) => x.classList.add("hide"));
    return;
  }
  document.title = `${t.short || t.name} — WONDER.GG`;

  $("#breadcrumbs").innerHTML = `
    <a href="index.html">Главная</a><span class="sep">/</span>
    <a href="index.html">Standoff 2</a><span class="sep">/</span>
    <span class="current">Все турниры</span><span class="sep">/</span>
    <span class="current">${esc(t.short)}</span>`;

  $("#tourHero").innerHTML = `
    <div class="tour-hero">
      <img class="tour-hero__cover" src="images/tournament.jpg" alt="">
      <div class="tour-hero__veil"></div>
      <div class="tour-hero__inner">
        <div class="tour-hero__logo">${esc(t.short.slice(0, 2))}</div>
        <div>
          <div class="flex flex-wrap mb-8">${tourBadge(t.status)}<span class="badge badge--ghost">${esc(t.format)}</span></div>
          <h1 class="tour-hero__name">${esc(t.name)}</h1>
          <div class="tour-hero__meta">
            <span>📅 <b>${esc(t.dates)}.${t.year}</b></span>
            <span>Организатор: <b>${esc(t.organizer)}</b></span>
            <span>Команд: <b>${(t.teams || []).length}</b></span>
          </div>
        </div>
        <div class="tour-hero__prize">
          <span class="k">Призовой фонд</span>
          <span class="v">${esc(t.prize)}</span>
        </div>
      </div>
    </div>
    <details class="tour-about">
      <summary class="tour-about__summary">
        О турнире
        <button class="btn btn--outline btn--sm" style="margin-left:auto;pointer-events:none">Показать подробности</button>
        <span class="arrow">▾</span>
      </summary>
      <div class="tour-about__body">${esc(t.desc)}</div>
    </details>`;

  /* Призовой фонд */
  $("#prizeTable").innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Место</th><th>Призовые</th><th>Команды</th></tr></thead>
        <tbody>
          ${(t.prizes || []).map((pz) => `
            <tr>
              <td><span class="place${pz.place === "1" ? " place--1" : pz.place === "2" ? " place--2" : pz.place === "3–4" ? " place--3" : ""}">${esc(pz.place)}</span></td>
              <td class="mono num--accent">${esc(pz.sum)}</td>
              <td>
                <div class="flex flex-wrap">
                  ${(pz.teams || []).length
                    ? pz.teams.map((tid) => {
                        const tm = teamById(tid);
                        return `<a class="chip-link" href="team.html?t=${esc(tid)}">${teamLogo(tm)} ${esc(tm ? tm.name : tid)}</a>`;
                      }).join("")
                    : `<span class="muted">Определяется</span>`}
                </div>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  renderGroups(t);
  renderBracket(t);
  renderTourMatches(t);
  renderTourTeams(t);
  renderTourNews(t);

  /* Переключатель Групповой этап / Плей-офф */
  $("#bracketSwitch").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    $$("#bracketSwitch button").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    const mode = b.dataset.mode;
    $("#groupsPanel").classList.toggle("hide", mode !== "groups");
    $("#playoffPanel").classList.toggle("hide", mode !== "playoff");
  });

  /* Вкладки */
  const tabs = $("#tourTabs");
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (!b) return;
    $$(".tab", tabs).forEach((x) => x.classList.remove("tab--active"));
    b.classList.add("tab--active");
    $$(".tab-panel").forEach((pnl) => pnl.classList.remove("tab-panel--active"));
    const target = $("#" + b.dataset.tab);
    if (target) target.classList.add("tab-panel--active");
  });
}

/* ------------------------------------------------------------
   8. НОВОСТИ (news.html)
   ------------------------------------------------------------ */
function initNews() {
  const params = new URLSearchParams(location.search);
  const articleId = params.get("id");

  if (articleId) {
    const n = Store.data.news.find((x) => x.id === articleId);
    $("#newsListWrap").classList.add("hide");
    $("#articleWrap").classList.remove("hide");
    if (!n) {
      $("#articleWrap").innerHTML = emptyState("Статья не найдена", "Возможно, новость была удалена.");
      return;
    }
    document.title = `${n.title} — WONDER.GG`;
    $("#articleWrap").innerHTML = `
      <div class="article">
        <img class="article__cover" src="${esc(n.cover || "images/tournament.jpg")}" alt="">
        <h1 class="article__title">${esc(n.title)}</h1>
        <div class="article__meta">
          <span class="badge badge--tag">${esc(n.tag || "Новость")}</span>
          <span>${esc(n.author || "Редакция WONDER.GG")}</span>
          <span class="mono">${esc(n.date ? fmtDateRu(n.date) : "")}${n.time ? ", " + esc(n.time) : ""}</span>
          <span class="mono">${esc(n.readTime || 3)} мин чтения</span>
        </div>
        <div class="article__body">${(n.body || n.excerpt || "").split("\n").filter(Boolean).map((par) => `<p>${esc(par)}</p>`).join("")}</div>
        ${(n.related || []).length ? `
          <h3 class="mb-8 mt-0" style="margin-top:26px;font-size:13px;text-transform:uppercase;letter-spacing:.07em">Связанные команды и игроки</h3>
          <div class="chips">
            ${(n.related || []).map((rid) => {
              const tm = teamById(rid), pl = playerById(rid);
              if (tm) return `<a class="chip-link" href="team.html?t=${esc(tm.id)}">${teamLogo(tm)} ${esc(tm.name)}</a>`;
              if (pl) return `<a class="chip-link" href="player.html?p=${esc(pl.id)}">${avatarHTML(pl)} ${esc(pl.nick)}</a>`;
              return "";
            }).join("")}
          </div>` : ""}
        <div style="margin-top:26px"><a class="btn btn--ghost" href="news.html">← Все новости</a></div>
      </div>`;
    return;
  }

  const state = { tag: "Все", q: "", page: 1, per: 6 };
  const tags = ["Все", "Турниры", "Трансферы", "Обновления", "Интервью"];

  $("#newsFilters").innerHTML = tags.map((t) => `
    <button class="chip${t === "Все" ? " chip--active" : ""}" data-tag="${t}" type="button">${t}</button>`).join("");

  const draw = () => {
    let list = Store.data.news.slice();
    if (state.tag !== "Все") list = list.filter((n) => (n.tag || "") === state.tag);
    if (state.q) {
      const q = state.q.toLowerCase();
      list = list.filter((n) => (n.title || "").toLowerCase().includes(q) || (n.excerpt || "").toLowerCase().includes(q));
    }
    const total = list.length;
    const shown = list.slice(0, state.page * state.per);
    const grid = $("#newsGrid");
    if (!total) {
      grid.innerHTML = `<div style="grid-column:1/-1">${
        state.q || state.tag !== "Все"
          ? emptyState("Ничего не найдено", "Попробуйте изменить фильтры или поисковый запрос.")
          : emptyState("Новостей пока нет", "Новости появятся здесь после публикации.")
      }</div>`;
    } else {
      grid.innerHTML = shown.map((n) => newsCardHTML(n, true)).join("");
    }
    $("#loadMore").classList.toggle("hide", shown.length >= total);
    $("#newsCount").textContent = total ? `Показано ${shown.length} из ${total}` : "";
  };

  $("#newsFilters").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    $$("#newsFilters .chip").forEach((x) => x.classList.remove("chip--active"));
    b.classList.add("chip--active");
    state.tag = b.dataset.tag;
    state.page = 1;
    draw();
  });
  $("#newsSearch").addEventListener("input", (e) => {
    state.q = e.target.value.trim();
    state.page = 1;
    draw();
  });
  $("#loadMore").addEventListener("click", () => { state.page++; draw(); });
  draw();
}

/* ------------------------------------------------------------
   9. КОМАНДЫ (teams.html) + страница команды (team.html)
   ------------------------------------------------------------ */
function initTeams() {
  const state = { q: "", region: "all", sort: "rank" };
  const draw = () => {
    let list = Store.data.teams.slice();
    if (state.q) list = list.filter((t) => t.name.toLowerCase().includes(state.q.toLowerCase()));
    if (state.region !== "all") list = list.filter((t) => t.region === state.region);
    if (state.sort === "rank") list.sort((a, b) => a.rank - b.rank);
    if (state.sort === "points") list.sort((a, b) => b.points - a.points);
    if (state.sort === "prize") list.sort((a, b) => b.prize - a.prize);
    $("#teamsGrid").innerHTML = list.length ? list.map((t) => `
      <a class="team-card" href="team.html?t=${esc(t.id)}">
        ${teamLogo(t, "xl", true)}
        <div class="team-card__name">${esc(t.name)}</div>
        <div class="team-card__country">${esc(t.flag)} ${esc(t.country)} · ${esc(t.region)}</div>
        <div class="team-card__points"><span>Рейтинг · очки</span>#${t.rank} · ${t.points}</div>
        <div class="mono muted" style="font-size:11px">Призовые: ${fmtPrize(t.prize)}</div>
      </a>`).join("")
      : `<div style="grid-column:1/-1">${emptyState("Команды не найдены", "Попробуйте изменить поиск или фильтры.")}</div>`;
    $("#teamsCount").textContent = `Команд в базе: ${list.length}`;
  };
  $("#teamSearch").addEventListener("input", (e) => { state.q = e.target.value.trim(); draw(); });
  $("#regionFilter").addEventListener("change", (e) => { state.region = e.target.value; draw(); });
  $("#sortFilter").addEventListener("change", (e) => { state.sort = e.target.value; draw(); });
  draw();
}

function initTeam() {
  const id = new URLSearchParams(location.search).get("t");
  const t = (id && teamById(id)) || (!id && Store.data.teams[0]) || null;
  if (!t) {
    $("#breadcrumbs").innerHTML = `<a href="index.html">Главная</a><span class="sep">/</span><span class="current">Команда</span>`;
    $("#teamHead").innerHTML = notFoundBlock("Команда не найдена", "Возможно, страница ещё не добавлена в базу.", "index.html", "На главную");
    $("#teamTabs").classList.add("hide");
    $$(".tab-panel").forEach((p) => p.classList.add("hide"));
    return;
  }
  document.title = `${t.name} — WONDER.GG`;

  $("#breadcrumbs").innerHTML = `
    <a href="index.html">Главная</a><span class="sep">/</span>
    <a href="index.html">Standoff 2</a><span class="sep">/</span>
    <a href="teams.html">Команды</a><span class="sep">/</span>
    <span class="current">${esc(t.name)}</span>`;

  $("#teamHead").innerHTML = `
    <div class="profile" style="grid-template-columns:auto minmax(0,1fr) auto">
      ${teamLogo(t, "xl", true)}
      <div class="profile__main">
        <h1 class="profile__nick">${esc(t.name)}</h1>
        <div class="profile__country"><span style="font-size:17px">${esc(t.flag)}</span> ${esc(t.country)} · ${esc(t.region)}</div>
        <div class="profile__facts">
          <div class="fact"><span class="k">Мировой рейтинг</span><span class="v green">#${t.rank} · ${t.points} pts</span></div>
          <div class="fact"><span class="k">Дисциплина</span><span class="v">Standoff 2</span></div>
          <div class="fact"><span class="k">Состав</span><span class="v">${(t.roster || []).length} игроков</span></div>
        </div>
      </div>
      <div class="profile__prize">
        <span class="k">Призовые команды</span>
        <span class="v">${fmtPrize(t.prize)}</span>
      </div>
    </div>`;

  /* Ростер */
  $("#rosterGrid").innerHTML = (t.roster || []).map((pid) => {
    const p = playerById(pid);
    if (p) {
      return `
        <a class="player-card" href="player.html?p=${esc(p.id)}">
          ${avatarHTML(p, "player-card__img")}
          <div class="player-card__body">
            <div class="player-card__nick">${esc(p.nick)}</div>
            <div class="player-card__real">${esc(p.realName)} ${p.flag || ""}</div>
            <div class="player-card__team">🎮 ${esc(p.role)}</div>
            <div class="player-card__stats">
              <div><div class="num">${p.stats ? p.stats.rating.toFixed(2) : "—"}</div><div class="lbl">Rating</div></div>
              <div><div class="num">${p.stats ? p.stats.kd.toFixed(2) : "—"}</div><div class="lbl">KD</div></div>
            </div>
          </div>
        </a>`;
    }
    return `
      <div class="player-card" style="opacity:.75">
        ${avatarHTML({ nick: String(pid), avatar: 0 }, "player-card__img")}
        <div class="player-card__body">
          <div class="player-card__nick">${esc(String(pid))}</div>
          <div class="player-card__real">Профиль добавляется</div>
          <div class="player-card__team">🎮 Игрок</div>
        </div>
      </div>`;
  }).join("") || emptyState("Состав не заполнен", "Игроки команды появятся позже.");

  /* Последние и ближайшие матчи */
  const ms = Store.data.matches.filter((m) => [m.teamA, m.teamB].includes(t.id));
  const past = ms.filter((m) => m.status === "finished").slice(-4).reverse();
  const next = ms.filter((m) => m.status !== "finished");
  $("#teamPastMatches").innerHTML = past.length ? past.map(matchRowHTML).join("") : emptyState("Нет матчей", "Завершённых матчей пока нет.");
  $("#teamNextMatches").innerHTML = next.length ? next.map(matchRowHTML).join("") : emptyState("Нет матчей", "Ближайших матчей не запланировано.");

  /* Достижения */
  $("#teamAchievements").innerHTML = (t.achievements || []).length ? `
    <div class="grid-3">
      ${t.achievements.map((a) => `
        <div class="trophy-card">
          <div class="flex">
            <span class="trophy-card__place${a.place === 1 ? " trophy-card__place--gold" : ""}">${a.place === 1 ? "🏆" : a.place}</span>
          </div>
          <div class="trophy-card__name">${esc(a.event)}</div>
          <div class="trophy-card__meta">${esc(a.date)} · ${esc(a.prize)}</div>
        </div>`).join("")}
    </div>` : emptyState("Трофеев пока нет", "Турнирные достижения команды появятся позже.");

  /* Новости команды */
  const news = Store.data.news.filter((n) => (n.related || []).includes(t.id)).slice(0, 4);
  $("#teamNews").innerHTML = news.length
    ? news.map((n) => newsCardHTML(n)).join("")
    : emptyState("Новостей пока нет", "Новости команды появятся позже.");

  /* Вкладки команды */
  const tabs = $("#teamTabs");
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (!b) return;
    $$(".tab", tabs).forEach((x) => x.classList.remove("tab--active"));
    b.classList.add("tab--active");
    $$(".tab-panel").forEach((pnl) => pnl.classList.remove("tab-panel--active"));
    const target = $("#" + b.dataset.tab);
    if (target) target.classList.add("tab-panel--active");
  });
}

/* ------------------------------------------------------------
   10. ИГРОКИ (players.html) и СТАТИСТИКА (stats.html)
   ------------------------------------------------------------ */
function initPlayers() {
  const state = { q: "", team: "all" };
  const draw = () => {
    let list = Store.data.players.slice().sort((a, b) => (b.stats ? b.stats.rating : 0) - (a.stats ? a.stats.rating : 0));
    if (state.q) {
      const q = state.q.toLowerCase();
      list = list.filter((p) => p.nick.toLowerCase().includes(q) || (p.realName || "").toLowerCase().includes(q));
    }
    if (state.team !== "all") list = list.filter((p) => p.team === state.team);
    $("#playersGrid").innerHTML = list.length ? list.map((p) => {
      const t = teamById(p.team);
      return `
        <a class="player-card" href="player.html?p=${esc(p.id)}">
          ${avatarHTML(p, "player-card__img")}
          <div class="player-card__body">
            <div class="player-card__nick">${esc(p.nick)}</div>
            <div class="player-card__real">${esc(p.realName)} ${p.flag || ""}</div>
            <div class="player-card__team">${teamLogo(t)} ${esc(t ? t.name : "—")} · ${esc(p.role)}</div>
            <div class="player-card__stats">
              <div><div class="num">${p.stats ? p.stats.rating.toFixed(2) : "—"}</div><div class="lbl">Rating</div></div>
              <div><div class="num">${p.stats ? p.stats.kd.toFixed(2) : "—"}</div><div class="lbl">KD</div></div>
              <div><div class="num">${fmtPrize(p.prize)}</div><div class="lbl">Призовые</div></div>
            </div>
          </div>
        </a>`;
    }).join("") : `<div style="grid-column:1/-1">${emptyState("Игроки не найдены", "Попробуйте изменить поиск или фильтры.")}</div>`;
  };
  $("#playerSearch").addEventListener("input", (e) => { state.q = e.target.value.trim(); draw(); });
  const sel = $("#teamFilter");
  sel.innerHTML = `<option value="all">Все команды</option>` + Store.data.teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
  sel.addEventListener("change", (e) => { state.team = e.target.value; draw(); });
  draw();
}

function initStats() {
  const state = { sort: "rating", dir: -1 };
  const cols = [
    { key: "rating", label: "Rating" }, { key: "kd", label: "KD" }, { key: "kpr", label: "KPR" },
    { key: "dpr", label: "DPR" }, { key: "impact", label: "Impact" }, { key: "kills", label: "K–D" },
    { key: "maps", label: "Карты" }, { key: "prize", label: "Призовые" }
  ];

  const draw = () => {
    const list = Store.data.players.slice().sort((a, b) => {
      const get = (p) => (state.sort === "prize" ? p.prize || 0 : (p.stats ? p.stats[state.sort] : 0));
      return (get(b) - get(a)) * (state.dir === -1 ? 1 : -1); // dir -1 = по убыванию
    });
    if (!list.length) {
      $("#statsTable").innerHTML = emptyState("Статистики пока нет", "Добавьте игроков в базу — таблица заполнится автоматически.");
      return;
    }
    $("#statsTable").innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Место</th>
              <th>Игрок</th>
              <th>Команда</th>
              ${cols.map((c) => `<th class="sortable" data-key="${c.key}">${c.label}${state.sort === c.key ? ` <span class="arr">${state.dir === -1 ? "▼" : "▲"}</span>` : ""}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${list.map((p, i) => {
              const t = teamById(p.team);
              return `
                <tr>
                  <td><span class="place${i === 0 ? " place--1" : i === 1 ? " place--2" : i === 2 ? " place--3" : ""}">${i + 1}</span></td>
                  <td>
                    <a class="player-cell" href="player.html?p=${esc(p.id)}">
                      ${avatarHTML(p)}
                      <div>
                        <div style="font-weight:800">${esc(p.nick)}</div>
                        <div class="muted" style="font-size:11px">${esc(p.realName)}</div>
                      </div>
                    </a>
                  </td>
                  <td><a class="flex" href="team.html?t=${esc(p.team)}">${teamLogo(t)} ${esc(t ? t.name : "—")}</a></td>
                  <td class="mono num--accent">${p.stats ? p.stats.rating.toFixed(2) : "—"}</td>
                  <td class="mono">${p.stats ? p.stats.kd.toFixed(2) : "—"}</td>
                  <td class="mono">${p.stats ? p.stats.kpr.toFixed(2) : "—"}</td>
                  <td class="mono">${p.stats ? p.stats.dpr.toFixed(2) : "—"}</td>
                  <td class="mono">${p.stats ? p.stats.impact.toFixed(2) : "—"}</td>
                  <td class="mono">${p.stats ? p.stats.kills + "–" + p.stats.deaths : "—"}</td>
                  <td class="mono">${p.stats ? p.stats.maps : "—"}</td>
                  <td class="mono num--accent">${fmtPrize(p.prize)}</td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;

    $$("#statsTable th.sortable").forEach((th) => {
      th.addEventListener("click", () => {
        const k = th.dataset.key;
        if (state.sort === k) state.dir *= -1;
        else { state.sort = k; state.dir = -1; }
        draw();
      });
    });
  };

  /* Топ-3 плитками */
  const top3 = Store.data.players.slice().sort((a, b) => (b.stats ? b.stats.rating : 0) - (a.stats ? a.stats.rating : 0)).slice(0, 3);
  if (!top3.length) {
    $("#top3Grid").innerHTML = `<div style="grid-column:1/-1">${emptyState("Топ игроков пуст", "Игроки появятся после добавления в базу.")}</div>`;
  } else $("#top3Grid").innerHTML = top3.map((p, i) => {
    const t = teamById(p.team);
    return `
      <a class="team-card" href="player.html?p=${esc(p.id)}">
        <span class="stat-tile__rank stat-tile__rank--top" style="font-size:16px">#${i + 1}</span>
        ${avatarHTML(p, "stat-tile__ava")}
        <div class="team-card__name">${esc(p.nick)}</div>
        <div class="team-card__country">${esc(p.flag)} ${esc(t ? t.name : "—")}</div>
        <div class="team-card__points"><span>Рейтинг</span>${p.stats ? p.stats.rating.toFixed(2) : "—"}</div>
      </a>`;
  }).join("");
  draw();
}

/* ------------------------------------------------------------
   11. АДМИН-ПАНЕЛЬ (admin.html) — отдельная ссылка, доступ по коду
   ------------------------------------------------------------ */
const ADMIN_SCHEMAS = {
  news: {
    label: "Новости",
    fields: [
      { k: "title", l: "Заголовок", type: "text", req: true },
      { k: "tag", l: "Тег", type: "select", opts: ["Турниры", "Трансферы", "Обновления", "Интервью"] },
      { k: "author", l: "Автор", type: "text" },
      { k: "date", l: "Дата", type: "date" },
      { k: "time", l: "Время", type: "time" },
      { k: "cover", l: "URL обложки", type: "text" },
      { k: "excerpt", l: "Краткое описание", type: "textarea" },
      { k: "body", l: "Текст статьи (абзацы через Enter)", type: "textarea" },
      { k: "related", l: "ID команд/игроков через запятую", type: "text" }
    ],
    title: (n) => n.title,
    meta: (n) => `${n.tag || "Новость"} · ${n.date || ""}`
  },
  players: {
    label: "Игроки",
    fields: [
      { k: "nick", l: "Ник", type: "text", req: true },
      { k: "realName", l: "Имя Фамилия", type: "text" },
      { k: "age", l: "Возраст", type: "number" },
      { k: "birth", l: "Дата рождения", type: "text" },
      { k: "country", l: "Страна", type: "text" },
      { k: "flag", l: "Флаг (эмодзи)", type: "text" },
      { k: "team", l: "ID команды", type: "text" },
      { k: "role", l: "Роль", type: "select", opts: ["IGL", "Rifler", "AWPer", "Support", "Lurker", "Entry Fragger"] },
      { k: "status", l: "Статус", type: "select", opts: ["Игрок", "Тренер", "Свободный агент"] },
      { k: "prize", l: "Призовые ($)", type: "number" },
      { k: "rating", l: "Rating", type: "number" },
      { k: "kd", l: "KD", type: "number" }
    ],
    title: (p) => p.nick,
    meta: (p) => `${p.team || "—"} · ${p.role || "—"}`
  },
  teams: {
    label: "Команды",
    fields: [
      { k: "name", l: "Название", type: "text", req: true },
      { k: "short", l: "Короткий тег", type: "text" },
      { k: "country", l: "Страна", type: "text" },
      { k: "flag", l: "Флаг (эмодзи)", type: "text" },
      { k: "region", l: "Регион", type: "select", opts: ["CIS", "EU", "SA", "NA", "ASIA"] },
      { k: "rank", l: "Место в рейтинге", type: "number" },
      { k: "points", l: "Очки", type: "number" },
      { k: "prize", l: "Призовые ($)", type: "number" },
      { k: "color", l: "Цвет логотипа", type: "text" },
      { k: "roster", l: "ID игроков через запятую", type: "text" }
    ],
    title: (t) => t.name,
    meta: (t) => `${t.region || "—"} · #${t.rank || "—"}`
  },
  matches: {
    label: "Матчи",
    fields: [
      { k: "tour", l: "ID турнира", type: "text", req: true },
      { k: "date", l: "Дата", type: "date", req: true },
      { k: "time", l: "Время", type: "time", req: true },
      { k: "teamA", l: "ID команды A", type: "text", req: true },
      { k: "teamB", l: "ID команды B", type: "text", req: true },
      { k: "scoreA", l: "Счёт A", type: "number" },
      { k: "scoreB", l: "Счёт B", type: "number" },
      { k: "status", l: "Статус", type: "select", opts: ["upcoming", "live", "finished"] },
      { k: "bo", l: "Формат", type: "select", opts: ["bo1", "bo3", "bo5"] },
      { k: "stage", l: "Стадия", type: "text" }
    ],
    title: (m) => `${m.teamA} vs ${m.teamB}`,
    meta: (m) => `${m.date || ""} ${m.time || ""} · ${m.status || ""}`
  },
  tournaments: {
    label: "Турниры",
    fields: [
      { k: "name", l: "Полное название", type: "text", req: true },
      { k: "short", l: "Короткое название", type: "text", req: true },
      { k: "prize", l: "Призовой фонд", type: "text" },
      { k: "dates", l: "Даты (например 05.10 – 25.10)", type: "text" },
      { k: "year", l: "Год", type: "number" },
      { k: "status", l: "Статус", type: "select", opts: ["upcoming", "live", "done"] },
      { k: "format", l: "Формат", type: "select", opts: ["Онлайн", "LAN"] },
      { k: "organizer", l: "Организатор", type: "text" },
      { k: "desc", l: "Описание", type: "textarea" }
    ],
    title: (t) => t.short || t.name,
    meta: (t) => `${t.dates || ""} · ${t.prize || ""}`
  }
};

function adminFormData(schema) {
  const obj = {};
  schema.fields.forEach((f) => {
    const el = $("#af_" + f.k);
    if (!el) return;
    let v = el.value.trim();
    if (f.type === "number") v = v ? Number(v) : 0;
    if (f.k === "related" || f.k === "roster") v = v ? v.split(",").map((x) => x.trim()).filter(Boolean) : [];
    if (f.k === "rating" || f.k === "kd") {
      obj.stats = obj.stats || {};
      obj.stats[f.k] = v ? Number(v) : 1;
      return;
    }
    obj[f.k] = v;
  });
  return obj;
}

function renderAdminForm(kind, editItem) {
  const schema = ADMIN_SCHEMAS[kind];
  const wrap = $("#adminFormWrap");
  wrap.innerHTML = `
    <h3 class="panel__title mb-12">${editItem ? "Редактирование" : "Добавить"}: ${esc(schema.label)}</h3>
    <form class="form" id="adminForm">
      ${schema.fields.map((f) => {
        const val = editItem ? (f.k === "rating" || f.k === "kd"
          ? (editItem.stats ? editItem.stats[f.k] : "")
          : Array.isArray(editItem[f.k]) ? editItem[f.k].join(", ")
          : editItem[f.k] != null ? editItem[f.k] : "") : "";
        const id = "af_" + f.k;
        if (f.type === "textarea") return `<label>${esc(f.l)}<textarea id="${id}">${esc(val)}</textarea></label>`;
        if (f.type === "select") return `<label>${esc(f.l)}<select id="${id}">${f.opts.map((o) => `<option${o === val ? " selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
        return `<label>${esc(f.l)}<input id="${id}" type="${f.type}" value="${esc(val)}" ${f.req ? "required" : ""}></label>`;
      }).join("")}
      <div class="form__actions">
        <button class="btn btn--primary" type="submit">${editItem ? "Сохранить" : "Добавить"}</button>
        <button class="btn btn--ghost" type="button" id="cancelEdit">Очистить</button>
      </div>
    </form>`;

  $("#adminForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const obj = adminFormData(schema);
    const missing = schema.fields.filter((f) => f.req && !String(obj[f.k] || "").length);
    if (missing.length) return toast("Заполните обязательные поля");
    if (editItem) {
      await Store.update(kind, editItem.id, obj);
      toast("Изменения сохранены");
    } else {
      if (kind === "news" && !obj.date) obj.date = TODAY_ISO;
      if (kind === "matches" && !obj.date) obj.date = TODAY_ISO;
      if (kind === "players" && !obj.stats) {
        obj.stats = { rating: 1, kd: 1, kpr: 0.6, dpr: 0.7, impact: 1, kills: 0, assists: 0, deaths: 0, maps: 0, wr: 0, lr: 0 };
      }
      await Store.add(kind, obj);
      toast(schema.label + ": добавлено");
    }
    renderAdminForm(kind);
    renderAdminList(kind);
  });
  const cancel = $("#cancelEdit");
  if (cancel) cancel.addEventListener("click", () => renderAdminForm(kind));
}

function renderAdminList(kind) {
  const schema = ADMIN_SCHEMAS[kind];
  const list = Store.data[kind];
  const wrap = $("#adminList");
  wrap.innerHTML = `
    <div class="flex mb-12">
      <h3 class="panel__title">${esc(schema.label)}</h3>
      <span class="badge badge--ghost" style="margin-left:auto">${list.length}</span>
    </div>
    <div class="admin-list">
      ${list.length ? list.map((it) => `
        <div class="admin-item">
          <div class="admin-item__info">
            <div class="admin-item__title">${esc(schema.title(it))}</div>
            <div class="admin-item__meta">${esc(schema.meta(it))}</div>
          </div>
          <div class="admin-item__btns">
            <button class="icon-btn" data-edit="${esc(it.id)}" title="Изменить">✎</button>
            <button class="icon-btn icon-btn--danger" data-del="${esc(it.id)}" title="Удалить">✕</button>
          </div>
        </div>`).join("")
        : emptyState("Пока пусто", `Элементы раздела «${schema.label}» добавляются формой слева.`)}
    </div>`;

  wrap.onclick = async (e) => {
    const del = e.target.closest("[data-del]");
    const ed = e.target.closest("[data-edit]");
    if (del) {
      if (confirm("Удалить элемент?")) {
        await Store.remove(kind, del.dataset.del);
        renderAdminList(kind);
        toast("Удалено");
      }
    } else if (ed) {
      const item = Store.data[kind].find((x) => x.id === ed.dataset.edit);
      if (item) {
        renderAdminForm(kind, item);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  };
}

function renderAdminSettings() {
  const s = Store.data.settings || DEFAULT_SETTINGS;
  $("#adminFormWrap").innerHTML = `
    <h3 class="panel__title mb-12">Настройки сайта</h3>
    <form class="form" id="settingsForm">
      <label>Название сайта
        <input id="set_name" type="text" value="${esc(s.siteName)}" placeholder="WONDER.GG">
      </label>
      <label>Код доступа к админ-панели
        <input id="set_pin" type="text" value="${esc(s.adminPin)}">
      </label>
      <label>Логотип (PNG / JPG / SVG, до 500 КБ)
        <input id="set_logo" type="file" accept="image/*">
      </label>
      <div class="mb-12" id="logoPreview">
        ${s.logoUrl
          ? `<img class="logo__img" src="${esc(s.logoUrl)}" alt="">`
          : `<span class="muted" style="font-size:12px">Логотип не задан — в шапке отображается текстовый логотип.</span>`}
      </div>
      <div class="form__actions">
        <button class="btn btn--primary" type="submit">Сохранить настройки</button>
        ${s.logoUrl ? `<button class="btn btn--ghost" type="button" id="logoReset">Убрать логотип</button>` : ""}
      </div>
    </form>`;

  let newLogo = s.logoUrl;
  const fileInput = $("#set_logo");
  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 500 * 1024) {
        toast("Файл слишком большой (максимум 500 КБ)");
        e.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        newLogo = reader.result;
        $("#logoPreview").innerHTML = `<img class="logo__img" src="${esc(newLogo)}" alt="">`;
      };
      reader.readAsDataURL(f);
    });
  }

  $("#settingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await Store.saveSettings({
      siteName: $("#set_name").value.trim() || "WONDER.GG",
      adminPin: $("#set_pin").value.trim() || DEFAULT_SETTINGS.adminPin,
      logoUrl: newLogo
    });
    renderLogo();
    toast("Настройки сохранены");
    renderAdminSettings();
    renderAdminSettingsInfo();
  });

  const resetBtn = $("#logoReset");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      newLogo = "";
      await Store.saveSettings({ logoUrl: "" });
      renderLogo();
      renderAdminSettings();
      renderAdminSettingsInfo();
    });
  }
}

function renderAdminSettingsInfo() {
  const d = Store.data;
  $("#adminList").innerHTML = `
    <div class="flex mb-12"><h3 class="panel__title">База данных</h3></div>
    <div class="stack">
      <div class="stat-row"><span class="k">Режим</span><span class="v ${Store.backend === "firebase" ? "green" : ""}">${Store.backend === "firebase" ? "Firebase Realtime Database" : "Локально (без Firebase)"}</span></div>
      <div class="stat-row"><span class="k">Команды</span><span class="v">${d.teams.length}</span></div>
      <div class="stat-row"><span class="k">Игроки</span><span class="v">${d.players.length}</span></div>
      <div class="stat-row"><span class="k">Турниры</span><span class="v">${d.tournaments.length}</span></div>
      <div class="stat-row"><span class="k">Матчи</span><span class="v">${d.matches.length}</span></div>
      <div class="stat-row"><span class="k">Новости</span><span class="v">${d.news.length}</span></div>
    </div>
    <p class="muted" style="font-size:11.5px;margin-top:12px">
      Подключение Firebase задаётся в файле <span class="mono">firebase-config.js</span>.
      Пока конфигурация не заполнена, данные хранятся локально в браузере.
    </p>`;
}

function renderLock(pin) {
  const lock = $("#adminLock");
  const app = $("#adminApp");
  if (!lock || !app) return;
  lock.classList.remove("hide");
  app.classList.add("hide");
  const form = $("#pinForm");
  form.onsubmit = (e) => {
    e.preventDefault();
    if ($("#pinInput").value === pin) {
      try { sessionStorage.setItem("wonder_admin_unlock", "1"); } catch (err) { /* noop */ }
      lock.classList.add("hide");
      app.classList.remove("hide");
      bootAdminApp();
    } else {
      toast("Неверный код доступа");
    }
  };
}

function bootAdminApp() {
  const tabs = $("#adminTabs");
  const switchTo = (kind) => {
    $$(".tab", tabs).forEach((x) => x.classList.toggle("tab--active", x.dataset.tab === kind));
    if (kind === "settings") {
      renderAdminSettings();
      renderAdminSettingsInfo();
      return;
    }
    renderAdminForm(kind);
    renderAdminList(kind);
  };
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (b) switchTo(b.dataset.tab);
  });

  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(Store.data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "wonder-gg-data.json";
    a.click();
    toast("Данные экспортированы");
  });

  $("#resetBtn").addEventListener("click", async () => {
    if (confirm("Удалить все команды, игроков, турниры, матчи и новости?")) {
      await Store.resetAll();
      switchTo("news");
      toast("База очищена");
    }
  });

  $("#importInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await Store.importAll(reader.result);
        renderLogo();
        switchTo("news");
        toast("Данные импортированы");
      } catch (err) {
        toast("Ошибка импорта: неверный JSON");
      }
    };
    reader.readAsText(file);
  });

  switchTo("news");
}

function initAdmin() {
  const pin = (Store.data.settings && Store.data.settings.adminPin) || DEFAULT_SETTINGS.adminPin;
  let unlocked = false;
  try { unlocked = sessionStorage.getItem("wonder_admin_unlock") === "1"; } catch (e) { /* noop */ }
  if (unlocked) {
    const lock = $("#adminLock");
    const app = $("#adminApp");
    if (lock) lock.classList.add("hide");
    if (app) app.classList.remove("hide");
    bootAdminApp();
  } else {
    renderLock(pin);
  }
}

/* ------------------------------------------------------------
   12. ЗАПУСК
   ------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", async () => {
  await Store.init();
  initChrome();
  const page = document.body.dataset.page;
  const inits = {
    index: initIndex,
    player: initPlayer,
    tournament: initTournament,
    news: initNews,
    teams: initTeams,
    team: initTeam,
    players: initPlayers,
    stats: initStats,
    admin: initAdmin
  };
  if (inits[page]) inits[page]();
});
