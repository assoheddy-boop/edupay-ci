const {
  slugify,
  trimestreSlug,
  frenchMonthSlug,
  personNameSlug,
  bulletinPdfFilename,
  payslipPdfFilename,
  buildContentDisposition,
} = require("../src/utils/pdfFilename");
const { filenameNom, filenamePrenom } = require("../src/utils/safeFilename");

describe("pdfFilename helpers", () => {
  test("slugify removes accents and spaces", () => {
    expect(slugify("Kouame Mohamed")).toBe("kouame-mohamed");
    expect(slugify("  Eleonore  ")).toBe("eleonore");
  });

  test("trimestreSlug normalizes period labels", () => {
    expect(trimestreSlug("Trimestre 1")).toBe("Trimestre-1");
    expect(trimestreSlug("T2")).toBe("Trimestre-2");
    expect(trimestreSlug("Annuelle")).toBe("Annuelle");
  });

  test("frenchMonthSlug uses French month names", () => {
    expect(frenchMonthSlug(8, 2026)).toBe("Aout-2026");
    expect(frenchMonthSlug(3, 2026)).toBe("Mars-2026");
  });

  test("personNameSlug joins last and first names", () => {
    expect(personNameSlug("KOUAME", "Mohamed")).toBe("KOUAME-Mohamed");
    expect(personNameSlug("Kayeda", "Warren")).toBe("KAYEDA-Warren");
    expect(filenameNom("Kayeda")).toBe("KAYEDA");
    expect(filenamePrenom("jean-luc")).toBe("Jean-Luc");
  });

  test("bulletinPdfFilename includes trimestre and student name", () => {
    expect(
      bulletinPdfFilename({
        student: { lastName: "KOUAME", firstName: "Mohamed" },
        period: "Trimestre 1",
      }),
    ).toBe("Bulletin-Trimestre-1-KOUAME-Mohamed.pdf");
  });

  test("payslipPdfFilename includes employee name and month", () => {
    expect(
      payslipPdfFilename({
        employee: { lastName: "KAYEDA", firstName: "Warren" },
        month: 8,
        year: 2026,
      }),
    ).toBe("Paie-KAYEDA-Warren-Aout-2026.pdf");
  });

  test("buildContentDisposition uses ASCII filename when safe", () => {
    expect(buildContentDisposition("Bulletin-Trimestre-1-KOUAME-Mohamed.pdf")).toBe(
      'attachment; filename="Bulletin-Trimestre-1-KOUAME-Mohamed.pdf"',
    );
  });

  test("buildContentDisposition adds filename* for non-ASCII names", () => {
    const header = buildContentDisposition("Bulletin-Trimestre-1-Kouam\u00e9.pdf");
    expect(header).toContain('filename="Bulletin-Trimestre-1-Kouame.pdf"');
    expect(header).toContain("filename*=UTF-8''");
  });
});