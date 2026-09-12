// ─── Общее для всех страниц: формат сумм и отправка целей в аналитику ───────

// toLocaleString('ru-RU') разделяет тысячи обычным неразрывным пробелом (U+00A0) —
// в Manrope рядом с tabular-nums он выглядит широковато, меняем на узкий (U+202F).
function fmt(n) {
  return Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');
}
// Тот же формат нужен калькуляторам в /tools/ — там свои скрипты на странице.
window.ffFmtNum = fmt;

// Цели Яндекс.Метрики. Счётчик грузится только после согласия на cookies, до
// этого window.ym не существует: события кладём в короткую очередь и отправляем,
// если согласие дадут в этой же сессии (ffFlushGoals ниже). При отказе очередь
// просто выбрасывается.
// Важно: в целях нет и не должно быть пользовательских сумм — только имя цели и
// короткие технические параметры (какой калькулятор, положительный результат или
// дефицит).
(function initGoals() {
  const METRIKA_ID = 111067132;
  const QUEUE_LIMIT = 20;
  let queue = [];

  const send = (goal, params) => {
    try {
      if (typeof window.ym !== 'function') return false;
      window.ym(METRIKA_ID, 'reachGoal', goal, params || undefined);
      return true;
    } catch {
      return false;
    }
  };

  window.ffTrack = function (goal, params) {
    if (send(goal, params)) return;
    if (queue.length < QUEUE_LIMIT) queue.push([goal, params]);
  };

  window.ffFlushGoals = function () {
    const pending = queue;
    queue = [];
    for (const [goal, params] of pending) send(goal, params);
  };

  window.ffDropGoals = function () {
    queue = [];
  };
})();

// Баннер согласия на cookies — управляет загрузкой Яндекс.Метрики (у неё включён
// webvisor, т.е. полная запись сессий) и пикселя VK Рекламы, поэтому не грузим
// счётчики до явного согласия. window.ffLoadMetrika и window.ffLoadVkPixel
// определены инлайновыми скриптами в <head> каждой страницы (см.
// index.html/privacy.html/terms.html/requisites.html).
(function initCookieBanner() {
  const KEY = 'ff_cookie_consent';
  // Согласие живёт в cookie на домене .myfamilyflow.ru, а не в localStorage:
  // app.myfamilyflow.ru — другой origin, и localStorage у него свой, поэтому
  // согласие с лендинга туда не долетало и Метрика в приложении не грузилась,
  // пока пользователь не соглашался ещё раз — часть регистраций из рекламы
  // не попадала в статистику.
  const cookieDomain = /(^|\.)myfamilyflow\.ru$/.test(location.hostname) ? '.myfamilyflow.ru' : '';
  const readConsent = () => {
    const m = document.cookie.match(/(?:^|; )ff_cookie_consent=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : null;
  };
  const writeConsent = value => {
    document.cookie = `${KEY}=${value}; path=/; max-age=${180 * 24 * 60 * 60}${cookieDomain ? `; domain=${cookieDomain}` : ''}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  };

  // Атрибуция клика по рекламе (yclid/utm_*) — читаем из URL при заходе на
  // лендинг и, как только есть согласие, кладём в ту же общую cookie
  // (.myfamilyflow.ru), что и само согласие. app.myfamilyflow.ru — поддомен,
  // поэтому cookie доедет туда сама, без переписывания ссылок «Попробовать
  // бесплатно». Приложение прикладывает её к регистрации — без этого нельзя
  // понять, какая кампания/фраза в Директе реально дала регистрацию, и
  // невозможно ни оптимизировать ставки, ни загрузить офлайн-конверсии.
  const AD_PARAM_KEYS = ['yclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const adParams = {};
  new URLSearchParams(location.search).forEach((v, k) => { if (AD_PARAM_KEYS.includes(k) && v) adParams[k] = v; });
  const writeAttrCookie = (params) => {
    const value = encodeURIComponent(JSON.stringify(Object.assign({ ts: Date.now() }, params)));
    // Короче, чем согласие (30 дней) — окно принятия решения о регистрации
    // после клика по рекламе разумно ограничить, а не хранить вечно.
    document.cookie = `ff_attr=${value}; path=/; max-age=${30 * 24 * 60 * 60}${cookieDomain ? `; domain=${cookieDomain}` : ''}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  };
  const writeAttribution = () => {
    if (Object.keys(adParams).length === 0) return;
    writeAttrCookie(adParams);
  };
  // Читаем так же, как приложение (familyflow-web/src/lib/metrika.js).
  const readAttribution = () => {
    const m = document.cookie.match(/(?:^|; )ff_attr=([^;]*)/);
    if (!m) return null;
    try { return JSON.parse(decodeURIComponent(m[1])); } catch { return null; }
  };

  // Только известные ключи и только короткие «метки кампаний». Это же гарантия,
  // что в атрибуцию физически не может попасть что-то введённое пользователем.
  const cleanParams = (params) => {
    const out = {};
    for (const key of AD_PARAM_KEYS) {
      const value = params && params[key];
      if (typeof value === 'string' && /^[\w.-]{1,64}$/.test(value)) out[key] = value;
    }
    return out;
  };

  // Обычная (не рекламная) поисковая выдача. Всё, чего здесь нет, поиском не
  // считается — в том числе mail.ru и vk.com, откуда приходят по ссылкам.
  const SEARCH_HOSTS = [
    [/(^|\.)google\./, 'google'],
    [/(^|\.)yandex\./, 'yandex'],
    [/^ya\.ru$/, 'yandex'],
    [/^go\.mail\.ru$/, 'mail'],
    [/(^|\.)bing\.com$/, 'bing'],
    [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
    [/(^|\.)rambler\.ru$/, 'rambler'],
    [/(^|\.)yahoo\./, 'yahoo'],
  ];

  // Откуда человек реально пришёл — по referrer, а не по тому, на какой
  // странице он оказался. Страницу калькулятора открывают и из поиска, и из
  // Telegram, и напрямую, поэтому записывать весь её трафик как organic нельзя.
  // null — источник неизвестен (переход внутри сайта): тогда лучше не указывать
  // его вовсе, чем подставить неверный.
  const acquisitionSource = () => {
    let host = '';
    try { host = new URL(document.referrer).hostname.toLowerCase(); } catch { /* пустой или битый referrer */ }

    if (!host) return { utm_source: 'direct', utm_medium: 'none' };
    if (host === location.hostname.toLowerCase() || /(^|\.)myfamilyflow\.ru$/.test(host)) return null;

    for (const [pattern, name] of SEARCH_HOSTS) {
      if (pattern.test(host)) return { utm_source: name, utm_medium: 'organic' };
    }
    return { utm_source: host.replace(/^www\./, ''), utm_medium: 'referral' };
  };

  // Метка того, чем человек воспользовался на сайте (сейчас — калькулятор в
  // /tools/): utm_campaign/utm_content. Канал привлечения к ней добавляется из
  // referrer, а не выдумывается. Новой системы атрибуции не заводим — это та же
  // cookie ff_attr, которую приложение читает при регистрации.
  //
  // Приоритеты: рекламная разметка (yclid или свои utm_campaign/utm_content)
  // не трогается вообще; уже записанный канал привлечения сохраняется, метка
  // инструмента к нему только дописывается.
  //
  // Возвращает 'written' | 'merged' | 'kept' | 'no-consent' | 'empty' — удобно
  // для отладки, на поведение страницы не влияет.
  let pendingMarks = null;

  const applyMarks = () => {
    if (!pendingMarks) return 'empty';
    // Та же политика, что у счётчиков: без согласия на cookies ничего не пишем.
    if (readConsent() !== 'accepted') return 'no-consent';

    const marks = cleanParams(pendingMarks);
    if (Object.keys(marks).length === 0) return 'empty';

    const current = readAttribution();
    if (current) {
      // Клик по объявлению, рассылка, ручная UTM-ссылка — их разметка
      // приоритетнее, перезаписать её значит потерять связь регистрации с
      // кампанией в Директе и офлайн-конверсии по yclid.
      if (current.yclid || current.utm_campaign || current.utm_content) return 'kept';
      // Канал привлечения уже определён на предыдущей странице — сохраняем его
      // вместе с исходным ts (это первое касание), дописываем только метку.
      writeAttrCookie(Object.assign({}, current, marks));
      return 'merged';
    }

    writeAttrCookie(Object.assign({}, acquisitionSource() || {}, marks));
    return 'written';
  };

  // Канал привлечения запоминаем на любой публичной странице лендинга, а не
  // только там, где человек нажал кнопку. Путь «поиск → главная → статья →
  // калькулятор» иначе терял исходный источник: на странице калькулятора
  // referrer уже внутренний, и определить по нему нечего.
  //
  // Первое касание не переписываем никогда: если источник (или yclid) уже
  // записан, функция ничего не делает. Рекламная атрибуция переписывает запись
  // сама, отдельным путём (writeAttribution выше), — этот порядок сохранён.
  //
  // Возвращает 'written' | 'merged' | 'kept' | 'internal' | 'no-consent'.
  const rememberAcquisition = () => {
    if (readConsent() !== 'accepted') return 'no-consent';

    const current = readAttribution();
    // yclid без utm_* — это автометка Директа: referrer у такого клика тоже
    // yandex.ru, и дописать к нему organic значило бы переписать платный визит
    // в органику.
    if (current && (current.yclid || current.utm_source)) return 'kept';

    const source = acquisitionSource();
    // Переход внутри сайта нового источника не создаёт.
    if (!source) return 'internal';

    // current здесь либо пуст, либо содержит только метку инструмента — тогда
    // сохраняем её и исходный ts, дописывая канал.
    writeAttrCookie(Object.assign({}, current || {}, source));
    return current ? 'merged' : 'written';
  };

  // Та же функция, что страница вызывает сама при загрузке. Открыта для
  // диагностики — как ffTrack и ffMarkAttribution рядом.
  window.ffRememberAcquisition = rememberAcquisition;

  // Запоминаем метку в памяти: если согласие ещё не дано, она применится сразу
  // после нажатия «Принять» (см. обработчик баннера ниже). Отдельного хранилища
  // под это не заводим.
  window.ffMarkAttribution = function (marks) {
    pendingMarks = marks;
    return applyMarks();
  };

  // На части мобильных браузеров (напр. iOS Safari с «Блокировать все cookie»
  // в настройках) обращение к localStorage кидает SecurityError — без try/catch
  // это падение останавливало вообще весь script.js на этой строке, и баннер
  // не успевал даже отрисоваться (не говоря уже о мобильном меню и демо ниже).
  let saved = readConsent();
  if (!saved) {
    // Миграция со старой per-origin схемы — не переспрашиваем, если человек
    // уже отвечал на этом origin раньше.
    try {
      const legacy = localStorage.getItem(KEY);
      if (legacy) { writeConsent(legacy); localStorage.removeItem(KEY); saved = legacy; }
    } catch {}
  }
  // Порядок важен: рекламные метки из URL пишутся первыми и перекрывают всё,
  // и только потом фиксируется канал привлечения — он уже ничего не тронет.
  if (saved === 'accepted') { writeAttribution(); rememberAcquisition(); }
  if (saved === 'accepted' || saved === 'declined') return;

  const banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Согласие на использование cookies');
  banner.innerHTML = `
    <p class="cookie-banner-text">Мы используем cookies, Яндекс.Метрику и VK Рекламу для аналитики посещений. Подробнее — в <a href="/privacy.html">политике конфиденциальности</a>.</p>
    <div class="cookie-banner-actions">
      <button type="button" class="btn btn-outline cookie-banner-decline">Отклонить</button>
      <button type="button" class="btn btn-primary cookie-banner-accept">Принять</button>
    </div>`;
  document.body.appendChild(banner);
  document.body.classList.add('has-cookie-banner'); // сдвигает floating-cta, чтобы баннер её не перекрывал

  const dismiss = choice => {
    // Если сохранить выбор не получилось (см. комментарий выше про заблокированное
    // хранилище) — баннер просто покажется снова при следующем визите, это не
    // должно мешать закрыть его и (при согласии) загрузить счётчик сейчас.
    try { writeConsent(choice); } catch {}
    banner.remove();
    document.body.classList.remove('has-cookie-banner');
  };
  banner.querySelector('.cookie-banner-accept').addEventListener('click', () => {
    dismiss('accepted');
    // Тот же порядок, что и при уже сохранённом согласии выше: рекламные метки
    // из URL → канал привлечения → метка инструмента. Каждый следующий шаг
    // только дописывает недостающее и не трогает предыдущий.
    writeAttribution();
    rememberAcquisition();
    applyMarks();
    if (typeof window.ffLoadMetrika === 'function') window.ffLoadMetrika();
    if (typeof window.ffLoadVkPixel === 'function') window.ffLoadVkPixel();
    // Счётчик только что подключился — досылаем цели, накопившиеся до согласия
    // (например, просмотр калькулятора в /tools/).
    if (typeof window.ffFlushGoals === 'function') window.ffFlushGoals();
  });
  banner.querySelector('.cookie-banner-decline').addEventListener('click', () => {
    dismiss('declined');
    pendingMarks = null;
    if (typeof window.ffDropGoals === 'function') window.ffDropGoals();
  });
})();

// Мобильное меню
const navBurger = document.getElementById('navBurger');
const navLinks = document.getElementById('navLinks');
if (navBurger && navLinks) {
  navBurger.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    navBurger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  navLinks.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navBurger.setAttribute('aria-expanded', 'false');
    });
  });
}

// Плавающая кнопка «Открыть приложение» — показываем после того, как страница
// прокручена на высоту экрана, чтобы не дублировать hero-кнопку сразу же на
// первом экране. Порог по scrollY, а не по границе .hero — на мобильном хиро
// (мокап телефона + текст в столбик) может быть заметно выше экрана.
const floatingCta = document.getElementById('floatingCta');
if (floatingCta) {
  const toggleFloatingCta = () => {
    floatingCta.classList.toggle('visible', window.scrollY > window.innerHeight * 0.6);
  };
  toggleFloatingCta();
  window.addEventListener('scroll', toggleFloatingCta, { passive: true });
}

// Интерактивное демо «свободно сверх плана»
const BASE_WEEKS = [
  { w: 'Н31', b: 34200 }, { w: 'Н32', b: 41500 }, { w: 'Н33', b: 19200 }, { w: 'Н34', b: 52400 },
  { w: 'Н35', b: 27800 }, { w: 'Н36', b: 63100 }, { w: 'Н37', b: 38900 }, { w: 'Н38', b: 71600 },
];
const FREE = 19200;
const MAX_V = 71600;

// Компактный формат для узких столбцов на мобильном («22.2к» вместо «22 200»).
function kFmt(n) {
  const k = Math.abs(n) / 1000;
  return (n < 0 ? '−' : '') + (k >= 10 ? Math.round(k) : Math.round(k * 10) / 10) + 'к';
}

function renderDemo(extra) {
  const mobile = window.innerWidth <= 640;
  const maxBarPx = mobile ? 84 : 108;
  let firstNeg = null;
  const bars = BASE_WEEKS.map(x => {
    const v = x.b - extra;
    if (v < 0 && !firstNeg) firstNeg = { w: x.w, v };
    const neg = v < 0;
    return {
      w: x.w,
      h: neg ? (mobile ? 8 : 10) : Math.max(mobile ? 4 : 5, Math.round((v / MAX_V) * maxBarPx)),
      color: neg ? 'var(--red-bar-dark)' : 'var(--green-bar-dark)',
      txtColor: neg ? 'var(--red-text-dark)' : 'var(--green-text-dark)',
      valText: mobile ? kFmt(v) : (neg ? '−' : '') + fmt(Math.abs(v)),
    };
  });
  const safe = !firstNeg;

  const barsEl = document.getElementById('demoBars');
  barsEl.innerHTML = bars.map(bar => `
    <div class="demo-bar-col">
      <div class="demo-bar-val" style="color:${bar.txtColor}">${bar.valText}</div>
      <div class="demo-bar" style="height:${bar.h}px;background:${bar.color}"></div>
      <div class="demo-bar-week">${bar.w}</div>
    </div>
  `).join('');

  const statusEl = document.getElementById('demoStatus');
  const statusIcon = document.getElementById('demoStatusIcon');
  const statusTitle = document.getElementById('demoStatusTitle');
  const statusText = document.getElementById('demoStatusText');

  statusEl.style.background = safe ? 'var(--green-status-bg-dark)' : 'var(--red-status-bg-dark)';
  const color = safe ? 'var(--green-status-dark)' : 'var(--red-text-dark)';
  statusIcon.style.color = color;
  statusTitle.style.color = color;
  statusIcon.textContent = safe ? '✓' : '⚠';

  if (safe) {
    statusTitle.textContent = 'Можно тратить — укладываетесь в «свободно сверх плана»';
    statusText.textContent = `После этой траты останется ещё ${fmt(FREE - extra)} ₽ свободных — все платежи впереди уже закрыты.`;
  } else {
    statusTitle.textContent = `На неделе ${firstNeg.w.slice(1)} уйдёте в минус на ${fmt(Math.abs(firstNeg.v))} ₽`;
    statusText.textContent = `Семейный поток предупредил бы вас уже сегодня — за ${firstNeg.w === 'Н31' ? 'неделю' : 'несколько недель'} до минуса, пока есть время что-то поменять.`;
  }

  document.getElementById('demoValue').textContent = fmt(extra) + ' ₽';
}

const demoSlider = document.getElementById('demoSlider');
if (demoSlider) {
  renderDemo(+demoSlider.value);
  demoSlider.addEventListener('input', () => renderDemo(+demoSlider.value));
  // Пересчитать формат чисел/масштаб баров при переходе через мобильную границу
  let demoResizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(demoResizeTimer);
    demoResizeTimer = setTimeout(() => renderDemo(+demoSlider.value), 150);
  });
}
