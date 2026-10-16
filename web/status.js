// The page reads what Upptime commits to this repository: the current state of each service
// (history/<slug>.yml, rewritten on every change) and the minutes down per UTC day
// (history/summary.json). Outages are the repository's issues, which Upptime opens and closes.
"use strict";

const REPO = "NodeMP-BeamNG/status";
const SINCE = Date.parse("2026-10-15T19:05:00Z"); // the first check
const DAYS = 90;
const DAY_MS = 86400000;
const REFRESH_MS = 5 * 60 * 1000;
const LANG_KEY = "nmp_status_lang";

const T = {
  ru: {
    tag: "ru-RU",
    pageTitle: "Статус сервисов · NodeMP",
    title: "Статус сервисов",
    lede: "Работают ли сайт, API и документация NodeMP.",
    news: "Новости",
    servers: "Серверы",
    download: "Скачать",
    docs: "Документация",
    docsUrl: "https://docs.nodemp.com/ru/",
    language: "Язык",
    services: "Сервисы",
    incidents: "Сбои",
    loading: "Загрузка…",
    names: { site: "Сайт", api: "API", docs: "Документация" },
    state: { up: "Работает", degraded: "Отвечает медленно", down: "Сбой" },
    allUp: "Все сервисы работают",
    someDown: (n) => `Сбой: ${n}`,
    someSlow: (n) => `Отвечают медленно: ${n}`,
    loadFailed: "Не удалось загрузить данные проверок. Попробуйте обновить страницу.",
    ago: (d) => `${d} дней назад`,
    today: "Сегодня",
    uptime: (p) => `Доступность ${p}`,
    uptimeLabel: (p) => `Доступность за последние дни: ${p}`,
    noChecks: "проверок ещё не было",
    noDowntime: "без сбоев",
    downFor: (m) => `недоступен ${m}`,
    downNow: "сбой сейчас",
    minutes: (min) => (min < 60 ? `${min} мин.` : `${Math.floor(min / 60)} ч ${min % 60} мин.`),
    noIncidents: "Сбоев не было.",
    wasDown: (n) => `${n}: недоступен`,
    ongoing: "· продолжается",
    since: (t) => `с ${t}`,
    details: "подробности",
    historyFailed: "Историю сбоев сейчас не загрузить. Она есть ",
    onGitHub: "на GitHub",
  },
  en: {
    tag: "en-GB",
    pageTitle: "Service status · NodeMP",
    title: "Service status",
    lede: "Whether NodeMP's site, API and docs are up.",
    news: "News",
    servers: "Servers",
    download: "Download",
    docs: "Docs",
    docsUrl: "https://docs.nodemp.com/",
    language: "Language",
    services: "Services",
    incidents: "Incidents",
    loading: "Loading…",
    names: { site: "Site", api: "API", docs: "Docs" },
    state: { up: "Operational", degraded: "Slow", down: "Down" },
    allUp: "All services are operational",
    someDown: (n) => `Down: ${n}`,
    someSlow: (n) => `Slow: ${n}`,
    loadFailed: "The checks could not be loaded. Try reloading the page.",
    ago: (d) => `${d} days ago`,
    today: "Today",
    uptime: (p) => `Uptime ${p}`,
    uptimeLabel: (p) => `Uptime over the last days: ${p}`,
    noChecks: "no checks yet",
    noDowntime: "no downtime",
    downFor: (m) => `down for ${m}`,
    downNow: "down now",
    minutes: (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`),
    noIncidents: "No incidents.",
    wasDown: (n) => `${n}: down`,
    ongoing: "· ongoing",
    since: (t) => `since ${t}`,
    details: "details",
    historyFailed: "The incident history cannot be loaded right now. It is ",
    onGitHub: "on GitHub",
  },
};

/** ?lang= first, then the last choice here, then the browser's languages (Russian wins a tie), then Russian -- as the site does. */
function pickLang() {
  const q = new URLSearchParams(location.search).get("lang");
  if (q in T) return q;
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved in T) return saved;
  } catch {}
  for (const l of navigator.languages || [navigator.language || ""]) {
    const base = l.toLowerCase().slice(0, 2);
    if (base in T) return base;
  }
  return "ru";
}

let lang = pickLang();
let t = T[lang];
let fmt = formats(t.tag);
let last = null; // { sum, states, issues } of the last load, so a language switch redraws without fetching

function formats(tag) {
  return {
    day: new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", timeZone: "UTC" }),
    time: new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
    pct: new Intl.NumberFormat(tag, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  };
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

async function fetchOk(url, init) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r;
}

const stateOf = (yml) => (/^status:\s*(\w+)/m.exec(yml) || [])[1] || "up";
const nameOf = (site) => t.names[site.slug] || site.name;

/** The last DAYS UTC days, oldest first, as midnight timestamps. */
function lastDays(now) {
  const d = new Date(now);
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Array.from({ length: DAYS }, (_, i) => today - (DAYS - 1 - i) * DAY_MS);
}

/** Minutes down per UTC day from the incidents themselves: the summary is recounted once a day, so an outage of today is not in it yet. */
function incidentMinutes(issues, slug, now) {
  const out = {};
  for (const i of issues || []) {
    if (!(i.labels || []).some((l) => l.name === slug)) continue;
    let from = Date.parse(i.created_at);
    const to = i.closed_at ? Date.parse(i.closed_at) : now;
    while (from < to) {
      const dayEnd = (Math.floor(from / DAY_MS) + 1) * DAY_MS;
      const end = Math.min(to, dayEnd);
      const key = new Date(from).toISOString().slice(0, 10);
      out[key] = (out[key] || 0) + Math.round((end - from) / 60000);
      from = end;
    }
  }
  return out;
}

function serviceRow(site, state, days, now, issues) {
  const fromIncidents = incidentMinutes(issues, site.slug, now);
  const cls = { up: "up", degraded: "slow", down: "down" }[state];
  const li = el("li");
  const head = el("div", "row-head");
  head.append(el("span", "name", nameOf(site)), el("span", `pill ${cls}`, t.state[state]));

  const bars = el("div", "bars");
  let watched = 0;
  let down = 0;
  for (const start of days) {
    const key = new Date(start).toISOString().slice(0, 10);
    const from = Math.max(start, SINCE);
    const to = Math.min(start + DAY_MS, now);
    const min = Math.max((site.dailyMinutesDown && site.dailyMinutesDown[key]) || 0, fromIncidents[key] || 0);
    const isToday = start + DAY_MS > now;
    const day = fmt.day.format(start);
    let barCls = "";
    let title = `${day}: ${t.noChecks}`;
    if (to > from) {
      watched += (to - from) / 60000;
      down += min;
      const nowDown = isToday && state === "down";
      barCls = min > 30 || nowDown ? "down" : min > 0 || (isToday && state === "degraded") ? "slow" : "up";
      title = `${day}: ${nowDown ? t.downNow : min ? t.downFor(t.minutes(min)) : t.noDowntime}`;
    }
    const bar = el("span", `bar ${barCls}`.trim());
    bar.title = title;
    bars.append(bar);
  }
  const uptime = fmt.pct.format(watched > 0 ? Math.max(0, 1 - down / watched) : 1);
  bars.setAttribute("role", "img");
  bars.setAttribute("aria-label", t.uptimeLabel(uptime));

  const foot = el("div", "row-foot");
  const ago = el("span");
  ago.append(el("span", "d90", t.ago(DAYS)), el("span", "d30", t.ago(30)));
  foot.append(ago, el("span", "uptime", t.uptime(uptime)), el("span", "", t.today));

  li.append(head, bars, foot);
  return li;
}

function drawServices({ sum, states, issues }) {
  const now = Date.now();
  const days = lastDays(now);
  document.getElementById("services").replaceChildren(...sum.map((s, i) => serviceRow(s, states[i], days, now, issues)));
  const box = document.getElementById("summary");
  const named = (s) => sum.filter((_, i) => states[i] === s).map(nameOf).join(", ");
  if (states.includes("down")) {
    box.className = "summary down";
    box.textContent = t.someDown(named("down"));
  } else if (states.includes("degraded")) {
    box.className = "summary slow";
    box.textContent = t.someSlow(named("degraded"));
  } else {
    box.className = "summary";
    box.textContent = t.allUp;
  }
}

function drawIncidents(sum, issues) {
  const box = document.getElementById("incidents");
  if (!issues) {
    const p = el("p", "muted", t.historyFailed);
    const a = el("a", "", t.onGitHub);
    a.href = `https://github.com/${REPO}/issues?q=label%3Astatus`;
    p.append(a, ".");
    box.replaceChildren(p);
    return;
  }
  if (!issues.length) {
    box.replaceChildren(el("p", "muted", t.noIncidents));
    return;
  }
  const bySlug = new Map(sum.map((s) => [s.slug, s]));
  box.replaceChildren(
    ...issues.map((i) => {
      const site = (i.labels || []).map((l) => bySlug.get(l.name)).find(Boolean);
      const row = el("div", "incident");
      const what = el("span", "what", t.wasDown(site ? nameOf(site) : "NodeMP"));
      if (i.state === "open") what.append(" ", el("span", "open", t.ongoing));
      const opened = Date.parse(i.created_at);
      const closed = i.closed_at ? Date.parse(i.closed_at) : null;
      const when = el("span", "when");
      when.append(closed ? `${fmt.time.format(opened)} — ${t.minutes(Math.max(1, Math.round((closed - opened) / 60000)))}` : t.since(fmt.time.format(opened)), " · ");
      const link = el("a", "", t.details);
      link.href = i.html_url;
      when.append(link);
      row.append(what, when);
      return row;
    }),
  );
}

/** The fixed texts, links and the switch for the current language. */
function applyLang() {
  document.documentElement.lang = lang;
  document.title = t.pageTitle;
  document.querySelector('meta[name="description"]').content = t.lede;
  for (const e of document.querySelectorAll("[data-t]")) e.textContent = t[e.dataset.t];
  for (const e of document.querySelectorAll("[data-t-label]")) e.setAttribute("aria-label", t[e.dataset.tLabel]);
  for (const e of document.querySelectorAll("[data-site]")) e.href = `https://nodemp.com/${lang}${e.dataset.site}`;
  for (const e of document.querySelectorAll("[data-docs]")) e.href = t.docsUrl;
  for (const b of document.querySelectorAll("[data-lang]")) b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
  document.querySelector(".lang").dataset.current = lang;
  if (!last) {
    document.getElementById("summary").textContent = t.loading;
    document.querySelector("#incidents .muted").textContent = t.loading;
  }
}

function setLang(next) {
  if (!(next in T) || next === lang) return;
  lang = next;
  t = T[lang];
  fmt = formats(t.tag);
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {}
  const url = new URL(location.href);
  url.searchParams.set("lang", lang);
  history.replaceState(null, "", url);
  applyLang();
  if (last) {
    drawServices(last);
    drawIncidents(last.sum, last.issues);
  }
}

async function loadIssues() {
  try {
    const r = await fetchOk(`https://api.github.com/repos/${REPO}/issues?state=all&labels=status&per_page=15`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    return (await r.json()).filter((i) => !i.pull_request);
  } catch {
    return null;
  }
}

async function refresh() {
  try {
    const sum = await (await fetchOk("/history/summary.json", { cache: "no-cache" })).json();
    const states = await Promise.all(
      sum.map((s) =>
        fetchOk(`/history/${s.slug}.yml`, { cache: "no-cache" })
          .then((r) => r.text())
          .then(stateOf)
          .catch(() => s.status || "up"),
      ),
    );
    last = { sum, states: states.map((s) => (s in T.ru.state ? s : "up")), issues: undefined };
    drawServices(last);
    last.issues = await loadIssues();
    if (last.issues && last.issues.length) drawServices(last);
    drawIncidents(sum, last.issues);
  } catch {
    const box = document.getElementById("summary");
    box.className = "summary";
    box.textContent = t.loadFailed;
  }
}

for (const b of document.querySelectorAll("[data-lang]")) b.addEventListener("click", () => setLang(b.dataset.lang));
applyLang();
refresh();
setInterval(() => {
  if (document.visibilityState === "visible") refresh();
}, REFRESH_MS);
