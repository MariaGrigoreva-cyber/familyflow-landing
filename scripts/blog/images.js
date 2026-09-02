// Генерация иллюстраций: OpenAI Images API + приведение к нужному размеру
// и формату через sharp. Модель картинок текст внутрь не рисует — это
// отдельно запрещено в prompts/blog/image-style.txt.
'use strict';

const fs = require('node:fs/promises');
const sharp = require('sharp');

// gpt-image-2 принимает произвольные размеры, кратные 16, поэтому берём точные
// 16:9 и 4:3. Для более старых моделей падаем на стандартные размеры, а нужную
// пропорцию всё равно получаем кадрированием в sharp (без растягивания).
const TARGETS = {
  hero: { width: 1536, height: 864, sizes: ['1536x864', '1536x1024', 'auto'] },
  inside_1: { width: 1216, height: 912, sizes: ['1216x912', '1536x1024', 'auto'] },
  inside_2: { width: 1216, height: 912, sizes: ['1216x912', '1536x1024', 'auto'] },
};

const WEBP_QUALITY = 85;

function isBadSizeError(err) {
  return err?.status === 400 && /size|resolution|dimension|width|height/i.test(String(err?.message || ''));
}

async function fetchImageBuffer(client, { model, prompt, sizes }) {
  let lastError;

  for (const size of sizes) {
    try {
      const result = await client.images.generate({ model, prompt, size, n: 1 });
      const image = result?.data?.[0];

      if (image?.b64_json) return Buffer.from(image.b64_json, 'base64');

      // dall-e-модели возвращают ссылку вместо base64.
      if (image?.url) {
        const response = await fetch(image.url);
        if (!response.ok) throw new Error(`не удалось скачать изображение: HTTP ${response.status}`);
        return Buffer.from(await response.arrayBuffer());
      }

      throw new Error('ответ Images API не содержит изображения');
    } catch (err) {
      lastError = err;
      if (!isBadSizeError(err)) throw err;
      // Размер не поддержан этой моделью — пробуем следующий из списка.
    }
  }

  throw lastError;
}

// Возвращает готовый webp-буфер нужных пропорций. cover кадрирует, но никогда
// не искажает картинку.
async function toWebp(buffer, { width, height }) {
  return sharp(buffer)
    .resize({ width, height, fit: 'cover', position: 'attention' })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

async function generateImage({ client, model, imagePrompt, styleGuide, outPath }) {
  const target = TARGETS[imagePrompt.role];
  if (!target) throw new Error(`Неизвестная роль изображения: ${imagePrompt.role}`);

  // Смысл картинки задаёт текстовая модель, единый визуальный стиль
  // добавляется из prompts/blog/image-style.txt.
  const prompt = `${imagePrompt.prompt.trim()}\n\n${styleGuide.trim()}`;

  const raw = await fetchImageBuffer(client, { model, prompt, sizes: target.sizes });
  const webp = await toWebp(raw, target);
  await fs.writeFile(outPath, webp);

  return { bytes: webp.length, width: target.width, height: target.height };
}

module.exports = { generateImage, TARGETS };
