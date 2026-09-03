#!/usr/bin/env node
// Одноразовый перенос уже опубликованных статей в content/blog/<slug>.json.
//
//   npm run blog:migrate
//   npm run blog:migrate -- --force     перезаписать уже существующий источник
//
// Статьи, сгенерированные до появления content/blog, источника не имеют. Заново
// прогонять их через OpenAI не нужно и незачем: весь текст уже лежит в готовой
// странице. Скрипт собирает источник из public/blog/<slug>/index.html и
// post.json, а затем проверяет себя — рендерит статью заново и сравнивает с
// оригиналом байт в байт. Источник записывается только при полном совпадении.
//
// Оригинальную статью скрипт не трогает ни при каком исходе.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

try {
  require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });
} catch {
  /* dotenv не установлен — работаем на значениях по умолчанию */
}

const render = require('./blog/render');
const sourceStore = require('./blog/source');

const DEFAULTS = {
  SITE_URL: 'https://myfamilyflow.ru',
  APP_URL: 'https://app.myfamilyflow.ru',
};

const PATHS = {
  articleTemplate: path.join(ROOT, 'templates', 'article.html'),
  contentBlogDir: path.join(ROOT, 'content', 'blog'),
  blogDir: path.join(ROOT, 'public', 'blog'),
  blogIndexJson: path.join(ROOT, 'public', 'blog', 'index.json'),
};

const log = (message = '') => console.log(message);
const step = (message) => console.log(`→ ${message}`);
const done = (message) => console.log(`✓ ${message}`);
const warn = (message) => console.log(`! ${message}`);

class MigrateError extends Error {}

const rel = (filePath) => path.relative(ROOT, filePath);

// Обратная операция к render.escapeHtml: значения в шаблон подставлялись
// экранированными, а в источнике должен лежать исходный текст.
function unescapeHtml(value) {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

const BODY_START = '<div class="article-body">\n        ';
const BODY_END = '\n      </div>';

function extractBetween(html, startMarker, endMarker, label) {
  const start = html.indexOf(startMarker);
  if (start === -1) throw new MigrateError(`не нашёл ${label} в index.html`);
  const from = start + startMarker.length;
  const end = html.indexOf(endMarker, from);
  if (end === -1) throw new MigrateError(`не нашёл конец блока ${label} в index.html`);
  return html.slice(from, end);
}

function matchOne(html, re, label) {
  const found = re.exec(html);
  if (!found) throw new MigrateError(`не нашёл ${label} в index.html`);
  return found[1];
}

// Разбираем готовую страницу обратно на составляющие. Ссылаемся на ту же
// разметку, которую собирает render.renderArticleHtml, поэтому вставки
// <figure> узнаются точно и превращаются обратно в плейсхолдеры.
function extractFromHtml(html) {
  const rawBody = extractBetween(html, BODY_START, BODY_END, 'блок .article-body');

  const alts = {};
  const FIGURE_RE = /<figure>\n {2}<img src="\.\/(inside-1|inside-2)\.webp" alt="([^"]*)" loading="lazy">\n<\/figure>/g;
  const articleHtml = rawBody.replace(FIGURE_RE, (whole, file, alt) => {
    const n = file === 'inside-1' ? 1 : 2;
    alts[`inside_${n}`] = unescapeHtml(alt);
    return `{{INSIDE_IMAGE_${n}}}`;
  });

  if (!alts.inside_1 || !alts.inside_2) {
    throw new MigrateError(
      'в index.html нашлись не обе внутренние картинки — возможно, статья собрана другим шаблоном'
    );
  }

  return {
    articleHtml,
    heroAlt: unescapeHtml(matchOne(html, /<img class="article-hero" src="\.\/hero\.webp" alt="([^"]*)"/, 'hero-картинку')),
    insideAlts: alts,
    ctaTitle: unescapeHtml(matchOne(html, /<h2 class="article-cta-title">([\s\S]*?)<\/h2>/, 'заголовок CTA')),
    ctaText: unescapeHtml(matchOne(html, /<p class="article-cta-text">([\s\S]*?)<\/p>/, 'текст CTA')),
  };
}

function buildSourceFromArticle({ post, extracted }) {
  return {
    version: sourceStore.SOURCE_VERSION,
    status: 'published',
    // Исходную формулировку темы восстановить неоткуда — её знал только тот,
    // кто запускал генерацию. Берём заголовок: это ближайшее правдивое значение.
    topic: post.title,
    created_at: post.date,
    published_at: post.date,

    title: post.title,
    seo_title: post.seo_title,
    seo_description: post.seo_description,
    slug: post.slug,
    excerpt: post.excerpt,
    keywords: Array.isArray(post.keywords) ? post.keywords : [],

    article_html: extracted.articleHtml,

    cta: {
      title: extracted.ctaTitle,
      text: extracted.ctaText,
    },

    // prompt в готовой странице не сохраняется, восстановить его невозможно —
    // по условию оставляем null. На пересборку это не влияет: картинки уже есть.
    images: [
      { role: 'hero', file: 'hero.webp', alt: extracted.heroAlt, prompt: null, aspect_ratio: '16:9' },
      { role: 'inside_1', file: 'inside-1.webp', alt: extracted.insideAlts.inside_1, prompt: null, aspect_ratio: '4:3' },
      { role: 'inside_2', file: 'inside-2.webp', alt: extracted.insideAlts.inside_2, prompt: null, aspect_ratio: '4:3' },
    ],

    social: {
      telegram: typeof post.telegram_post === 'string' ? post.telegram_post : '',
      threads: typeof post.threads_post === 'string' ? post.threads_post : '',
    },
  };
}

function firstDifference(a, b) {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i += 1;
  const line = a.slice(0, i).split('\n').length;
  return {
    line,
    expected: JSON.stringify(a.slice(Math.max(0, i - 40), i + 60)),
    actual: JSON.stringify(b.slice(Math.max(0, i - 40), i + 60)),
  };
}

async function migrateOne({ slug, template, siteUrl, appUrl, force }) {
  const dir = path.join(PATHS.blogDir, slug);
  const target = sourceStore.sourcePath(PATHS.contentBlogDir, slug);

  if (!force && await fs.access(target).then(() => true, () => false)) {
    warn(`${rel(target)} уже существует — пропускаю (перезаписать: --force)`);
    return { slug, skipped: true };
  }

  const [html, postRaw] = await Promise.all([
    fs.readFile(path.join(dir, 'index.html'), 'utf8'),
    fs.readFile(path.join(dir, 'post.json'), 'utf8'),
  ]);
  const post = JSON.parse(postRaw);

  const source = buildSourceFromArticle({ post, extracted: extractFromHtml(html) });

  const problems = sourceStore.validateSource(source, `content/blog/${slug}.json`);
  if (problems.length > 0) {
    throw new MigrateError(`источник собрался невалидным:\n    - ${problems.join('\n    - ')}`);
  }

  // Самопроверка: собираем статью заново из источника и сравниваем с той, что
  // лежит на сайте. Расхождение означает, что разбор чего-то не восстановил, —
  // такой источник записывать нельзя.
  const rebuilt = render.renderArticleHtml({ source, template, siteUrl, appUrl });
  if (rebuilt !== html) {
    const diff = firstDifference(html, rebuilt);
    throw new MigrateError(
      `статья, собранная из источника, отличается от опубликованной (первое расхождение около строки ${diff.line}).\n` +
      `    было:  ${diff.expected}\n    стало: ${diff.actual}\n` +
      '    Источник НЕ записан, оригинальная статья не тронута.'
    );
  }

  await sourceStore.writeSourceAtomic(target, source);
  return { slug, skipped: false, bytes: sourceStore.serializeSource(source).length };
}

async function main() {
  const force = process.argv.slice(2).includes('--force');
  const siteUrl = process.env.SITE_URL || DEFAULTS.SITE_URL;
  const appUrl = process.env.APP_URL || DEFAULTS.APP_URL;

  const template = await fs.readFile(PATHS.articleTemplate, 'utf8').catch(() => {
    throw new MigrateError(`Не найден ${rel(PATHS.articleTemplate)}`);
  });

  let index;
  try {
    index = JSON.parse(await fs.readFile(PATHS.blogIndexJson, 'utf8'));
  } catch (error) {
    throw new MigrateError(`Не удалось прочитать ${rel(PATHS.blogIndexJson)}: ${error.message}`);
  }
  if (!Array.isArray(index) || index.length === 0) {
    throw new MigrateError('public/blog/index.json пуст — переносить нечего.');
  }

  step(`Переношу статьи в ${rel(PATHS.contentBlogDir)}...`);

  const failures = [];
  let migrated = 0;
  let skipped = 0;

  for (const entry of index) {
    try {
      const result = await migrateOne({ slug: entry.slug, template, siteUrl, appUrl, force });
      if (result.skipped) skipped += 1;
      else {
        migrated += 1;
        done(`content/blog/${result.slug}.json — собран и сверен с опубликованной страницей`);
      }
    } catch (error) {
      failures.push(`${entry.slug}: ${error.message}`);
    }
  }

  if (failures.length > 0) {
    log('');
    for (const failure of failures) console.error(`✗ ${failure}`);
  }

  log('');
  log(`Перенесено: ${migrated}, пропущено: ${skipped}, с ошибками: ${failures.length}`);
  if (failures.length > 0) {
    log('Статьи с ошибками остались как были — ни одна публичная страница не изменена.');
    process.exitCode = 1;
    return;
  }
  if (migrated > 0) {
    log('');
    log('Теперь источник правды — content/blog/*.json. Проверить пересборку: npm run blog:rebuild');
  }
}

main().catch((error) => {
  if (error instanceof MigrateError) {
    console.error(`\n✗ ${error.message}`);
  } else {
    console.error(`\n✗ Перенос не удался: ${error.message}`);
  }
  process.exitCode = 1;
});
