-- EduPay CI initial migration (generated baseline)
-- Run: npx prisma migrate deploy

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ORGANIZATION_ADMIN', 'SCHOOL_ADMIN', 'PARENT', 'TEACHER');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'VALIDATED', 'REJECTED');
CREATE TYPE "AbsenceType" AS ENUM ('ABSENCE', 'LATE');
CREATE TYPE "NotificationType" AS ENUM ('ABSENCE', 'LATE', 'PAYMENT', 'HOMEWORK', 'HEALTH', 'BEHAVIOR', 'TRANSPORT', 'GENERAL');
CREATE TYPE "BehaviorType" AS ENUM ('POSITIVE', 'NEGATIVE');
CREATE TYPE "TransportEvent" AS ENUM ('BOARDED_BUS', 'ARRIVED_SCHOOL', 'LEFT_SCHOOL', 'PICKED_UP');
CREATE TYPE "FinanceAccountType" AS ENUM ('WAVE', 'ORANGE_MONEY', 'CASH', 'BANK');
CREATE TYPE "FinanceTransactionType" AS ENUM ('INCOME', 'EXPENSE');

-- Note: For existing databases, use `npm run db:push` instead.
-- This file documents the schema baseline for fresh installs via migrate deploy.
