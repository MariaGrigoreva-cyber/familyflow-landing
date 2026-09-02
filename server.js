// Семейный поток · лендинг — статическая раздача файлов.
const express = require('express');
const compression = require('compression');
const path = require('path');

// Единый maxAge на всю статику не подходит: с ним обновлённый CSS сутки не
// доезжал до тех, кто уже был на сайте. Считаем время жизни по типу файла.
const IMAGE_EXT = new Set(['.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico']);

function cacheControl(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  // HTML всегда перепроверяем: страницы блога перегенерируются, и устаревшая
  // разметка ссылалась бы на несуществующие статьи.
  if (ext === '.html') return 'no-cache';

  // Имена у styles.css и script.js постоянные, хешей в них нет, поэтому кэш
  // короткий и с обязательной ревалидацией — правка вёрстки доезжает за минуты.
  if (ext === '.css' || ext === '.js') return 'public, max-age=300, must-revalidate';

  if (IMAGE_EXT.has(ext)) {
    // Картинки статей лежат под постоянными именами (hero.webp, inside-1.webp),
    // и npm run blog перезаписывает их при перегенерации статьи — поэтому здесь
    // час и никакого immutable. Иконки и фавиконка меняются раз в год, им можно
    // неделю.
    return filePath.includes(`${path.sep}blog${path.sep}`)
      ? 'public, max-age=3600'
      : 'public, max-age=604800';
  }

  return 'public, max-age=3600';
}

const app = express();
app.use(compression());
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  setHeaders: (res, filePath) => res.setHeader('Cache-Control', cacheControl(filePath)),
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Лендинг Семейного потока на :' + PORT));
