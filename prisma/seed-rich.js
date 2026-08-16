require('dotenv/config');

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const PERIOD = 'Trimestre 1';
const SUBJECTS = ['Mathématiques', 'Français', 'Sciences', 'Histoire-Géo', 'Anglais', 'EPS'];

const STUDENTS = [
  { matricule: 'ETOILE-002', firstName: 'Aminata', lastName: 'Traoré', className: 'CM2 A' },
  { matricule: 'ETOILE-003', firstName: 'Yao', lastName: 'Kouassi', className: 'CM2 A' },
  { matricule: 'ETOILE-004', firstName: 'Fatou', lastName: 'Diallo', className: 'CM2 A' },
  { matricule: 'ETOILE-005', firstName: 'Kouadio', lastName: 'N\'Guessan', className: 'CM2 A' },
  { matricule: 'ETOILE-006', firstName: 'Mariam', lastName: 'Ouattara', className: 'CM2 B' },
  { matricule: 'ETOILE-007', firstName: 'Seydou', lastName: 'Bamba', className: 'CM2 B' },
  { matricule: 'ETOILE-008', firstName: 'Adjoua', lastName: 'Koffi', className: 'CM2 B' },
  { matricule: 'ETOILE-009', firstName: 'Ibrahim', lastName: 'Coulibaly', className: 'CM1 A' },
  { matricule: 'ETOILE-010', firstName: 'Akissi', lastName: 'Yao', className: 'CM1 A' },
  { matricule: 'ETOILE-011', firstName: 'Mohamed', lastName: 'Sanogo', className: 'CM1 A' },
  { matricule: 'ETOILE-012', firstName: 'Christelle', lastName: 'Aka', className: 'CM1 B' },
  { matricule: 'ETOILE-013', firstName: 'Eric', lastName: 'Gnahoré', className: 'CM1 B' },
  { matricule: 'ETOILE-014', firstName: 'Salimata', lastName: 'Doumbia', className: 'CE2 A' },
  { matricule: 'ETOILE-015', firstName: 'Jean-Baptiste', lastName: 'Kouamé', className: 'CE2 A' },
  { matricule: 'ETOILE-016', firstName: 'Nadège', lastName: 'Brou', className: 'CE2 B' },
  { matricule: 'ETOILE-017', firstName: 'Lassina', lastName: 'Fofana', className: 'CE2 B' },
  { matricule: 'ETOILE-018', firstName: 'Prisca', lastName: 'Toure', className: 'CE1 A' },
  { matricule: 'ETOILE-019', firstName: 'Didier', lastName: 'Kacou', className: 'CE1 A' },
];

const TEACHERS = [
  { email: 'prof.francais@demo.ci', firstName: 'M.', lastName: 'Kouadio', subject: 'Français' },
  { email: 'prof.sciences@demo.ci', firstName: 'Mme', lastName: 'Aka', subject: 'Sciences' },
  { email: 'prof.eps@demo.ci', firstName: 'M.', lastName: 'Bamba', subject: 'EPS' },
];

const PARENTS = [
  { email: 'parent2@demo.ci', firstName: 'Moussa', lastName: 'Traoré', matricules: ['ETOILE-002', 'ETOILE-003'] },
  { email: 'parent3@demo.ci', firstName: 'Aïcha', lastName: 'Diallo', matricules: ['ETOILE-004'] },
  { email: 'parent4@demo.ci', firstName: 'Koffi', lastName: 'N\'Guessan', matricules: ['ETOILE-005', 'ETOILE-006'] },
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d;
}

function dateOnly(daysOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return new Date(d.toISOString().slice(0, 10));
}

async function ensureClass(schoolId, name, level) {
  const existing = await prisma.class.findFirst({ where: { schoolId, name } });
  if (existing) return existing;
  return prisma.class.create({ data: { name, level, schoolId } });
}

async function ensureStudent(schoolId, classId, data) {
  const existing = await prisma.student.findFirst({
    where: { schoolId, matricule: data.matricule },
  });
  if (existing) return existing;
  return prisma.student.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      matricule: data.matricule,
      birthDate: new Date(2014 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 12), 15),
      classId,
      schoolId,
    },
  });
}

async function main() {
  const school = await prisma.school.findFirst({
    where: { slug: 'ecole-les-etoiles' },
    include: { admin: true },
  });
  if (!school) throw new Error('École démo introuvable. Lancez d\'abord npm run db:seed');

  const hash = await bcrypt.hash('demo1234', 10);
  const mainTeacher = await prisma.user.findUnique({
    where: { email: 'prof@demo.ci' },
    include: { teacher: true },
  });
  if (!mainTeacher?.teacher) throw new Error('Enseignant démo introuvable.');

  const classes = {};
  for (const [name, level] of [
    ['CM2 A', 'CM2'], ['CM2 B', 'CM2'], ['CM1 A', 'CM1'], ['CM1 B', 'CM1'],
    ['CE2 A', 'CE2'], ['CE2 B', 'CE2'], ['CE1 A', 'CE1'],
  ]) {
    classes[name] = await ensureClass(school.id, name, level);
  }

  const students = [];
  for (const s of STUDENTS) {
    const cls = classes[s.className];
    students.push(await ensureStudent(school.id, cls.id, s));
  }

  const kofi = await prisma.student.findFirst({
    where: { schoolId: school.id, matricule: 'ETOILE-001' },
  });
  if (kofi) students.unshift(kofi);

  const teachers = [mainTeacher.teacher];
  for (const t of TEACHERS) {
    const user = await prisma.user.upsert({
      where: { email: t.email },
      update: {},
      create: {
        email: t.email,
        password: hash,
        firstName: t.firstName,
        lastName: t.lastName,
        phone: `07${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
        role: 'TEACHER',
        teacher: { create: { schoolId: school.id, subject: t.subject } },
      },
      include: { teacher: true },
    });
    teachers.push(user.teacher);
    const targetClass = classes['CM2 A'];
    await prisma.teacherClass.upsert({
      where: { teacherId_classId: { teacherId: user.teacher.id, classId: targetClass.id } },
      update: {},
      create: { teacherId: user.teacher.id, classId: targetClass.id },
    });
  }

  for (const p of PARENTS) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: {
        email: p.email,
        password: hash,
        firstName: p.firstName,
        lastName: p.lastName,
        phone: `07${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
        role: 'PARENT',
        parentProfile: { create: {} },
      },
      include: { parentProfile: true },
    });
    for (const mat of p.matricules) {
      const st = students.find((s) => s.matricule === mat);
      if (!st) continue;
      await prisma.parentStudent.upsert({
        where: { parentId_studentId: { parentId: user.parentProfile.id, studentId: st.id } },
        update: {},
        create: { parentId: user.parentProfile.id, studentId: st.id },
      });
    }
  }

  const feeTypes = [];
  for (const fee of [
    { name: 'Scolarité T1', amount: 25000, dueDay: 15 },
    { name: 'Cantine T1', amount: 15000, dueDay: 10 },
    { name: 'Transport T1', amount: 12000, dueDay: 5 },
    { name: 'Fournitures', amount: 8000, dueDay: 20 },
  ]) {
    const existing = await prisma.feeType.findFirst({
      where: { schoolId: school.id, name: fee.name },
    });
    feeTypes.push(existing || await prisma.feeType.create({
      data: { ...fee, schoolId: school.id },
    }));
  }

  const paymentCount = await prisma.payment.count({
    where: { student: { schoolId: school.id } },
  });
  if (paymentCount < 5) {
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      const fee = feeTypes[i % feeTypes.length];
      const status = i % 3 === 0 ? 'PENDING' : 'VALIDATED';
      await prisma.payment.create({
        data: {
          amount: fee.amount,
          status,
          reference: status === 'VALIDATED' ? `WAVE-${student.matricule}` : null,
          validatedAt: status === 'VALIDATED' ? daysAgo(10 - i) : null,
          studentId: student.id,
          feeTypeId: fee.id,
        },
      });
    }
  }

  const gradeCount = await prisma.grade.count({
    where: { student: { schoolId: school.id } },
  });
  if (gradeCount < 10) {
    for (const student of students) {
      for (const subject of SUBJECTS) {
        const teacher = teachers.find((t) => t.subject === subject) || teachers[0];
        const exists = await prisma.grade.findFirst({
          where: { studentId: student.id, subject, period: PERIOD },
        });
        if (exists) continue;
        await prisma.grade.create({
          data: {
            subject,
            value: 8 + Math.floor(Math.random() * 12),
            period: PERIOD,
            comment: Math.random() > 0.7 ? 'Bon travail' : null,
            studentId: student.id,
            teacherId: teacher.id,
          },
        });
      }
    }
  }

  const absenceCount = await prisma.absence.count({
    where: { student: { schoolId: school.id } },
  });
  if (absenceCount < 5) {
    for (let i = 0; i < Math.min(8, students.length); i++) {
      await prisma.absence.create({
        data: {
          date: dateOnly(-(i + 1)),
          type: i % 4 === 0 ? 'LATE' : 'ABSENCE',
          reason: i % 4 === 0 ? 'Retard bus' : 'Maladie',
          studentId: students[i].id,
          recordedBy: mainTeacher.teacher.id,
        },
      });
    }
  }

  const hwCount = await prisma.homework.count({ where: { class: { schoolId: school.id } } });
  if (hwCount < 3) {
    const cm2a = classes['CM2 A'];
    const homeworks = [
      { title: 'Exercices fractions p.42-43', description: 'À rendre pour vendredi', days: 3, kind: 'HOMEWORK', subject: 'Mathématiques' },
      { title: 'Contrôle de vocabulaire unité 4', description: 'Révisions unités 1 à 4', days: 5, kind: 'TEST', subject: 'Français' },
      { title: 'Rédaction : Mon héros', description: 'Minimum 15 lignes', days: 5, kind: 'HOMEWORK', subject: 'Français' },
      { title: 'Leçon vocabulaire unité 4', description: 'Apprendre par cœur', days: 2, kind: 'HOMEWORK', subject: 'Français' },
      { title: 'Exercices sciences : le cycle de l\'eau', description: null, days: 7, kind: 'HOMEWORK', subject: 'Sciences' },
    ];
    for (const hw of homeworks) {
      const homework = await prisma.homework.create({
        data: {
          title: hw.title,
          description: hw.description,
          dueDate: daysAgo(-hw.days),
          classId: cm2a.id,
          teacherId: mainTeacher.teacher.id,
          kind: hw.kind || 'HOMEWORK',
          subject: hw.subject || null,
        },
      });
      const classStudents = students.filter((s) => s.classId === cm2a.id);
      for (const st of classStudents) {
        await prisma.homeworkSubmission.upsert({
          where: { homeworkId_studentId: { homeworkId: homework.id, studentId: st.id } },
          update: {},
          create: { homeworkId: homework.id, studentId: st.id, done: Math.random() > 0.4 },
        });
      }
    }
  }

  const notifCount = await prisma.notification.count({
    where: { user: { email: 'parent@demo.ci' } },
  });
  if (notifCount < 3) {
    const parentUser = await prisma.user.findUnique({ where: { email: 'parent@demo.ci' } });
    const items = [
      { type: 'ABSENCE', title: 'Absence signalée', body: 'Kofi Koné absent le ' + dateOnly(-2).toLocaleDateString('fr-FR') },
      { type: 'HOMEWORK', title: 'Nouveau devoir', body: 'Exercices fractions — échéance vendredi' },
      { type: 'PAYMENT', title: 'Paiement en attente', body: 'Scolarité T1 : 25 000 FCFA à régler' },
      { type: 'GENERAL', title: 'Réunion parents', body: 'Réunion parents-professeurs samedi 9h' },
      { type: 'BEHAVIOR', title: 'Félicitations', body: 'Kofi a reçu un badge « Élève du mois »' },
    ];
    for (const n of items) {
      await prisma.notification.create({
        data: { ...n, userId: parentUser.id },
      });
    }
  }

  const msgCount = await prisma.message.count({
    where: { OR: [{ sender: { email: 'prof@demo.ci' } }, { receiver: { email: 'parent@demo.ci' } }] },
  });
  if (msgCount < 2) {
    const prof = await prisma.user.findUnique({ where: { email: 'prof@demo.ci' } });
    const parent = await prisma.user.findUnique({ where: { email: 'parent@demo.ci' } });
    await prisma.message.createMany({
      data: [
        { content: 'Bonjour, Kofi progresse bien en maths ce trimestre.', senderId: prof.id, receiverId: parent.id, studentId: kofi?.id },
        { content: 'Merci beaucoup pour le suivi !', senderId: parent.id, receiverId: prof.id, studentId: kofi?.id },
        { content: 'Pensez à signer le carnet de correspondance.', senderId: prof.id, receiverId: parent.id, studentId: kofi?.id },
      ],
    });
  }

  const menuCount = await prisma.canteenMenu.count({ where: { schoolId: school.id } });
  if (menuCount < 3) {
    const menus = [
      'Riz sauce graine + poisson braisé + banane',
      'Attiéké + poulet braisé + salade',
      'Foutou banane + sauce claire + viande',
      'Riz blanc + sauce arachide + légumes',
      'Spaghetti bolognaise + fruit',
    ];
    for (let i = 0; i < menus.length; i++) {
      const menu = await prisma.canteenMenu.create({
        data: { date: dateOnly(-i), menu: menus[i], schoolId: school.id },
      });
      for (const st of students.slice(0, 10)) {
        await prisma.canteenRecord.upsert({
          where: { studentId_menuId: { studentId: st.id, menuId: menu.id } },
          update: {},
          create: { studentId: st.id, menuId: menu.id, ate: Math.random() > 0.15 },
        });
      }
    }
  }

  const activityCount = await prisma.extracurricular.count({ where: { schoolId: school.id } });
  if (activityCount < 2) {
    const activities = [
      { name: 'Club football', description: 'Entraînement mardi et jeudi', schedule: 'Mardi/Jeudi 16h-17h30' },
      { name: 'Club lecture', description: 'Découverte de la littérature africaine', schedule: 'Mercredi 15h-16h' },
      { name: 'Chorale scolaire', description: 'Chants traditionnels et modernes', schedule: 'Vendredi 14h-15h30' },
      { name: 'Robotique', description: 'Initiation programmation et LEGO', schedule: 'Samedi 9h-11h' },
    ];
    for (const act of activities) {
      const activity = await prisma.extracurricular.create({
        data: { ...act, schoolId: school.id },
      });
      for (const st of students.slice(0, 6)) {
        await prisma.extracurricularEnrollment.upsert({
          where: { studentId_activityId: { studentId: st.id, activityId: activity.id } },
          update: {},
          create: { studentId: st.id, activityId: activity.id },
        });
      }
    }
  }

  const behaviorCount = await prisma.behaviorNote.count({
    where: { student: { schoolId: school.id } },
  });
  if (behaviorCount < 3) {
    for (let i = 0; i < 6; i++) {
      await prisma.behaviorNote.create({
        data: {
          type: i % 3 === 0 ? 'NEGATIVE' : 'POSITIVE',
          message: i % 3 === 0 ? 'Bavardage en classe' : 'Participation active',
          studentId: students[i].id,
          teacherId: mainTeacher.teacher.id,
        },
      });
      await prisma.badge.create({
        data: {
          type: 'merit',
          label: i % 2 === 0 ? 'Élève du mois' : 'Bon comportement',
          studentId: students[i].id,
          teacherId: mainTeacher.teacher.id,
        },
      });
    }
  }

  const transportCount = await prisma.transportLog.count({
    where: { student: { schoolId: school.id } },
  });
  if (transportCount < 3) {
    for (const st of students.slice(0, 8)) {
      await prisma.transportLog.createMany({
        data: [
          { event: 'BOARDED_BUS', studentId: st.id, createdAt: daysAgo(0) },
          { event: 'ARRIVED_SCHOOL', studentId: st.id, createdAt: daysAgo(0) },
        ],
      });
    }
  }

  const healthCount = await prisma.healthIncident.count({
    where: { student: { schoolId: school.id } },
  });
  if (healthCount < 2) {
    await prisma.healthIncident.createMany({
      data: [
        { type: 'Fièvre légère', description: 'Température 37.8°C — repos conseillé', studentId: students[2].id },
        { type: 'Allergie', description: 'Réaction cutanée — parents contactés', studentId: students[5].id },
      ],
    });
  }

  const lostCount = await prisma.lostItem.count({ where: { schoolId: school.id } });
  if (lostCount < 2) {
    await prisma.lostItem.createMany({
      data: [
        { description: 'Gourde bleue Thermos', schoolId: school.id, claimed: false },
        { description: 'Cartable rouge avec stickers', schoolId: school.id, studentId: students[3].id, claimed: true },
        { description: 'Montre digitale noire', schoolId: school.id, claimed: false },
      ],
    });
  }

  const scheduleCount = await prisma.schedule.count({
    where: { class: { schoolId: school.id } },
  });
  if (scheduleCount < 3) {
    const cm2a = classes['CM2 A'];
    const slots = [
      { dayOfWeek: 1, startTime: '08:00', endTime: '09:00', subject: 'Mathématiques', room: 'Salle 12' },
      { dayOfWeek: 1, startTime: '09:00', endTime: '10:00', subject: 'Français', room: 'Salle 12' },
      { dayOfWeek: 2, startTime: '08:00', endTime: '09:00', subject: 'Sciences', room: 'Labo' },
      { dayOfWeek: 3, startTime: '10:00', endTime: '11:00', subject: 'EPS', room: 'Cour' },
      { dayOfWeek: 4, startTime: '08:00', endTime: '09:00', subject: 'Anglais', room: 'Salle 8' },
      { dayOfWeek: 5, startTime: '14:00', endTime: '15:00', subject: 'Histoire-Géo', room: 'Salle 12' },
    ];
    for (const slot of slots) {
      const teacher = teachers.find((t) => t.subject === slot.subject) || teachers[0];
      await prisma.schedule.create({
        data: { ...slot, classId: cm2a.id, teacherId: teacher.id },
      });
    }
  }

  const bulletinCount = await prisma.bulletin.count({
    where: { student: { schoolId: school.id } },
  });
  if (bulletinCount < 3) {
    for (const st of students.slice(0, 8)) {
      const grades = await prisma.grade.findMany({ where: { studentId: st.id, period: PERIOD } });
      const avg = grades.length
        ? grades.reduce((s, g) => s + g.value, 0) / grades.length
        : 12;
      await prisma.bulletin.create({
        data: { period: PERIOD, average: Math.round(avg * 100) / 100, studentId: st.id },
      });
    }
  }

  const pickupCount = await prisma.pickupAuthorization.count({
    where: { schoolId: school.id },
  });
  if (pickupCount < 2 && kofi) {
    await prisma.pickupAuthorization.create({
      data: {
        authorizedPerson: 'Tonton Kouassi',
        authorizedPhone: '0701020304',
        qrCode: `pickup-${kofi.id}-${crypto.randomBytes(4).toString('hex')}`,
        validUntil: daysAgo(-7),
        studentId: kofi.id,
        schoolId: school.id,
      },
    });
  }

  const { initFinanceDefaults } = require('../src/utils/modules');
  await initFinanceDefaults(school.id);

  const txCount = await prisma.financeTransaction.count({ where: { schoolId: school.id } });
  if (txCount < 3) {
    const accounts = await prisma.financeAccount.findMany({ where: { schoolId: school.id } });
    const categories = await prisma.expenseCategory.findMany({ where: { schoolId: school.id } });
    const wave = accounts.find((a) => a.type === 'WAVE');
    const cash = accounts.find((a) => a.type === 'CASH');
    const salaires = categories.find((c) => c.name === 'Salaires');
    const fournitures = categories.find((c) => c.name === 'Fournitures');

    if (wave) {
      await prisma.financeTransaction.createMany({
        data: [
          { type: 'INCOME', amount: 250000, description: 'Paiements scolarité T1', schoolId: school.id, accountId: wave.id },
          { type: 'INCOME', amount: 85000, description: 'Cantine — recettes semaine', schoolId: school.id, accountId: wave.id },
        ],
      });
      await prisma.financeAccount.update({
        where: { id: wave.id },
        data: { balance: 335000 },
      });
    }
    if (cash && salaires) {
      await prisma.financeTransaction.create({
        data: {
          type: 'EXPENSE', amount: 120000, description: 'Avance salaire enseignant',
          schoolId: school.id, accountId: cash.id, categoryId: salaires.id,
        },
      });
    }
    if (cash && fournitures) {
      await prisma.financeTransaction.create({
        data: {
          type: 'EXPENSE', amount: 45000, description: 'Achat cahiers et stylos',
          schoolId: school.id, accountId: cash.id, categoryId: fournitures.id,
        },
      });
    }
  }

  // ——— Module RH (démo) ———
  const { calcNetPay } = require('../src/utils/hr');
  const now = new Date();
  const hrMonth = now.getMonth() + 1;
  const hrYear = now.getFullYear();

  async function seedStaffProfile(teacherId, schoolId, data) {
    return prisma.staffProfile.upsert({
      where: { teacherId },
      create: { teacherId, schoolId, ...data },
      update: data,
    });
  }

  const profileData = [
    { teacher: teachers[0], contractType: 'CDI', baseSalary: 250000, hireDate: daysAgo(400) },
    { teacher: teachers[1], contractType: 'CDD', baseSalary: 220000, hireDate: daysAgo(200) },
    { teacher: teachers[2], contractType: 'CDI', baseSalary: 230000, hireDate: daysAgo(300) },
    { teacher: teachers[3], contractType: 'VACATAIRE', hourlyRate: 5000, baseSalary: 0, hireDate: daysAgo(90) },
  ];

  for (const p of profileData) {
    await seedStaffProfile(p.teacher.id, school.id, {
      contractType: p.contractType,
      baseSalary: p.baseSalary ?? 0,
      hourlyRate: p.hourlyRate ?? null,
      hireDate: p.hireDate,
      nationalId: 'CI' + String(Math.floor(1000000000 + Math.random() * 9000000000)),
      bankName: 'SGBCI',
      bankAccount: 'CI' + crypto.randomBytes(4).toString('hex').toUpperCase(),
      emergencyName: 'Contact urgence',
      emergencyPhone: '+225 07 00 00 00',
      address: 'Abidjan, Cocody',
    });
  }

  const mainT = teachers[0];
  const secondT = teachers[1];

  await prisma.leaveRequest.deleteMany({ where: { schoolId: school.id } });
  await prisma.leaveRequest.createMany({
    data: [
      {
        schoolId: school.id,
        teacherId: mainT.id,
        type: 'ANNUAL',
        status: 'PENDING',
        startDate: dateOnly(14),
        endDate: dateOnly(18),
        reason: 'Congé annuel — voyage familial',
      },
      {
        schoolId: school.id,
        teacherId: secondT.id,
        type: 'SICK',
        status: 'APPROVED',
        startDate: dateOnly(-10),
        endDate: dateOnly(-8),
        reason: 'Arrêt maladie',
        reviewedAt: daysAgo(11),
      },
    ],
  });

  await prisma.staffAttendance.deleteMany({ where: { schoolId: school.id } });
  for (let d = 0; d < 5; d++) {
    const day = dateOnly(-d);
    for (const t of teachers) {
      const checkIn = new Date(day);
      checkIn.setHours(7, 45 + (d % 3) * 5, 0, 0);
      const checkOut = new Date(day);
      checkOut.setHours(16, 30, 0, 0);
      await prisma.staffAttendance.create({
        data: {
          schoolId: school.id,
          teacherId: t.id,
          date: day,
          checkIn,
          checkOut,
          status: d === 2 && t.id === teachers[3].id ? 'LATE' : 'PRESENT',
        },
      });
    }
  }

  await prisma.salaryAdvance.deleteMany({ where: { schoolId: school.id } });
  await prisma.salaryAdvance.create({
    data: {
      schoolId: school.id,
      teacherId: mainT.id,
      amount: 50000,
      status: 'APPROVED',
      reason: 'Avance sur salaire — frais scolaires enfants',
    },
  });

  await prisma.staffEvaluation.deleteMany({ where: { schoolId: school.id } });
  await prisma.staffEvaluation.create({
    data: {
      schoolId: school.id,
      teacherId: mainT.id,
      period: 'Trimestre 1 — 2025-2026',
      punctuality: 4,
      pedagogy: 5,
      discipline: 4,
      teamwork: 5,
      comment: 'Excellent suivi pédagogique et bonne collaboration avec l\'équipe.',
    },
  });

  const existingPayroll = await prisma.payrollRun.findUnique({
    where: { schoolId_month_year: { schoolId: school.id, month: hrMonth, year: hrYear } },
  });
  if (!existingPayroll) {
    const payrollRun = await prisma.payrollRun.create({
      data: { schoolId: school.id, month: hrMonth, year: hrYear, status: 'VALIDATED' },
    });
    let totalNet = 0;
    for (const t of teachers) {
      const prof = await prisma.staffProfile.findUnique({ where: { teacherId: t.id } });
      const advances = t.id === mainT.id ? 50000 : 0;
      const bonuses = t.id === mainT.id ? 15000 : 0;
      const deductions = 10000;
      const hoursWorked = prof?.hourlyRate ? 32 : null;
      const netPay = calcNetPay({
        baseSalary: prof?.baseSalary || 0,
        bonuses,
        deductions,
        advances,
        hourlyRate: prof?.hourlyRate,
        hoursWorked,
      });
      totalNet += netPay;
      await prisma.payslip.create({
        data: {
          schoolId: school.id,
          teacherId: t.id,
          payrollRunId: payrollRun.id,
          baseSalary: prof?.baseSalary || 0,
          bonuses,
          deductions,
          advances,
          hoursWorked,
          netPay,
        },
      });
    }
    await prisma.payrollRun.update({
      where: { id: payrollRun.id },
      data: { totalNet },
    });
  }

  const totalStudents = await prisma.student.count({ where: { schoolId: school.id } });
  const totalGrades = await prisma.grade.count({ where: { student: { schoolId: school.id } } });
  const totalPayments = await prisma.payment.count({ where: { student: { schoolId: school.id } } });

  console.log('✅ Données enrichies pour École Les Étoiles');
  console.log(`   ${totalStudents} élèves · ${totalGrades} notes · ${totalPayments} paiements`);
  console.log('   + devoirs, absences, cantine, transport, activités, comptabilité, RH');
  console.log('   Comptes démo : mot de passe demo1234');
  console.log('   Nouveaux parents : parent2@demo.ci, parent3@demo.ci, parent4@demo.ci');
  console.log('   Nouveaux profs   : prof.francais@demo.ci, prof.sciences@demo.ci, prof.eps@demo.ci');
}

main()
  .catch(console.error)
  .finally(() => pool.end());
