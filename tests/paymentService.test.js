const { inspectProofFile, MAX_PROOF_SIZE } = require('../services/PaymentService');

describe('PaymentService.inspectProofFile', () => {
  test('rejects missing file', () => {
    expect(inspectProofFile(null)).toEqual({ ok: false, error: 'file' });
  });

  test('rejects invalid MIME type', () => {
    expect(inspectProofFile({
      mimetype: 'application/zip',
      originalname: 'proof.zip',
      size: 1200,
    })).toEqual({ ok: false, error: 'mime' });
  });

  test('accepts jpeg proof under size limit', () => {
    const result = inspectProofFile({
      mimetype: 'image/jpeg',
      originalname: 'wave.jpg',
      size: 250000,
    });
    expect(result.ok).toBe(true);
    expect(result.ext).toBe('.jpg');
  });

  test('accepts pdf proof', () => {
    const result = inspectProofFile({
      mimetype: 'application/pdf',
      originalname: 'recu.pdf',
      size: 80000,
    });
    expect(result.ok).toBe(true);
    expect(result.ext).toBe('.pdf');
  });

  test('rejects file over size limit', () => {
    expect(inspectProofFile({
      mimetype: 'image/png',
      originalname: 'big.png',
      size: MAX_PROOF_SIZE + 1,
    })).toEqual({ ok: false, error: 'size' });
  });
});
