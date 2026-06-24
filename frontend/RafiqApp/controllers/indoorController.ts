import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  destination: string;
  filename: string;
  path: string;
  size: number;
}

type MulterRequest = Request & { file?: MulterFile };

export const router = express.Router();

// Multer setup for image uploads
const upload = multer({ dest: path.join(__dirname, "..", "uploads") });

// Simple JSON DB file
const DB_PATH = path.join(__dirname, "..", "data", "floorPlans.json");
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}
const readDB = () => (fs.existsSync(DB_PATH) ? JSON.parse(fs.readFileSync(DB_PATH, "utf8")) : []);
const writeDB = (data: any) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

// POST /indoor/floor-plan
router.post(
  "/floor-plan",
  upload.single("image"),
  (req: MulterRequest, res: Response) => {
    const { name, corridor_y, locations_json } = req.body;
    const imageFile = req.file;
    if (!name || !corridor_y || !locations_json || !imageFile) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }
    // Move image to public folder
    const imagesDir = path.join(__dirname, "..", "public", "floor_images");
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
    const targetPath = path.join(imagesDir, imageFile.originalname);
    fs.renameSync(imageFile.path, targetPath);
    const newPlan = {
      id: Date.now().toString(),
      name: name.trim(),
      corridor_y: parseInt(corridor_y as any, 10),
      image_url: `/floor_images/${imageFile.originalname}`,
      width: 800,
      height: 600,
      locations: JSON.parse(locations_json as any)
    };
    const db = readDB();
    db.push(newPlan);
    writeDB(db);
    return res.json({ success: true, data: newPlan });
  }
);

// GET all floor plans (optional, already may exist elsewhere)
router.get("/floor-plans", (_req: Request, res: Response) => {
  const db = readDB();
  res.json(db);
});

// DELETE /indoor/floor-plan/:id
router.delete("/floor-plan/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDB();
  const index = db.findIndex((plan: any) => plan.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: "Floor plan not found" });
  }

  const [deletedPlan] = db.splice(index, 1);
  writeDB(db);

  if (deletedPlan.image_url) {
    const imagesDir = path.join(__dirname, "..", "public", "floor_images");
    const imagePath = path.join(imagesDir, path.basename(deletedPlan.image_url));
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }

  return res.json({ success: true, data: deletedPlan });
});

export default router;
