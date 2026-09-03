// Canonical source статьи: content/blog/<slug>.json.
//
// Всё в public/blog — производное: страницу, post.json, индекс и sitemap можно
// в любой момент пересобрать из этих файлов (npm run blog:rebuild). Здесь живут
// схема, сборка из ответа модели, валидация и атомарная запись.
//
// Чего в источнике не бывает: ключей API, base64 картинок и сырого ответа
// OpenAI. Только то, что нужно, чтобы заново собрать страницу.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { sanitizeArticleHtml } = require('./render');

const SOURCE_VERSION = 1;
const STATUSES = ['draft', 'published'];
const SLUG_RE = /^[a-z0-9-]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const IMAGE_SHAPE = [
  { role: 'hero', file: 'hero.webp', aspect_ratio: '16:9' },
  { role: 'inside_1', file: 'inside-1.webp', aspect_ratio: '4:3' },
  { role: 'inside_2', file: 'inside-2.webp', aspect_ratio: '4:3' },
];

const IMAGE_FILES = IMAGE_SHAPE.map((image) => image.file);

// Границы соцпакета. Держим их здесь, потому что по ним сверяются двое: ответ
// модели (scripts/blog/text.js) и сохранённый источник — правила должны
// совпадать, иначе сгенерированное не пройдёт проверку при пересборке.
const SOCIAL_LIMITS = {
  slidesMin: 6,
  slidesMax: 8,
  scenesMin: 4,
  scenesMax: 7,
  durationMin: 20,
  durationMax: 35,
};

// Порядок площадок по умолчанию: в этом порядке content:today предлагает,
// что публиковать. Он же задаёт порядок ключей в distribution.
const PLATFORMS = ['telegram', 'threads', 'instagram', 'short_video', 'vk'];
const DISTRIBUTION_STATUSES = ['ready', 'published', 'skipped'];

// Есть ли в соцпакете содержимое для площадки. Нужно и для нормализации
// (не выставлять ready там, где публиковать нечего), и для валидации.
function hasSocialFor(social, platform) {
  if (!social || typeof social !== 'object') return false;

  if (platform === 'instagram') {
    const slides = social.instagram?.carousel?.slides;
    return Array.isArray(slides) && slides.length > 0 && isText(social.instagram?.caption);
  }
  if (platform === 'short_video') {
    const script = social.short_video?.script;
    return isText(social.short_video?.hook) && Array.isArray(script) && script.length > 0;
  }
  return isText(social[platform]);
}

// distribution — только состояние публикации. Тексты живут в social и здесь не
// дублируются: смешивать их нельзя, иначе правка статуса начнёт задевать контент.
function buildDistribution(social) {
  const distribution = {};
  for (const platform of PLATFORMS) {
    // Ложный ready там, где контента нет, хуже отсутствующей записи: по нему
    // человек пойдёт публиковать пустоту.
    if (hasSocialFor(social, platform)) {
      distribution[platform] = { status: 'ready', published_at: null };
    }
  }
  return distribution;
}

// Старые источники distribution не знают. Достраиваем его в памяти из того, что
// реально есть в social, — файл при этом не трогаем.
function normalizeDistribution(source) {
  const existing = source.distribution && typeof source.distribution === 'object' ? source.distribution : {};
  const derived = buildDistribution(source.social);

  const result = {};
  for (const platform of PLATFORMS) {
    if (existing[platform]) result[platform] = existing[platform];
    else if (derived[platform]) result[platform] = derived[platform];
  }
  return result;
}

function validateDistribution(distribution, social, label = 'distribution') {
  if (distribution === undefined) return [];  // legacy-источник — это не ошибка
  if (!distribution || typeof distribution !== 'object' || Array.isArray(distribution)) {
    return [`${label}: должен быть объектом`];
  }

  const problems = [];
  const at = (message) => problems.push(`${label}.${message}`);

  for (const [platform, entry] of Object.entries(distribution)) {
    if (!PLATFORMS.includes(platform)) {
      at(`${platform}: неизвестная площадка. Доступны: ${PLATFORMS.join(', ')}`);
      continue;
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      at(`${platform}: должен быть объектом`);
      continue;
    }
    if (!DISTRIBUTION_STATUSES.includes(entry.status)) {
      at(`${platform}.status = ${JSON.stringify(entry.status)}, доступны: ${DISTRIBUTION_STATUSES.join(', ')}`);
      continue;
    }

    if (entry.status === 'published') {
      if (!ISO_DATE_RE.test(entry.published_at || '')) {
        at(`${platform}: status = published, но published_at не дата YYYY-MM-DD`);
      }
    } else if (entry.published_at !== null && entry.published_at !== undefined) {
      at(`${platform}: status = ${entry.status}, published_at должен быть null`);
    }

    // ready означает «можно брать и публиковать» — значит, контент обязан быть.
    if (entry.status === 'ready' && !hasSocialFor(social, platform)) {
      at(`${platform}: status = ready, но в social нет контента для этой площадки`);
    }
  }

  return problems;
}

// Порядок ключей фиксируем руками: источник читают и правят люди, диффы должны
// быть стабильными от запуска к запуску.
function buildSource({ article, topic, dates, status = 'published' }) {
  return {
    version: SOURCE_VERSION,
    status,
    topic,
    created_at: dates.iso,
    published_at: status === 'published' ? dates.iso : null,

    title: article.title,
    seo_title: article.seo_title,
    seo_description: article.seo_description,
    slug: article.slug,
    excerpt: article.excerpt,
    keywords: article.keywords,

    // Санитайз делаем один раз, здесь: в источник попадает ровно тот HTML,
    // который потом окажется на странице, и пересборка получается детерминированной.
    article_html: sanitizeArticleHtml(article.article_html),

    cta: {
      title: article.cta_title,
      text: article.cta_text,
    },

    images: article.image_prompts.map((image) => ({
      role: image.role,
      file: image.file,
      alt: image.alt,
      prompt: image.prompt,
      aspect_ratio: image.aspect_ratio,
    })),

    // Модель отдаёт social уже в нужной форме — перекладывать нечего.
    social: article.social,

    // Соцпакет только что прошёл валидацию, поэтому все площадки готовы к публикации.
    distribution: buildDistribution(article.social),
  };
}

const isText = (value) => typeof value === 'string' && value.trim().length > 0;

// Статьи, созданные до расширения соцпакета, знают только telegram и threads.
// Ломать из-за этого пересборку нельзя, поэтому такие источники распознаём
// отдельно и проверяем по старым правилам.
function isLegacySocial(social) {
  return social.instagram === undefined && social.vk === undefined && social.short_video === undefined;
}

// allowLegacy = true только для сохранённых источников: статьи, созданные до
// расширения пакета, имеют право знать лишь telegram и threads. От модели пакет
// требуется целиком, поэтому scripts/blog/text.js зовёт эту функцию без поблажки.
function validateSocial(social, label = 'social', { allowLegacy = false } = {}) {
  if (!social || typeof social !== 'object' || Array.isArray(social)) return [`${label}: должен быть объектом`];

  const problems = [];
  const at = (message) => problems.push(`${label}.${message}`);

  for (const field of ['telegram', 'threads']) {
    if (!isText(social[field])) at(`${field}: пусто`);
  }

  if (allowLegacy && isLegacySocial(social)) return problems;

  if (!isText(social.vk)) at('vk: пусто');

  const instagram = social.instagram;
  if (!instagram || typeof instagram !== 'object' || Array.isArray(instagram)) {
    at('instagram: нет объекта');
  } else {
    if (!isText(instagram.caption)) at('instagram.caption: пусто');

    const carousel = instagram.carousel;
    if (!carousel || typeof carousel !== 'object' || Array.isArray(carousel)) {
      at('instagram.carousel: нет объекта');
    } else {
      if (!isText(carousel.title)) at('instagram.carousel.title: пусто');
      if (!Array.isArray(carousel.slides)) {
        at('instagram.carousel.slides: не массив');
      } else {
        const { slides } = carousel;
        if (slides.length < SOCIAL_LIMITS.slidesMin || slides.length > SOCIAL_LIMITS.slidesMax) {
          at(`instagram.carousel.slides: ${slides.length} шт., нужно ${SOCIAL_LIMITS.slidesMin}–${SOCIAL_LIMITS.slidesMax}`);
        }
        slides.forEach((slide, i) => {
          if (!slide || typeof slide !== 'object') {
            at(`instagram.carousel.slides[${i}]: не объект`);
            return;
          }
          // Нумерация подряд с единицы: по ней автор собирает карусель.
          if (slide.number !== i + 1) {
            at(`instagram.carousel.slides[${i}].number = ${JSON.stringify(slide.number)}, ожидалось ${i + 1}`);
          }
          if (!isText(slide.text)) at(`instagram.carousel.slides[${i}].text: пусто`);
        });
      }
    }
  }

  const video = social.short_video;
  if (!video || typeof video !== 'object' || Array.isArray(video)) {
    at('short_video: нет объекта');
  } else {
    if (!isText(video.hook)) at('short_video.hook: пусто');
    if (!isText(video.caption)) at('short_video.caption: пусто');
    if (!isText(video.cta)) at('short_video.cta: пусто');

    const seconds = video.duration_seconds;
    if (!Number.isInteger(seconds) || seconds < SOCIAL_LIMITS.durationMin || seconds > SOCIAL_LIMITS.durationMax) {
      at(`short_video.duration_seconds = ${JSON.stringify(seconds)}, нужно целое ${SOCIAL_LIMITS.durationMin}–${SOCIAL_LIMITS.durationMax}`);
    }

    if (!Array.isArray(video.script)) {
      at('short_video.script: не массив');
    } else {
      const { script } = video;
      if (script.length < SOCIAL_LIMITS.scenesMin || script.length > SOCIAL_LIMITS.scenesMax) {
        at(`short_video.script: ${script.length} сцен, нужно ${SOCIAL_LIMITS.scenesMin}–${SOCIAL_LIMITS.scenesMax}`);
      }
      script.forEach((scene, i) => {
        if (!scene || typeof scene !== 'object') {
          at(`short_video.script[${i}]: не объект`);
          return;
        }
        for (const field of ['time', 'voice', 'visual']) {
          if (!isText(scene[field])) at(`short_video.script[${i}].${field}: пусто`);
        }
        // overlay может быть пустым: не в каждой сцене нужен текст на экране.
        if (typeof scene.overlay !== 'string') at(`short_video.script[${i}].overlay: должен быть строкой`);
      });
    }
  }

  return problems;
}

// Возвращает список проблем, а не бросает исключение: вызывающему удобнее
// показать все ошибки файла разом, чем чинить их по одной.
function validateSource(source, label = 'источник') {
  const problems = [];
  const at = (message) => problems.push(`${label}: ${message}`);

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return [`${label}: должен быть объектом`];
  }

  if (source.version !== SOURCE_VERSION) at(`version должен быть ${SOURCE_VERSION}, получено ${JSON.stringify(source.version)}`);
  if (!STATUSES.includes(source.status)) at(`status должен быть ${STATUSES.join(' или ')}, получено ${JSON.stringify(source.status)}`);

  for (const field of ['title', 'seo_title', 'seo_description', 'excerpt']) {
    if (!isText(source[field])) at(`пустое поле ${field}`);
  }

  if (!isText(source.slug)) at('пустой slug');
  else if (!SLUG_RE.test(source.slug)) at(`slug «${source.slug}» не подходит под ^[a-z0-9-]+$`);

  if (!Array.isArray(source.keywords) || source.keywords.some((word) => typeof word !== 'string')) {
    at('keywords должен быть массивом строк');
  }

  if (!isText(source.article_html)) {
    at('пустой article_html');
  } else {
    for (const [n, placeholder] of [[1, '{{INSIDE_IMAGE_1}}'], [2, '{{INSIDE_IMAGE_2}}']]) {
      const count = source.article_html.split(placeholder).length - 1;
      if (count !== 1) at(`article_html содержит ${placeholder} ${count} раз(а), а должен ровно один`);
    }
  }

  if (!source.cta || typeof source.cta !== 'object') at('нет объекта cta');
  else {
    if (!isText(source.cta.title)) at('пустой cta.title');
    if (!isText(source.cta.text)) at('пустой cta.text');
  }

  if (!Array.isArray(source.images) || source.images.length !== IMAGE_SHAPE.length) {
    at(`images должен содержать ровно ${IMAGE_SHAPE.length} изображения`);
  } else {
    IMAGE_SHAPE.forEach((expected, i) => {
      const image = source.images[i];
      if (!image || typeof image !== 'object') {
        at(`images[${i}] должен быть объектом`);
        return;
      }
      if (image.role !== expected.role) at(`images[${i}].role должен быть «${expected.role}», получено ${JSON.stringify(image.role)}`);
      if (image.file !== expected.file) at(`images[${i}].file должен быть «${expected.file}», получено ${JSON.stringify(image.file)}`);
      if (!isText(image.alt)) at(`images[${i}] (${expected.role}): пустой alt`);
      // prompt восстановить удаётся не всегда (например, после миграции старой
      // статьи) — null здесь допустим, картинки от этого не ломаются.
      if (image.prompt !== null && typeof image.prompt !== 'string') at(`images[${i}].prompt должен быть строкой или null`);
    });
  }

  problems.push(...validateSocial(source.social, `${label}: social`, { allowLegacy: true }));
  problems.push(...validateDistribution(source.distribution, source.social, `${label}: distribution`));

  if (!ISO_DATE_RE.test(source.created_at || '')) at('created_at должен быть датой YYYY-MM-DD');
  if (source.published_at !== null && !ISO_DATE_RE.test(source.published_at || '')) {
    at('published_at должен быть датой YYYY-MM-DD или null');
  }
  if (source.status === 'published' && !ISO_DATE_RE.test(source.published_at || '')) {
    at('status = published, но published_at не заполнен');
  }

  return problems;
}

function serializeSource(source) {
  return `${JSON.stringify(source, null, 2)}\n`;
}

// Через временный файл: прерванная запись не оставит обрезанный источник.
async function writeSourceAtomic(filePath, source) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.tmp`);
  await fs.writeFile(tmp, serializeSource(source));
  await fs.rename(tmp, filePath);
}

async function readSource(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${path.basename(filePath)} — битый JSON: ${err.message}`);
  }
}

// Только *.json, без временных файлов и служебных точек в начале имени.
async function listSourceFiles(dir) {
  let names;
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return names
    .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
    .sort()
    .map((name) => path.join(dir, name));
}

const sourcePath = (dir, slug) => path.join(dir, `${slug}.json`);

module.exports = {
  SOURCE_VERSION,
  STATUSES,
  IMAGE_FILES,
  SOCIAL_LIMITS,
  PLATFORMS,
  DISTRIBUTION_STATUSES,
  validateSocial,
  isLegacySocial,
  hasSocialFor,
  buildDistribution,
  normalizeDistribution,
  validateDistribution,
  buildSource,
  validateSource,
  serializeSource,
  writeSourceAtomic,
  readSource,
  listSourceFiles,
  sourcePath,
};
