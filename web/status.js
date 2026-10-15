// The page reads what Upptime commits to this repository: the current state of each service
// (history/<slug>.yml, rewritten on every change) and the minutes down per UTC day
// (history/summary.json). Outages are the repository's issues, which Upptime opens and closes.
"use strict";

const REPO = "NodeMP-BeamNG/status";
const SINCE = Date.parse("2026-10-15T19:05:00Z"); // the first check
const DAYS = 90;
const DAY_MS = 86400000;
const REFRESH_MS = 5 * 60 * 1000;

const STATE = {
  up: { pill: "Работает", cls: "up" },
  degraded: { pill: "Отвечает медленно", cls: "slow" },
  down: { pill: "Сбой", cls: "down" },
};
const dayFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const timeFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const pctFmt = new Intl.NumberFormat("ru-RU", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

/** The last DAYS UTC days, oldest first, as midnight timestamps. */
function lastDays(now) {
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  return Array.from({ length: DAYS }, (_, i) => today - (DAYS - 1 - i) * DAY_MS);
}

function minutesText(min) {
  return min < 60 ? `${min} мин.` : `${Math.floor(min / 60)} ч ${min % 60} мин.`;
}

function serviceRow(site, state, days, now) {
  const li = el("li");
  const head = el("div", "row-head");
  head.append(el("span", "name", site.name), el("span", `pill ${STATE[state].cls}`, STATE[state].pill));

  const bars = el("div", "bars");
  let watched = 0;
  let down = 0;
  for (const start of days) {
    const key = new Date(start).toISOString().slice(0, 10);
    const from = Math.max(start, SINCE);
    const to = Math.min(start + DAY_MS, now);
    let min = (site.dailyMinutesDown && site.dailyMinutesDown[key]) || 0;
    const isToday = start + DAY_MS > now;
    let cls;
    let title;
    if (to <= from) {
      cls = "";
      title = `${dayFmt.format(start)}: проверок ещё не было`;
    } else {
      watched += (to - from) / 60000;
      down += min;
      const nowDown = isToday && state === "down";
      cls = min > 30 || nowDown ? "down" : min > 0 || (isToday && state === "degraded") ? "slow" : "up";
      title = nowDown ? `${dayFmt.format(start)}: сбой сейчас` : `${dayFmt.format(start)}: ${min ? `недоступен ${minutesText(min)}` : "без сбоев"}`;
    }
    const bar = el("span", `bar ${cls}`.trim());
    bar.title = title;
    bars.append(bar);
  }
  const uptime = watched > 0 ? Math.max(0, 1 - down / watched) : 1;
  bars.setAttribute("role", "img");
  bars.setAttribute("aria-label", `Доступность за последние дни: ${pctFmt.format(uptime)}`);

  const foot = el("div", "row-foot");
  const ago = el("span");
  ago.append(el("span", "d90", `${DAYS} дней назад`), el("span", "d30", "30 дней назад"));
  foot.append(ago, el("span", "uptime", `Доступность ${pctFmt.format(uptime)}`), el("span", "", "Сегодня"));

  li.append(head, bars, foot);
  return li;
}

function summaryLine(sites, states) {
  const box = document.getElementById("summary");
  const text = document.getElementById("summary-text");
  const named = (s) => sites.filter((_, i) => states[i] === s).map((x) => x.name).join(", ");
  if (states.includes("down")) {
    box.className = "summary down";
    text.textContent = `Сбой: ${named("down")}`;
  } else if (states.includes("degraded")) {
    box.className = "summary slow";
    text.textContent = `Отвечают медленно: ${named("degraded")}`;
  } else {
    box.className = "summary up";
    text.textContent = "Все сервисы работают";
  }
}

async function loadServices() {
  const sum = await (await fetchOk("/history/summary.json", { cache: "no-cache" })).json();
  const states = await Promise.all(
    sum.map((s) =>
      fetchOk(`/history/${s.slug}.yml`, { cache: "no-cache" })
        .then((r) => r.text())
        .then(stateOf)
        .catch(() => s.status || "up"),
    ),
  );
  const now = Date.now();
  const days = lastDays(now);
  document.getElementById("services").replaceChildren(...sum.map((s, i) => serviceRow(s, STATE[states[i]] ? states[i] : "up", days, now)));
  summaryLine(sum, states);
  return sum;
}

async function loadIncidents(sites) {
  const box = document.getElementById("incidents");
  const names = new Map(sites.map((s) => [s.slug, s.name]));
  try {
    const r = await fetchOk(`https://api.github.com/repos/${REPO}/issues?state=all&labels=status&per_page=15`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    const issues = (await r.json()).filter((i) => !i.pull_request);
    if (!issues.length) {
      box.replaceChildren(el("p", "muted", "Сбоев не было."));
      return;
    }
    box.replaceChildren(
      ...issues.map((i) => {
        const slug = (i.labels || []).map((l) => l.name).find((n) => names.has(n));
        const row = el("div", "incident");
        const what = el("span", "what", `${names.get(slug) || "Сервис"}: недоступен`);
        if (i.state === "open") what.append(" ", el("span", "open", "· продолжается"));
        const opened = Date.parse(i.created_at);
        const closed = i.closed_at ? Date.parse(i.closed_at) : null;
        const when = el("span", "when");
        when.append(closed ? `${timeFmt.format(opened)} — ${minutesText(Math.max(1, Math.round((closed - opened) / 60000)))}` : `с ${timeFmt.format(opened)}`, " · ");
        const link = el("a", "", "подробности");
        link.href = i.html_url;
        when.append(link);
        row.append(what, when);
        return row;
      }),
    );
  } catch {
    const p = el("p", "muted", "Историю сбоев сейчас не загрузить. Она есть ");
    const a = el("a", "", "на GitHub");
    a.href = `https://github.com/${REPO}/issues?q=label%3Astatus`;
    p.append(a, ".");
    box.replaceChildren(p);
  }
}

async function refresh() {
  try {
    const sites = await loadServices();
    await loadIncidents(sites);
  } catch {
    document.getElementById("summary").className = "summary";
    document.getElementById("summary-text").textContent = "Не удалось загрузить данные проверок. Попробуйте обновить страницу.";
  }
}

refresh();
setInterval(() => {
  if (document.visibilityState === "visible") refresh();
}, REFRESH_MS);
