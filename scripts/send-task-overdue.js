/**
 * Sends daily overdue reminders through Android FCM and optional Apple Web Push.
 * Run from a trusted scheduler with server-side credentials.
 */
const { createHash } = require('node:crypto');
const { getGoogleOAuthToken, getUserTopic } = require('../js/api/fcm.js');
const tasksModule = require('../js/modules/tasks.js');

const normalize = value => String(value || '').trim().toLowerCase();
const memberAccountIdentity = member => normalize(member?.email || String(member?.ic || '').split('__')[0]);
const isActiveMember = member =>
  Boolean(member) &&
  !['deleted', 'archived_deleted'].includes(normalize(member.department)) &&
  !normalize(member.ic).startsWith('archived_');

function collectReminderTopics(tasks, members, blockedEmails, now, matcher) {
  const topics = new Set();
  const blocked = new Set(blockedEmails.map(normalize));
  const activeMembers = (Array.isArray(members) ? members : []).filter(isActiveMember);
  const uniqueMatch = (key, field) => {
    if (!key) return null;
    const matches = activeMembers.filter(member => normalize(member[field]) === key);
    return matches.length === 1 ? matches[0] : null;
  };
  const topicCounts = new Map();
  for (const row of activeMembers) {
    const id = memberAccountIdentity(row);
    if (!id) continue;
    const t = getUserTopic(id);
    if (t) topicCounts.set(t, (topicCounts.get(t) || 0) + 1);
  }
  for (const task of tasks) {
    if (!matcher(task, now)) continue;
    const keys = tasksModule.getTaskAssigneeKeys(task);
    const recipients = keys.length
      ? keys.map(key => uniqueMatch(key, 'ic') || uniqueMatch(key, 'email'))
      : [uniqueMatch(normalize(task.assignee_name || task.assignee), 'name')];
    for (const member of recipients) {
      const identity = memberAccountIdentity(member);
      if (!identity || blocked.has(identity)) continue;
      const topic = getUserTopic(identity);
      if (topic && topicCounts.get(topic) === 1) {
        topics.add(topic);
      }
    }
  }
  return [...topics].sort();
}

function buildReminderTopics(tasks, members, blockedEmails, now) {
  return collectReminderTopics(tasks, members, blockedEmails, now, tasksModule.getOverdueTaskReminder);
}

function buildDueSoonReminderTopics(tasks, members, blockedEmails, now) {
  return collectReminderTopics(tasks, members, blockedEmails, now, tasksModule.getDueSoonTaskReminder);
}

function buildAndroidReminder(topic, day) {
  const title = 'Overdue tasks';
  const body = 'Open the portal to review your overdue tasks.';
  return {
    message: {
      topic,
      notification: { title, body },
      data: { title, body, category: 'task_overdue', tab: 'tasks', targetId: '' },
      android: {
        priority: 'HIGH',
        ttl: '43200s',
        notification: {
          channel_id: 'portal-alerts-v2',
          sound: 'portal_chime',
          tag: 'portal_task_overdue_' + day
        }
      }
    }
  };
}

function buildAndroidDueSoonReminder(topic, day) {
  const title = 'Task due soon';
  const body = 'You have tasks due within 2 days. Open Projects & Tasks to review.';
  return {
    message: {
      topic,
      notification: { title, body },
      data: { title, body, category: 'task_due_soon', tab: 'tasks', targetId: '' },
      android: {
        priority: 'HIGH',
        ttl: '43200s',
        notification: {
          channel_id: 'portal-alerts-v2',
          sound: 'portal_chime',
          tag: 'portal_task_due_soon_' + day
        }
      }
    }
  };
}

async function sendIOSReminders(db, key, topics, dueSoonTopics = []) {
  // The Edge Function deduplicates each iPhone subscription in the daily delivery ledger.
  const payload = dueSoonTopics.length
    ? { action: 'remind', topics, dueSoonTopics }
    : { action: 'remind', topics };
  const response = await fetch(new URL('/functions/v1/portal-web-push', db), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      ...(key.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key })
    },
    body: JSON.stringify(payload),
    redirect: 'error',
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) throw new Error('iPhone overdue reminder delivery failed with HTTP ' + response.status + '.');
  const { sent } = await response.json();
  console.log('iPhone and iPad overdue reminders sent: ' + sent + '.');
}

async function sendAndroidReminders(serviceAccount, request, topics, now, day, dueSoonTopics = []) {
  if (!serviceAccount?.trim()) throw new Error('Missing GitHub Actions secret: TASK_REMINDER_FCM_SERVICE_ACCOUNT.');
  let credentials;
  try {
    credentials = JSON.parse(serviceAccount);
  } catch {
    throw new Error('TASK_REMINDER_FCM_SERVICE_ACCOUNT must contain JSON.');
  }
  if (!credentials?.project_id || !credentials.client_email || !credentials.private_key) {
    throw new Error('TASK_REMINDER_FCM_SERVICE_ACCOUNT must contain project_id, client_email and private_key.');
  }
  if (!topics.length && !dueSoonTopics.length) return;
  const token = await getGoogleOAuthToken(credentials);
  if (!token) throw new Error('Could not authenticate the FCM reminder sender.');
  const endpoint = 'https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(credentials.project_id) + '/messages:send';
  const ledger = 'bb_task_reminder_deliveries';
  await request(ledger + '?reminder_day=lt.' + tasksModule.getTaskMalaysiaDay(now - 7 * 86400000), { method: 'DELETE' });
  let sent = 0;
  let failed = 0;
  const queue = [
    ...topics.map(topic => ({ topic, hashInput: topic, build: buildAndroidReminder })),
    ...dueSoonTopics.map(topic => ({ topic, hashInput: 'due_soon/' + topic, build: buildAndroidDueSoonReminder }))
  ];
  for (const entry of queue) {
    const key = createHash('sha256').update(entry.hashInput).digest('hex');
    const claim = await request(ledger + '?on_conflict=reminder_day,recipient_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ reminder_day: day, recipient_key: key })
    });
    if (!claim.length) continue;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(entry.build(entry.topic, day)),
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) {
        await request(ledger + '?reminder_day=eq.' + day + '&recipient_key=eq.' + key, { method: 'DELETE' });
        failed++;
      } else {
        sent++;
      }
    } catch {
      // A timed-out send may have been accepted. Preserve the claim to avoid a second alert.
      failed++;
    }
  }
  console.log('Android overdue reminders sent: ' + sent + '.');
  if (failed) throw new Error(failed + ' Android overdue reminders could not be confirmed.');
}

async function runOverdueReminders(env) {
  const { TASK_REMINDER_SUPABASE_URL, TASK_REMINDER_SUPABASE_SERVICE_ROLE_KEY, TASK_REMINDER_FCM_SERVICE_ACCOUNT } = env;
  const sendWebPush = env.PORTAL_WEB_PUSH_REMINDERS === 'true';
  const missing = ['TASK_REMINDER_SUPABASE_URL', 'TASK_REMINDER_SUPABASE_SERVICE_ROLE_KEY']
    .filter(name => !env[name]?.trim());
  if ((missing.length || !sendWebPush) && !TASK_REMINDER_FCM_SERVICE_ACCOUNT?.trim()) {
    missing.push('TASK_REMINDER_FCM_SERVICE_ACCOUNT');
  }
  if (missing.length) {
    throw new Error(`Missing GitHub Actions secret${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`);
  }
  const db = new URL(TASK_REMINDER_SUPABASE_URL);
  if (db.protocol !== 'https:' || db.username || db.password) throw new Error('The Supabase URL must use HTTPS.');
  const dbHeaders = { apikey: TASK_REMINDER_SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };
  if (TASK_REMINDER_SUPABASE_SERVICE_ROLE_KEY.startsWith('eyJ')) {
    dbHeaders.Authorization = 'Bearer ' + TASK_REMINDER_SUPABASE_SERVICE_ROLE_KEY;
  }
  async function request(path, options = {}) {
    const response = await fetch(new URL('/rest/v1/' + path, db), {
      ...options,
      headers: { ...dbHeaders, ...options.headers },
      redirect: 'error',
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error('Supabase reminder request failed with HTTP ' + response.status + '.');
    return response.status === 204 ? null : response.json();
  }
  async function fetchRows(path) {
    const rows = [];
    for (let offset = 0; ; offset += 200) {
      const page = await request(path + '&limit=200&offset=' + offset);
      rows.push(...page);
      if (page.length < 200) return rows;
    }
  }
  const [tasks, members, config] = await Promise.all([
    fetchRows('bb_tasks?select=*&due_date=not.is.null&order=id.asc'),
    fetchRows('bb_members?select=ic,email,name,department&order=ic.asc'),
    request('bb_config?select=key,value&key=in.(bb_project_statuses,bb_blocked_emails)')
  ]);
  const readConfig = (key, fallback) => {
    const value = config.find(row => row.key === key)?.value;
    return typeof value === 'string' ? JSON.parse(value) : value ?? fallback;
  };
  tasksModule._projectStatusesMap = readConfig('bb_project_statuses', {});
  const now = Date.now();
  const day = tasksModule.getTaskMalaysiaDay(now);
  const blocked = readConfig('bb_blocked_emails', []);
  const topics = buildReminderTopics(tasks, members, blocked, now);
  const dueSoonTopics = buildDueSoonReminderTopics(tasks, members, blocked, now);
  if (!topics.length && !dueSoonTopics.length) console.log('No overdue or due-soon task reminders to send.');

  const deliveries = [sendAndroidReminders(TASK_REMINDER_FCM_SERVICE_ACCOUNT, request, topics, now, day, dueSoonTopics)];
  if (sendWebPush) deliveries.push(sendIOSReminders(db, TASK_REMINDER_SUPABASE_SERVICE_ROLE_KEY, topics, dueSoonTopics));
  const failures = (await Promise.allSettled(deliveries)).filter(result => result.status === 'rejected');
  if (failures.length) throw new Error(failures.map(result => result.reason.message).join(' '));
}

if (require.main === module) {
  runOverdueReminders(process.env).catch(error => {
    console.error(error instanceof SyntaxError ? 'The task reminder configuration contains invalid JSON.' : error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildReminderTopics,
  buildDueSoonReminderTopics,
  buildAndroidReminder,
  buildAndroidDueSoonReminder,
  runOverdueReminders
};
