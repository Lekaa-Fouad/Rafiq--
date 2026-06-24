const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const router = express.Router();

// Multer setup for image uploads
const upload = multer({ dest: path.join(__dirname, '..', 'uploads') });

// Simple JSON DB file
const DB_PATH = path.join(__dirname, '..', 'data', 'floorPlans.json');
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}
const readDB = () => (fs.existsSync(DB_PATH) ? JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) : []);
const writeDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

// POST /indoor/floor-plan
router.post('/floor-plan', upload.single('image'), (req, res) => {
  const { name, corridor_y, locations_json } = req.body;
  const imageFile = req.file;
  if (!name || !corridor_y || !locations_json || !imageFile) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  // Move image to public folder
  const imagesDir = path.join(__dirname, '..', 'public', 'floor_images');
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
  const targetPath = path.join(imagesDir, imageFile.originalname);
  fs.renameSync(imageFile.path, targetPath);

  const newPlan = {
    id: Date.now().toString(),
    name: name.trim(),
    corridor_y: parseInt(corridor_y, 10),
    image_url: `/floor_images/${imageFile.originalname}`,
    width: parseInt(req.body.width, 10) || 800,
    height: parseInt(req.body.height, 10) || 600,
    locations: JSON.parse(locations_json)
  };

  const db = readDB();
  db.push(newPlan);
  writeDB(db);

  return res.json({ success: true, data: newPlan });
});

// GET all floor plans
router.get('/floor-plans', (_req, res) => {
  const db = readDB();
  res.json(db);
});
module.exports = router;


