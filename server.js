// Семейный поток · лендинг — статическая раздача файлов.
const express = require('express');
const compression = require('compression');
const path = require('path');

const app = express();
app.use(compression());
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: '1d',
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Лендинг Семейного потока на :' + PORT));
