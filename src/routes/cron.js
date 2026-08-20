const express = require('express');
const { requireCronSecret } = require('../middleware/cronAuth');
const { paymentReminders, weeklyParentSummary, dailyBackup, homeworkReminders, notificationJobs, hrLeaveMaintenance } = require('../jobs/cron');

const router = express.Router();

router.use(requireCronSecret);

async function runJob(job, fn, res) {
  try {
    const result = await fn();
    res.json({ ok: true, job, result: result || null });
  } catch (err) {
    console.error(`[Cron] ${job} failed:`, err?.message || err);
    res.status(500).json({ ok: false, job, error: 'failed' });
  }
}

router.get('/payments', (req, res) => runJob('payments', paymentReminders, res));
router.get('/summary', (req, res) => runJob('summary', weeklyParentSummary, res));
router.get('/backup', (req, res) => runJob('backup', dailyBackup, res));
router.get('/homework-reminders', (req, res) => runJob('homework-reminders', homeworkReminders, res));
router.get('/notifications', (req, res) => runJob('notifications', notificationJobs, res));
router.get('/hr-leaves', (req, res) => runJob('hr-leaves', hrLeaveMaintenance, res));

router.get('/daily', async (req, res) => {
  try {
    const monday = new Date().getUTCDay() === 1;
    const payments = await paymentReminders();
    const homeworks = await homeworkReminders();
    const summary = monday ? await weeklyParentSummary() : { skipped: true, reason: 'not_monday' };
    const backup = await dailyBackup();
    const notifications = await notificationJobs();
    const hrLeaves = await hrLeaveMaintenance();
    res.json({
      ok: true,
      job: 'daily',
      result: { payments: payments || null, homeworks, summary, backup, notifications, hrLeaves },
    });
  } catch (err) {
    console.error('[Cron] daily failed:', err?.message || err);
    res.status(500).json({ ok: false, job: 'daily', error: 'failed' });
  }
});

module.exports = router;
