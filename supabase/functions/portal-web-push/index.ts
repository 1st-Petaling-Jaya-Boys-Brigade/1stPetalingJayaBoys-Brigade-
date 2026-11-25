import webPush from 'npm:web-push@3.6.7';

const PROJECT = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SERVICE_API_KEYS = new Set(Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')));
const PUBLIC_KEY = Deno.env.get('PORTAL_VAPID_PUBLIC_KEY') || '';
const PRIVATE_KEY = Deno.env.get('PORTAL_VAPID_PRIVATE_KEY') || '';
const SITE = 'https://1st-petaling-jaya-boys-brigade.github.io';
const ORIGIN = Deno.env.get('PORTAL_PUSH_ORIGIN') || SITE;
const CLIENT_ORIGINS = new Set([ORIGIN, 'https://localhost']);
const encoder = new TextEncoder();
const dayMs = 86_400_000;
const MEMBER_FIELDS = 'ic,email,name,rank,department';
const MESSAGES: Record<string, [string, string, string]> = {
  announcement: ['Company announcement', 'A new announcement is available in the portal.', 'home'],
  task_assigned: ['Task assigned', 'Open the portal to view your task.', 'tasks'],
  task_comment: ['Task activity', 'There is a new update on a task you follow.', 'tasks'],
  mention: ['New mention', 'You were mentioned in the portal.', 'tasks'],
  resource: ['New resource', 'A resource is available in the portal.', 'resources'],
  order_status: ['Order update', 'Open the portal to view your order status.', 'member'],
  forum_reply: ['Forum activity', 'There is a new reply or mention in the portal.', 'forum'],
  task_overdue: ['Overdue task reminder', 'Open Projects & Tasks to review your overdue tasks.', 'tasks'],
  test: ['1st PJ BB test notification', 'Background notifications are working on this device.', 'home'],
};

type Member = { ic: string; email: string; name: string; rank: string; department: string; password?: string };
type Device = { endpoint: string; member_ic: string; device_hash: string; p256dh: string; auth_key: string };
type SignIn = { email: string; expires_at: string };

class ProviderRejected extends Error {}

const normalize = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const accountEmail = (member: Member) => normalize(member.email || member.ic.split('__')[0]);
const hex = (bytes: Uint8Array) => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
const hash = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
const tokenPattern = /^[\da-f]{64}$/;
const filter = (column: string, value: string) => column + '=eq.' + encodeURIComponent(value);

async function db<T>(path: string, method = 'GET', body?: unknown, prefer?: string): Promise<T> {
  const response = await fetch(PROJECT + '/rest/v1/' + path, {
    method,
    headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(6000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Database request failed');
  const result = await response.text();
  return result ? JSON.parse(result) : undefined as T;
}

function budget(key: string, limit: number, seconds: number) {
  return db<boolean>('rpc/rpc_claim_portal_push_limit', 'POST', { p_key: key, p_limit: limit, p_seconds: seconds });
}

async function isReminderSender(request: Request) {
  if (request.headers.has('origin')) return false;
  const key = request.headers.get('apikey');
  if (key && (key === SERVICE || SERVICE_API_KEYS.has(key))) return true;

  const authorization = request.headers.get('authorization') || '';
  if (SERVICE && authorization === 'Bearer ' + SERVICE) return true;
  // Legacy service-role JWTs can differ from the function's injected key.
  // Have PostgREST validate the JWT and require permission on a server-only table.
  const legacyKey = key || authorization.replace(/^Bearer /, '');
  if (!/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(legacyKey)) return false;
  const response = await fetch(PROJECT + '/rest/v1/bb_portal_push_devices?select=endpoint&limit=0', {
    headers: { apikey: legacyKey, Authorization: 'Bearer ' + legacyKey },
    signal: AbortSignal.timeout(5000),
    redirect: 'error',
  });
  await response.body?.cancel();
  return response.ok;
}

function active(member: Member) {
  return !['deleted', 'archived_deleted'].includes(normalize(member.department)) && !normalize(member.ic).startsWith('archived_');
}

async function blockedEmails() {
  const [row] = await db<{ value: string | unknown[] }[]>('bb_config?select=value&key=eq.bb_blocked_emails');
  const values = typeof row?.value === 'string' ? JSON.parse(row.value) : row?.value || [];
  if (!Array.isArray(values)) throw new Error('Invalid access configuration');
  return new Set(values.map(value => normalize(typeof value === 'object' && value ? value.email : value)));
}

async function matchesPassword(password: string, stored: string) {
  const fields = stored.match(/^pbkdf2:sha256:100000:([a-f\d]{32}):([a-f\d]{64})$/i);
  if (!fields) return false;
  const salt = Uint8Array.from(fields[1].match(/../g)!, n => parseInt(n, 16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256)));
  const expected = fields[2].toLowerCase();
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ derived.charCodeAt(i);
  return difference === 0;
}

async function issueSession(input: Record<string, unknown>, request: Request) {
  const email = normalize(input.email);
  const password = typeof input.password === 'string' ? input.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password || password.length > 1024) return null;
  const ip = request.headers.get('x-real-ip') || request.headers.get('cf-connecting-ip') || 'unknown';
  if (!await budget('sign-in-ip:' + await hash(ip), 120, 900) || !await budget('sign-in-email:' + await hash(email), 8, 900)) return null;
  const [primary, accounts, blocked] = await Promise.all([
    db<Member[]>('bb_members?select=' + MEMBER_FIELDS + ',password&' + filter('ic', email)),
    db<Member[]>('bb_members?select=' + MEMBER_FIELDS + ',password&email=ilike.' + encodeURIComponent(email.replace(/[\\%_*]/g, '\\$&')) + '&order=ic.asc&limit=20'),
    blockedEmails(),
  ]);
  const account = [...primary, ...accounts].find(member => accountEmail(member) === email && active(member) && member.password);
  if (!account || blocked.has(email) || !await matchesPassword(password, account.password!)) return null;
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + (input.remember === false ? dayMs / 2 : 30 * dayMs)).toISOString();
  await db('bb_portal_push_sessions', 'POST', { token_hash: await hash(token), email, expires_at: expiresAt });
  return { token, expiresAt };
}

function appleEndpoint(value: unknown) {
  if (typeof value !== 'string' || value.length > 1024) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.push.apple.com') && !url.port && !url.username && !url.password && !url.hash && url.pathname !== '/' ? url.href : '';
  } catch { return ''; }
}

function topicPart(value: string) {
  return normalize(value).replace(/[^a-z0-9\-_~]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100);
}

const nco = (member: Member) => ['lance corporal', 'corporal', 'sergeant', 'staff sergeant', 'warrant officer'].includes(normalize(member.rank));
const officer = (member: Member) => ['captain', 'honarary captain', 'honorary captain', 'lieutenant', 'chaplain', 'warrant officer', 'instructor'].includes(normalize(member.rank));
const departmentTopic = (member: Member) => normalize(member.department) && normalize(member.department) !== 'none' ? 'dept_' + topicPart(member.department) : '';

function targetTopics(member: Member) {
  return new Set([
    'announcements', departmentTopic(member),
    ...(nco(member) || officer(member) ? ['dept_nco'] : []),
    ...(officer(member) || normalize(member.rank) === 'staff sergeant' ? ['dept_officers'] : []),
    ...[member.ic, member.email, member.name, member.name?.replace(/\s+/g, '')].filter(Boolean).map(id => 'user_' + topicPart(id)),
  ]);
}

async function recipients(topics: string[]) {
  if (!topics.length) return [];
  const [devices, blocked] = await Promise.all([
    db<Device[]>('bb_portal_push_devices?select=*&order=endpoint.asc&limit=1000'), blockedEmails(),
  ]);
  if (!devices.length) return [];
  const ids = Array.from(new Set(devices.map(device => device.member_ic)));
  const members: Member[] = [];
  for (let offset = 0; offset < ids.length; offset += 50) {
    const chunk = ids.slice(offset, offset + 50).map(id => '"' + id.replace(/["\\]/g, '\\$&') + '"').join(',');
    members.push(...await db<Member[]>('bb_members?select=' + MEMBER_FIELDS + '&ic=in.(' + encodeURIComponent(chunk) + ')'));
  }
  const matches = members.filter(member => active(member) && !blocked.has(accountEmail(member)))
    .map(member => ({ member, topics: targetTopics(member) }));
  const eligible = new Set<string>();
  for (const topic of topics) {
    const owners = matches.filter(match => match.topics.has(topic));
    if (topic.startsWith('user_') && owners.length !== 1) continue;
    for (const { member } of owners) eligible.add(member.ic);
  }
  return devices.filter(device => eligible.has(device.member_ic));
}

async function deliver(device: Device, type: string, target: string, targetId = '') {
  const endpoint = appleEndpoint(device.endpoint);
  if (!endpoint) return false;
  const [title, body, tab] = MESSAGES[type];
  const params = new URLSearchParams({ notif_tab: tab, notif_cat: type });
  if (targetId) params.set('notif_target', targetId);
  const url = './index.html?' + params.toString() + '#' + tab;
  const details = webPush.generateRequestDetails({ endpoint, keys: { p256dh: device.p256dh, auth: device.auth_key } }, JSON.stringify({
    title, body, tab, category: type, targetId, tag: 'portal-web-' + type + '-' + target, url,
  }), { TTL: type === 'task_overdue' ? 43_200 : 3_600, urgency: 'high', vapidDetails: { subject: SITE, publicKey: PUBLIC_KEY, privateKey: PRIVATE_KEY } });
  const response = await fetch(endpoint, {
    method: 'POST', headers: details.headers as HeadersInit, body: new Uint8Array(details.body!),
    redirect: 'error', signal: AbortSignal.timeout(8000),
  });
  await response.body?.cancel();
  if ([404, 410].includes(response.status)) {
    await db('bb_portal_push_devices?' + filter('endpoint', endpoint) + '&' + filter('device_hash', device.device_hash), 'DELETE');
    return false;
  }
  if (!response.ok) throw new ProviderRejected('Push provider rejected delivery');
  return true;
}

async function fanout(devices: Device[], type: string, target: string, targetId = '') {
  let sent = 0;
  let failed = 0;
  for (let index = 0; index < devices.length; index += 10) {
    const results = await Promise.allSettled(devices.slice(index, index + 10).map(async device => {
      if (type !== 'task_overdue') return deliver(device, type, target, targetId);
      const key = await hash('web/' + device.endpoint);
      const claim = await db<unknown[]>('bb_task_reminder_deliveries?on_conflict=reminder_day,recipient_key', 'POST',
        { reminder_day: target, recipient_key: key }, 'resolution=ignore-duplicates,return=representation');
      if (!claim.length) return false;
      try {
        return await deliver(device, type, target, '');
      } catch (error) {
        // Retry explicit provider rejections on the next run. Keep the claim if the outcome is unknown.
        if (error instanceof ProviderRejected) {
          await db('bb_task_reminder_deliveries?' + filter('reminder_day', target) + '&' + filter('recipient_key', key), 'DELETE');
        }
        throw error;
      }
    }));
    for (const result of results) {
      if (result.status === 'rejected') failed++;
      else if (result.value) sent++;
    }
  }
  return { sent, failed };
}

Deno.serve(async request => {
  const origin = request.headers.get('origin');
  const trustedOrigin = Boolean(origin && CLIENT_ORIGINS.has(origin));
  const cors = { 'Access-Control-Allow-Origin': trustedOrigin ? origin! : ORIGIN, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', Vary: 'Origin', 'Cache-Control': 'no-store' };
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: cors });
  if (origin && !trustedOrigin) return json({ error: 'Invalid request origin' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method === 'GET') return json({ applicationServerKey: PUBLIC_KEY });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!PUBLIC_KEY || !PRIVATE_KEY) return json({ error: 'Web Push is unavailable' }, 503);

  try {
    const raw = await request.text();
    if (raw.length > 12_000) return json({ error: 'Invalid request' }, 413);
    const data = JSON.parse(raw);
    const action = data?.action;
    const rawTopics = Array.isArray(data?.topics) ? data.topics : [];
    const topics = Array.from(new Set<string>(rawTopics.slice(0, 100).filter((topic: unknown) =>
      typeof topic === 'string' && /^(announcements|(?:user|dept)_[\w~-]{1,108})$/.test(topic))));

    if (action === 'remind') {
      if (!await isReminderSender(request)) return json({ error: 'Unauthorized' }, 401);
      const day = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
      const expired = encodeURIComponent(new Date().toISOString());
      await Promise.all([
        db('bb_portal_push_sessions?expires_at=lt.' + expired, 'DELETE'),
        db('bb_portal_push_limits?resets_at=lt.' + expired, 'DELETE'),
      ]);
      const result = await fanout(await recipients(topics.filter(topic => topic.startsWith('user_'))), 'task_overdue', day);
      return json(result, result.failed ? 502 : 200);
    }
    if (!trustedOrigin) return json({ error: 'Invalid request origin' }, 403);
    if (action === 'session') {
      const result = await issueSession(data, request);
      return result ? json(result) : json({ error: 'Notification sign-in could not be verified' }, 401);
    }
    const deviceKey = typeof data.deviceKey === 'string' ? data.deviceKey : '';
    const endpoint = appleEndpoint(data.subscription?.endpoint || data.endpoint);
    if (action === 'unregister' && endpoint && tokenPattern.test(deviceKey)) {
      await db('bb_portal_push_devices?' + filter('endpoint', endpoint) + '&' + filter('device_hash', await hash(deviceKey)), 'DELETE');
      return json({ ok: true });
    }
    if (typeof data.token !== 'string' || !tokenPattern.test(data.token)) return json({ error: 'Sign in to use notifications' }, 401);
    const tokenHash = await hash(data.token);
    if (action === 'signout') {
      await db('bb_portal_push_sessions?' + filter('token_hash', tokenHash), 'DELETE');
      return json({ ok: true });
    }
    const [session] = await db<SignIn[]>('bb_portal_push_sessions?select=email,expires_at&' + filter('token_hash', tokenHash));
    if (!session || Date.parse(session.expires_at) <= Date.now() || (await blockedEmails()).has(session.email)) return json({ error: 'Sign in to use notifications' }, 401);
    const [actor] = await db<Member[]>('bb_members?select=' + MEMBER_FIELDS + '&' + filter('ic', String(data.member || '').slice(0, 254)));
    if (!actor || !active(actor) || accountEmail(actor) !== session.email) return json({ error: 'Member could not be verified' }, 403);

    if (action === 'register') {
      const p256dh = data.subscription?.keys?.p256dh;
      const authKey = data.subscription?.keys?.auth;
      if (!endpoint || !tokenPattern.test(deviceKey) || typeof p256dh !== 'string' || !/^[\w-]{87}$/.test(p256dh)
          || typeof authKey !== 'string' || !/^[\w-]{22}$/.test(authKey)) return json({ error: 'Invalid iPhone subscription' }, 400);
      if (!await budget('register:' + await hash(session.email), 15, 900)) return json({ error: 'Too many registration attempts' }, 429);
      const deviceHash = await hash(deviceKey);
      const record = { endpoint, member_ic: actor.ic, device_hash: deviceHash, p256dh, auth_key: authKey };
      const added = await db<Device[]>('bb_portal_push_devices?on_conflict=endpoint', 'POST', record, 'resolution=ignore-duplicates,return=representation');
      if (!added.length) {
        const changed = await db<Device[]>('bb_portal_push_devices?' + filter('endpoint', endpoint) + '&' + filter('device_hash', deviceHash), 'PATCH', record, 'return=representation');
        if (!changed.length) return json({ error: 'Reset the device subscription and try again' }, 409);
      }
      return json({ ok: true });
    }
    if (action === 'test' && endpoint && tokenPattern.test(deviceKey)) {
      if (!await budget('test:' + await hash(session.email), 4, 900)) return json({ error: 'Too many tests' }, 429);
      const devices = await db<Device[]>('bb_portal_push_devices?select=*&' + filter('endpoint', endpoint)
        + '&' + filter('member_ic', actor.ic) + '&' + filter('device_hash', await hash(deviceKey)));
      const result = await fanout(devices, 'test', String(Date.now()));
      return json(result, result.sent ? 200 : 409);
    }
    if (action !== 'notify' || typeof data.category !== 'string' || !Object.hasOwn(MESSAGES, data.category)
        || ['test', 'task_overdue'].includes(data.category)) return json({ error: 'Invalid notification' }, 400);
    if (!await budget('notify:' + await hash(session.email), 20, 60)) return json({ error: 'Too many notifications' }, 429);
    const category: string = data.category;
    const privileged = ['announcement', 'order_status', 'resource'].includes(category) || topics.some(topic => !topic.startsWith('user_'));
    let staff = officer(actor);
    if (privileged && !staff) {
      const role = await db<{ role?: string }>('rpc/rpc_get_user_role', 'POST', { p_email: session.email });
      staff = ['admin', 'super_admin'].includes(role?.role || '');
    }
    if (['announcement', 'order_status', 'resource'].includes(category) && !staff) return json({ error: 'Notification audience restricted' }, 403);
    if (['task_assigned', 'task_comment', 'mention'].includes(category) && !staff && !nco(actor) && !departmentTopic(actor)) {
      return json({ error: 'Task access required' }, 403);
    }
    const permitted = topics.filter(topic => topic.startsWith('user_') || staff || (category !== 'forum_reply' && topic === departmentTopic(actor)));
    const targetId = String(data.target || '').replace(/[^\w-]/g, '').slice(0, 80);
    const target = targetId || String(Date.now());
    const result = await fanout(await recipients(permitted), category, target, targetId);
    return json(result, result.failed && !result.sent ? 502 : 200);
  } catch {
    return json({ error: 'Web Push could not complete the request' }, 500);
  }
});
