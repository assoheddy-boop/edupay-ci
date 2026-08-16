const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function uploadsRoot() {
  if (process.env.UPLOADS_DIR) return process.env.UPLOADS_DIR;
  if (process.env.VERCEL) return path.join(os.tmpdir(), 'educonnect-uploads');
  return path.join(__dirname, '../uploads');
}

function getDriver() {
  if (process.env.NODE_ENV === 'test' && !process.env.STORAGE_DRIVER) return 'local';
  const explicit = String(process.env.STORAGE_DRIVER || '').toLowerCase();
  if (explicit === 'blob' || explicit === 's3' || explicit === 'local') return explicit;
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'blob';
  if (process.env.AWS_S3_BUCKET) return 's3';
  return 'local';
}

function uniqueFilename(originalName = '') {
  const ext = path.extname(originalName).toLowerCase();
  const safeExt = /^\.(jpe?g|png|webp|gif|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|mp3|wav|m4a|ogg)$/i.test(ext)
    ? ext
    : '';
  const unique = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  return `${unique}${safeExt}`;
}

function localUrl(folder, filename) {
  return `/uploads/${folder}/${filename}`.replace(/\/{2,}/g, '/');
}

async function putLocal({ folder, filename, buffer }) {
  const dir = path.join(uploadsRoot(), folder);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, filename), buffer);
  return { url: localUrl(folder, filename), key: `${folder}/${filename}`, driver: 'local' };
}

async function putBlob({ folder, filename, buffer, contentType }) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN manquant');
  const { put } = require('@vercel/blob');
  const blob = await put(`${folder}/${filename}`, buffer, {
    access: 'public',
    token,
    contentType: contentType || 'application/octet-stream',
    addRandomSuffix: false,
  });
  return { url: blob.url, key: `${folder}/${filename}`, driver: 'blob' };
}

async function putS3({ folder, filename, buffer, contentType }) {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || 'eu-west-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('S3 incomplet (AWS_S3_BUCKET / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)');
  }

  let S3Client;
  let PutObjectCommand;
  try {
    ({ S3Client, PutObjectCommand } = require('@aws-sdk/client-s3'));
  } catch {
    throw new Error('STORAGE_DRIVER=s3 nécessite le paquet @aws-sdk/client-s3');
  }

  const key = `${folder}/${filename}`;
  const client = new S3Client({
    region,
    endpoint: process.env.AWS_S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.AWS_S3_ENDPOINT),
  });
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream',
  }));

  const publicBase = process.env.AWS_S3_PUBLIC_URL;
  const url = publicBase
    ? `${publicBase.replace(/\/$/, '')}/${key}`
    : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  return { url, key, driver: 's3' };
}

async function putObject({ folder = 'files', filename, buffer, contentType }) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw Object.assign(new Error('Fichier introuvable'), { code: 'file' });
  }
  const name = filename || uniqueFilename('file.bin');
  const driver = getDriver();
  if (driver === 'blob') return putBlob({ folder, filename: name, buffer, contentType });
  if (driver === 's3') return putS3({ folder, filename: name, buffer, contentType });
  return putLocal({ folder, filename: name, buffer });
}

async function readMulterBuffer(file) {
  if (!file) return null;
  if (file.buffer && Buffer.isBuffer(file.buffer)) return file.buffer;
  if (file.path) return fs.promises.readFile(file.path);
  return null;
}

async function storeMulterFile(file, folder = 'files') {
  if (!file) return null;
  const buffer = await readMulterBuffer(file);
  if (!buffer) return null;
  const filename = file.filename || uniqueFilename(file.originalname || 'file.bin');
  const stored = await putObject({
    folder,
    filename,
    buffer,
    contentType: file.mimetype,
  });
  file.filename = filename;
  file.url = stored.url;
  if (file.path && getDriver() !== 'local') {
    await fs.promises.unlink(file.path).catch(() => {});
  }
  return stored;
}

function collectMulterFiles(req) {
  const files = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) files.push(...req.files);
  else if (req.files && typeof req.files === 'object') {
    for (const value of Object.values(req.files)) {
      if (Array.isArray(value)) files.push(...value);
      else if (value) files.push(value);
    }
  }
  return files;
}

function publicUrlFor(file, folder = 'files') {
  if (!file) return null;
  if (file.url) return file.url;
  if (file.filename) return localUrl(folder, file.filename);
  return null;
}

module.exports = {
  getDriver,
  uploadsRoot,
  uniqueFilename,
  putObject,
  storeMulterFile,
  collectMulterFiles,
  publicUrlFor,
  readMulterBuffer,
};
