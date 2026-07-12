require('dotenv/config');

const { PrismaClient } = require('@prisma/client');

const { PrismaPg } = require('@prisma/adapter-pg');

const { Pool } = require('pg');

const bcrypt = require('bcryptjs');



const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });



async function main() {

  const hash = await bcrypt.hash('demo1234', 10);



  await prisma.user.upsert({

    where: { email: 'admin@edupay.ci' },

    update: {},

    create: {

      email: 'admin@edupay.ci',

      password: hash,

      firstName: 'Super',

      lastName: 'Admin',

      phone: '0700000000',

      role: 'SUPER_ADMIN',

    },

  });



  const org = await prisma.organization.upsert({

    where: { slug: 'groupe-les-etoiles' },

    update: {},

    create: { name: 'Groupe Les Étoiles', slug: 'groupe-les-etoiles' },

  });



  let admin = await prisma.user.findUnique({

    where: { email: 'ecole@demo.ci' },

    include: { school: true },

  });



  if (!admin) {

    admin = await prisma.user.create({

      data: {

        email: 'ecole@demo.ci',

        password: hash,

        firstName: 'Directeur',

        lastName: 'Demo',

        phone: '0700000001',

        role: 'SCHOOL_ADMIN',

        school: {

          create: {

            name: 'École Les Étoiles',

            slug: 'ecole-les-etoiles',

            address: 'Cocody, Abidjan',

            city: 'Abidjan',

            waveNumber: '07 00 00 00 01',

            omNumber: '07 00 00 00 02',

            subscription: 'premium',

            organizationId: org.id,

            campusLabel: 'Campus Cocody',

            currentSchoolYear: '2025-2026',

          },

        },

      },

      include: { school: true },

    });

  } else if (admin.school) {
    await prisma.school.update({
      where: { id: admin.school.id },
      data: { slug: 'ecole-les-etoiles', currentSchoolYear: '2025-2026' },
    });
  }



  const school = admin.school || (await prisma.school.findFirst({ where: { adminId: admin.id } }));

  if (school && !school.organizationId) {

    await prisma.school.update({

      where: { id: school.id },

      data: { organizationId: org.id, campusLabel: 'Campus Cocody', slug: school.slug || 'ecole-les-etoiles' },

    });

  }



  await prisma.user.upsert({

    where: { email: 'groupe@demo.ci' },

    update: {},

    create: {

      email: 'groupe@demo.ci',

      password: hash,

      firstName: 'Admin',

      lastName: 'Groupe',

      phone: '0700000004',

      role: 'ORGANIZATION_ADMIN',

      organizationAdmin: { create: { organizationId: org.id } },

    },

  });



  const cls = await prisma.class.findFirst({ where: { schoolId: school.id, name: 'CM2 A' } })

    || await prisma.class.create({ data: { name: 'CM2 A', level: 'CM2', schoolId: school.id } });



  let student = await prisma.student.findFirst({ where: { matricule: 'ETOILE-001', schoolId: school.id } });

  if (!student) {

    student = await prisma.student.create({

      data: {

        firstName: 'Kofi',

        lastName: 'Koné',

        matricule: 'ETOILE-001',

        classId: cls.id,

        schoolId: school.id,

      },

    });

  } else if (!student.schoolId) {

    await prisma.student.update({ where: { id: student.id }, data: { schoolId: school.id } });

  }



  const feeExists = await prisma.feeType.findFirst({ where: { schoolId: school.id } });

  if (!feeExists) {

    await prisma.feeType.create({

      data: { name: 'Scolarité T1', amount: 25000, dueDay: 15, schoolId: school.id },

    });

  }



  const parentUser = await prisma.user.upsert({

    where: { email: 'parent@demo.ci' },

    update: {},

    create: {

      email: 'parent@demo.ci',

      password: hash,

      firstName: 'Awa',

      lastName: 'Koné',

      phone: '0700000003',

      role: 'PARENT',

      parentProfile: { create: {} },

    },

    include: { parentProfile: true },

  });



  await prisma.parentStudent.upsert({

    where: { parentId_studentId: { parentId: parentUser.parentProfile.id, studentId: student.id } },

    update: {},

    create: { parentId: parentUser.parentProfile.id, studentId: student.id },

  }).catch(async () => {

    const link = await prisma.parentStudent.findFirst({

      where: { parentId: parentUser.parentProfile.id, studentId: student.id },

    });

    if (!link) {

      await prisma.parentStudent.create({

        data: { parentId: parentUser.parentProfile.id, studentId: student.id },

      });

    }

  });



  const teacherUser = await prisma.user.upsert({

    where: { email: 'prof@demo.ci' },

    update: {},

    create: {

      email: 'prof@demo.ci',

      password: hash,

      firstName: 'Mme',

      lastName: 'Diabaté',

      phone: '0700000002',

      role: 'TEACHER',

      teacher: { create: { schoolId: school.id, subject: 'Mathématiques' } },

    },

    include: { teacher: true },

  });



  if (teacherUser.teacher) {

    await prisma.teacherClass.upsert({

      where: { teacherId_classId: { teacherId: teacherUser.teacher.id, classId: cls.id } },

      update: {},

      create: { teacherId: teacherUser.teacher.id, classId: cls.id },

    });

  }



  const { initSchoolModules, setModule, initFinanceDefaults } = require('../src/utils/modules');

  await initSchoolModules(school.id);

  await setModule(school.id, 'accounting', { enabled: true, locked: false });

  await setModule(school.id, 'multi_campus', { enabled: true, locked: false });

  await initFinanceDefaults(school.id);



  const schoolRecord = await prisma.school.findUnique({ where: { id: school.id } });



  console.log('✅ Démo EduPay CI créée');

  console.log('Admin site : admin@edupay.ci / demo1234');

  console.log('Groupe     : groupe@demo.ci / demo1234');

  console.log('École      : ecole@demo.ci / demo1234');

  console.log('Parent     : parent@demo.ci / demo1234');

  console.log('Prof       : prof@demo.ci / demo1234');

  console.log('Code école :', schoolRecord?.slug || 'ecole-les-etoiles');

  console.log('Matricule  : ETOILE-001');

}



main()

  .catch(console.error)

  .finally(() => pool.end());

