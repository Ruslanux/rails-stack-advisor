/* ============================================================
   Rails Stack Advisor — интерфейс подборщика.
   ============================================================ */
(function () {
  "use strict";

  var E = window.RSAEngine;
  var root = document.getElementById("advisor");

  /* ---------- тема ---------- */
  var toggle = document.getElementById("themeToggle");
  if (toggle) {
    var icon = toggle.querySelector("[data-theme-icon]");
    var paint = function () {
      var light = document.documentElement.getAttribute("data-theme") === "light";
      if (icon) icon.textContent = light ? "☾" : "☀";
      toggle.setAttribute("aria-label", light ? "Включить тёмную тему" : "Включить светлую тему");
    };
    paint();
    toggle.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("rsa-theme", next); } catch (e) {}
      paint();
    });
  }
  if (!root) return; // на остальных страницах дальше не идём

  /* ---------- утилиты ---------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function el(html) {
    var d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }
  /* Подсветка `код` внутри текстов задач. */
  function tick(s) {
    return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
  }
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove("is-on"); }, 1900);
  }

  var PRESETS = [
    { name: "MVP за месяц", a: { project_type: "mvp", domain: "simple", timeline: "mvp_term", ui: "crud", seo: "important", realtime: "notify", mobile: "none", team: "solo", rails_exp: "middle", scale: "small", infra: "vps_cheap", compliance: "standard" } },
    { name: "Маркетплейс", a: { project_type: "marketplace", domain: "complex", timeline: "longterm", ui: "rich", seo: "critical", realtime: "notify", mobile: "pwa", team: "rails_small", rails_exp: "senior", scale: "medium", infra: "vps_cheap", compliance: "fintech" } },
    { name: "B2B SaaS", a: { project_type: "saas", domain: "complex", timeline: "product", ui: "rich", seo: "important", realtime: "notify", mobile: "none", team: "rails_small", rails_exp: "senior", scale: "large", infra: "cloud", compliance: "pii" } },
    { name: "Внутренняя админка", a: { project_type: "internal", domain: "medium", timeline: "product", ui: "crud", seo: "none", realtime: "none", mobile: "none", team: "solo", rails_exp: "middle", scale: "small", infra: "vps_cheap", compliance: "standard" } },
    { name: "AI-продукт", a: { project_type: "ai_agent", domain: "complex", timeline: "product", ui: "app_like", seo: "none", realtime: "notify", mobile: "none", team: "with_frontend", rails_exp: "senior", scale: "medium", infra: "cloud", compliance: "pii" } },
    { name: "Контентный сайт", a: { project_type: "content", domain: "simple", timeline: "mvp_term", ui: "static", seo: "critical", realtime: "none", mobile: "none", team: "solo", rails_exp: "junior", scale: "small", infra: "vps_cheap", compliance: "standard" } },
    { name: "Мобильный бэкенд", a: { project_type: "api_mobile", domain: "medium", timeline: "product", ui: "crud", seo: "none", realtime: "notify", mobile: "native_api", team: "rails_small", rails_exp: "middle", scale: "medium", infra: "paas", compliance: "pii" } },
    { name: "Хакатон", a: { project_type: "mvp", domain: "simple", timeline: "hackathon", ui: "crud", seo: "none", realtime: "none", mobile: "none", team: "solo", rails_exp: "middle", scale: "small", infra: "paas", compliance: "standard" } }
  ];

  var DATA = null, ANSWERS = {}, QUESTION_INDEX = {}, APP_NAME = "myapp";

  /* ---------- состояние ---------- */
  function defaults() {
    var a = {};
    DATA.questions.forEach(function (s) {
      s.items.forEach(function (q) {
        a[q.id] = q.default || q.options[0].value;
        QUESTION_INDEX[q.id] = q;
      });
    });
    return a;
  }
  function readURL(base) {
    var p = new URLSearchParams(location.search);
    var a = Object.assign({}, base);
    Object.keys(base).forEach(function (k) {
      var v = p.get(k);
      if (v && QUESTION_INDEX[k].options.some(function (o) { return o.value === v; })) a[k] = v;
    });
    if (p.get("app")) APP_NAME = p.get("app").replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "myapp";
    return a;
  }
  function writeURL() {
    var p = new URLSearchParams();
    Object.keys(ANSWERS).forEach(function (k) { p.set(k, ANSWERS[k]); });
    if (APP_NAME !== "myapp") p.set("app", APP_NAME);
    history.replaceState(null, "", location.pathname + "?" + p.toString());
  }

  /* ---------- рендер анкеты ---------- */
  function renderQuestions() {
    var html = DATA.questions.map(function (section) {
      var cards = section.items.map(function (q) {
        var chips = q.options.map(function (o) {
          return '<button class="chip" type="button" role="switch" data-q="' + esc(q.id) + '" data-v="' + esc(o.value) + '" aria-pressed="false">' +
            esc(o.label) + (o.note ? '<span class="chip__note">' + esc(o.note) + '</span>' : '') + '</button>';
        }).join("");
        return '<div class="q"><div class="q__title">' + esc(q.title) + '</div>' +
          (q.hint ? '<div class="q__hint">' + esc(q.hint) + '</div>' : '') +
          '<div class="chips">' + chips + '</div></div>';
      }).join("");
      return '<div class="qgroup"><div class="qgroup__title">' + esc(section.icon || "") + " " + esc(section.section) +
        '</div><div class="qgrid">' + cards + '</div></div>';
    }).join("");

    document.getElementById("questions").innerHTML = html;
    document.getElementById("questions").addEventListener("click", function (ev) {
      var chip = ev.target.closest(".chip");
      if (!chip) return;
      ANSWERS[chip.dataset.q] = chip.dataset.v;
      syncChips();
      writeURL();
      renderReport();
    });
  }
  function syncChips() {
    document.querySelectorAll(".chip").forEach(function (c) {
      c.setAttribute("aria-pressed", ANSWERS[c.dataset.q] === c.dataset.v ? "true" : "false");
    });
  }

  function renderPresets() {
    var host = document.getElementById("presets");
    host.innerHTML = '<span class="toolbar__label">Шаблоны</span>' +
      PRESETS.map(function (p, i) { return '<button class="btn btn--sm" data-preset="' + i + '">' + esc(p.name) + '</button>'; }).join("") +
      '<button class="btn btn--sm btn--ghost" data-action="share" style="margin-left:auto">🔗 Ссылка на конфигурацию</button>';
    host.addEventListener("click", function (ev) {
      var b = ev.target.closest("button");
      if (!b) return;
      if (b.dataset.preset != null) {
        Object.assign(ANSWERS, PRESETS[+b.dataset.preset].a);
        syncChips(); writeURL(); renderReport();
        document.getElementById("report").scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (b.dataset.action === "share") {
        writeURL();
        copy(location.href, "Ссылка скопирована");
      }
    });
  }

  function copy(text, msg) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { toast(msg || "Скопировано"); },
        function () { fallbackCopy(text, msg); });
    } else fallbackCopy(text, msg);
  }
  function fallbackCopy(text, msg) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast(msg || "Скопировано"); } catch (e) { toast("Не удалось скопировать"); }
    document.body.removeChild(ta);
  }

  /* ---------- рендер отчёта ---------- */
  var LAST = null;

  function renderReport() {
    var result = E.decide(DATA, ANSWERS);
    var head = E.headline(DATA, result, ANSWERS);
    var cmd = E.railsNewCommand(DATA, result, ANSWERS, APP_NAME);
    var gems = E.collectGems(DATA, result);
    var steps = E.postInstallSteps(result);
    var plan = E.buildPlan(DATA, ANSWERS, result.chosen);
    var risks = E.buildRisks(DATA, ANSWERS, result.chosen);
    var similar = E.similarProjects(DATA, ANSWERS, 3);
    LAST = { result: result, head: head, cmd: cmd, gems: gems, steps: steps, plan: plan, risks: risks, similar: similar };

    document.getElementById("report").innerHTML =
      verdictHTML(head, result) +
      commandsHTML(cmd, gems, steps) +
      decisionsHTML(result) +
      risksHTML(risks) +
      planHTML(plan) +
      similarHTML(similar) +
      exportHTML();

    var bar = document.getElementById("stickyText");
    if (bar) bar.innerHTML = "<b>" + esc(head.arch) + "</b> · " + esc(head.rendering) + " · " + esc(head.background);
  }

  function verdictHTML(head, result) {
    function cell(k, catKey) {
      var o = E.pick(result, catKey);
      return '<div class="vcell"><div class="vcell__k">' + esc(k) + '</div><div class="vcell__v">' + esc(o ? o.title : "—") + '</div></div>';
    }
    return '<div class="verdict">' +
      '<div class="verdict__top">' +
      '<div class="verdict__label">Рекомендация</div>' +
      '<div class="verdict__line"><b>' + esc(head.arch) + '</b> на Rails ' + esc(DATA.meta.rails) + ' <span class="dim">·</span> ' + esc(head.rendering) + '</div>' +
      '<div class="verdict__sub">' + esc(head.database) + ' · ' + esc(head.background) + ' · развёртывание: ' + esc(head.deploy) + '</div>' +
      '</div><div class="verdict__grid">' +
      cell("Фронтенд", "frontend") + cell("Ассеты", "assets") + cell("Аутентификация", "auth") +
      cell("Авторизация", "authorization") + cell("Тесты", "testing") + cell("Паттерны", "patterns") +
      '</div></div>';
  }

  function codeblock(caption, code, id) {
    return '<div class="codeblock"><div class="codeblock__cap">' + esc(caption) + '</div>' +
      '<button class="btn btn--sm codeblock__copy" data-copy="' + id + '">Копировать</button>' +
      '<pre id="' + id + '">' + esc(code) + '</pre></div>';
  }

  /** Длинный `bundle add` переносим по строкам — иначе блок уезжает в горизонтальный скролл. */
  function bundleAdd(list, suffix) {
    if (list.length <= 4) return "bundle add " + list.join(" ") + (suffix || "");
    var rows = [];
    for (var i = 0; i < list.length; i += 4) rows.push("  " + list.slice(i, i + 4).join(" "));
    return "bundle add \\\n" + rows.join(" \\\n") + (suffix ? "\n  " + suffix.trim() : "");
  }

  function commandsHTML(cmd, gems, steps) {
    var out = '<div class="section-head" style="margin-top:34px"><h2>С чего начать</h2>' +
      '<span class="muted">команды под выбранную конфигурацию</span></div>';
    out += codeblock("Создание приложения", cmd.command, "code-new");

    if (gems.runtime.length) {
      out += codeblock("Гемы сверх дефолтных", bundleAdd(gems.runtime), "code-gems");
    }
    if (gems.dev.length) {
      out += codeblock("Инструменты разработки и тестов",
        bundleAdd(gems.dev, " --group development,test"), "code-gems-dev");
    }
    if (steps.length) out += codeblock("Дальнейшие шаги", steps.join("\n"), "code-steps");

    if (gems.builtin.length) {
      out += '<div class="dim" style="font-size:.85rem;margin:-6px 0 20px">Уже входит в <code>rails new</code> на Rails ' +
        esc(DATA.meta.rails) + ': <span class="pills">' +
        gems.builtin.map(function (g) { return '<span class="pill pill--good">' + esc(g) + '</span>'; }).join("") +
        '</span></div>';
    }
    return out;
  }

  function decisionsHTML(result) {
    var cards = result.decisions.map(function (d) {
      if (!d.winner) return "";
      var o = d.winner.option;
      if (d.na) return "";
      var badge = '<span class="badge badge--' + d.confidence.key + '">' + esc(d.confidence.label) + '</span>';

      var why = d.winner.pros.slice(0, 4).map(function (r) {
        return '<li>' + esc(r.why) + '</li>';
      }).join("") + d.winner.cons.slice(0, 2).map(function (r) {
        return '<li class="neg">' + esc(r.why) + '</li>';
      }).join("");

      var pc = "";
      if ((o.pros && o.pros.length) || (o.cons && o.cons.length)) {
        pc = '<div class="prosCons">' +
          '<div><h4>Плюсы</h4><ul>' + (o.pros || []).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + '</ul></div>' +
          '<div><h4>Издержки</h4><ul>' + (o.cons || []).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + '</ul></div>' +
          '</div>';
      }

      var addons = d.addons.length
        ? '<div class="pills" style="margin-top:12px"><span class="muted" style="font-size:.78rem;align-self:center">Дополнить:</span>' +
          d.addons.map(function (a) { return '<span class="pill pill--good" title="' + esc((a.pros[0] || {}).why || "") + '">' + esc(a.option.title) + '</span>'; }).join("") + '</div>'
        : "";

      var alts = d.alternatives.length
        ? '<details class="alt"><summary>Альтернативы (' + d.alternatives.length + ')</summary>' +
          d.alternatives.map(function (a) {
            var reason = (a.cons[0] || {}).why || (a.pros[0] || {}).why || (a.option.short || "");
            return '<div class="altrow"><div><b>' + esc(a.option.title) + '</b>' +
              '<div class="altrow__why">' + esc(reason) + '</div></div>' +
              '<span class="score">' + a.score + '</span></div>';
          }).join("") + '</details>'
        : "";

      return '<div class="dec"><div class="dec__head"><span class="dec__icon">' + esc(d.icon || "◆") + '</span>' +
        '<div style="flex:1"><div class="dec__cat">' + esc(d.label) + '</div>' +
        '<div class="dec__pick">' + esc(o.title) + '</div>' +
        '<div class="dec__short">' + esc(o.short || "") + '</div></div>' + badge + '</div>' +
        '<div class="dec__body"><ul class="why">' + why + '</ul>' + pc + addons + alts + '</div></div>';
    }).join("");

    var na = result.decisions.filter(function (d) { return d.na; });
    var naBlock = na.length
      ? '<div class="risk risk--low" style="margin-bottom:14px"><span class="risk__lvl">не применимо</span><p>' +
        '<b>' + na.map(function (d) { return esc(d.label); }).join(", ") + '</b> — ' +
        'у статически сгенерированного сайта нет ни сервера, ни базы, ни пользовательских сессий в рантайме. ' +
        'Если эти слои нужны, значит выбран не тот способ рендеринга.</p></div>'
      : "";

    return '<div class="section-head" style="margin-top:38px"><h2>Решения по слоям</h2>' +
      '<span class="muted">' + (result.decisions.length - na.length) + ' категорий · «спорно» значит, что вариант с похожим весом стоит рассмотреть</span></div>' +
      naBlock + '<div class="decisions">' + cards + '</div>';
  }

  function risksHTML(risks) {
    if (!risks.length) return "";
    var names = { high: "важно", medium: "учесть", low: "заметка" };
    return '<div class="section-head" style="margin-top:38px"><h2>На что обратить внимание</h2>' +
      '<span class="muted">' + risks.length + ' предупреждений для этой конфигурации</span></div>' +
      risks.map(function (r) {
        return '<div class="risk risk--' + esc(r.level) + '"><span class="risk__lvl">' + esc(names[r.level]) + '</span>' +
          '<p>' + tick(r.text) + '</p></div>';
      }).join("");
  }

  function planHTML(plan) {
    if (!plan.length) return "";
    var total = plan.reduce(function (n, p) { return n + p.tasks.length; }, 0);
    return '<div class="section-head" style="margin-top:38px"><h2>План реализации</h2>' +
      '<span class="muted">' + plan.length + ' фаз · ' + total + ' задач под выбранный стек и сроки</span></div>' +
      plan.map(function (p, i) {
        return '<div class="phase"><div class="phase__head">' +
          '<span class="phase__n">' + String(i).padStart(2, "0") + '</span>' +
          '<span class="phase__title">' + esc(p.title.replace(/^Фаза \d+ — /, "")) + '</span>' +
          (p.duration ? '<span class="phase__dur">' + esc(p.duration) + '</span>' : '') + '</div>' +
          '<div class="phase__goal">' + esc(p.goal) + '</div>' +
          '<ul class="phase__tasks">' + p.tasks.map(function (t) { return "<li>" + tick(t) + "</li>"; }).join("") + '</ul></div>';
      }).join("");
  }

  function similarHTML(similar) {
    if (!similar.length) return "";
    return '<div class="section-head" style="margin-top:38px"><h2>Похожие реальные проекты</h2>' +
      '<span class="muted">из семи production-приложений, на которых собрана эта база</span></div>' +
      '<div class="simgrid">' + similar.map(function (s) {
        var p = s.project;
        var stack = Object.keys(p.stack).slice(0, 7).map(function (k) {
          return "<li><b>" + esc(k) + "</b><span>" + esc(p.stack[k]) + "</span></li>";
        }).join("");
        return '<div class="sim"><div class="sim__top"><span class="sim__name">' + esc(p.name) + '</span>' +
          '<span class="sim__match">' + s.match + '% совпадение</span></div>' +
          '<div class="sim__tag">' + esc(p.tagline) + '</div>' +
          '<div class="sim__meta">' + esc(p.scale_note) + '</div>' +
          '<ul class="sim__stack">' + stack + '</ul>' +
          '<div style="margin-top:10px"><a href="' + (window.RSA_BASE || "") + '/projects/#' + esc(p.id) + '">Разбор кейса →</a></div>' +
          '</div>';
      }).join("") + '</div>';
  }

  function exportHTML() {
    return '<div class="toolbar" style="margin-top:34px">' +
      '<button class="btn btn--primary" data-action="copy-md">Скопировать отчёт (Markdown)</button>' +
      '<button class="btn" data-action="download-md">Скачать .md</button>' +
      '<button class="btn btn--ghost" data-action="print">Печать / PDF</button>' +
      '<button class="btn btn--ghost" data-action="reset">Сбросить</button>' +
      '</div>';
  }

  /* ---------- Markdown-экспорт ---------- */
  function toMarkdown() {
    var L = LAST, out = [];
    out.push("# Рекомендация по стеку Rails\n");
    out.push("**" + L.head.arch + "** на Rails " + DATA.meta.rails + " · " + L.head.rendering +
      " · " + L.head.database + " · " + L.head.background + " · " + L.head.deploy + "\n");

    out.push("## Профиль проекта\n");
    DATA.questions.forEach(function (s) {
      s.items.forEach(function (q) {
        var opt = q.options.filter(function (o) { return o.value === ANSWERS[q.id]; })[0];
        out.push("- **" + q.title + ":** " + (opt ? opt.label : ANSWERS[q.id]));
      });
    });
    out.push("");

    out.push("## Команды\n");
    out.push("```bash\n" + L.cmd.command + "\n```\n");
    if (L.gems.runtime.length) out.push("```bash\n" + bundleAdd(L.gems.runtime) + "\n```\n");
    if (L.gems.dev.length) out.push("```bash\n" + bundleAdd(L.gems.dev, " --group development,test") + "\n```\n");
    if (L.steps.length) out.push("```bash\n" + L.steps.join("\n") + "\n```\n");

    out.push("## Решения по слоям\n");
    out.push("| Слой | Выбор | Уверенность | Ключевая причина |");
    out.push("| --- | --- | --- | --- |");
    L.result.decisions.forEach(function (d) {
      if (!d.winner || d.na) return;
      var why = (d.winner.pros[0] || {}).why || d.winner.option.short || "";
      out.push("| " + d.label + " | " + d.winner.option.title + " | " + d.confidence.label + " | " + why + " |");
    });
    out.push("");

    var addons = [];
    L.result.decisions.forEach(function (d) {
      if (d.na) return;
      d.addons.forEach(function (a) { addons.push(a.option.title + " — " + ((a.pros[0] || {}).why || "")); });
    });
    if (addons.length) {
      out.push("## Дополнения\n");
      addons.forEach(function (a) { out.push("- " + a); });
      out.push("");
    }

    if (L.risks.length) {
      out.push("## На что обратить внимание\n");
      L.risks.forEach(function (r) { out.push("- **[" + r.level + "]** " + r.text); });
      out.push("");
    }

    out.push("## План реализации\n");
    L.plan.forEach(function (p) {
      out.push("### " + p.title + (p.duration ? " _(" + p.duration + ")_" : ""));
      out.push("> " + p.goal + "\n");
      p.tasks.forEach(function (t) { out.push("- [ ] " + t); });
      out.push("");
    });

    out.push("## Похожие проекты\n");
    L.similar.forEach(function (s) {
      out.push("- **" + s.project.name + "** (" + s.match + "%) — " + s.project.tagline);
    });
    out.push("\n---\n_Сгенерировано Rails Stack Advisor · Rails " + DATA.meta.rails + " · " + location.href + "_");
    return out.join("\n");
  }

  /* ---------- делегирование действий ---------- */
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-action], [data-copy]");
    if (!b) return;
    if (b.dataset.copy) {
      var pre = document.getElementById(b.dataset.copy);
      if (pre) copy(pre.textContent, "Команда скопирована");
      return;
    }
    switch (b.dataset.action) {
      case "copy-md": copy(toMarkdown(), "Отчёт скопирован в Markdown"); break;
      case "download-md": download(toMarkdown()); break;
      case "print": window.print(); break;
      case "reset":
        ANSWERS = defaults(); APP_NAME = "myapp";
        syncChips(); writeURL(); renderReport(); toast("Настройки сброшены");
        break;
      case "to-report":
        document.getElementById("report").scrollIntoView({ behavior: "smooth", block: "start" });
        break;
    }
  });

  function download(text) {
    var blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "rails-stack-" + (ANSWERS.project_type || "plan") + ".md";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast("Файл сохранён");
  }

  /* ---------- нижняя панель ---------- */
  function initStickyBar() {
    var bar = document.getElementById("stickybar");
    var anchor = document.getElementById("report");
    if (!bar || !anchor || !("IntersectionObserver" in window)) return;
    new IntersectionObserver(function (entries) {
      bar.classList.toggle("is-on", !entries[0].isIntersecting && window.scrollY > 320);
    }, { rootMargin: "-40% 0px 0px 0px" }).observe(anchor);
  }

  /* ---------- запуск ---------- */
  fetch((window.RSA_BASE || "") + "/api/data.json")
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      DATA = E.applyTuning(data);
      ANSWERS = readURL(defaults());
      renderQuestions();
      renderPresets();
      syncChips();
      renderReport();
      initStickyBar();
      var counts = document.getElementById("kbStats");
      if (counts) {
        var opts = 0, cats = Object.keys(DATA.options).length;
        Object.keys(DATA.options).forEach(function (k) { opts += DATA.options[k].items.length; });
        counts.innerHTML = "<b>" + cats + "</b> слоёв решений · <b>" + opts + "</b> вариантов · <b>" +
          DATA.projects.length + "</b> реальных проектов · <b>" + DATA.risks.length + "</b> правил-предупреждений";
      }
    })
    .catch(function (err) {
      root.innerHTML = '<div class="card"><b>Не удалось загрузить базу знаний.</b><br>' +
        '<span class="dim">' + esc(err.message) + '. Если вы открыли файл напрямую через file://, ' +
        'запустите локальный сервер: <code>bundle exec jekyll serve</code>.</span></div>';
    });
})();
