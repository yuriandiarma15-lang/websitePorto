require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const signalsRouter = require('./routes/signals');

const app = express();

const PORT = process.env.PORT || 3000;

// ======================
// Middleware
// ======================

app.use(cors());

app.use(express.json());

app.use(express.urlencoded({
  extended: true
}));

// ======================
// Public Website
// ======================

app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);

// ======================
// Folder Upload
// ======================

app.use(
  '/uploads',
  express.static(
    path.join(__dirname, 'uploads')
  )
);

// ======================
// API
// ======================

app.use('/api', signalsRouter);

// ======================
// Admin Panel
// ======================

app.get('/admin', (req, res) => {

  res.sendFile(

    path.join(
      __dirname,
      'public',
      'admin.html'
    )

  );

});

// ======================
// Health Check
// ======================

app.get('/health', (req, res) => {

  res.json({

    ok: true,

    time: new Date().toISOString()

  });

});

// ======================
// Start Server
// ======================

app.listen(PORT, () => {

  console.log('');
  console.log('====================================');
  console.log('🚀 XAU SIGNAL SERVER RUNNING');
  console.log(`🌐 http://localhost:${PORT}`);
  console.log('====================================');
  console.log('');

});
