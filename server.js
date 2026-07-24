// Семейный поток · лендинг — статическая раздача файлов.
const express = require('express');
const path = require('path');

const app = express();
app.use(express.static(__dirname, { extensions: ['html'] }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Лендинг Семейного потока на :' + PORT));
