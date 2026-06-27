const express = require('express');
const cors = require('cors');
const path = require('path');
const indoorRouter = require('./controllers/indoorController');
const { BACKEND_URL } = require('./config');

const app = express();
const PORT = Number(new URL(BACKEND_URL).port) || 8000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images statically
app.use('/floor_images', express.static(path.join(__dirname, 'public', 'floor_images')));

// API routes
app.use('/indoor', indoorRouter);

// Health check
app.get('/', (_req, res) => res.send('RafiqApp backend is running'));

app.listen(PORT, () => console.log(`🚀 Server listening at ${BACKEND_URL}`));
