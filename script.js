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

// Интерактивное демо «свободно сверх плана»
const BASE_WEEKS = [
  { w: 'Н31', b: 34200 }, { w: 'Н32', b: 41500 }, { w: 'Н33', b: 19200 }, { w: 'Н34', b: 52400 },
  { w: 'Н35', b: 27800 }, { w: 'Н36', b: 63100 }, { w: 'Н37', b: 38900 }, { w: 'Н38', b: 71600 },
];
const FREE = 19200;
const MAX_V = 71600;

function fmt(n) {
  return Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');
}

function renderDemo(extra) {
  let firstNeg = null;
  const bars = BASE_WEEKS.map(x => {
    const v = x.b - extra;
    if (v < 0 && !firstNeg) firstNeg = { w: x.w, v };
    const neg = v < 0;
    return {
      w: x.w,
      h: neg ? 10 : Math.max(5, Math.round((v / MAX_V) * 108)),
      color: neg ? 'var(--red-bar-dark)' : 'var(--green-bar-dark)',
      txtColor: neg ? 'var(--red-text-dark)' : 'var(--green-text-dark)',
      valText: (neg ? '−' : '') + fmt(Math.abs(v)),
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
}
