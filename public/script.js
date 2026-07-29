// Баннер согласия на cookies — управляет загрузкой Яндекс.Метрики (у неё включён
// webvisor, т.е. полная запись сессий) и пикселя VK Рекламы, поэтому не грузим
// счётчики до явного согласия. window.ffLoadMetrika и window.ffLoadVkPixel
// определены инлайновыми скриптами в <head> каждой страницы (см.
// index.html/privacy.html/terms.html/requisites.html).
(function initCookieBanner() {
  const KEY = 'ff_cookie_consent';
  // На части мобильных браузеров (напр. iOS Safari с «Блокировать все cookie»
  // в настройках) обращение к localStorage кидает SecurityError — без try/catch
  // это падение останавливало вообще весь script.js на этой строке, и баннер
  // не успевал даже отрисоваться (не говоря уже о мобильном меню и демо ниже).
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch {}
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
    try { localStorage.setItem(KEY, choice); } catch {}
    banner.remove();
    document.body.classList.remove('has-cookie-banner');
  };
  banner.querySelector('.cookie-banner-accept').addEventListener('click', () => {
    dismiss('accepted');
    if (typeof window.ffLoadMetrika === 'function') window.ffLoadMetrika();
    if (typeof window.ffLoadVkPixel === 'function') window.ffLoadVkPixel();
  });
  banner.querySelector('.cookie-banner-decline').addEventListener('click', () => dismiss('declined'));
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

// toLocaleString('ru-RU') разделяет тысячи обычным неразрывным пробелом (U+00A0) —
// в Manrope рядом с tabular-nums он выглядит широковато, меняем на узкий (U+202F).
function fmt(n) {
  return Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');
}

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
    statusTitle.textContent = 'Безопасно: трата в пределах «свободно сверх плана»';
    statusText.textContent = `После траты останется ещё ${fmt(FREE - extra)} ₽ свободных — все обязательные платежи впереди закрыты.`;
  } else {
    statusTitle.textContent = `Кассовый разрыв в неделе ${firstNeg.w.slice(1)}: ${fmt(firstNeg.v)} ₽`;
    statusText.textContent = `Семейный поток предупредил бы об этом сегодня — за ${firstNeg.w === 'Н31' ? '1 неделю' : 'несколько недель'} до минуса, пока есть время среагировать.`;
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
