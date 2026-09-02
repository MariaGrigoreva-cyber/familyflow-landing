// Сборка файлов статьи: HTML по шаблону, post.json, index.json и страница /blog/.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const sanitizeHtml = require('sanitize-html');

const ALLOWED_TAGS = ['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'blockquote', 'a'];

// article_html приходит от модели — пропускаем через белый список тегов.
// script/style/iframe и любые on*-атрибуты удаляются, у ссылок остаётся только href.
function sanitizeArticleHtml(html) {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href'],
    disallowedTagsMode: 'discard',
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Строка внутри <script type="application/ld+json">: экранируем по правилам JSON
// и дополнительно "<", чтобы содержимое не могло закрыть тег script.
function escapeJsonString(value) {
  return JSON.stringify(String(value)).slice(1, -1).replace(/</g, '\\u003c');
}

const MONTHS_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function formatDates(date = new Date()) {
  const iso = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  return { iso, human: `${date.getDate()} ${MONTHS_RU[date.getMonth()]} ${date.getFullYear()}` };
}

// Одним проходом, чтобы подставленные значения (например, ARTICLE_HTML)
// не пересканировались на плейсхолдеры и не ломались о спецсимволы $ в replace.
function fillTemplate(template, values) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  );
}

function figure(file, alt) {
  return `<figure>\n  <img src="./${file}" alt="${escapeHtml(alt)}" loading="lazy">\n</figure>`;
}

// Разметка Schema.org — единственное место в шаблоне, где HTML соседствует с
// JSON. Ошибка здесь не видна глазами, но ломает сниппет в поиске, поэтому
// проверяем блок разбором до записи файлов.
function assertValidJsonLd(html) {
  const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  if (!match) return;
  try {
    JSON.parse(match[1]);
  } catch (err) {
    throw new Error(
      `Блок JSON-LD в templates/article.html получился невалидным: ${err.message}. ` +
      'Частая причина — неразрывные пробелы (U+00A0) после редактирования шаблона в TextEdit.'
    );
  }
}

function renderArticleHtml({ article, template, siteUrl, appUrl, dates }) {
  const [hero, inside1, inside2] = article.image_prompts;

  const body = fillTemplate(sanitizeArticleHtml(article.article_html), {
    INSIDE_IMAGE_1: figure('inside-1.webp', inside1.alt),
    INSIDE_IMAGE_2: figure('inside-2.webp', inside2.alt),
  });

  const canonical = `${siteUrl}/blog/${article.slug}/`;
  const ogImage = `${siteUrl}/blog/${article.slug}/hero.webp`;

  const html = fillTemplate(template, {
    SEO_TITLE: escapeHtml(article.seo_title),
    SEO_DESCRIPTION: escapeHtml(article.seo_description),
    SEO_DESCRIPTION_JSON: escapeJsonString(article.seo_description),
    CANONICAL_URL: escapeHtml(canonical),
    OG_IMAGE: escapeHtml(ogImage),
    TITLE: escapeHtml(article.title),
    TITLE_JSON: escapeJsonString(article.title),
    EXCERPT: escapeHtml(article.excerpt),
    DATE_ISO: dates.iso,
    DATE_HUMAN: escapeHtml(dates.human),
    HERO_ALT: escapeHtml(hero.alt),
    ARTICLE_HTML: body,
    CTA_TITLE: escapeHtml(article.cta_title),
    CTA_TEXT: escapeHtml(article.cta_text),
    APP_URL: escapeHtml(appUrl),
  });

  assertValidJsonLd(html);
  return html;
}

function buildPost({ article, dates }) {
  const [hero] = article.image_prompts;
  return {
    title: article.title,
    seo_title: article.seo_title,
    seo_description: article.seo_description,
    slug: article.slug,
    excerpt: article.excerpt,
    keywords: article.keywords,
    date: dates.iso,
    url: `/blog/${article.slug}/`,
    hero: `/blog/${article.slug}/hero.webp`,
    hero_alt: hero.alt,
    telegram_post: article.telegram_post,
    threads_post: article.threads_post,
  };
}

function buildIndexEntry(post) {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    date: post.date,
    url: post.url,
    hero: post.hero,
    hero_alt: post.hero_alt,
  };
}

// Новая статья идёт первой, дубликаты по slug вытесняются.
function mergeIndex(existing, entry) {
  const rest = Array.isArray(existing) ? existing.filter((item) => item && item.slug !== entry.slug) : [];
  return [entry, ...rest];
}

async function readIndex(indexPath) {
  try {
    const parsed = JSON.parse(await fs.readFile(indexPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw new Error(`Не удалось прочитать ${indexPath}: ${err.message}`);
  }
}

function humanDate(iso) {
  const [year, month, day] = String(iso).split('-').map(Number);
  if (!year || !month || !day) return iso;
  return `${day} ${MONTHS_RU[month - 1]} ${year}`;
}

// Карточки статей рендерятся прямо в HTML (не через fetch на клиенте) —
// иначе странице блога нечего было бы индексировать.
// Разметка карточки одна и та же на /blog/ и в блоке на главной, классы
// .blog-card* лежат в public/styles.css рядом с остальной дизайн-системой.
function renderCards(posts) {
  return posts.map((post) => `      <article class="blog-card">
        <a class="blog-card-link" href="${escapeHtml(post.url)}">
          <img
            class="blog-card-image"
            src="${escapeHtml(post.hero)}"
            alt="${escapeHtml(post.hero_alt || post.title)}"
            width="1536"
            height="864"
            loading="lazy"
          >
          <div class="blog-card-date">${escapeHtml(humanDate(post.date)).toUpperCase()}</div>
          <h2 class="blog-card-title">${escapeHtml(post.title)}</h2>
          <p class="blog-card-excerpt">${escapeHtml(post.excerpt)}</p>
          <span class="blog-card-more">Читать статью →</span>
        </a>
      </article>`).join('\n');
}

const EMPTY_BLOG = '      <p class="blog-empty">Первые статьи скоро появятся.</p>';

// Одна статья не должна выглядеть потерянной в трёхколоночной сетке, две —
// оставлять пустую третью колонку. Сама разметка карточек при этом одна и та
// же, меняется только раскладка контейнера.
function blogGridClass(count) {
  if (count <= 1) return 'blog-cards blog-cards-featured';
  if (count === 2) return 'blog-cards blog-cards-duo';
  return 'blog-cards';
}

function renderBlogIndexHtml({ posts, template, siteUrl, appUrl }) {
  return fillTemplate(template, {
    CANONICAL_URL: escapeHtml(`${siteUrl}/blog/`),
    APP_URL: escapeHtml(appUrl),
    GRID_CLASS: blogGridClass(posts.length),
    CARDS: posts.length ? renderCards(posts) : EMPTY_BLOG,
  });
}

// Блок «Полезное о семейных финансах» на главной. Пока статей нет, блока нет
// вовсе — пустая секция на лендинге выглядела бы как поломка.
function renderHomeTeaser({ posts, template, limit = 3 }) {
  if (posts.length === 0) return '';
  // На главной показываем только несколько свежих статей, и раскладка считается
  // по их числу, а не по всему блогу: три статьи в индексе и три в блоке — это
  // одна и та же сетка, а вот одна статья не должна висеть узкой третью.
  const shown = posts.slice(0, limit);
  return fillTemplate(template, {
    GRID_CLASS: blogGridClass(shown.length),
    CARDS: renderCards(shown),
  });
}

const TEASER_START = '<!-- BLOG_TEASER:START -->';
const TEASER_END = '<!-- BLOG_TEASER:END -->';

// Правим главную страницу сайта, поэтому трогаем ровно то, что между
// маркерами. Нет маркеров — ничего не делаем и говорим об этом вызывающему.
function replaceHomeTeaser(homeHtml, teaserHtml) {
  const start = homeHtml.indexOf(TEASER_START);
  const end = homeHtml.indexOf(TEASER_END);

  if (start === -1 || end === -1) return null;
  if (end < start) {
    throw new Error(`В public/index.html маркер ${TEASER_END} стоит раньше ${TEASER_START}`);
  }

  const before = homeHtml.slice(0, start + TEASER_START.length);
  const after = homeHtml.slice(end);
  return `${before}\n${teaserHtml ? `${teaserHtml}\n` : ''}${after}`;
}

// Пишем через временный файл: прерванный запуск не оставит обрезанный index.json.
async function writeFileAtomic(filePath, contents) {
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.tmp`);
  await fs.writeFile(tmp, contents);
  await fs.rename(tmp, filePath);
}

module.exports = {
  sanitizeArticleHtml,
  escapeHtml,
  escapeJsonString,
  formatDates,
  fillTemplate,
  renderArticleHtml,
  buildPost,
  buildIndexEntry,
  mergeIndex,
  readIndex,
  renderBlogIndexHtml,
  renderHomeTeaser,
  replaceHomeTeaser,
  writeFileAtomic,
  ALLOWED_TAGS,
};
