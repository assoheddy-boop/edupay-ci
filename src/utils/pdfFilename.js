const FRENCH_MONTHS = [
  "Janvier",
  "Fevrier",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Aout",
  "Septembre",
  "Octobre",
  "Novembre",
  "Decembre",
];

const { slugify, trimestreSlug, personNameSlug } = require("./safeFilename");

function frenchMonthSlug(month, year) {
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (!m || m < 1 || m > 12 || !y) return slugify(String(month) + "-" + String(year));
  return FRENCH_MONTHS[m - 1] + "-" + y;
}

function bulletinPdfFilename({ student, period }) {
  const term = trimestreSlug(period);
  const name = personNameSlug(student?.lastName, student?.firstName);
  return "Bulletin-" + term + "-" + name + ".pdf";
}

function payslipPdfFilename({ employee, profile, teacher, month, year }) {
  const lastName = employee?.lastName || profile?.lastName || teacher?.user?.lastName;
  const firstName = employee?.firstName || profile?.firstName || teacher?.user?.firstName;
  const name = personNameSlug(lastName, firstName);
  const period = frenchMonthSlug(month, year);
  return "Paie-" + name + "-" + period + ".pdf";
}

function asciiFallbackFilename(filename) {
  return String(filename || "document.pdf")
    .replace(/["\r\n]/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "_");
}

function encodeRFC5987(value) {
  return encodeURIComponent(value).replace(/['()*]/g, function (char) {
    return "%" + char.charCodeAt(0).toString(16).toUpperCase();
  });
}

function buildContentDisposition(filename) {
  const safe = String(filename || "document.pdf").replace(/["\r\n]/g, "");
  const ascii = asciiFallbackFilename(safe);
  if (ascii === safe) {
    return 'attachment; filename="' + ascii + '"';
  }
  return 'attachment; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeRFC5987(safe);
}

module.exports = {
  FRENCH_MONTHS,
  slugify,
  trimestreSlug,
  frenchMonthSlug,
  personNameSlug,
  bulletinPdfFilename,
  payslipPdfFilename,
  buildContentDisposition,
};