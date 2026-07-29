require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const signalsRouter = require('./routes/signals');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', signalsRouter);

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`> Server jalan di http://localhost:${PORT}`);
});
