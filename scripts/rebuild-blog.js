#!/usr/bin/env node
// Пересборка статических страниц блога из уже сохранённых данных.
//
//   npm run blog:rebuild
//
// Нужна после правки templates/blog-index.html, templates/home-teaser.html или
// стилей карточек: уже сгенерированные страницы остаются старыми до следующего
// прогона генератора, а гонять платный npm run blog ради вёрстки незачем.
//
// Команда полностью офлайновая: не обращается к OpenAI, не требует
// OPENAI_API_KEY, не генерирует картинки и ничего не удаляет.
//
// Источник правды — public/blog/index.json. Он и post.json только читаются.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// SITE_URL и APP_URL можно переопределить в .env, как и для генератора. dotenv
// живёт в devDependencies, поэтому на проде (npm install --omit=dev) его нет —
// там просто берутся значения по умолчанию, и команда всё равно работает.
try {
  require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });
} catch {
  /* dotenv не установлен — не страшно, ниже есть дефолты */
}

const render = require('./blog/render');

const DEFAULTS = {
  SITE_URL: 'https://myfamilyflow.ru',
  APP_URL: 'https://app.myfamilyflow.ru',
};

const PATHS = {
  blogIndexTemplate: path.join(ROOT, 'templates', 'blog-index.html'),
  homeTeaserTemplate: path.join(ROOT, 'templates', 'home-teaser.html'),
  blogDir: path.join(ROOT, 'public', 'blog'),
  blogIndexJson: path.join(ROOT, 'public', 'blog', 'index.json'),
  blogIndexHtml: path.join(ROOT, 'public', 'blog', 'index.html'),
  homeIndexHtml: path.join(ROOT, 'public', 'index.html'),
};

const log = (message) => console.log(message);
const step = (message) => console.log(`→ ${message}`);
const done = (message) => console.log(`✓ ${message}`);
const warn = (message) => console.log(`! ${message}`);

const SLUG_RE = /^[a-z0-9-]+$/;
// Поля, без которых карточку не нарисовать. hero_alt необязателен — рендер
// подставит вместо него заголовок.
const REQUIRED_FIELDS = ['title', 'slug', 'excerpt', 'date', 'url', 'hero'];

class RebuildError extends Error {}

async function readFileOrNull(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function readTemplate(filePath, label) {
  const contents = await readFileOrNull(filePath);
  if (contents === null) throw new RebuildError(`Не найден ${label}: ${path.relative(ROOT, filePath)}`);
  return contents;
}

// Индекс читаем строго: на нём держатся и /blog/, и блок на главной, поэтому
// при малейшем сомнении лучше не трогать ни один файл.
async function readIndexJson() {
  const raw = await readFileOrNull(PATHS.blogIndexJson);
  if (raw === null) {
    throw new RebuildError(
      'Нет public/blog/index.json — пересобирать нечего. Сначала сгенерируйте статью: npm run blog'
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new RebuildError(`public/blog/index.json — битый JSON (${error.message}). Ничего не перезаписано.`);
  }

  if (!Array.isArray(parsed)) {
    throw new RebuildError('public/blog/index.json должен быть массивом статей. Ничего не перезаписано.');
  }
  if (parsed.length === 0) {
    throw new RebuildError(
      'public/blog/index.json пуст. Пустую страницу блога не собираю — сначала сгенерируйте статью: npm run blog'
    );
  }

  parsed.forEach((post, i) => {
    if (!post || typeof post !== 'object') {
      throw new RebuildError(`index.json: элемент #${i + 1} — не объект. Ничего не перезаписано.`);
    }
    const missing = REQUIRED_FIELDS.filter((field) => typeof post[field] !== 'string' || !post[field].trim());
    if (missing.length > 0) {
      throw new RebuildError(
        `index.json: у статьи #${i + 1} нет полей ${missing.join(', ')}. Ничего не перезаписано.`
      );
    }
    if (!SLUG_RE.test(post.slug)) {
      throw new RebuildError(`index.json: недопустимый slug «${post.slug}». Ничего не перезаписано.`);
    }
  });

  const slugs = parsed.map((post) => post.slug);
  const duplicate = slugs.find((slug, i) => slugs.indexOf(slug) !== i);
  if (duplicate) {
    throw new RebuildError(`index.json: slug «${duplicate}» встречается дважды. Ничего не перезаписано.`);
  }

  return parsed;
}

// Страницу статьи из post.json собрать нельзя: там нет article_html, cta_title
// и cta_text — то есть самого текста статьи, CTA и подписей внутренних
// картинок. Достраивать их «по памяти» значило бы испортить готовые статьи,
// поэтому мы только проверяем, что файлы на месте, и честно об этом пишем.
async function inspectArticles(posts) {
  const report = [];

  for (const post of posts) {
    const dir = path.join(PATHS.blogDir, post.slug);
    const [pageExists, postJsonExists] = await Promise.all([
      fs.access(path.join(dir, 'index.html')).then(() => true, () => false),
      fs.access(path.join(dir, 'post.json')).then(() => true, () => false),
    ]);
    report.push({ slug: post.slug, pageExists, postJsonExists });
  }

  return report;
}

async function main() {
  const siteUrl = process.env.SITE_URL || DEFAULTS.SITE_URL;
  const appUrl = process.env.APP_URL || DEFAULTS.APP_URL;

  step('Читаю public/blog/index.json...');
  const posts = await readIndexJson();
  done(`index.json прочитан: ${posts.length} ${posts.length === 1 ? 'статья' : 'статей'}`);

  const [blogIndexTemplate, homeTeaserTemplate] = await Promise.all([
    readTemplate(PATHS.blogIndexTemplate, 'шаблон страницы блога'),
    readTemplate(PATHS.homeTeaserTemplate, 'шаблон блока для главной'),
  ]);

  const articles = await inspectArticles(posts);
  for (const article of articles) {
    if (!article.pageExists) warn(`нет public/blog/${article.slug}/index.html — ссылка с /blog/ приведёт в 404`);
    else if (!article.postJsonExists) warn(`нет public/blog/${article.slug}/post.json`);
  }

  // Сначала рендерим всё в память и только потом пишем: так ошибка рендера не
  // оставит главную с пересобранным блоком при старой странице блога.
  const blogIndexHtml = render.renderBlogIndexHtml({
    posts,
    template: blogIndexTemplate,
    siteUrl,
    appUrl,
  });

  const homeHtml = await readFileOrNull(PATHS.homeIndexHtml);
  if (homeHtml === null) throw new RebuildError('Не найден public/index.html');

  const updatedHome = render.replaceHomeTeaser(
    homeHtml,
    render.renderHomeTeaser({ posts, template: homeTeaserTemplate })
  );

  // Обе записи атомарные (временный файл + rename), так что оборваться на
  // полпути внутри файла невозможно.
  await render.writeFileAtomic(PATHS.blogIndexHtml, blogIndexHtml);
  done('public/blog/index.html пересобран');

  if (updatedHome === null) {
    warn('в public/index.html нет маркеров BLOG_TEASER — блок на главной не тронут');
  } else if (updatedHome === homeHtml) {
    done('блок на главной уже актуален');
  } else {
    await render.writeFileAtomic(PATHS.homeIndexHtml, updatedHome);
    done('блок «Полезное о семейных финансах» на главной пересобран');
  }

  const skipped = articles.filter((article) => article.pageExists);
  if (skipped.length > 0) {
    log('');
    log(
      `Страницы статей не пересобирались (${skipped.length} шт.): в post.json нет article_html, ` +
        'cta_title и cta_text, а без них статью не собрать из шаблона. Чтобы обновить саму ' +
        'статью, нужен полный прогон: npm run blog'
    );
  }

  log('');
  log('DONE');
  log(`${siteUrl}/blog/`);
}

main().catch((error) => {
  if (error instanceof RebuildError) {
    console.error(`\n✗ ${error.message}`);
  } else {
    console.error(`\n✗ Пересборка не удалась: ${error.message}`);
  }
  process.exitCode = 1;
});
