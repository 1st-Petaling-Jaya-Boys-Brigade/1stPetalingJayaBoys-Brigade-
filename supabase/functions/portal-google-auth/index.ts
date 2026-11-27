import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6.1.3';

const PROJECT = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE = 'https://1st-petaling-jaya-boys-brigade.github.io';
const ORIGIN = Deno.env.get('PORTAL_PUSH_ORIGIN') || SITE;
const EXTRA_ORIGINS = (Deno.env.get('PORTAL_GOOGLE_EXTRA_ORIGINS') || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);
const CLIENT_ORIGINS = new Set([ORIGIN, 'https://localhost', ...EXTRA_ORIGINS]);
const ALLOWED_CLIENT_IDS = (Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const MEMBER_SELECT_FIELDS = [
  'ic',
  'email',
  'name',
  'rank',
  'squad',
  'date_of_birth',
  'department',
  'joined_at',
  'att_role',
  'att_section',
  'age',
  'section',
  'verification_status',
  'parental_consent_signed',
  'media_consent',
  'updated_at',
].join(',');

const encoder = new TextEncoder();
const dayMs = 86_400_000;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type MemberRow = {
  ic: string;
  email?: string | null;
  name?: string | null;
  rank?: string | null;
  squad?: string | null;
  date_of_birth?: string | null;
  department?: string | null;
  joined_at?: string | null;
  att_role?: string | null;
  att_section?: string | null;
  age?: number | null;
  section?: string | null;
  verification_status?: string | null;
  parental_consent_signed?: boolean | null;
  media_consent?: boolean | null;
  updated_at?: string | null;
};

const normalize = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const hex = (bytes: Uint8Array) => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
const hash = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
const filter = (column: string, value: string) => column + '=eq.' + encodeURIComponent(value);
const escapeLike = (value: string) => value.replace(/[\\%_*]/g, '\\$&');

async function db<T>(path: string, method = 'GET', body?: unknown, prefer?: string): Promise<T> {
  const response = await fetch(PROJECT + '/rest/v1/' + path, {
    method,
    headers: {
      apikey: SERVICE,
      Authorization: 'Bearer ' + SERVICE,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(6000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Database request failed');
  const result = await response.text();
  return result ? JSON.parse(result) : undefined as T;
}

function budget(key: string, limit: number, seconds: number) {
  return db<boolean>('rpc/rpc_claim_portal_push_limit', 'POST', {
    p_key: key,
    p_limit: limit,
    p_seconds: seconds,
  });
}

function isActiveMember(member: MemberRow, deletedSet: Set<string>): boolean {
  if (!member || !member.ic) return false;
  const dept = normalize(member.department);
  if (dept === 'deleted' || dept === 'archived_deleted') return false;
  const ic = normalize(member.ic);
  if (ic.startsWith('archived_')) return false;
  if (deletedSet.has(ic)) return false;
  return true;
}

async function loadConfigList(key: string): Promise<Set<string>> {
  try {
    const [row] = await db<{ value: string | unknown[] }[]>('bb_config?select=value&' + filter('key', key));
    const parsed = typeof row?.value === 'string' ? JSON.parse(row.value) : row?.value || [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed
        .map(item => normalize(typeof item === 'object' && item && 'email' in item ? (item as { email?: string }).email : item))
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

async function verifyGoogleIdToken(idToken: string, expectedNonce?: string): Promise<{ email: string } | null> {
  if (!idToken || idToken.length > 8192) return null;
  try {
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      algorithms: ['RS256'],
      issuer: GOOGLE_ISSUERS,
      audience: ALLOWED_CLIENT_IDS,
    });
    const email = normalize(payload.email);
    const verified = payload.email_verified === true || payload.email_verified === 'true';
    if (!verified || !email || email.length > 254 || !emailPattern.test(email)) return null;
    if (typeof payload.nonce === 'string' && payload.nonce.length > 0) {
      if (!expectedNonce || payload.nonce !== expectedNonce) return null;
    } else if (expectedNonce) {
      return null;
    }
    return { email };
  } catch {
    return null;
  }
}

async function verifyGoogleAccessToken(accessToken: string): Promise<{ email: string } | null> {
  if (!accessToken || accessToken.length > 4096) return null;
  try {
    const infoRes = await fetch(
      'https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(accessToken),
      {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!infoRes.ok) {
      await infoRes.body?.cancel();
      return null;
    }
    const info = await infoRes.json() as Record<string, unknown>;
    const aud = typeof info.aud === 'string' ? info.aud.trim() : '';
    const azp = typeof info.azp === 'string' ? info.azp.trim() : '';
    const clientMatches = ALLOWED_CLIENT_IDS.includes(aud) || ALLOWED_CLIENT_IDS.includes(azp);
    const expiresIn = Number(info.expires_in);
    if (!clientMatches || !Number.isFinite(expiresIn) || expiresIn <= 0) return null;

    let email = normalize(info.email);
    let verified = info.email_verified === true || info.email_verified === 'true';

    if (!email || !verified) {
      const userInfoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + accessToken },
        redirect: 'error',
        signal: AbortSignal.timeout(6000),
      });
      if (!userInfoRes.ok) {
        await userInfoRes.body?.cancel();
        return null;
      }
      const userInfo = await userInfoRes.json() as Record<string, unknown>;
      email = normalize(userInfo.email);
      verified = userInfo.email_verified === true || userInfo.email_verified === 'true';
    }

    if (!verified || !email || email.length > 254 || !emailPattern.test(email)) return null;
    return { email };
  } catch {
    return null;
  }
}

async function findActiveMembersForEmail(email: string): Promise<MemberRow[]> {
  const cfgKey = 'bb_family_' + email.replace(/[^a-zA-Z0-9]/g, '_');
  const escaped = escapeLike(email);
  const [byIc, byEmail, byPrefix, famRows, deletedSet] = await Promise.all([
    db<MemberRow[]>('bb_members?select=' + MEMBER_SELECT_FIELDS + '&' + filter('ic', email)),
    db<MemberRow[]>('bb_members?select=' + MEMBER_SELECT_FIELDS + '&email=ilike.' + encodeURIComponent(escaped) + '&limit=50'),
    db<MemberRow[]>('bb_members?select=' + MEMBER_SELECT_FIELDS + '&ic=ilike.' + encodeURIComponent(escaped + '\\_\\_%') + '&limit=50'),
    db<{ value: string | { members?: Array<{ ic?: string }> } }[]>('bb_config?select=value&' + filter('key', cfgKey)),
    loadConfigList('bb_deleted_members'),
  ]);

  const memberMap = new Map<string, MemberRow>();
  for (const list of [byIc, byEmail, byPrefix]) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (row && row.ic) memberMap.set(row.ic, row);
    }
  }

  if (Array.isArray(famRows) && famRows.length > 0 && famRows[0]?.value) {
    try {
      const famData = typeof famRows[0].value === 'string'
        ? JSON.parse(famRows[0].value) as { members?: Array<{ ic?: string }> }
        : famRows[0].value;
      const missingIcs = (Array.isArray(famData?.members) ? famData.members : [])
        .map(m => (m && typeof m.ic === 'string' ? m.ic.trim() : ''))
        .filter(ic => ic && !memberMap.has(ic))
        .slice(0, 20);
      if (missingIcs.length > 0) {
        const extraResults = await Promise.allSettled(
          missingIcs.map(ic => db<MemberRow[]>('bb_members?select=' + MEMBER_SELECT_FIELDS + '&' + filter('ic', ic))),
        );
        for (const res of extraResults) {
          if (res.status === 'fulfilled' && Array.isArray(res.value)) {
            for (const row of res.value) {
              if (row && row.ic) memberMap.set(row.ic, row);
            }
          }
        }
      }
    } catch {
      // Ignore malformed legacy family blob
    }
  }

  const activeMembers = Array.from(memberMap.values()).filter(m => isActiveMember(m, deletedSet));
  activeMembers.sort((a, b) => {
    const aPrimary = normalize(a.ic) === email ? 0 : 1;
    const bPrimary = normalize(b.ic) === email ? 0 : 1;
    if (aPrimary !== bPrimary) return aPrimary - bPrimary;
    return String(a.name || a.ic).localeCompare(String(b.name || b.ic));
  });
  return activeMembers;
}

async function issuePortalSessions(email: string, remember: boolean) {
  const pushToken = hex(crypto.getRandomValues(new Uint8Array(32)));
  const pushExpiresAt = new Date(Date.now() + (remember ? 30 * dayMs : dayMs / 2)).toISOString();
  await db('bb_portal_push_sessions', 'POST', {
    token_hash: await hash(pushToken),
    email,
    expires_at: pushExpiresAt,
  });

  let adminSignIn: { token: string; expires_at: string; email: string } | null = null;
  try {
    const roleInfo = await db<{ role?: string }>('rpc/rpc_get_user_role', 'POST', { p_email: email });
    if (roleInfo && (roleInfo.role === 'admin' || roleInfo.role === 'super_admin')) {
      const adminToken = hex(crypto.getRandomValues(new Uint8Array(32)));
      const adminExpiresAt = new Date(Date.now() + (remember ? 14 * dayMs : dayMs / 2)).toISOString();
      await db('bb_admin_member_signins?' + filter('email', email) + '&expires_at=lte.' + encodeURIComponent(new Date().toISOString()), 'DELETE').catch(() => {});
      await db('bb_admin_member_signins', 'POST', {
        token_hash: await hash(adminToken),
        email,
        expires_at: adminExpiresAt,
      });
      adminSignIn = { token: adminToken, expires_at: adminExpiresAt, email };
    }
  } catch {
    // Non-fatal: member login still succeeds even if admin session issuance fails
  }

  return {
    pushSession: { token: pushToken, expiresAt: pushExpiresAt },
    adminSignIn,
  };
}

function logAuditBestEffort(email: string, action: string, details: Record<string, unknown>) {
  db('rpc/rpc_log_audit_event', 'POST', {
    p_actor_id: email || 'anonymous',
    p_actor_role: 'member',
    p_action: action,
    p_target_type: 'auth',
    p_target_id: email || 'google',
    p_details: details,
  }).catch(() => {});
}

Deno.serve(async request => {
  const origin = request.headers.get('origin');
  const trustedOrigin = Boolean(origin && CLIENT_ORIGINS.has(origin));
  const cors = {
    'Access-Control-Allow-Origin': trustedOrigin ? origin! : ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
  };
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: cors });

  if (origin && !trustedOrigin) return json({ ok: false, error: 'Invalid request origin' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method === 'GET') {
    return json({
      enabled: ALLOWED_CLIENT_IDS.length > 0,
      clientId: ALLOWED_CLIENT_IDS[0] || '',
    });
  }
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  if (!trustedOrigin) return json({ ok: false, error: 'Invalid request origin' }, 403);
  if (ALLOWED_CLIENT_IDS.length === 0) {
    return json({
      ok: false,
      code: 'GOOGLE_NOT_CONFIGURED',
      error: 'Google Sign-In is not configured yet.',
    }, 503);
  }

  try {
    const ip = request.headers.get('x-real-ip') || request.headers.get('cf-connecting-ip') || 'unknown';
    if (!await budget('google-auth-ip:' + await hash(ip), 60, 900)) {
      return json({ ok: false, code: 'RATE_LIMITED', error: 'Too many sign-in attempts. Please try again later.' }, 429);
    }

    const raw = await request.text();
    if (!raw || raw.length > 16_384) return json({ ok: false, code: 'INVALID_REQUEST', error: 'Invalid request' }, 413);
    const data = JSON.parse(raw) as {
      idToken?: unknown;
      nonce?: unknown;
      accessToken?: unknown;
      remember?: unknown;
    };

    const idToken = typeof data?.idToken === 'string' ? data.idToken.trim() : '';
    const nonce = typeof data?.nonce === 'string' ? data.nonce.trim() : '';
    const accessToken = typeof data?.accessToken === 'string' ? data.accessToken.trim() : '';
    const remember = data?.remember !== false;

    const verified = idToken
      ? await verifyGoogleIdToken(idToken, nonce || undefined)
      : accessToken
        ? await verifyGoogleAccessToken(accessToken)
        : null;

    if (!verified) {
      return json({
        ok: false,
        code: 'INVALID_GOOGLE_TOKEN',
        error: 'Google sign-in could not be verified. Please try again.',
      }, 401);
    }

    const email = verified.email;
    if (!await budget('google-auth-email:' + await hash(email), 20, 900)) {
      return json({ ok: false, code: 'RATE_LIMITED', error: 'Too many sign-in attempts for this account. Please try again later.' }, 429);
    }

    const blocked = await loadConfigList('bb_blocked_emails');
    if (blocked.has(email)) {
      return json({
        ok: false,
        code: 'ACCOUNT_BLOCKED',
        email,
        error: 'This email address has been blocked by an administrator.',
      }, 403);
    }

    const accounts = await findActiveMembersForEmail(email);
    if (!accounts.length) {
      logAuditBestEffort(email, 'auth.google_login_not_found', { method: 'google', registered: false });
      return json({
        ok: false,
        code: 'ACCOUNT_NOT_FOUND',
        email,
        error: "Couldn't find your Google Account",
      }, 404);
    }

    const sessions = await issuePortalSessions(email, remember);
    logAuditBestEffort(email, 'auth.google_login_success', {
      method: 'google',
      multi_account: accounts.length > 1,
      account_count: accounts.length,
    });

    return json({
      ok: true,
      email,
      accounts,
      pushSession: sessions.pushSession,
      adminSignIn: sessions.adminSignIn,
    });
  } catch {
    return json({ ok: false, code: 'SERVICE_UNAVAILABLE', error: 'Google sign-in is temporarily unavailable. Please try again.' }, 500);
  }
});
