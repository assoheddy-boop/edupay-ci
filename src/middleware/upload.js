const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
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

module.exports = upload;
module.exports.csvUpload = csvUpload;
module.exports.logoUpload = logoUpload;
module.exports.hrDocUpload = hrDocUpload;
