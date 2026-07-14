import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { authenticate } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
const maxSize = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    cb(null, `${randomUUID()}${ext}`);
  },
});

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const DOC_EXTS = ['.pdf', '.doc', '.docx', '.txt', '.xls', '.xlsx', '.ppt', '.pptx', '.zip'];
const AUDIO_EXTS = ['.webm', '.ogg', '.mp3', '.wav', '.m4a'];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const all = [...IMAGE_EXTS, ...DOC_EXTS, ...AUDIO_EXTS];
  if (all.includes(ext) || file.mimetype?.startsWith('audio/')) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type. Allowed: images, PDF/docs, audio'));
  }
};

const upload = multer({ storage, limits: { fileSize: maxSize }, fileFilter });

async function maybeCloudinary(filePath, originalName) {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret) return null;

  try {
    const { v2: cloudinary } = await import('cloudinary');
    cloudinary.config({ cloud_name: cloud, api_key: key, api_secret: secret });
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'pulsechat',
      resource_type: 'auto',
      public_id: path.parse(originalName).name.slice(0, 40),
    });
    return result.secure_url;
  } catch (err) {
    console.warn('Cloudinary upload failed, using local storage:', err.message);
    return null;
  }
}

async function handleUpload(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    let type = 'file';
    if (IMAGE_EXTS.includes(ext)) type = 'image';
    else if (AUDIO_EXTS.includes(ext) || req.file.mimetype?.startsWith('audio/')) type = 'audio';

    const cloudUrl = await maybeCloudinary(req.file.path, req.file.originalname);
    const url = cloudUrl || `/uploads/${req.file.filename}`;

    res.json({
      success: true,
      data: {
        url,
        imageUrl: type === 'image' ? url : undefined,
        fileUrl: url,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        type,
        storage: cloudUrl ? 'cloudinary' : 'local',
      },
    });
  } catch (error) {
    next(error);
  }
}

const router = Router();

router.post('/', authenticate, (req, res, next) => {
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'image', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) return next(err);
    req.file = req.files?.file?.[0] || req.files?.image?.[0];
    return handleUpload(req, res, next);
  });
});

export default router;
