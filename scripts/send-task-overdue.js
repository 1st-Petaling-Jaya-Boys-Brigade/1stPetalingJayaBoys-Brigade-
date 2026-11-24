/**
 * Sends one daily Android reminder per assigned account through the existing FCM channel.
 * Run from a trusted scheduler with server-side credentials.
 */
const { createHash } = require('node:crypto');
const { getGoogleOAuthToken, getUserTopic } = require('../js/api/fcm.js');
const tasksModule = require('../js/modules/tasks.js');

const normalize = value => String(value || '').trim().toLowerCase();

function buildReminderTopics(tasks, members, blockedEmails, now) {
  const topics = new Set();
  const blocked = new Set(blockedEmails.map(normalize));
  const uniqueMatch = (key, field) => {
    if (!key) return null;
    const matches = members.filter(member => normalize(member[field]) === key);
    return matches.length === 1 ? matches[0] : null;
  };
  for (const task of tasks) {
    if (!tasksModule.getOverdueTaskReminder(task, now)) continue;
    const keys = tasksModule.getTaskAssigneeKeys(task);
    const recipients = keys.length
      ? keys.map(key => uniqueMatch(key, 'ic') || uniqueMatch(key, 'email'))
      : [uniqueMatch(normalize(task.assignee_name || task.assignee), 'name')];
    for (const member of recipients) {
      const email = normalize(member?.email);
      if (!email || blocked.has(email)) continue;
      const topic = getUserTopic(email);
      if (members.filter(row => normalize(row.email) && getUserTopic(normalize(row.email)) === topic).length === 1) {
        topics.add(topic);
      }
    }
  }
  return [...topics].sort();
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

async function sendIOSReminders(db, key, topics) {
  // The Edge Function deduplicates each iPhone subscription in the daily delivery ledger.
  const response = await fetch(new URL('/functions/v1/portal-web-push', db), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      ...(key.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key })
    },
    body: JSON.stringify({ action: 'remind', topics }),
    redirect: 'error',
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) throw new Error('iPhone overdue reminder delivery failed with HTTP ' + response.status + '.');
  const { sent } = await response.json();
  console.log('iPhone and iPad overdue reminders sent: ' + sent + '.');
}

async function sendAndroidReminders(credentials, request, topics, now, day) {
  const token = await getGoogleOAuthToken(credentials);
  if (!token) throw new Error('Could not authenticate the FCM reminder sender.');
  const endpoint = 'https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(credentials.project_id) + '/messages:send';
  const ledger = 'bb_task_reminder_deliveries';
  await request(ledger + '?reminder_day=lt.' + tasksModule.getTaskMalaysiaDay(now - 7 * 86400000), { method: 'DELETE' });
  let sent = 0;
  let failed = 0;
  for (const topic of topics) {
    const key = createHash('sha256').update(topic).digest('hex');
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
        body: JSON.stringify(buildAndroidReminder(topic, day)),
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
  if (!TASK_REMINDER_SUPABASE_URL || !TASK_REMINDER_SUPABASE_SERVICE_ROLE_KEY || !TASK_REMINDER_FCM_SERVICE_ACCOUNT) {
    throw new Error('Configure the three TASK_REMINDER secrets for scheduled Android delivery.');
  }
  const db = new URL(TASK_REMINDER_SUPABASE_URL);
  if (db.protocol !== 'https:' || db.username || db.password) throw new Error('The Supabase URL must use HTTPS.');
  let credentials;
  try {
    credentials = JSON.parse(TASK_REMINDER_FCM_SERVICE_ACCOUNT);
  } catch {
    throw new Error('The FCM service-account secret must contain JSON.');
  }
  if (!credentials?.project_id) throw new Error('The FCM service-account secret is missing project_id.');
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
    fetchRows('bb_members?select=ic,email,name&order=ic.asc'),
    request('bb_config?select=key,value&key=in.(bb_project_statuses,bb_blocked_emails)')
  ]);
  const readConfig = (key, fallback) => {
    const value = config.find(row => row.key === key)?.value;
    return typeof value === 'string' ? JSON.parse(value) : value ?? fallback;
  };
  tasksModule._projectStatusesMap = readConfig('bb_project_statuses', {});
  const now = Date.now();
  const day = tasksModule.getTaskMalaysiaDay(now);
  const topics = buildReminderTopics(tasks, members, readConfig('bb_blocked_emails', []), now);
  if (!topics.length) {
    console.log('No overdue task reminders to send.');
    if (env.PORTAL_WEB_PUSH_REMINDERS === 'true') await sendIOSReminders(db, TASK_REMINDER_SUPABASE_SERVICE_ROLE_KEY, topics);
    return;
  }

  const deliveries = [sendAndroidReminders(credentials, request, topics, now, day)];
  if (env.PORTAL_WEB_PUSH_REMINDERS === 'true') deliveries.push(sendIOSReminders(db, TASK_REMINDER_SUPABASE_SERVICE_ROLE_KEY, topics));
  const failures = (await Promise.allSettled(deliveries)).filter(result => result.status === 'rejected');
  if (failures.length) throw new Error(failures.map(result => result.reason.message).join(' '));
}

if (require.main === module) {
  runOverdueReminders(process.env).catch(error => {
    console.error(error instanceof SyntaxError ? 'The task reminder configuration contains invalid JSON.' : error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildReminderTopics, buildAndroidReminder, runOverdueReminders };
