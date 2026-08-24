/* ============================================================
   Rails Stack Advisor — движок принятия решений.
   Чистые функции: данные + ответы -> рекомендация.
   ============================================================ */
(function (global) {
  "use strict";

  var ADDON_THRESHOLD = 60;   // порог включения дополнения
  var SURE_GAP = 20;          // отрыв, при котором выбор считается уверенным
  var LEAN_GAP = 8;

  function asArray(v) { return Array.isArray(v) ? v : [v]; }

  /** Условие срабатывает, если по каждому ключу ответ входит в список значений. */
  function matches(cond, answers) {
    if (!cond) return false;
    return Object.keys(cond).every(function (key) {
      return asArray(cond[key]).indexOf(answers[key]) !== -1;
    });
  }

  /** Правило срабатывает, если совпали ответы (if) и уже сделанные выборы (picked). */
  function ruleFires(rule, answers, chosen) {
    if (rule.if && !matches(rule.if, answers)) return false;
    if (rule.picked && !rule.picked.some(function (id) { return chosen.indexOf(id) !== -1; })) return false;
    return !!(rule.if || rule.picked);
  }

  /** Балл варианта = base + сумма сработавших правил; попутно собираем обоснования. */
  function scoreOption(option, answers, chosen) {
    chosen = chosen || [];
    var score = typeof option.base === "number" ? option.base : 0;
    var pros = [], cons = [];
    (option.rules || []).forEach(function (rule) {
      if (!ruleFires(rule, answers, chosen)) return;
      score += rule.score;
      (rule.score >= 0 ? pros : cons).push({ score: rule.score, why: rule.why });
    });
    pros.sort(function (a, b) { return b.score - a.score; });
    cons.sort(function (a, b) { return a.score - b.score; });
    return { option: option, score: score, pros: pros, cons: cons };
  }

  function confidenceOf(gap) {
    if (gap >= SURE_GAP) return { key: "sure",  label: "уверенно" };
    if (gap >= LEAN_GAP) return { key: "lean",  label: "перевес" };
    return { key: "close", label: "спорно" };
  }

  /** Решение по одной категории: победитель, альтернативы, включённые дополнения. */
  function decideCategory(catKey, category, answers, chosen) {
    var scored = (category.items || []).map(function (o) { return scoreOption(o, answers, chosen); });
    var main   = scored.filter(function (s) { return !s.option.addon; });
    var addons = scored.filter(function (s) { return s.option.addon; });

    main.sort(function (a, b) { return b.score - a.score; });
    addons.sort(function (a, b) { return b.score - a.score; });

    var winner = main[0] || null;
    var gap = (main.length > 1 && winner) ? winner.score - main[1].score : 99;

    return {
      key: catKey,
      label: category.label,
      subtitle: category.subtitle,
      icon: category.icon,
      winner: winner,
      confidence: confidenceOf(gap),
      gap: gap,
      alternatives: main.slice(1),
      addons: addons.filter(function (a) { return a.score >= ADDON_THRESHOLD; }),
      rejectedAddons: addons.filter(function (a) { return a.score < ADDON_THRESHOLD; })
    };
  }

  /**
   * Полное решение. Категории считаются в порядке объявления, и каждая следующая
   * видит уже сделанный выбор — так правила `picked` держат слои согласованными.
   */
  // Слои, которых у статически сгенерированного сайта попросту нет.
  var NA_WHEN_STATIC = ["architecture", "database", "background", "api", "auth", "authorization",
                        "pagination", "search", "observability", "security", "patterns"];

  function decide(data, answers) {
    var chosen = [];
    var decisions = Object.keys(data.options).map(function (k) {
      var d = decideCategory(k, data.options[k], answers, chosen);
      if (d.winner) chosen.push(d.winner.option.id);
      d.addons.forEach(function (a) { chosen.push(a.option.id); });
      return d;
    });

    var isStatic = decisions.some(function (d) {
      return d.key === "rendering" && d.winner && d.winner.option.id === "ssg";
    });
    if (isStatic) {
      decisions.forEach(function (d) {
        if (NA_WHEN_STATIC.indexOf(d.key) === -1) return;
        d.na = "Статическому сайту этот слой не нужен: нет ни сервера, ни пользовательских данных в рантайме.";
        // Убираем из выбранного, чтобы гемы, задачи плана и риски не тянулись за ним.
        var drop = [d.winner ? d.winner.option.id : null]
          .concat(d.addons.map(function (a) { return a.option.id; }))
          .filter(Boolean);
        chosen = chosen.filter(function (id) { return drop.indexOf(id) === -1; });
      });
    }

    return { decisions: decisions, chosen: chosen, isStatic: isStatic, byKey: index(decisions) };
  }

  /** Вливает кросс-слойные правила из _data/tuning.yml в каталог вариантов. */
  function applyTuning(data) {
    (data.tuning || []).forEach(function (entry) {
      var cat = data.options[entry.category];
      if (!cat) return;
      var opt = (cat.items || []).filter(function (o) { return o.id === entry.option; })[0];
      if (!opt) return;
      opt.rules = (opt.rules || []).concat(entry.rules || []);
    });
    return data;
  }

  function index(decisions) {
    var map = {};
    decisions.forEach(function (d) { map[d.key] = d; });
    return map;
  }

  function pick(result, catKey) {
    var d = result.byKey[catKey];
    return d && d.winner ? d.winner.option : null;
  }

  /** Задача/риск проходит, если совпали ответы (if) и есть пересечение с выбранным (needs). */
  function applicable(item, answers, chosen) {
    if (item.if && !matches(item.if, answers)) return false;
    if (item.needs && !item.needs.some(function (id) { return chosen.indexOf(id) !== -1; })) return false;
    return true;
  }

  function buildPlan(data, answers, chosen) {
    var timeline = answers.timeline;
    return (data.plans.phases || []).map(function (phase) {
      var tasks = (phase.tasks || []).filter(function (t) { return applicable(t, answers, chosen); });
      return {
        id: phase.id,
        title: phase.title,
        goal: phase.goal,
        duration: (phase.duration || {})[timeline] || "",
        tasks: tasks.map(function (t) { return t.text; })
      };
    }).filter(function (p) { return p.tasks.length && p.duration !== "пропустить"; });
  }

  function buildRisks(data, answers, chosen) {
    var rank = { high: 0, medium: 1, low: 2 };
    return (data.risks || [])
      .filter(function (r) { return applicable(r, answers, chosen); })
      .sort(function (a, b) { return rank[a.level] - rank[b.level]; });
  }

  /** Похожие проекты: доля совпавших полей профиля, с весами по ключевым осям. */
  var PROFILE_WEIGHTS = {
    project_type: 3, domain: 2, ui: 3, team: 2, scale: 2,
    seo: 1, realtime: 1, mobile: 1, timeline: 1, infra: 1, compliance: 1, rails_exp: 1
  };

  function similarProjects(data, answers, limit) {
    var total = 0;
    Object.keys(PROFILE_WEIGHTS).forEach(function (k) { total += PROFILE_WEIGHTS[k]; });

    return (data.projects || []).map(function (p) {
      var hit = 0, shared = [];
      Object.keys(PROFILE_WEIGHTS).forEach(function (k) {
        if (p.profile[k] === answers[k]) { hit += PROFILE_WEIGHTS[k]; shared.push(k); }
      });
      return { project: p, match: Math.round((hit / total) * 100), shared: shared };
    })
    .sort(function (a, b) { return b.match - a.match; })
    .slice(0, limit || 3);
  }

  /* -------------------- генерация команд и Gemfile -------------------- */

  var DEV_TEST_GEMS = [
    "rspec-rails", "factory_bot_rails", "faker", "shoulda-matchers", "capybara",
    "selenium-webdriver", "webmock", "vcr", "simplecov", "bullet", "rack-mini-profiler",
    "brakeman", "bundler-audit", "rubocop-rails-omakase", "rubocop", "rubocop-rails",
    "rubocop-performance", "standard", "annotaterb", "dotenv-rails", "debug", "web-console"
  ];
  // Уже входит в результат `rails new` на Rails 8 — повторно ставить не нужно.
  var BUILT_IN = [
    "propshaft", "importmap-rails", "turbo-rails", "stimulus-rails", "tailwindcss-rails",
    "solid_queue", "solid_cache", "solid_cable", "kamal", "thruster", "bootsnap", "jbuilder",
    "pg", "mysql2", "brakeman", "rubocop-rails-omakase", "bundler-audit", "debug", "web-console",
    "capybara", "selenium-webdriver"
  ];

  function collectGems(data, result) {
    var runtime = [], dev = [], builtin = [];
    result.decisions.forEach(function (d) {
      if (d.na) return;
      var picks = [];
      if (d.winner) picks.push(d.winner.option);
      d.addons.forEach(function (a) { picks.push(a.option); });
      picks.forEach(function (o) {
        (o.gems || []).forEach(function (g) {
          var bucket = BUILT_IN.indexOf(g) !== -1 ? builtin
                     : DEV_TEST_GEMS.indexOf(g) !== -1 ? dev : runtime;
          if (bucket.indexOf(g) === -1) bucket.push(g);
        });
      });
    });
    return { runtime: runtime.sort(), dev: dev.sort(), builtin: builtin.sort() };
  }

  function railsNewCommand(data, result, answers, appName) {
    var name = appName || "myapp";
    var db = pick(result, "database");
    var css = pick(result, "css");
    var fe = pick(result, "frontend");
    var flags = [];

    var rend = pick(result, "rendering");
    var assets = pick(result, "assets");
    var viaVite = assets && assets.id === "vite_ruby";

    // Статическая генерация — это вообще не rails new.
    if (rend && rend.id === "ssg") {
      return {
        command: "# Статический сайт: Rails не нужен\n" +
                 "gem install bridgetown\n" +
                 "bridgetown new " + name + "   # либо jekyll new " + name,
        flags: [], name: name, static: true
      };
    }

    flags.push(db && db.flags ? db.flags : "--database=postgresql");

    // Tailwind через Vite ставится из npm, а не гемом tailwindcss-rails.
    if (css && css.flags && !viaVite) flags.push(css.flags);
    else if (css && css.id === "dartsass" && !viaVite) flags.push("--css=sass");

    if (fe && fe.id === "api_meta_framework") flags.push("--api");
    else if (viaVite) flags.push("--skip-javascript");
    else if (fe && fe.flags) flags.push(fe.flags);

    var testing = pick(result, "testing");
    if (answers.timeline === "hackathon" && testing && testing.id === "smoke_only") {
      flags.push("--skip-system-test");
    }

    var lines = ["rails new " + name];
    flags.forEach(function (f) { lines.push("  " + f); });
    return { command: lines.join(" \\\n"), flags: flags, name: name, viaVite: viaVite };
  }

  function postInstallSteps(result) {
    var steps = [];
    var rend = pick(result, "rendering");
    var fe = pick(result, "frontend");
    var assets = pick(result, "assets");
    var css = pick(result, "css");
    var auth = pick(result, "auth");
    var testing = pick(result, "testing");
    var deploy = pick(result, "deploy");
    var viaVite = assets && assets.id === "vite_ruby";

    if (rend && rend.id === "ssg") {
      return [
        "# Контент в _data/*.yml и Markdown, сборка в CI",
        "bundle exec jekyll build",
        "# GitHub Pages: Settings -> Pages -> Source: GitHub Actions"
      ];
    }

    if (viaVite) {
      steps.push("bundle add vite_rails && bundle exec vite install");
      if (css && css.id === "tailwind") {
        steps.push("npm install -D tailwindcss @tailwindcss/vite   # Tailwind через Vite, не гемом");
      }
    }
    if (fe && (fe.id === "inertia_react" || fe.id === "inertia_vue")) {
      steps.push("bundle add inertia_rails && bin/rails generate inertia:install");
      steps.push(fe.id === "inertia_react"
        ? "npm install @inertiajs/react react react-dom"
        : "npm install @inertiajs/vue3 vue");
    }
    if (fe && fe.id === "turbo_mount") steps.push("npm install turbo-mount");
    if (fe && fe.id === "superglue") steps.push("bundle add superglue_rails && bin/rails superglue:install:web");
    if (assets && assets.id === "propshaft_esbuild") {
      steps.push("bundle add jsbundling-rails && bin/rails javascript:install:esbuild");
    }

    if (auth && auth.id === "rails8_builtin") steps.push("bin/rails generate authentication");
    if (auth && auth.id === "devise") steps.push("bundle add devise && bin/rails generate devise:install && bin/rails generate devise User");
    if (auth && auth.id === "authentication_zero") steps.push("bundle add authentication-zero && bin/rails generate authentication");
    if (auth && auth.id === "rodauth") steps.push("bundle add rodauth-rails && bin/rails generate rodauth:install");

    if (testing && testing.id === "rspec") steps.push("bin/rails generate rspec:install");

    if (deploy && (deploy.id === "kamal_vps" || deploy.id === "kamal_multi")) {
      steps.push("kamal init      # config/deploy.yml + .kamal/secrets");
      steps.push("kamal setup     # bootstrap сервера, kamal-proxy, TLS, первый выкат");
    }
    if (deploy && deploy.id === "paas") steps.push("# Подключить репозиторий в панели платформы, задать RAILS_MASTER_KEY");

    steps.push("bin/setup && bin/dev");
    return steps;
  }

  /** Одна фраза-вердикт: суть рекомендации. */
  function headline(data, result, answers) {
    var arch = pick(result, "architecture");
    var rend = pick(result, "rendering");
    var bg = pick(result, "background");
    var dep = pick(result, "deploy");
    var db = pick(result, "database");
    return {
      arch: arch ? arch.title : "",
      rendering: rend ? rend.title : "",
      background: bg ? bg.title : "",
      deploy: dep ? dep.title : "",
      database: db ? db.title : "",
      text: [
        arch ? arch.title : "",
        "на Rails " + data.meta.rails,
        rend ? "· " + rend.title : "",
        db ? "· " + db.title : "",
        bg ? "· " + bg.title : "",
        dep ? "· " + dep.title : ""
      ].filter(Boolean).join(" ")
    };
  }

  global.RSAEngine = {
    matches: matches,
    applyTuning: applyTuning,
    scoreOption: scoreOption,
    decide: decide,
    pick: pick,
    buildPlan: buildPlan,
    buildRisks: buildRisks,
    similarProjects: similarProjects,
    collectGems: collectGems,
    railsNewCommand: railsNewCommand,
    postInstallSteps: postInstallSteps,
    headline: headline,
    ADDON_THRESHOLD: ADDON_THRESHOLD
  };
})(window);
