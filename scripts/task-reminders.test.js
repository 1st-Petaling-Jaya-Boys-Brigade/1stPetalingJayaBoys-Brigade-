const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const { test } = require('node:test');
const tasks = require('../js/modules/tasks.js');
const reminders = require('./send-task-overdue.js');

const due = { id: 'T-1', due_date: '2026-11-25', status: 'todo' };
const sameDay = Date.parse('2026-11-25T15:59:59.999Z');
const midnight = Date.parse('2026-11-25T16:00:00Z');

test('completion badges and reminders use the next midnight in Malaysia', () => {
  assert.equal(tasks.getTaskDaysUntilDue(due.due_date, sameDay), 0);
  assert.equal(tasks.getTaskDaysUntilDue(due.due_date + 'T08:00:00Z', midnight), -1);
  assert.equal(tasks.getTaskDaysUntilDue('2026-02-30', midnight), null);
  assert.equal(tasks.getOverdueTaskReminder(due, sameDay), null);
  assert.equal(tasks.getOverdueTaskReminder(due, midnight), 'notif-task-overdue-T-1-2026-11-26');
  assert.equal(tasks.getOverdueTaskReminder(due, midnight + 86400000), 'notif-task-overdue-T-1-2026-11-27');
  assert.equal(tasks.getOverdueTaskReminder({ ...due, id: 'temp_1' }, midnight), null);

  const completed = { ...due, status: 'done' };
  assert.deepEqual(tasks.getTaskDueDisplay(completed), { label: 'Completed: 25 Nov', badgeClass: 'due-normal' });
  const onTime = tasks.getTaskDueDisplay({ ...completed, completed_at: new Date(sameDay).toISOString() });
  assert.deepEqual(onTime, { label: 'Completed: 25 Nov', badgeClass: 'due-completed', timing: 'On time' });
  const early = tasks.getTaskDueDisplay({ ...completed, completed_at: '2026-11-24T16:00:00Z' });
  assert.equal(early.timing, '1 day early');
  const late = tasks.getTaskDueDisplay({ ...completed, completed_at: new Date(midnight).toISOString() });
  assert.equal(late.badgeClass, 'due-overdue');
  assert.equal(late.timing, 'Under 1 min late');
  const reloaded = JSON.parse(JSON.stringify({ ...completed, completed_at: new Date(midnight + 86400000).toISOString() }));
  assert.deepEqual(tasks.getTaskDueDisplay(reloaded), {
    label: 'Completed: 25 Nov',
    badgeClass: 'due-overdue',
    timing: '1 day late'
  });
  assert.equal(tasks.getOverdueTaskReminder(completed, midnight), null);
});

test('reminder recipients are unique and respect custom completion and blocked accounts', () => {
  const members = [
    { ic: 'member-1', email: 'member1@example.test', name: 'A Member' },
    { ic: 'member-2', email: 'blocked@example.test', name: 'B Member' },
    { ic: 'member-3', email: 'shared@example.test', name: 'C Member' },
    { ic: 'member-4', email: 'shared@example.test', name: 'D Member' }
  ];
  const prior = tasks._projectStatusesMap;
  tasks._projectStatusesMap = { media: [{ id: 'todo' }, { id: 'approved', label: 'Approved' }] };
  try {
    assert.equal(tasks.getOverdueTaskReminder({ ...due, project_name: 'Media', status: 'approved' }, midnight), null);
    const rows = [
      { ...due, assignee_ic: 'member-1, member-2, member-3' },
      { ...due, id: 'T-2', assignee_name: 'A Member' },
      { ...due, id: 'T-3', assignee_ic: 'unknown', assignee_name: 'A Member' },
      { ...due, id: 'T-4' }
    ];
    assert.deepEqual(reminders.buildReminderTopics(rows, members, ['blocked@example.test'], midnight), ['user_member1_example_test']);
    assert.deepEqual(reminders.buildReminderTopics(rows, members, [], sameDay), []);
  } finally {
    tasks._projectStatusesMap = prior;
  }
});

test('scheduled sender claims once per day and keeps task text out of phone payloads', async ({ mock }) => {
  let now = midnight;
  const claims = new Set();
  const sends = [];
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });
  mock.method(Date, 'now', () => now);
  mock.method(global, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'fixture' });
    if (url.hostname === 'fcm.googleapis.com') {
      sends.push(JSON.parse(options.body));
      return Response.json({ name: 'sent' });
    }
    switch (url.pathname) {
      case '/rest/v1/bb_tasks':
        return Response.json([{ ...due, assignee_ic: 'member-1', title: 'Private task title' }]);
      case '/rest/v1/bb_members':
        return Response.json([{ ic: 'member-1', email: 'member1@example.test' }]);
      case '/rest/v1/bb_config':
        return Response.json([]);
      case '/rest/v1/bb_task_reminder_deliveries': {
        if (options.method === 'DELETE') return new Response(null, { status: 204 });
        const claim = JSON.parse(options.body);
        const key = claim.reminder_day + claim.recipient_key;
        if (claims.has(key)) return Response.json([]);
        claims.add(key);
        return Response.json([claim]);
      }
      default:
        throw new Error('Unexpected test request');
    }
  });
  const env = {
    TASK_REMINDER_SUPABASE_URL: 'https://db.example.test',
    TASK_REMINDER_SUPABASE_SERVICE_ROLE_KEY: 'test',
    TASK_REMINDER_FCM_SERVICE_ACCOUNT: JSON.stringify({
      client_email: 'sender@example.test', private_key: privateKey, project_id: 'portal-test'
    })
  };
  await reminders.runOverdueReminders(env);
  await reminders.runOverdueReminders(env);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].message.android.notification.channel_id, 'portal-alerts-v2');
  assert.equal(sends[0].message.android.notification.sound, 'portal_chime');
  assert.doesNotMatch(JSON.stringify(sends[0]), /Private task title|T-1/);
  now += 86400000;
  await reminders.runOverdueReminders(env);
  assert.equal(sends.length, 2);
  assert.notEqual(sends[0].message.android.notification.tag, sends[1].message.android.notification.tag);
});
