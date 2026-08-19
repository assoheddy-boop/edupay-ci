/**
 * Remplit l’école IGEST (Yopougon-Sideci) de données de démo réalistes.
 * Idempotent : matricules IG-DEMO-*, e-mails *@igest-demo.ci
 *
 * Usage :
 *   node scripts/fill-igest-demo.js              # Neon prod + local si dispo
 *   node scripts/fill-igest-demo.js --neon-only
 *   node scripts/fill-igest-demo.js --local-only
 *
 * Ne touche jamais au mot de passe de igest@educonnect.ci.
 * N’imprime jamais DATABASE_URL.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const MARKER = 'IG-DEMO';
const EMAIL_DOMAIN = 'igest-demo.ci';
const ADMIN_EMAIL = 'igest@educonnect.ci';
const SLUG = 'igest-yopougon-sideci';
const TARGET_STUDENTS = 120;
const MIN_SKIP_STUDENTS = 80;
const SCHOOL_YEAR_DEFAULT = '2025-2026';

const CLASS_DEFS = [
  { name: '6e A', level: '6e' },
  { name: '6e B', level: '6e' },
  { name: '5e A', level: '5e' },
  { name: '5e B', level: '5e' },
  { name: '4e A', level: '4e' },
  { name: '4e B', level: '4e' },
  { name: '3e A', level: '3e' },
  { name: '3e B', level: '3e' },
];

const SUBJECTS = [
  'Mathématiques', 'Français', 'Anglais', 'Histoire-Géo',
  'SVT', 'Physique-Chimie', 'EPS', 'Espagnol', 'Informatique', 'Arts plastiques',
];

const TEACHERS = [
  { email: `prof.maths@${EMAIL_DOMAIN}`, firstName: 'Jean-Baptiste', lastName: 'Koné', subject: 'Mathématiques', phone: '07 01 22 33 01' },
  { email: `prof.francais@${EMAIL_DOMAIN}`, firstName: 'Awa', lastName: 'Kouassi', subject: 'Français', phone: '07 01 22 33 02' },
  { email: `prof.anglais@${EMAIL_DOMAIN}`, firstName: 'Mariame', lastName: 'Bamba', subject: 'Anglais', phone: '05 01 22 33 03' },
  { email: `prof.histo@${EMAIL_DOMAIN}`, firstName: 'Seydou', lastName: 'Traoré', subject: 'Histoire-Géo', phone: '07 01 22 33 04' },
  { email: `prof.svt@${EMAIL_DOMAIN}`, firstName: 'Fatoumata', lastName: 'Ouattara', subject: 'SVT', phone: '01 01 22 33 05' },
  { email: `prof.pc@${EMAIL_DOMAIN}`, firstName: 'Kouadio', lastName: "N'Guessan", subject: 'Physique-Chimie', phone: '07 01 22 33 06' },
  { email: `prof.eps@${EMAIL_DOMAIN}`, firstName: 'Yao', lastName: 'Koffi', subject: 'EPS', phone: '05 01 22 33 07' },
  { email: `prof.espagnol@${EMAIL_DOMAIN}`, firstName: 'Salimata', lastName: 'Diallo', subject: 'Espagnol', phone: '07 01 22 33 08' },
  { email: `prof.info@${EMAIL_DOMAIN}`, firstName: 'Ibrahim', lastName: 'Coulibaly', subject: 'Informatique', phone: '01 01 22 33 09' },
  { email: `prof.arts@${EMAIL_DOMAIN}`, firstName: 'Adjoua', lastName: 'Aka', subject: 'Arts plastiques', phone: '07 01 22 33 10' },
];

const FIRST_M = [
  'Kofi', 'Yao', 'Kouadio', 'Koffi', 'Jean-Baptiste', 'Seydou', 'Ibrahim', 'Mohamed',
  'Lassina', 'Didier', 'Eric', 'Abdoulaye', 'Mamadou', 'Souleymane', 'Serge', 'Patrick',
  'Alain', 'Michel', 'François', 'Issa', 'Bakary', 'Drissa', 'Ousmane', 'Amadou',
];
const FIRST_F = [
  'Aminata', 'Adjoua', 'Akissi', 'Awa', 'Fatou', 'Mariam', 'Salimata', 'Christelle',
  'Nadège', 'Prisca', 'Aïcha', 'Rokia', 'Affoué', 'Amenan', 'Véronique', 'Patricia',
  'Grace', 'Esther', 'Chantal', 'Simone', 'Bintou', 'Kadiatou', 'Maimouna', 'Ramata',
];
const LAST_NAMES = [
  'Kouassi', 'Koné', 'Traoré', 'Ouattara', "N'Guessan", 'Yao', 'Koffi', 'Diallo',
  'Coulibaly', 'Aka', 'Bamba', 'Sanogo', 'Doumbia', 'Touré', 'Kouamé', 'Brou',
  'Gnahoré', 'Kacou', 'Fofana', 'Cissé', 'Bédié', 'Drogba', 'Kalou', 'Zokora',
  'Drogba', 'Bakayoko', 'Soro', 'Diabaté', 'Konan', 'Assi',
];

const FEE_DEFS = [
  { name: "Frais d'inscription", amount: 25000, dueDay: 15, description: 'Rentrée scolaire' },
  { name: 'Scolarité Trimestre 1', amount: 75000, dueDay: 10, description: 'Septembre — décembre' },
  { name: 'Scolarité Trimestre 2', amount: 75000, dueDay: 10, description: 'Janvier — mars' },
  { name: 'Scolarité Trimestre 3', amount: 75000, dueDay: 10, description: 'Avril — juin' },
  { name: 'Cantine', amount: 15000, dueDay: 5, description: 'Forfait mensuel cantine' },
  { name: 'Transport', amount: 10000, dueDay: 5, description: 'Navette Yopougon-Sideci' },
  { name: 'Tenue scolaire', amount: 12000, dueDay: 20, description: 'Uniforme IGEST' },
  { name: 'Fournitures', amount: 8000, dueDay: 20, description: 'Cahiers et manuels' },
];

const HOMEWORKS = [
  { title: 'Exercices équations p. 48-50', subject: 'Mathématiques', kind: 'HOMEWORK', days: 4, description: 'À rendre pour vendredi — cahier d’exercices.' },
  { title: 'Contrôle de grammaire — les accords', subject: 'Français', kind: 'TEST', days: 6, description: 'Révisions des leçons 12 à 15.' },
  { title: 'Rédaction : Ma ville, Yopougon', subject: 'Français', kind: 'HOMEWORK', days: 8, description: 'Minimum 20 lignes, écriture soignée.' },
  { title: 'Vocabulary quiz — Unit 5', subject: 'Anglais', kind: 'TEST', days: 5, description: 'Words from the market and school.' },
  { title: 'Carte de la Côte d’Ivoire — relief', subject: 'Histoire-Géo', kind: 'HOMEWORK', days: 7, description: 'Légender le croquis vu en classe.' },
  { title: 'Le cycle de l’eau — schéma annoté', subject: 'SVT', kind: 'HOMEWORK', days: 9, description: 'Schéma + 10 lignes d’explication.' },
  { title: 'Devoir de physique — forces', subject: 'Physique-Chimie', kind: 'TEST', days: 10, description: 'Exercices 1 à 6 du polycopié.' },
  { title: 'Match inter-classes — convocations', subject: 'EPS', kind: 'HOMEWORK', days: 3, description: 'Tenue de sport obligatoire.' },
];

const EXPENSE_MONTHLY = [
  { cat: 'Salaires', amount: 1850000, desc: 'Salaires enseignants et administration' },
  { cat: 'Loyer & charges', amount: 350000, desc: 'Loyer campus Yopougon-Sideci + CIE/SODECI' },
  { cat: 'Fournitures', amount: 85000, desc: 'Cahiers, craie, cartouches imprimante' },
  { cat: 'Cantine', amount: 220000, desc: 'Approvisionnement cantine (attiéké, riz, poisson)' },
  { cat: 'Transport', amount: 90000, desc: 'Carburant navette scolaire' },
];

function readText(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.slice(2).toString('utf16le');
  }
  return buf.toString('utf8').replace(/^\uFEFF/, '');
}

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const text = readText(filePath);
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function firstNonEmpty(...values) {
  return values.find((value) => value && value.length > 8 && !/^["']{0,2}$/.test(value)) || '';
}

function neonUrlFromFile(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return readText(filePath).split(/\r?\n/).map((line) => line.trim()).filter((line) => /^postgres(ql)?:\/\//i.test(line)).pop() || '';
}

function describeTarget(url) {
  try {
    const host = new URL(url).hostname;
    if (/localhost|127\.0\.0\.1/i.test(host)) return 'PostgreSQL local';
    if (/neon\.tech|neon\.build/i.test(host)) return 'Neon production';
    return 'PostgreSQL distant';
  } catch {
    return 'base configurée';
  }
}

function isLocalUrl(url) {
  try {
    return /localhost|127\.0\.0\.1/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function fetchNeonUrl() {
  const projectId = process.env.NEON_PROJECT_ID || 'ancient-cloud-90631299';
  const result = spawnSync(
    'npx',
    ['--yes', 'neonctl', 'connection-string', '--project-id', projectId, '--pooled'],
    {
      encoding: 'utf8',
      shell: true,
      env: { ...process.env, NODE_OPTIONS: '--use-system-ca' },
    },
  );
  const text = `${result.stdout || ''}\n${result.stderr || ''}`;
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^postgres(ql)?:\/\//i.test(line)).pop() || '';
}

function resolveNeonUrl() {
  const root = path.resolve(__dirname, '..');
  const parsed = parseEnvFile(path.join(root, '.env.vercel-backup'));
  const neonFile = path.join(root, '.neon-url.tmp');
  let url = firstNonEmpty(
    parsed.DATABASE_URL,
    parsed.POSTGRES_PRISMA_URL,
    parsed.POSTGRES_URL,
    parsed.DATABASE_URL_UNPOOLED,
    neonUrlFromFile(neonFile),
  );
  if (!url) {
    console.log('Récupération de l’URL Neon (masquée)…');
    url = fetchNeonUrl();
    if (url) fs.writeFileSync(neonFile, `${url}\n`);
  }
  return url;
}

function resolveLocalUrl() {
  const root = path.resolve(__dirname, '..');
  const parsed = parseEnvFile(path.join(root, '.env'));
  const url = firstNonEmpty(parsed.DATABASE_URL, parsed.POSTGRES_PRISMA_URL, parsed.POSTGRES_URL);
  return url && isLocalUrl(url) ? url : '';
}

function spawnFill(url, label) {
  const env = { ...process.env, DATABASE_URL: url, NODE_OPTIONS: '--use-system-ca' };
  console.log(`\n── ${label} ──`);
  const result = spawnSync(process.execPath, [__filename, '--run'], {
    env,
    stdio: 'inherit',
    shell: false,
  });
  return result.status || 0;
}

function at(year, monthIndex, day, hour = 10) {
  return new Date(year, monthIndex, day, hour, 15, 0, 0);
}

function dateOnly(d) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function weekdaysBack(from, count) {
  const out = [];
  const cur = new Date(from);
  while (out.length < count) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) out.push(new Date(cur));
    cur.setDate(cur.getDate() - 1);
  }
  return out;
}

function monthsBack(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth(), key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` });
  }
  return out;
}

function pick(arr, i) {
  return arr[i % arr.length];
}

function studentBlueprint(index) {
  const n = index + 1;
  const girl = n % 2 === 0;
  const firstName = girl ? pick(FIRST_F, Math.floor(index / 2)) : pick(FIRST_M, Math.floor(index / 2));
  const lastName = pick(LAST_NAMES, index);
  const classIndex = index % CLASS_DEFS.length;
  const level = CLASS_DEFS[classIndex].level;
  const ageOffset = { '6e': 11, '5e': 12, '4e': 13, '3e': 14 }[level] || 12;
  const birthYear = new Date().getFullYear() - ageOffset;
  return {
    matricule: `${MARKER}-${String(n).padStart(3, '0')}`,
    firstName,
    lastName,
    gender: girl ? 'F' : 'M',
    classIndex,
    birthDate: at(birthYear, index % 12, 5 + (index % 20)),
  };
}

function channelFor(i) {
  const r = i % 10;
  if (r < 5) return { type: 'WAVE', prefix: 'WAVE' };
  if (r < 8) return { type: 'ORANGE_MONEY', prefix: 'OM' };
  return { type: 'CASH', prefix: 'ESP' };
}

async function createManyChunked(prisma, model, data, chunkSize = 200, skipDuplicates = false) {
  let created = 0;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    const result = await prisma[model].createMany({ data: chunk, skipDuplicates });
    created += result.count;
  }
  return created;
}

async function fill() {
  const bcrypt = require('bcryptjs');
  const prisma = require('../src/config/database');
  const { IGEST_SCHOOL } = require('../src/config/igestSchool');
  const { initFinanceDefaults } = require('../src/utils/modules');

  const counts = {
    classes: 0,
    students: 0,
    teachers: 0,
    parents: 0,
    parentLinks: 0,
    feeTypes: 0,
    payments: 0,
    pendingPayments: 0,
    proofs: 0,
    absences: 0,
    homeworks: 0,
    grades: 0,
    accounting: 0,
    yearRecords: 0,
    messages: 0,
    notifications: 0,
  };

  try {
    const school = await prisma.school.findFirst({
      where: {
        OR: [
          { slug: IGEST_SCHOOL.slug || SLUG },
          { admin: { email: IGEST_SCHOOL.admin.email || ADMIN_EMAIL } },
        ],
      },
      include: { admin: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    if (!school) {
      console.error('École IGEST introuvable (slug / e-mail direction). Rien n’a été modifié.');
      process.exitCode = 1;
      return;
    }

    const expectedEmail = (IGEST_SCHOOL.admin.email || ADMIN_EMAIL).toLowerCase();
    const slugOk = school.slug === (IGEST_SCHOOL.slug || SLUG);
    const emailOk = school.admin?.email && school.admin.email.toLowerCase() === expectedEmail;
    if (!slugOk && !emailOk) {
      console.error('L’école trouvée n’est pas IGEST — arrêt.');
      process.exitCode = 1;
      return;
    }
    if (!emailOk && school.admin?.email) {
      console.log('Note : compte direction local différent de igest@educonnect.ci — mot de passe non modifié.');
    }

    const schoolYear = school.currentSchoolYear || SCHOOL_YEAR_DEFAULT;
    const adminId = school.adminId || school.admin?.id;
    console.log(`IGEST : ${school.name} · ${school.campusLabel || ''} · année ${schoolYear}`);
    console.log(`Direction : ${ADMIN_EMAIL} (mot de passe inchangé)`);

    await initFinanceDefaults(school.id);

    const classMap = {};
    for (const def of CLASS_DEFS) {
      let cls = await prisma.class.findFirst({ where: { schoolId: school.id, name: def.name } });
      if (!cls) {
        cls = await prisma.class.create({
          data: { name: def.name, level: def.level, schoolYear, schoolId: school.id },
        });
        counts.classes += 1;
      }
      classMap[def.name] = cls;
    }
    const classList = CLASS_DEFS.map((d) => classMap[d.name]);

    const demoStudentCount = await prisma.student.count({
      where: { schoolId: school.id, matricule: { startsWith: `${MARKER}-` } },
    });
    const skipCore = demoStudentCount >= MIN_SKIP_STUDENTS;

    const passwordHash = await bcrypt.hash('IgestDemo2026!', 10);

    const teacherRecords = [];
    for (const t of TEACHERS) {
      const user = await prisma.user.upsert({
        where: { email: t.email },
        update: { firstName: t.firstName, lastName: t.lastName, phone: t.phone },
        create: {
          email: t.email,
          password: passwordHash,
          role: 'TEACHER',
          firstName: t.firstName,
          lastName: t.lastName,
          phone: t.phone,
          teacher: { create: { schoolId: school.id, subject: t.subject } },
        },
        include: { teacher: true },
      });
      let teacher = user.teacher;
      if (!teacher) {
        teacher = await prisma.teacher.create({
          data: { userId: user.id, schoolId: school.id, subject: t.subject },
        });
        counts.teachers += 1;
      } else if (teacher.schoolId !== school.id) {
        console.warn(`Enseignant ${t.email} déjà lié à une autre école — ignoré.`);
        continue;
      }
      teacherRecords.push(teacher);
      const classA = classList[teacherRecords.length % classList.length];
      const classB = classList[(teacherRecords.length + 3) % classList.length];
      for (const cls of [classA, classB]) {
        await prisma.teacherClass.upsert({
          where: { teacherId_classId: { teacherId: teacher.id, classId: cls.id } },
          update: {},
          create: { teacherId: teacher.id, classId: cls.id },
        });
      }
    }
    counts.teachers = teacherRecords.length;

    if (!skipCore) {
      const existingMats = new Set(
        (await prisma.student.findMany({
          where: { schoolId: school.id, matricule: { startsWith: `${MARKER}-` } },
          select: { matricule: true },
        })).map((s) => s.matricule),
      );
      const toCreate = [];
      for (let i = 0; i < TARGET_STUDENTS; i++) {
        const b = studentBlueprint(i);
        if (existingMats.has(b.matricule)) continue;
        const cls = classList[b.classIndex];
        toCreate.push({
          firstName: b.firstName,
          lastName: b.lastName,
          matricule: b.matricule,
          gender: b.gender,
          birthDate: b.birthDate,
          classId: cls.id,
          schoolId: school.id,
        });
      }
      counts.students = await createManyChunked(prisma, 'student', toCreate);
    }

    const students = await prisma.student.findMany({
      where: { schoolId: school.id, matricule: { startsWith: `${MARKER}-` } },
      orderBy: { matricule: 'asc' },
    });

    const parentTarget = 60;
    const existingParents = await prisma.user.count({
      where: { email: { endsWith: `@${EMAIL_DOMAIN}` }, role: 'PARENT' },
    });
    if (existingParents < 40) {
      for (let p = 0; p < parentTarget; p++) {
        const childA = students[p];
        const childB = students[p + parentTarget] || null;
        if (!childA) break;
        const email = `parent.${String(p + 1).padStart(3, '0')}@${EMAIL_DOMAIN}`;
        const lastName = childA.lastName;
        const firstName = p % 3 === 0 ? pick(FIRST_F, p) : pick(FIRST_M, p);
        const user = await prisma.user.upsert({
          where: { email },
          update: {},
          create: {
            email,
            password: passwordHash,
            role: 'PARENT',
            firstName,
            lastName,
            phone: `07 ${String(40 + (p % 50)).padStart(2, '0')} ${String(10 + p).padStart(2, '0')} ${String(20 + p).padStart(2, '0')}`,
            parentProfile: { create: {} },
          },
          include: { parentProfile: true },
        });
        let profile = user.parentProfile;
        if (!profile) {
          profile = await prisma.parentProfile.create({ data: { userId: user.id } });
        }
        counts.parents += 1;
        for (const st of [childA, childB].filter(Boolean)) {
          const link = await prisma.parentStudent.upsert({
            where: { parentId_studentId: { parentId: profile.id, studentId: st.id } },
            update: {},
            create: { parentId: profile.id, studentId: st.id, relation: st === childA ? 'père/mère' : 'tuteur' },
          });
          if (link) counts.parentLinks += 1;
        }
      }
    } else {
      counts.parents = existingParents;
      counts.parentLinks = await prisma.parentStudent.count({
        where: { student: { schoolId: school.id, matricule: { startsWith: `${MARKER}-` } } },
      });
    }

    const feeTypes = [];
    for (const fee of FEE_DEFS) {
      let row = await prisma.feeType.findFirst({ where: { schoolId: school.id, name: fee.name } });
      if (!row) {
        row = await prisma.feeType.create({ data: { ...fee, schoolId: school.id } });
        counts.feeTypes += 1;
      }
      feeTypes.push(row);
    }

    const paymentCount = await prisma.payment.count({
      where: { student: { schoolId: school.id }, reference: { startsWith: `${MARKER}-` } },
    });

    if (paymentCount < 100 && students.length) {
      const existingRefs = new Set(
        (await prisma.payment.findMany({
          where: { student: { schoolId: school.id }, reference: { startsWith: `${MARKER}-` } },
          select: { reference: true },
        })).map((p) => p.reference),
      );
      const feeByName = Object.fromEntries(feeTypes.map((f) => [f.name, f]));
      const monthSlots = monthsBack(12);
      const paymentRows = [];
      const pendingMeta = [];

      const termPlan = [
        { fee: "Frais d'inscription", monthOffset: 11, day: 5 },
        { fee: 'Tenue scolaire', monthOffset: 11, day: 8 },
        { fee: 'Fournitures', monthOffset: 11, day: 12 },
        { fee: 'Scolarité Trimestre 1', monthOffset: 10, day: 15 },
        { fee: 'Scolarité Trimestre 2', monthOffset: 6, day: 12 },
        { fee: 'Scolarité Trimestre 3', monthOffset: 3, day: 10 },
      ];

      students.forEach((st, si) => {
        termPlan.forEach((plan, pi) => {
          const fee = feeByName[plan.fee];
          if (!fee) return;
          const slot = monthSlots[monthSlots.length - 1 - plan.monthOffset] || monthSlots[0];
          const ch = channelFor(si + pi);
          const status = (si + pi) % 17 === 0 ? 'PENDING' : 'VALIDATED';
          const createdAt = at(slot.year, slot.month, plan.day, 9 + (si % 8));
          const ref = `${MARKER}-${ch.prefix}-${st.matricule}-${fee.name.slice(0, 8).replace(/\s+/g, '')}`;
          paymentRows.push({
            amount: fee.amount,
            status,
            reference: ref,
            note: status === 'PENDING' ? `Preuve ${ch.prefix} à valider` : `Paiement ${ch.prefix}`,
            proofUrl: status === 'PENDING' ? '/img/schools/igest-yopougon-sideci.png' : null,
            validatedAt: status === 'VALIDATED' ? new Date(createdAt.getTime() + 36e5) : null,
            createdAt,
            studentId: st.id,
            feeTypeId: fee.id,
          });
          if (status === 'PENDING') pendingMeta.push({ studentId: st.id, ref });
        });

        const cantineMonths = monthSlots.slice(-8);
        cantineMonths.forEach((slot, mi) => {
          if ((si + mi) % 3 !== 0) return;
          const fee = (si + mi) % 2 === 0 ? feeByName.Cantine : feeByName.Transport;
          if (!fee) return;
          const ch = channelFor(si + mi + 3);
          const createdAt = at(slot.year, slot.month, 6 + (si % 12), 11);
          paymentRows.push({
            amount: fee.amount,
            status: 'VALIDATED',
            reference: `${MARKER}-${ch.prefix}-${st.matricule}-${slot.key}`,
            note: `Paiement ${ch.prefix}`,
            validatedAt: createdAt,
            createdAt,
            studentId: st.id,
            feeTypeId: fee.id,
          });
        });
      });

      const newPayments = paymentRows.filter((p) => !existingRefs.has(p.reference));
      counts.payments = await createManyChunked(prisma, 'payment', newPayments, 150);
      counts.pendingPayments = pendingMeta.length;

      const pendingPays = await prisma.payment.findMany({
        where: { student: { schoolId: school.id }, status: 'PENDING', reference: { startsWith: `${MARKER}-` } },
        select: { id: true, studentId: true, reference: true },
      });
      const proofRows = pendingPays.map((p, i) => ({
        hash: crypto.createHash('sha256').update(`${MARKER}-proof-${p.id}-${i}`).digest('hex'),
        fileUrl: '/img/schools/igest-yopougon-sideci.png',
        mimeType: 'image/png',
        size: 18400,
        originalName: `preuve-wave-${i + 1}.png`,
        studentId: p.studentId,
        paymentId: p.id,
      }));
      counts.proofs = await createManyChunked(prisma, 'paymentProof', proofRows);
    } else {
      counts.payments = paymentCount;
      counts.pendingPayments = await prisma.payment.count({
        where: { student: { schoolId: school.id }, status: 'PENDING', reference: { startsWith: `${MARKER}-` } },
      });
    }

    const absenceCount = await prisma.absence.count({
      where: { student: { schoolId: school.id, matricule: { startsWith: `${MARKER}-` } } },
    });
    if (absenceCount < 80 && students.length && teacherRecords[0]) {
      const days = weekdaysBack(new Date(), 40);
      const absenceRows = [];
      const recorder = teacherRecords[0].id;
      students.forEach((st, si) => {
        const nAbs = 2 + (si % 5);
        for (let k = 0; k < nAbs; k++) {
          const day = days[(si + k * 3) % days.length];
          absenceRows.push({
            date: dateOnly(day),
            type: (si + k) % 4 === 0 ? 'LATE' : 'ABSENCE',
            reason: (si + k) % 4 === 0 ? 'Retard transport Yopougon' : (k % 2 === 0 ? 'Maladie' : 'Rendez-vous familial'),
            studentId: st.id,
            recordedBy: recorder,
          });
        }
      });

      const repeaterIdx = students.map((_, i) => i).filter((i) => i % 9 === 0).slice(0, 12);
      const yearDays = weekdaysBack(at(2026, 5, 30), 80);
      repeaterIdx.forEach((si, ri) => {
        const st = students[si];
        for (let k = 0; k < 32; k++) {
          absenceRows.push({
            date: dateOnly(yearDays[k % yearDays.length]),
            type: 'ABSENCE',
            reason: 'Absences répétées — suivi vie scolaire',
            studentId: st.id,
            recordedBy: recorder,
          });
        }
        void ri;
      });
      counts.absences = await createManyChunked(prisma, 'absence', absenceRows, 250);
    } else {
      counts.absences = absenceCount;
    }

    const hwCount = await prisma.homework.count({
      where: { class: { schoolId: school.id }, title: { startsWith: '' } },
    });
    const demoHw = await prisma.homework.count({
      where: { class: { schoolId: school.id }, description: { contains: MARKER } },
    });
    if (demoHw < 8 && teacherRecords.length) {
      for (const cls of classList) {
        for (const hw of HOMEWORKS.slice(0, 3 + (cls.name.includes('A') ? 1 : 0))) {
          const teacher = teacherRecords.find((t) => t.subject === hw.subject) || teacherRecords[0];
          const due = new Date();
          due.setDate(due.getDate() + hw.days);
          const homework = await prisma.homework.create({
            data: {
              title: hw.title,
              description: `${hw.description} [${MARKER}]`,
              dueDate: due,
              kind: hw.kind,
              subject: hw.subject,
              classId: cls.id,
              teacherId: teacher.id,
            },
          });
          counts.homeworks += 1;
          const classStudents = students.filter((s) => s.classId === cls.id);
          const subs = classStudents.map((st, i) => ({
            homeworkId: homework.id,
            studentId: st.id,
            done: i % 3 !== 0,
          }));
          if (subs.length) {
            await prisma.homeworkSubmission.createMany({ data: subs, skipDuplicates: true });
          }
        }
      }
    } else {
      counts.homeworks = hwCount;
    }

    const gradeCount = await prisma.grade.count({
      where: { student: { schoolId: school.id, matricule: { startsWith: `${MARKER}-` } } },
    });
    if (gradeCount < 200 && students.length && teacherRecords.length) {
      const periods = ['Trimestre 1', 'Trimestre 2'];
      const gradeRows = [];
      const repeaterSet = new Set(students.filter((_, i) => i % 9 === 0).slice(0, 12).map((s) => s.id));
      students.forEach((st, si) => {
        SUBJECTS.slice(0, 6).forEach((subject, subi) => {
          const teacher = teacherRecords.find((t) => t.subject === subject) || teacherRecords[subi % teacherRecords.length];
          periods.forEach((period, pi) => {
            let value = 9 + ((si + subi + pi) % 10) + ((si * 3 + subi) % 3) * 0.5;
            if (repeaterSet.has(st.id)) value = 6 + ((si + subi) % 4);
            gradeRows.push({
              subject,
              value: Math.min(20, Math.round(value * 2) / 2),
              maxValue: 20,
              period,
              comment: value >= 14 ? 'Bon travail' : value < 8 ? 'Doit redoubler d’efforts' : null,
              studentId: st.id,
              teacherId: teacher.id,
            });
          });
        });
      });
      counts.grades = await createManyChunked(prisma, 'grade', gradeRows, 200);
    } else {
      counts.grades = gradeCount;
    }

    const yearCount = await prisma.studentYearRecord.count({
      where: { schoolId: school.id, student: { matricule: { startsWith: `${MARKER}-` } } },
    });
    if (yearCount < students.length && students.length) {
      const years = ['2023-2024', '2024-2025', schoolYear];
      const uniqueYears = [...new Set(years)];
      const rows = [];
      students.forEach((st, si) => {
        uniqueYears.forEach((year) => {
          const repeated = si % 9 === 0 && year === schoolYear;
          rows.push({
            studentId: st.id,
            schoolYear: year,
            classId: st.classId,
            schoolId: school.id,
            repeatYear: repeated,
            status: 'inscrit',
            gender: st.gender,
          });
        });
      });
      counts.yearRecords = await createManyChunked(prisma, 'studentYearRecord', rows, 150, true);
    } else {
      counts.yearRecords = yearCount;
    }

    const accounts = await prisma.financeAccount.findMany({ where: { schoolId: school.id } });
    const categories = await prisma.expenseCategory.findMany({ where: { schoolId: school.id } });
    const accountByType = Object.fromEntries(accounts.map((a) => [a.type, a]));
    const catByName = Object.fromEntries(categories.map((c) => [`${c.kind}::${c.name}`, c]));

    const finCount = await prisma.financeTransaction.count({
      where: { schoolId: school.id, reference: { startsWith: `${MARKER}-FIN-` } },
    });
    if (finCount < 20) {
      const monthSlots = monthsBack(12);
      const txRows = [];
      const entryRows = [];
      monthSlots.forEach((slot, mi) => {
        const incomeWave = 1800000 + (mi % 5) * 120000;
        const incomeOm = 950000 + (mi % 4) * 80000;
        const incomeCash = 220000 + (mi % 3) * 25000;
        const createdAt = at(slot.year, slot.month, 18, 14);
        const packs = [
          { type: 'WAVE', amount: incomeWave, cat: 'Scolarité', desc: `Encaissements scolarité Wave — ${slot.key}` },
          { type: 'ORANGE_MONEY', amount: incomeOm, cat: 'Scolarité', desc: `Encaissements Orange Money — ${slot.key}` },
          { type: 'CASH', amount: incomeCash, cat: 'Cantine', desc: `Cantine et extras espèces — ${slot.key}` },
        ];
        packs.forEach((p) => {
          const account = accountByType[p.type];
          const cat = catByName[`INCOME::${p.cat}`];
          if (!account) return;
          txRows.push({
            type: 'INCOME',
            amount: p.amount,
            description: p.desc,
            reference: `${MARKER}-FIN-${slot.key}-${p.type}`,
            createdAt,
            schoolId: school.id,
            accountId: account.id,
            categoryId: cat?.id || null,
          });
          entryRows.push({
            type: 'INCOME',
            amount: p.amount,
            description: p.desc,
            date: createdAt,
            category: p.cat,
            accountType: p.type,
            source: 'PAYMENT',
            schoolId: school.id,
          });
        });
        EXPENSE_MONTHLY.forEach((ex, ei) => {
          if (mi < 2 && ei > 2) return;
          const account = accountByType[ei % 2 === 0 ? 'BANK' : 'CASH'] || accounts[0];
          const cat = catByName[`EXPENSE::${ex.cat}`];
          const amount = ex.amount + (mi % 3) * 15000;
          const when = at(slot.year, slot.month, 22, 11);
          txRows.push({
            type: 'EXPENSE',
            amount,
            description: `${ex.desc} [${MARKER}]`,
            reference: `${MARKER}-FIN-${slot.key}-EXP-${ei}`,
            createdAt: when,
            schoolId: school.id,
            accountId: account.id,
            categoryId: cat?.id || null,
          });
          entryRows.push({
            type: 'EXPENSE',
            amount,
            description: `${ex.desc} [${MARKER}]`,
            date: when,
            category: ex.cat,
            accountType: account.type,
            source: 'MANUAL',
            schoolId: school.id,
          });
        });
      });
      counts.accounting = await createManyChunked(prisma, 'financeTransaction', txRows);
      await createManyChunked(prisma, 'accountingEntry', entryRows);

      for (const account of accounts) {
        const txs = await prisma.financeTransaction.findMany({
          where: { accountId: account.id },
          select: { type: true, amount: true },
        });
        const balance = txs.reduce((s, t) => s + (t.type === 'INCOME' ? t.amount : -t.amount), 0);
        await prisma.financeAccount.update({ where: { id: account.id }, data: { balance } });
      }
    } else {
      counts.accounting = finCount;
    }

    const parentUsers = await prisma.user.findMany({
      where: { email: { endsWith: `@${EMAIL_DOMAIN}` }, role: 'PARENT' },
      take: 8,
      include: { parentProfile: { include: { children: true } } },
    });
    const teacherUsers = await prisma.user.findMany({
      where: { email: { endsWith: `@${EMAIL_DOMAIN}` }, role: 'TEACHER' },
      take: 4,
    });
    const msgCount = await prisma.message.count({
      where: { sender: { email: { endsWith: `@${EMAIL_DOMAIN}` } } },
    });
    if (msgCount < 4 && parentUsers.length && teacherUsers.length && students[0]) {
      const msgs = [];
      const pairs = Math.min(parentUsers.length, teacherUsers.length, 4);
      for (let i = 0; i < pairs; i++) {
        const child = parentUsers[i].parentProfile?.children?.[0];
        msgs.push({
          content: `Bonjour, ${students[i]?.firstName || 'votre enfant'} progresse bien ce trimestre. Cordialement, ${teacherUsers[i].lastName}.`,
          senderId: teacherUsers[i].id,
          receiverId: parentUsers[i].id,
          studentId: child?.studentId || students[i]?.id || null,
        });
        msgs.push({
          content: 'Merci beaucoup pour le suivi, nous serons à la réunion parents-professeurs.',
          senderId: parentUsers[i].id,
          receiverId: teacherUsers[i].id,
          studentId: child?.studentId || students[i]?.id || null,
        });
      }
      counts.messages = (await prisma.message.createMany({ data: msgs })).count;
    } else {
      counts.messages = msgCount;
    }

    if (adminId) {
      const notifCount = await prisma.notification.count({
        where: { userId: adminId, body: { contains: MARKER } },
      });
      if (notifCount < 3) {
        await prisma.notification.createMany({
          data: [
            { type: 'PAYMENT', title: 'Paiements en attente', body: `Plusieurs preuves Wave / Orange Money à valider. [${MARKER}]`, userId: adminId },
            { type: 'GENERAL', title: 'Réunion pédagogique', body: `Conseil des professeurs vendredi 15h — salle des profs. [${MARKER}]`, userId: adminId },
            { type: 'HOMEWORK', title: 'Devoirs publiés', body: `De nouveaux devoirs et contrôles ont été publiés cette semaine. [${MARKER}]`, userId: adminId },
          ],
        });
        counts.notifications = 3;
      }
    }

    const totals = {
      classes: await prisma.class.count({ where: { schoolId: school.id } }),
      students: await prisma.student.count({ where: { schoolId: school.id } }),
      demoStudents: await prisma.student.count({ where: { schoolId: school.id, matricule: { startsWith: `${MARKER}-` } } }),
      teachers: await prisma.teacher.count({ where: { schoolId: school.id } }),
      parents: await prisma.user.count({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` }, role: 'PARENT' } }),
      payments: await prisma.payment.count({ where: { student: { schoolId: school.id } } }),
      pending: await prisma.payment.count({ where: { student: { schoolId: school.id }, status: 'PENDING' } }),
      absences: await prisma.absence.count({ where: { student: { schoolId: school.id } } }),
      homeworks: await prisma.homework.count({ where: { class: { schoolId: school.id } } }),
      grades: await prisma.grade.count({ where: { student: { schoolId: school.id } } }),
      financeTx: await prisma.financeTransaction.count({ where: { schoolId: school.id } }),
      accounting: await prisma.accountingEntry.count({ where: { schoolId: school.id } }),
      yearRecords: await prisma.studentYearRecord.count({ where: { schoolId: school.id } }),
      messages: await prisma.message.count({
        where: { OR: [{ sender: { email: { endsWith: `@${EMAIL_DOMAIN}` } } }, { receiver: { email: { endsWith: `@${EMAIL_DOMAIN}` } } }] },
      }),
    };

    console.log('\nCréés / traités cette exécution :');
    console.log(JSON.stringify(counts, null, 2));
    console.log('\nTotaux IGEST maintenant :');
    console.log(`  Classes            : ${totals.classes}`);
    console.log(`  Élèves (dont démo) : ${totals.students} (${totals.demoStudents} ${MARKER})`);
    console.log(`  Enseignants        : ${totals.teachers}`);
    console.log(`  Parents démo       : ${totals.parents}`);
    console.log(`  Paiements          : ${totals.payments} (dont ${totals.pending} en attente)`);
    console.log(`  Absences/retards   : ${totals.absences}`);
    console.log(`  Devoirs            : ${totals.homeworks}`);
    console.log(`  Notes              : ${totals.grades}`);
    console.log(`  Écritures finance  : ${totals.financeTx}`);
    console.log(`  AccountingEntry    : ${totals.accounting}`);
    console.log(`  Fiches année       : ${totals.yearRecords}`);
    console.log(`  Messages           : ${totals.messages}`);
    console.log('\nConnexion direction : igest@educonnect.ci (mot de passe inchangé).');
    console.log(skipCore ? 'Déjà peuplé au seuil IG-DEMO — sections manquantes complétées si besoin.' : 'Jeu IG-DEMO créé / enrichi.');
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--run')) {
    return fill()
      .catch((err) => {
        console.error(err.message || err);
        process.exitCode = 1;
      })
      .finally(() => {
        process.exit(process.exitCode || 0);
      });
  }

  const neonOnly = args.includes('--neon-only');
  const localOnly = args.includes('--local-only');
  let exitCode = 0;

  if (!localOnly) {
    const neonUrl = resolveNeonUrl();
    if (!neonUrl) {
      console.error('Aucune URL Neon (fichier de secours / neonctl).');
      exitCode = 1;
    } else {
      exitCode = spawnFill(neonUrl, `Neon production (${describeTarget(neonUrl)})`) || exitCode;
    }
  }

  if (!neonOnly) {
    const localUrl = resolveLocalUrl();
    if (localUrl) {
      const localStatus = spawnFill(localUrl, describeTarget(localUrl));
      if (localStatus) {
        console.warn('Remplissage local en échec (PostgreSQL local absent ?). Neon n’est pas annulé.');
        if (localOnly) exitCode = localStatus;
      }
    } else if (localOnly) {
      console.error('Pas d’URL PostgreSQL locale dans .env.');
      exitCode = 1;
    } else {
      console.log('Pas de PostgreSQL local détecté dans .env — Neon seulement.');
    }
  }

  process.exit(exitCode);
}

if (require.main === module) {
  Promise.resolve(main()).catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { fill };
