const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../../uploads');

try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch {
  // Vercel / serverless filesystems are read-only outside /tmp
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = /jpeg|jpg|png|pdf|webp|mp3|wav|m4a/;
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  const mime = allowed.test(file.mimetype) || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('image/');
  cb(null, ext || mime);
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.csv$/i.test(file.originalname)
      || file.mimetype === 'text/csv'
      || file.mimetype === 'application/vnd.ms-excel'
      || file.mimetype === 'text/plain';
    cb(null, ok);
  },
});

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /jpeg|jpg|png|webp/i.test(path.extname(file.originalname))
      || /^image\/(jpeg|png|webp)$/i.test(file.mimetype);
    cb(null, ok);
  },
});

const hrDocUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /jpeg|jpg|png|webp|pdf/i.test(path.extname(file.originalname))
      || file.mimetype.startsWith('image/')
      || file.mimetype === 'application/pdf';
    cb(null, ok);
  },
});

const chatUpload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExt = /\.(jpe?g|png|webp|gif|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|mp3|wav|m4a|ogg)$/i;
    const mimeOk = /^(image|audio)\//.test(file.mimetype)
      || file.mimetype === 'application/pdf'
      || file.mimetype === 'text/plain'
      || /officedocument|msword|ms-excel|ms-powerpoint/.test(file.mimetype);
    cb(null, allowedExt.test(ext) || mimeOk);
  },
});

module.exports = upload;
module.exports.csvUpload = csvUpload;
module.exports.logoUpload = logoUpload;
module.exports.hrDocUpload = hrDocUpload;
module.exports.chatUpload = chatUpload;
