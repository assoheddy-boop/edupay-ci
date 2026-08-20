const multer = require('multer');
const path = require('path');
const { storeMulterFile, collectMulterFiles } = require('../../services/StorageService');
const { isDangerousUpload } = require('../utils/uploadSafety');

const memory = multer.memoryStorage();

function acceptUpload(file, extOk, mimeOk) {
  if (isDangerousUpload(file)) return false;
  return Boolean(extOk || mimeOk);
}

const fileFilter = (_req, file, cb) => {
  const allowed = /jpeg|jpg|png|pdf|webp|mp3|wav|m4a/;
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  const mime = allowed.test(file.mimetype)
    || /^audio\/(mpeg|mp3|wav|x-wav|mp4|m4a)$/i.test(file.mimetype)
    || /^image\/(jpeg|png|webp)$/i.test(file.mimetype);
  cb(null, acceptUpload(file, ext, mime));
};

const upload = multer({
  storage: memory,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});

const csvUpload = multer({
  storage: memory,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    const ok = ext === '.csv'
      || ext === '.xlsx'
      || ext === '.xml'
      || mime === 'text/csv'
      || mime === 'text/plain'
      || mime === 'application/xml'
      || mime === 'text/xml'
      || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      || (mime === 'application/vnd.ms-excel' && ext !== '.xls');
    cb(null, ok);
  },
});

const logoUpload = multer({
  storage: memory,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const extOk = /jpeg|jpg|png|webp/i.test(path.extname(file.originalname));
    const mimeOk = /^image\/(jpeg|png|webp)$/i.test(file.mimetype);
    cb(null, acceptUpload(file, extOk, mimeOk));
  },
});

const hrDocUpload = multer({
  storage: memory,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const extOk = /jpeg|jpg|png|webp|pdf/i.test(path.extname(file.originalname));
    const mimeOk = /^image\/(jpeg|png|webp)$/i.test(file.mimetype)
      || file.mimetype === 'application/pdf';
    cb(null, acceptUpload(file, extOk, mimeOk));
  },
});

const chatUpload = multer({
  storage: memory,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExt = /\.(jpe?g|png|webp|gif|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|mp3|wav|m4a|ogg)$/i;
    const mimeOk = /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype)
      || /^audio\/(mpeg|mp3|wav|x-wav|mp4|m4a|ogg)$/i.test(file.mimetype)
      || file.mimetype === 'application/pdf'
      || file.mimetype === 'text/plain'
      || /officedocument|msword|ms-excel|ms-powerpoint/.test(file.mimetype);
    cb(null, acceptUpload(file, allowedExt.test(ext), mimeOk));
  },
});

function persistUpload(folder) {
  return async (req, _res, next) => {
    try {
      const files = collectMulterFiles(req);
      for (const file of files) {
        await storeMulterFile(file, folder);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = upload;
module.exports.csvUpload = csvUpload;
module.exports.logoUpload = logoUpload;
module.exports.hrDocUpload = hrDocUpload;
module.exports.chatUpload = chatUpload;
module.exports.persistUpload = persistUpload;
