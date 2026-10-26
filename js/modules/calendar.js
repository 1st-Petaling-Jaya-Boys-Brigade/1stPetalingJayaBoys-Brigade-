/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Company Calendar & Member Personal Schedule Module
 * Pre-populated with official 2026 Master Calendar (Senior & Junior Sections)
 */

(function(global) {
  'use strict';

  // ── Authentic 2026 Company Calendar Dataset (Google Docs Master) ───────────
  var DEFAULT_2026_CALENDAR = [
    // January 2026
    { id: 'cal-2026-01-03', date: '2026-01-03', title: 'Fellowship Parade', type: 'special', kit: 'PT Kit', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Fellowship Parade & Ice-breaking', jrDetails: 'No parade', notes: 'First parade of 2026. Welcome back!' },
    { id: 'cal-2026-01-10', date: '2026-01-10', title: 'Regular Parade', type: 'parade', kit: 'PT Kit', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Target · Comp. Knowledge (A) · Soc-Entrepreneur (B) · Drill', jrDetails: 'Junior Games & Drill Introduction', notes: '' },
    { id: 'cal-2026-01-17', date: '2026-01-17', title: 'Regular Parade', type: 'parade', kit: 'PT Kit', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Comp. Knowledge (A) · Soc-Entrepreneur (B) · Drill', jrDetails: 'Junior Games & Squad Basics', notes: '' },
    { id: 'cal-2026-01-24', date: '2026-01-24', title: 'Regular Parade & Parents Briefing', type: 'parade', kit: 'PT Kit', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Target · Comp. Knowledge (A) · Soc-Entrepreneur (B) · Parents & Recruits Briefing · Drill', jrDetails: 'Junior Games · Recruits Briefing · Parents Briefing', notes: 'Parents & Recruits Welcome Briefing at 4:30 PM' },
    { id: 'cal-2026-01-31', date: '2026-01-31', title: 'Special Event (Optional)', type: 'special', kit: 'PT Kit', time: '1:30 PM – 5:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Special Event (Optional) · Squad Fellowship', jrDetails: 'No Parade (Company Break)', notes: 'Thaipusam on Jan 1' },

    // February 2026
    { id: 'cal-2026-02-07', date: '2026-02-07', title: 'Regular Parade', type: 'parade', kit: 'Day Dress', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Target · Comp. Knowledge (A) · Soc-Entrepreneur (B) · Drill', jrDetails: 'JR - BB in Malaysia · Target · Badge Class 1', notes: 'Day Dress uniform inspection' },
    { id: 'cal-2026-02-14', date: '2026-02-14', title: 'Chinese New Year - No Parade', type: 'noparade', kit: 'None', time: 'All Day', location: 'No Parade', srDetails: 'Chinese New Year holiday break', jrDetails: 'Chinese New Year holiday break', notes: 'Happy Chinese New Year! No parade.' },
    { id: 'cal-2026-02-21', date: '2026-02-21', title: 'Chinese New Year - No Parade', type: 'noparade', kit: 'None', time: 'All Day', location: 'No Parade', srDetails: 'Chinese New Year holiday break', jrDetails: 'Chinese New Year holiday break', notes: 'CNY holidays: Feb 17-18' },
    { id: 'cal-2026-02-28', date: '2026-02-28', title: 'Special Event - Half Day', type: 'special', kit: 'Drill Kit', time: '1:30 PM – 5:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Special Event - Half Day (Squad Zulu) · NO CE · Target/Drill · Board Games', jrDetails: 'JR - Morse Code · Target · Special Event', notes: 'Squad Zulu in charge' },

    // March 2026
    { id: 'cal-2026-03-07', date: '2026-03-07', title: 'Regular Parade', type: 'parade', kit: 'Day Dress', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Target · Comp. Knowledge (A) · Soc-Entrepreneur (B) · Drill', jrDetails: 'JR - BB History · Target · Badge Class 1', notes: '' },
    { id: 'cal-2026-03-14', date: '2026-03-14', title: 'Regular Parade', type: 'parade', kit: 'Day Dress', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Target · Comp. Knowledge (A) · Soc-Entrepreneur (B) · Drill', jrDetails: 'JR - Morse Code · Target · Badge Class 1', notes: '' },
    { id: 'cal-2026-03-21', date: '2026-03-21', title: '4 in 1 State Camp (20–22 Mar)', type: 'camp', kit: 'Drill Kit', time: 'Full Weekend', location: 'State Camp Site', srDetails: '4 in 1 State Camp (20-22 March)', jrDetails: 'JR - Bootcamp · 4 in 1 State Camp (20-22)', notes: 'Hari Raya Aidilfitri on Mar 21-22' },
    { id: 'cal-2026-03-28', date: '2026-03-28', title: 'Special Event - Half Day', type: 'special', kit: 'PT Kit', time: '1:30 PM – 5:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Special Event - Half Day (Squad Alpha) · NO CE · Target Test / Drill · Intersquad Sports', jrDetails: 'JR - Morse Code Test · Target Test · Special Event', notes: 'Squad Alpha in charge' },

    // April 2026
    { id: 'cal-2026-04-04', date: '2026-04-04', title: 'Easter - No Parade', type: 'noparade', kit: 'None', time: 'All Day', location: 'No Parade', srDetails: 'Easter Weekend - No Parade', jrDetails: 'Easter Weekend - No Parade', notes: 'Blessed Easter!' },
    { id: 'cal-2026-04-11', date: '2026-04-11', title: 'Regular Parade', type: 'parade', kit: 'Day Dress', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · First Aid (B) · Campers (B+A) · Drill', jrDetails: 'JR - BB Recruitment · Badge Class 2', notes: 'Stage 2 Badge Classes commence' },
    { id: 'cal-2026-04-18', date: '2026-04-18', title: 'Regular Parade', type: 'parade', kit: 'Drill Kit', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · First Aid (B) · Campers (B+A) · Drill', jrDetails: 'JR - Sports · Badge Class 2', notes: '' },
    { id: 'cal-2026-04-25', date: '2026-04-25', title: 'Rank Exchange Parade', type: 'parade', kit: 'PT Kit', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'RANK EXCHANGE · Worship · CE · First Aid (B) · Campers (B+A) · Drill', jrDetails: 'JR - Sports · Badge Class 2', notes: 'Annual Senior Section Rank Exchange' },

    // May 2026
    { id: 'cal-2026-05-02', date: '2026-05-02', title: 'Labour Day / Wesak - No Parade', type: 'noparade', kit: 'None', time: 'All Day', location: 'No Parade', srDetails: 'Wesak Day / Labour Day Holiday - No Parade', jrDetails: 'JR - Junior Leadership Training (1-3) - No Parade', notes: 'Labour Day: May 1, Wesak: May 31' },
    { id: 'cal-2026-05-09', date: '2026-05-09', title: 'BCM (8–10 May) - No Parade', type: 'noparade', kit: 'Day Dress', time: 'All Day', location: 'BCM Center', srDetails: 'Boys\' Brigade Council Meeting (BCM 8-10 May) - No Parade', jrDetails: 'BCM (8-10 May) - No Parade', notes: 'Officers attending national council meeting' },
    { id: 'cal-2026-05-16', date: '2026-05-16', title: 'Regular Parade', type: 'parade', kit: 'Drill Kit', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · First Aid (B) · Campers (B+A) · Drill', jrDetails: 'JR - Mother\'s Day Crafts · Badge Class 2', notes: 'Mother\'s Day celebration' },
    { id: 'cal-2026-05-23', date: '2026-05-23', title: 'Special Event - Half Day', type: 'special', kit: 'PT Kit', time: '1:30 PM – 5:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Special Event - Half Day (Squad Papa) · NO CE · Drill · Intersquad Sports', jrDetails: 'JR - Sports Outing · Special Event', notes: 'Squad Papa in charge' },
    { id: 'cal-2026-05-30', date: '2026-05-30', title: '1st PJ Company Camp (30 May – 1 Jun)', type: 'camp', kit: 'PT Kit', time: 'Full Weekend', location: 'Company Campsite', srDetails: 'Company Camp / Family Outing (30-31 May)', jrDetails: 'JR - Company Camp (30 May - 1 June)', notes: 'Annual Company Camp for all members and families' },

    // June 2026
    { id: 'cal-2026-06-06', date: '2026-06-06', title: 'Regular Parade', type: 'parade', kit: 'Day Dress', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · First Aid (B) · Campers (B+A) · Drill', jrDetails: 'JR - Respect & Obedience · Drill Assessment · Badge Class 2', notes: 'Agong\'s Birthday on Jun 1' },
    { id: 'cal-2026-06-13', date: '2026-06-13', title: 'Regular Parade', type: 'parade', kit: 'Day Dress', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · First Aid (B) · Campers (B+A) · Drill', jrDetails: 'JR - Respect & Obedience · Badge Class 2', notes: '' },
    { id: 'cal-2026-06-20', date: '2026-06-20', title: 'Enrolment Rehearsal', type: 'ceremonial', kit: 'Drill Kit', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church Sanctuary', srDetails: 'NO CE · BBGB Enrolment Full Rehearsal', jrDetails: 'JR - Father\'s Day Craft · Enrolment Rehearsal', notes: 'Enrolment Service full walkthrough' },
    { id: 'cal-2026-06-27', date: '2026-06-27', title: 'Enrolment Final Rehearsal', type: 'ceremonial', kit: 'PT Kit', time: '1:30 PM – 5:30 PM', location: 'Trinity Methodist Church Sanctuary', srDetails: 'NO CE · BBGB Enrolment Rehearsal', jrDetails: 'JR - BBGB Enrolment Rehearsal', notes: 'Final rehearsal before Sunday ceremony' },
    { id: 'cal-2026-06-28', date: '2026-06-28', title: 'ENROLMENT SUNDAY', type: 'ceremonial', kit: 'Ceremonial', time: '8:30 AM – 1:00 PM', location: 'Trinity Methodist Church Sanctuary', srDetails: 'Company Enrolment Service & Dedication Ceremony', jrDetails: 'Company Enrolment Service & Dedication Ceremony', notes: 'Mandatory Full Ceremonial Kit for all members and officers' },

    // July 2026
    { id: 'cal-2026-07-04', date: '2026-07-04', title: 'Regular Parade & NCO Stayover', type: 'parade', kit: 'PT Kit', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'SSDC Practice and NCO Stayover (4-5 July)', jrDetails: 'JR - Photo Session · CE Assessment', notes: 'Senior NCO stayover on Saturday evening' },
    { id: 'cal-2026-07-11', date: '2026-07-11', title: 'SSDC at KSL Sports Puchong - No Parade', type: 'noparade', kit: 'Day Dress', time: '8:00 AM – 4:00 PM', location: 'KSL Sports Puchong', srDetails: 'SSDC at KSL Sports Puchong - No Regular Parade', jrDetails: 'JR - SSDC Prep & NCO Stayover', notes: 'State Sports & Drill Competition' },
    { id: 'cal-2026-07-18', date: '2026-07-18', title: 'Regular Parade', type: 'parade', kit: 'Drill Kit', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Safety (B) · Nature Awareness (B) · Drill', jrDetails: 'JR - Fire & Rescue · Badge Class 3', notes: 'Badge Class 3 syllabus starts' },
    { id: 'cal-2026-07-25', date: '2026-07-25', title: 'Campers & Expedition Assessment Camp', type: 'camp', kit: 'Drill Kit', time: 'Full Day / Overnight', location: 'Camp Site', srDetails: 'NO CE · Campers & Expedition Assessment Camp', jrDetails: 'JR - Fire & Rescue Outing', notes: 'Practical field assessment for Campers badge' },

    // August 2026 (Ogos)
    { id: 'cal-2026-08-01', date: '2026-08-01', title: 'Mid-Year Recess - No Parade', type: 'noparade', kit: 'None', time: 'All Day', location: 'No Parade', srDetails: 'Mid-year Company Recess - No Parade', jrDetails: 'Mid-year Company Recess - No Parade', notes: 'Enjoy your rest!' },
    { id: 'cal-2026-08-08', date: '2026-08-08', title: 'Regular Parade', type: 'parade', kit: 'Day Dress', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Safety (B) · Nature Awareness (B) · Drill', jrDetails: 'JR - Road Safety · Badge Class 3', notes: '' },
    { id: 'cal-2026-08-15', date: '2026-08-15', title: 'Regular Parade', type: 'parade', kit: 'Drill Kit', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Safety (B) · Nature Awareness (B) · Drill', jrDetails: 'JR - Road Safety · Badge Class 3', notes: '' },
    { id: 'cal-2026-08-22', date: '2026-08-22', title: 'Regular Parade & Outing', type: 'parade', kit: 'PT Kit', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Safety (B) · Nature Awareness (B) · Drill', jrDetails: 'JR - Road Safety Outing · Badge Class 3', notes: '' },
    { id: 'cal-2026-08-29', date: '2026-08-29', title: 'Drill Camp (Optional)', type: 'special', kit: 'Drill Kit', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Special Event (Optional) / Drill Camp', jrDetails: 'JR - No Parade (National Day weekend)', notes: 'National Day (Merdeka) on Aug 31' },

    // September 2026
    { id: 'cal-2026-09-05', date: '2026-09-05', title: 'Regular Parade & Photo Session', type: 'parade', kit: 'Day Dress', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Photo Session · Safety (B) · Nature Awareness (B) · Drill', jrDetails: 'JR - Merdeka Craft · Badge Class 3 · Photo Session', notes: 'Annual squad & platoon official photography' },
    { id: 'cal-2026-09-12', date: '2026-09-12', title: 'Regular Parade', type: 'parade', kit: 'Day Dress', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Safety (B) · Nature Awareness (B) · Drill Theory (B+A)', jrDetails: 'JR - Nature Awareness · Badge Class 3', notes: '' },
    { id: 'cal-2026-09-19', date: '2026-09-19', title: 'Regular Parade', type: 'parade', kit: 'Drill Kit', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Safety (B) · Nature Awareness (B) · Drill Theory (B+A)', jrDetails: 'JR - Nature Awareness · Badge Class 3 · Drill Theory', notes: '' },
    { id: 'cal-2026-09-26', date: '2026-09-26', title: 'Career Talk with BB Alumni', type: 'special', kit: 'PT Kit', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'NO CE · Career Talk with BB Alumni · Special Event (Officers)', jrDetails: 'JR - Nature Awareness Outing · Special Event', notes: 'BB Alumni career mentoring & sharing session' },

    // October 2026
    { id: 'cal-2026-10-03', date: '2026-10-03', title: 'SELANGOR STATE FOUNDER\'S DAY', type: 'ceremonial', kit: 'Ceremonial', time: '8:00 AM – 2:00 PM', location: 'State Assembly Grounds', srDetails: 'Selangor State Founder\'s Day Celebration & Parade', jrDetails: 'Selangor State Founder\'s Day Celebration', notes: 'State-level ceremonial gathering' },
    { id: 'cal-2026-10-10', date: '2026-10-10', title: 'Planning Retreat - No Parade', type: 'noparade', kit: 'None', time: 'All Day', location: 'Retreat Center', srDetails: 'Planning Retreat (9-11 Oct) - No Parade', jrDetails: 'Planning Retreat (9-11 Oct) - No Parade', notes: 'Officers and NCO planning weekend' },
    { id: 'cal-2026-10-17', date: '2026-10-17', title: 'Regular Parade & Hobbies Showcase', type: 'parade', kit: 'Drill Kit', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Arts, Crafts, Hobbies Presentation · Drill Theory (B+A)', jrDetails: 'PJR - Safe Touch · JR - BGR · SR - Award Assessment, Drill Theory', notes: '' },
    { id: 'cal-2026-10-24', date: '2026-10-24', title: 'Regular Parade', type: 'parade', kit: 'PT Kit', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Safety (A) · Drill Theory (B+A)', jrDetails: 'PJR - Safe Touch · JR - BGR · Safety, Drill Theory', notes: '' },
    { id: 'cal-2026-10-31', date: '2026-10-31', title: 'Athletics & Drill Commanding', type: 'parade', kit: 'Day Dress', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'No Standard Parade · Athletics + Drill Commanding (B+A)', jrDetails: 'JR - Drill Assessments', notes: 'End-of-year practical badges assessment' },

    // November 2026
    { id: 'cal-2026-11-07', date: '2026-11-07', title: 'Regular Parade & Awards Submission', type: 'parade', kit: 'Day Dress', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Awards Submission Review', jrDetails: 'JR - Drill & CE Assessment · Awards Submission', notes: 'Deepavali on Nov 8' },
    { id: 'cal-2026-11-14', date: '2026-11-14', title: 'Brigade Officers Retreat - No Parade', type: 'noparade', kit: 'None', time: 'All Day', location: 'Retreat Center', srDetails: 'Brigade Officers Retreat - No Parade', jrDetails: 'Brigade Officers Retreat - No Parade', notes: 'Officers retreat weekend' },
    { id: 'cal-2026-11-21', date: '2026-11-21', title: 'Regular Parade & Re-assessments', type: 'parade', kit: 'Drill Kit', time: '1:30 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Senior Badges & Awards Application Submission', jrDetails: 'JR - Re-assessments · Awards Application Submission', notes: 'Final deadline for all badge claims' },
    { id: 'cal-2026-11-28', date: '2026-11-28', title: 'Awards Day Preparation', type: 'special', kit: 'PT Kit', time: '1:30 PM – 5:30 PM', location: 'Trinity Methodist Church Hall', srDetails: 'Awards Day Rehearsal & Setup', jrDetails: 'JR - Awards Day Prep & Rehearsal', notes: 'Setup for Christmas Party & Awards Ceremony' },

    // December 2026
    { id: 'cal-2026-12-05', date: '2026-12-05', title: '1ST PJ AWARDS DAY & CHRISTMAS PARTY', type: 'ceremonial', kit: 'Day Dress', time: '2:00 PM – 7:30 PM', location: 'Trinity Methodist Church Grand Hall', srDetails: 'Annual Company Awards Ceremony, Rank Promotions & Christmas Celebration', jrDetails: 'Junior Section Awards Presentation & Christmas Celebration', notes: 'Annual Company celebration with parents, alumni and friends!' }
  ];

  // ── Module State ───────────────────────────────────────────────────────────
  var _calendarEvents   = JSON.parse(JSON.stringify(DEFAULT_2026_CALENDAR));
  var _memberReminders  = [];
  var _currentMonth     = new Date().getMonth();
  var _currentYear      = new Date().getFullYear();
  var _selectedDateStr  = formatDateKey(new Date());

  function formatDateKey(dateObj) {
    var y = dateObj.getFullYear();
    var m = String(dateObj.getMonth() + 1).padStart(2, '0');
    var d = String(dateObj.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  // ── Kit & Type Metadata ────────────────────────────────────────────────────
  var KIT_BADGES = {
    'PT Kit':     { label: 'PT Kit',      color: '#10b981', bg: 'rgba(16,185,129,0.15)', icon: '🥋' },
    'Day Dress':  { label: 'Day Dress',   color: '#3b82f6', bg: 'rgba(59,130,246,0.15)', icon: '👔' },
    'Drill Kit':  { label: 'Drill Kit',   color: '#eab308', bg: 'rgba(234,179,8,0.15)',  icon: '🎖️' },
    'Ceremonial': { label: 'Ceremonial',  color: '#a855f7', bg: 'rgba(168,85,247,0.15)', icon: '🏅' },
    'Casual':     { label: 'Casual',      color: '#64748b', bg: 'rgba(100,116,139,0.15)',icon: '👕' },
    'None':       { label: 'No Kit',      color: '#94a3b8', bg: 'rgba(148,163,184,0.12)',icon: '—' }
  };

  var TYPE_BADGES = {
    'parade':     { label: 'Regular Parade',   color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
    'noparade':   { label: 'No Parade',        color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
    'special':    { label: 'Special Event',    color: '#eab308', bg: 'rgba(234,179,8,0.15)' },
    'camp':       { label: 'Camp / Outing',    color: '#06b6d4', bg: 'rgba(6,182,212,0.15)' },
    'ceremonial': { label: 'Ceremonial',       color: '#a855f7', bg: 'rgba(168,85,247,0.15)' },
    'holiday':    { label: 'Public Holiday',   color: '#f97316', bg: 'rgba(249,115,22,0.15)' }
  };

  // ── Supabase & Storage Persistence ─────────────────────────────────────────

  /**
   * Loads Company Calendar Events from Supabase or defaults to the authentic 2026 dataset
   */
  async function loadCalendarEvents() {
    try {
      var client = (typeof supa !== 'undefined') ? supa : (typeof window !== 'undefined' ? window.supa : null);
      if (client && typeof client.get === 'function') {
        var rows = await client.get('bb_config?key=eq.bb_company_calendar&select=value');
        if (rows && rows.length && rows[0].value) {
          var parsed = JSON.parse(rows[0].value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            _calendarEvents = parsed;
            return _calendarEvents;
          }
        }
      }
    } catch (e) {
      console.warn('Could not load company calendar from Supabase, using standard master:', e);
    }

    // Default to the full 2026 Master Calendar if nothing saved yet
    _calendarEvents = JSON.parse(JSON.stringify(DEFAULT_2026_CALENDAR));
    return _calendarEvents;
  }

  /**
   * Saves Company Calendar Events to Supabase bb_config
   */
  async function saveCalendarEvents(events) {
    if (Array.isArray(events)) {
      _calendarEvents = events;
    }
    var client = (typeof supa !== 'undefined') ? supa : (typeof window !== 'undefined' ? window.supa : null);
    if (!client) return false;

    try {
      if (typeof client.upsert === 'function') {
        await client.upsert('bb_config', { key: 'bb_company_calendar', value: JSON.stringify(_calendarEvents) }, 'key');
      } else {
        await client.req('POST', 'bb_config?on_conflict=key', { key: 'bb_company_calendar', value: JSON.stringify(_calendarEvents) });
      }
      return true;
    } catch (err) {
      console.error('Error saving calendar events to Supabase:', err);
      try {
        await client.patch('bb_config?key=eq.bb_company_calendar', { value: JSON.stringify(_calendarEvents) });
        return true;
      } catch (err2) {
        console.error('Fallback patch failed:', err2);
        return false;
      }
    }
  }

  /**
   * Loads Personal Member Events/Reminders for logged-in user
   */
  function loadMemberEvents() {
    var userId = (typeof sessionGet === 'function') ? (sessionGet('email') || sessionGet('ic')) : null;
    if (!userId) {
      _memberReminders = [];
      return [];
    }

    try {
      var storageKey = 'bb_member_reminders_' + encodeURIComponent(userId);
      var raw = localStorage.getItem(storageKey);
      if (raw) {
        _memberReminders = JSON.parse(raw);
        if (!Array.isArray(_memberReminders)) _memberReminders = [];
      } else {
        _memberReminders = [];
      }
    } catch (e) {
      _memberReminders = [];
    }
    return _memberReminders;
  }

  /**
   * Saves Personal Member Events/Reminders
   */
  function saveMemberEvents(events) {
    var userId = (typeof sessionGet === 'function') ? (sessionGet('email') || sessionGet('ic')) : null;
    if (!userId) return false;

    if (Array.isArray(events)) {
      _memberReminders = events;
    }

    try {
      var storageKey = 'bb_member_reminders_' + encodeURIComponent(userId);
      localStorage.setItem(storageKey, JSON.stringify(_memberReminders));
      return true;
    } catch (e) {
      console.error('Failed to save personal member events:', e);
      return false;
    }
  }

  /**
   * Adds a personal reminder for the member on a given date
   */
  function addPersonalEvent(dateStr, title, time, notes, tag) {
    if (!dateStr || !title) return null;
    var sanitizedTitle = ((typeof sanitizeText === 'function') ? sanitizeText(title, 80) : title).trim();
    var sanitizedNotes = ((typeof sanitizeText === 'function') ? sanitizeText(notes || '', 200) : (notes || '')).trim();
    var sanitizedTag   = ((typeof sanitizeText === 'function') ? sanitizeText(tag || 'Personal', 30) : (tag || 'Personal')).trim();

    var newReminder = {
      id: 'rem-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      date: dateStr,
      title: sanitizedTitle,
      time: time || '',
      notes: sanitizedNotes,
      tag: sanitizedTag,
      createdAt: new Date().toISOString()
    };

    var list = loadMemberEvents();
    list.push(newReminder);
    saveMemberEvents(list);
    return newReminder;
  }

  /**
   * Deletes a personal reminder
   */
  function deletePersonalEvent(reminderId) {
    var list = loadMemberEvents();
    var updated = list.filter(function(r) { return r.id !== reminderId; });
    saveMemberEvents(updated);
    return true;
  }

  // ── Helper Queries ─────────────────────────────────────────────────────────

  function getCompanyEventsForDate(dateStr) {
    return _calendarEvents.filter(function(ev) { return ev.date === dateStr; });
  }

  function getMemberEventsForDate(dateStr) {
    return _memberReminders.filter(function(r) { return r.date === dateStr; });
  }

  function getNextUpcomingParade(fromDateStr) {
    var refDate = fromDateStr ? new Date(fromDateStr) : new Date();
    refDate.setHours(0, 0, 0, 0);

    var sorted = _calendarEvents.slice().sort(function(a, b) {
      return a.date.localeCompare(b.date);
    });

    for (var i = 0; i < sorted.length; i++) {
      var evDate = new Date(sorted[i].date + 'T00:00:00');
      if (evDate >= refDate && sorted[i].type !== 'noparade') {
        return sorted[i];
      }
    }
    // Fallback to first non-past event
    return sorted.find(function(s) { return s.type !== 'noparade'; }) || sorted[0];
  }

  // ── Calendar Month Mathematics ─────────────────────────────────────────────

  var MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  var MONTH_SHORT_NAMES = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
  ];

  function getMonthMatrix(year, month) {
    var firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var daysInPrevMonth = new Date(year, month, 0).getDate();

    var cells = [];

    // Previous month filler
    for (var i = firstDay - 1; i >= 0; i--) {
      var prevDay = daysInPrevMonth - i;
      var prevMonth = month === 0 ? 11 : month - 1;
      var prevYear = month === 0 ? year - 1 : year;
      var dateKey = prevYear + '-' + String(prevMonth + 1).padStart(2, '0') + '-' + String(prevDay).padStart(2, '0');
      cells.push({
        dayNumber: prevDay,
        dateKey: dateKey,
        isCurrentMonth: false
      });
    }

    // Current month days
    for (var d = 1; d <= daysInMonth; d++) {
      var curDateKey = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      cells.push({
        dayNumber: d,
        dateKey: curDateKey,
        isCurrentMonth: true
      });
    }

    // Next month filler (fill 6 rows = 42 cells or 5 rows = 35 cells)
    var totalCells = cells.length > 35 ? 42 : 35;
    var nextCount = totalCells - cells.length;
    for (var n = 1; n <= nextCount; n++) {
      var nextMonth = month === 11 ? 0 : month + 1;
      var nextYear = month === 11 ? year + 1 : year;
      var nDateKey = nextYear + '-' + String(nextMonth + 1).padStart(2, '0') + '-' + String(n).padStart(2, '0');
      cells.push({
        dayNumber: n,
        dateKey: nDateKey,
        isCurrentMonth: false
      });
    }

    return cells;
  }

  // ── Home Page Widget Rendering (Image 1 Style) ─────────────────────────────

  function renderCalendarWidget(containerId) {
    var container = document.getElementById(containerId || 'company-calendar-widget');
    if (!container) return;

    loadMemberEvents();

    var todayStr = formatDateKey(new Date());
    var todayDay = new Date().getDate();
    var matrix = getMonthMatrix(_currentYear, _currentMonth);

    // Selected event or next upcoming event
    var selectedCompanyEvents = getCompanyEventsForDate(_selectedDateStr);
    var selectedMemberEvents  = getMemberEventsForDate(_selectedDateStr);
    var primaryEvent = selectedCompanyEvents.length > 0 ? selectedCompanyEvents[0] : null;

    // Upcoming Parade
    var nextParade = getNextUpcomingParade(todayStr);

    // Month Badge (Image 1: Top Right badge, e.g. "10 OCT")
    var badgeMonth = MONTH_SHORT_NAMES[_currentMonth];

    // Live Parade countdown text
    var countdownText = '';
    if (nextParade) {
      var diffDays = Math.ceil((new Date(nextParade.date + 'T00:00:00') - new Date()) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) countdownText = 'Parade Today!';
      else if (diffDays === 1) countdownText = 'Parade Tomorrow';
      else if (diffDays > 1) countdownText = diffDays + ' days to parade';
      else countdownText = 'Upcoming Schedule';
    }

    var html = ''
      + '<div class="cal-widget-header">'
        + '<div class="cal-widget-title-wrap">'
          + '<div class="cal-widget-month-title">' + MONTH_NAMES[_currentMonth] + ' ' + _currentYear + '</div>'
          + '<div class="cal-widget-countdown">' + (escapeHtml(countdownText)) + '</div>'
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:6px;">'
          + '<button type="button" class="cal-nav-btn" onclick="calNavigateMonth(-1)" title="Previous Month">&lsaquo;</button>'
          + '<button type="button" class="cal-nav-btn" onclick="calNavigateMonth(1)" title="Next Month">&rsaquo;</button>'
          + '<div class="cal-month-badge">'
            + '<span class="cal-badge-day">' + todayDay + '</span>'
            + '<span class="cal-badge-mon">' + badgeMonth + '</span>'
          + '</div>'
        + '</div>'
      + '</div>'

      // Weekday Row (S M T W T F S)
      + '<div class="cal-weekdays-row">'
        + '<span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>'
      + '</div>'

      // Days Grid
      + '<div class="cal-days-grid">';

    matrix.forEach(function(cell) {
      var isToday    = cell.dateKey === todayStr;
      var isSelected = cell.dateKey === _selectedDateStr;
      var compEvents = getCompanyEventsForDate(cell.dateKey);
      var memEvents  = getMemberEventsForDate(cell.dateKey);

      var hasCompEvent = compEvents.length > 0;
      var hasMemEvent  = memEvents.length > 0;

      var dayClass = 'cal-day-cell';
      if (!cell.isCurrentMonth) dayClass += ' cal-day-overflow';
      if (isToday) dayClass += ' cal-day-today';
      if (isSelected) dayClass += ' cal-day-selected';
      if (hasCompEvent || hasMemEvent) dayClass += ' cal-day-has-event';

      // Indicator Dots: Red for no parade, Gold for regular parade/special, Cyan for personal
      var dotsHtml = '<div class="cal-dots-wrap">';
      if (hasCompEvent) {
        var ev = compEvents[0];
        var dotColor = '#eab308'; // gold
        if (ev.type === 'noparade') dotColor = '#ef4444'; // red
        else if (ev.type === 'camp') dotColor = '#06b6d4'; // cyan/blue
        else if (ev.type === 'ceremonial') dotColor = '#a855f7'; // purple
        dotsHtml += '<span class="cal-event-dot" style="background:' + dotColor + ';" title="' + escapeHtml(ev.title) + '"></span>';
      }
      if (hasMemEvent) {
        dotsHtml += '<span class="cal-event-dot cal-dot-personal" style="background:#38bdf8;" title="Personal Reminder"></span>';
      }
      dotsHtml += '</div>';

      html += '<div class="' + dayClass + '" onclick="calSelectDate(\'' + cell.dateKey + '\')" role="button" tabindex="0">'
        + '<span class="cal-day-num">' + cell.dayNumber + '</span>'
        + dotsHtml
        + '</div>';
    });

    html += '</div>'; // end cal-days-grid

    // ── Bottom Preview / Details Bar (Matching Image 1 card) ──
    var kitMeta = (primaryEvent && KIT_BADGES[primaryEvent.kit]) ? KIT_BADGES[primaryEvent.kit] : null;
    var typeMeta = (primaryEvent && TYPE_BADGES[primaryEvent.type]) ? TYPE_BADGES[primaryEvent.type] : null;

    var previewDateObj = new Date(_selectedDateStr + 'T00:00:00');
    var dateLabel = previewDateObj.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' });

    html += '<div class="cal-preview-card">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">'
        + '<div>'
          + '<div class="cal-preview-heading">' + escapeHtml(dateLabel) + '</div>'
          + '<div class="cal-preview-title">'
            + (primaryEvent ? escapeHtml(primaryEvent.title) : 'No Official Parade Scheduled')
          + '</div>'
        + '</div>'
        + '<div style="display:flex;gap:4px;flex-shrink:0;">'
          + (typeMeta ? ('<span class="cal-pill-badge" style="background:' + typeMeta.bg + ';color:' + typeMeta.color + ';">' + escapeHtml(typeMeta.label) + '</span>') : '')
          + (kitMeta ? ('<span class="cal-pill-badge" style="background:' + kitMeta.bg + ';color:' + kitMeta.color + ';">' + kitMeta.icon + ' ' + escapeHtml(kitMeta.label) + '</span>') : '')
        + '</div>'
      + '</div>';

    if (primaryEvent && (primaryEvent.srDetails || primaryEvent.jrDetails)) {
      html += '<div class="cal-preview-desc">'
        + (primaryEvent.srDetails ? ('<div style="margin-bottom:2px;"><strong>Senior:</strong> ' + escapeHtml(primaryEvent.srDetails) + '</div>') : '')
        + (primaryEvent.jrDetails ? ('<div><strong>Junior:</strong> ' + escapeHtml(primaryEvent.jrDetails) + '</div>') : '')
      + '</div>';
    } else if (selectedMemberEvents.length > 0) {
      html += '<div class="cal-preview-desc" style="color:#38bdf8;">'
        + '<span>📌 You have ' + selectedMemberEvents.length + ' personal reminder(s) on this date</span>'
      + '</div>';
    } else {
      html += '<div class="cal-preview-desc" style="color:var(--text-muted);">'
        + 'Click below to view full details or add personal notes for this day.'
      + '</div>';
    }

    html += '<div class="cal-preview-actions">'
      + '<button type="button" class="portal-btn portal-btn-primary" onclick="openCalendarDayModal(\'' + _selectedDateStr + '\')" style="flex:1;font-size:12px;padding:7px 12px;display:flex;align-items:center;justify-content:center;gap:6px;">'
        + '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>'
        + 'View Details'
      + '</button>'
      + '<button type="button" class="portal-btn portal-btn-secondary" onclick="openCalendarDayModal(\'' + _selectedDateStr + '\', true)" style="font-size:12px;padding:7px 12px;display:flex;align-items:center;justify-content:center;gap:6px;" title="Add personal reminder">'
        + '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
        + 'Add Reminder'
      + '</button>'
    + '</div>'
    + '</div>'; // end cal-preview-card

    container.innerHTML = html;
  }

  // ── Day Details Modal (Images 3 & 4 Google Doc Format) ─────────────────────

  function openCalendarDayModal(dateStr, focusAddReminder) {
    var modal = document.getElementById('calendar-day-modal');
    if (!modal) return;

    var targetDate = dateStr || _selectedDateStr;
    _selectedDateStr = targetDate;

    var compEvents = getCompanyEventsForDate(targetDate);
    var memEvents  = getMemberEventsForDate(targetDate);
    var ev = compEvents.length > 0 ? compEvents[0] : null;

    var dateObj = new Date(targetDate + 'T00:00:00');
    var fullDateStr = dateObj.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    var kitMeta = (ev && KIT_BADGES[ev.kit]) ? KIT_BADGES[ev.kit] : null;
    var typeMeta = (ev && TYPE_BADGES[ev.type]) ? TYPE_BADGES[ev.type] : null;

    // Title & Badges
    var titleEl = document.getElementById('cdm-date-title');
    if (titleEl) titleEl.textContent = fullDateStr;

    var headerBadges = document.getElementById('cdm-header-badges');
    if (headerBadges) {
      var badgesHtml = '';
      if (typeMeta) {
        badgesHtml += '<span class="cal-pill-badge" style="background:' + typeMeta.bg + ';color:' + typeMeta.color + ';">' + escapeHtml(typeMeta.label) + '</span> ';
      }
      if (kitMeta) {
        badgesHtml += '<span class="cal-pill-badge" style="background:' + kitMeta.bg + ';color:' + kitMeta.color + ';">' + kitMeta.icon + ' ' + escapeHtml(kitMeta.label) + '</span>';
      }
      headerBadges.innerHTML = badgesHtml;
    }

    var eventNameEl = document.getElementById('cdm-event-name');
    if (eventNameEl) {
      eventNameEl.textContent = ev ? ev.title : 'No Official Company Parade Scheduled';
    }

    var venueEl = document.getElementById('cdm-venue-time');
    if (venueEl) {
      if (ev && ev.type !== 'noparade') {
        venueEl.innerHTML = '<span style="color:var(--accent);">🕒 ' + escapeHtml(ev.time || '1:30 PM – 6:00 PM') + '</span> &bull; <span>📍 ' + escapeHtml(ev.location || 'Trinity Methodist Church PJ') + '</span>';
      } else if (ev && ev.type === 'noparade') {
        venueEl.innerHTML = '<span style="color:var(--red);">⛔ No Parade Scheduled</span>';
      } else {
        venueEl.innerHTML = '<span style="color:var(--text-muted);">Free Weekend</span>';
      }
    }

    // Senior Section Breakdown (Matching Image 4)
    var srBox = document.getElementById('cdm-sr-schedule');
    if (srBox) {
      if (ev && ev.srDetails) {
        srBox.innerHTML = ''
          + '<div class="cal-detail-subbox">'
            + '<div class="cal-subbox-title">🎖️ Senior Section Program &amp; Badges</div>'
            + '<div style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-top:4px;">'
              + escapeHtml(ev.srDetails)
            + '</div>'
          + '</div>';
        srBox.style.display = 'block';
      } else {
        srBox.style.display = 'none';
      }
    }

    // Junior Section Breakdown (Matching Image 3)
    var jrBox = document.getElementById('cdm-jr-schedule');
    if (jrBox) {
      if (ev && ev.jrDetails) {
        jrBox.innerHTML = ''
          + '<div class="cal-detail-subbox">'
            + '<div class="cal-subbox-title">🎯 Junior Section Program &amp; Badges</div>'
            + '<div style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-top:4px;">'
              + escapeHtml(ev.jrDetails)
            + '</div>'
          + '</div>';
        jrBox.style.display = 'block';
      } else {
        jrBox.style.display = 'none';
      }
    }

    // Notes & Notices
    var notesBox = document.getElementById('cdm-notes-box');
    if (notesBox) {
      if (ev && ev.notes) {
        notesBox.innerHTML = ''
          + '<div class="cal-detail-subbox" style="border-left:3px solid var(--accent);background:rgba(234,179,8,0.08);">'
            + '<div class="cal-subbox-title" style="color:var(--accent);">📢 Important Remarks &amp; Briefings</div>'
            + '<div style="font-size:12px;color:var(--text-primary);line-height:1.5;margin-top:4px;">'
              + escapeHtml(ev.notes)
            + '</div>'
          + '</div>';
        notesBox.style.display = 'block';
      } else {
        notesBox.style.display = 'none';
      }
    }

    // Member Personal Reminders List
    renderModalPersonalReminders(targetDate);

    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    if (focusAddReminder) {
      var inputEl = document.getElementById('cdm-rem-input');
      if (inputEl) {
        inputEl.focus();
        inputEl.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }

  function closeCalendarDayModal() {
    var modal = document.getElementById('calendar-day-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  function renderModalPersonalReminders(dateStr) {
    var container = document.getElementById('cdm-personal-reminders-list');
    if (!container) return;

    var memEvents = getMemberEventsForDate(dateStr);
    if (!memEvents.length) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;font-style:italic;padding:8px 0;">No personal notes or reminders added for this day.</div>';
      return;
    }

    var html = '';
    memEvents.forEach(function(rem) {
      html += '<div class="cal-member-rem-item">'
        + '<div style="flex:1;">'
          + '<div style="font-size:13px;font-weight:600;color:var(--text-primary);display:flex;align-items:center;gap:6px;">'
            + '<span style="color:#38bdf8;">●</span> ' + escapeHtml(rem.title)
            + (rem.time ? (' <span style="font-size:11px;color:var(--text-muted);">(' + escapeHtml(rem.time) + ')</span>') : '')
          + '</div>'
          + (rem.notes ? ('<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;padding-left:14px;">' + escapeHtml(rem.notes) + '</div>') : '')
        + '</div>'
        + '<button type="button" class="portal-btn-sm portal-btn-danger" onclick="deleteModalReminder(\'' + rem.id + '\', \'' + dateStr + '\')" style="padding:3px 8px;font-size:11px;" title="Remove reminder">&times;</button>'
      + '</div>';
    });

    container.innerHTML = html;
  }

  function handleAddModalReminder() {
    var titleEl = document.getElementById('cdm-rem-input');
    var notesEl = document.getElementById('cdm-rem-notes');
    var timeEl  = document.getElementById('cdm-rem-time');

    if (!titleEl || !titleEl.value.trim()) {
      if (typeof showToast === 'function') showToast('Please enter a reminder title.');
      return;
    }

    addPersonalEvent(_selectedDateStr, titleEl.value, timeEl ? timeEl.value : '', notesEl ? notesEl.value : '');
    titleEl.value = '';
    if (notesEl) notesEl.value = '';
    if (timeEl) timeEl.value = '';

    renderModalPersonalReminders(_selectedDateStr);
    renderCalendarWidget();

    if (typeof showToast === 'function') showToast('Personal reminder added! 📌');
  }

  function deleteModalReminder(id, dateStr) {
    deletePersonalEvent(id);
    renderModalPersonalReminders(dateStr);
    renderCalendarWidget();
    if (typeof showToast === 'function') showToast('Reminder removed.');
  }

  // ── Admin Grid View & Event Form ───────────────────────────────────────────

  var _adminMonth = new Date().getMonth();
  var _adminYear  = new Date().getFullYear();

  function renderAdminCalendarGrid() {
    var container = document.getElementById('adm-calendar-grid-container');
    if (!container) return;

    var headerTitle = document.getElementById('adm-cal-month-title');
    if (headerTitle) {
      headerTitle.textContent = MONTH_NAMES[_adminMonth] + ' ' + _adminYear;
    }

    var matrix = getMonthMatrix(_adminYear, _adminMonth);
    var todayStr = formatDateKey(new Date());

    var html = ''
      + '<div class="adm-cal-table-wrap">'
        + '<div class="adm-cal-grid-header">'
          + '<div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>'
        + '</div>'
        + '<div class="adm-cal-grid-body">';

    matrix.forEach(function(cell) {
      var compEvents = getCompanyEventsForDate(cell.dateKey);
      var isToday = cell.dateKey === todayStr;

      var cellClass = 'adm-cal-cell';
      if (!cell.isCurrentMonth) cellClass += ' adm-cell-overflow';
      if (isToday) cellClass += ' adm-cell-today';
      if (compEvents.length > 0) cellClass += ' adm-cell-has-event';

      html += '<div class="' + cellClass + '" onclick="openAdminEventModal(\'' + cell.dateKey + '\')">'
        + '<div class="adm-cell-top">'
          + '<span class="adm-cell-num">' + cell.dayNumber + '</span>'
          + '<button type="button" class="adm-cell-add-btn" onclick="event.stopPropagation();openAdminEventModal(\'' + cell.dateKey + '\')" title="Add/Edit Parade">+</button>'
        + '</div>';

      compEvents.forEach(function(ev) {
        var kitMeta = KIT_BADGES[ev.kit] || { label: ev.kit, bg: 'rgba(255,255,255,0.1)', color: '#fff' };
        var typeMeta = TYPE_BADGES[ev.type] || { bg: 'rgba(234,179,8,0.15)', color: 'var(--accent)' };

        html += '<div class="adm-cell-event-pill" style="border-left:3px solid ' + typeMeta.color + ';">'
          + '<div class="adm-pill-title">' + escapeHtml(ev.title) + '</div>'
          + '<div class="adm-pill-meta">'
            + '<span class="adm-pill-kit" style="background:' + kitMeta.bg + ';color:' + kitMeta.color + ';">' + escapeHtml(kitMeta.label) + '</span>'
          + '</div>'
        + '</div>';
      });

      html += '</div>';
    });

    html += '</div></div>';
    container.innerHTML = html;
  }

  function adminNavigateMonth(offset) {
    _adminMonth += offset;
    if (_adminMonth > 11) {
      _adminMonth = 0;
      _adminYear++;
    } else if (_adminMonth < 0) {
      _adminMonth = 11;
      _adminYear--;
    }
    renderAdminCalendarGrid();
  }

  function openAdminEventModal(dateStr, eventId) {
    var modal = document.getElementById('adm-event-edit-modal');
    if (!modal) return;

    var ev = null;
    if (eventId) {
      ev = _calendarEvents.find(function(x) { return x.id === eventId; });
    } else if (dateStr) {
      var matching = getCompanyEventsForDate(dateStr);
      if (matching.length > 0) ev = matching[0];
    }

    var targetDate = ev ? ev.date : (dateStr || _selectedDateStr);

    // Populate Form fields
    document.getElementById('adm-ev-id').value       = ev ? ev.id : '';
    document.getElementById('adm-ev-date').value     = targetDate;
    document.getElementById('adm-ev-title').value    = ev ? ev.title : 'Regular Parade';
    document.getElementById('adm-ev-type').value     = ev ? (ev.type || 'parade') : 'parade';
    document.getElementById('adm-ev-kit').value      = ev ? (ev.kit || 'PT Kit') : 'PT Kit';
    document.getElementById('adm-ev-time').value     = ev ? (ev.time || '1:30 PM – 6:00 PM') : '1:30 PM – 6:00 PM';
    document.getElementById('adm-ev-loc').value      = ev ? (ev.location || 'Trinity Methodist Church PJ') : 'Trinity Methodist Church PJ';
    document.getElementById('adm-ev-sr').value       = ev ? (ev.srDetails || '') : '';
    document.getElementById('adm-ev-jr').value       = ev ? (ev.jrDetails || '') : '';
    document.getElementById('adm-ev-notes').value    = ev ? (ev.notes || '') : '';

    var delBtn = document.getElementById('adm-ev-delete-btn');
    if (delBtn) delBtn.style.display = ev ? 'inline-block' : 'none';

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeAdminEventModal() {
    var modal = document.getElementById('adm-event-edit-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  async function handleAdminSaveEvent() {
    var id       = document.getElementById('adm-ev-id').value;
    var dateVal  = document.getElementById('adm-ev-date').value;
    var titleVal = document.getElementById('adm-ev-title').value;
    var typeVal  = document.getElementById('adm-ev-type').value;
    var kitVal   = document.getElementById('adm-ev-kit').value;
    var timeVal  = document.getElementById('adm-ev-time').value;
    var locVal   = document.getElementById('adm-ev-loc').value;
    var srVal    = document.getElementById('adm-ev-sr').value;
    var jrVal    = document.getElementById('adm-ev-jr').value;
    var notesVal = document.getElementById('adm-ev-notes').value;

    if (!dateVal || !titleVal.trim()) {
      if (typeof showToast === 'function') showToast('Please enter both date and title.');
      return;
    }

    var cleanTitle = (typeof sanitizeText === 'function') ? sanitizeText(titleVal, 100) : titleVal.trim();
    var cleanSr    = (typeof sanitizeText === 'function') ? sanitizeText(srVal, 500) : srVal.trim();
    var cleanJr    = (typeof sanitizeText === 'function') ? sanitizeText(jrVal, 500) : jrVal.trim();
    var cleanNotes = (typeof sanitizeText === 'function') ? sanitizeText(notesVal, 500) : notesVal.trim();

    var eventObj = {
      id: id || ('cal-' + dateVal + '-' + Math.random().toString(36).substr(2, 4)),
      date: dateVal,
      title: cleanTitle,
      type: typeVal,
      kit: kitVal,
      time: timeVal || '1:30 PM – 6:00 PM',
      location: locVal || 'Trinity Methodist Church PJ',
      srDetails: cleanSr,
      jrDetails: cleanJr,
      notes: cleanNotes,
      updatedAt: new Date().toISOString()
    };

    var updatedList = _calendarEvents.slice();
    var idx = updatedList.findIndex(function(x) { return x.id === eventObj.id || x.date === eventObj.date; });
    if (idx >= 0) {
      updatedList[idx] = eventObj;
    } else {
      updatedList.push(eventObj);
    }

    var success = await saveCalendarEvents(updatedList);
    if (success) {
      closeAdminEventModal();
      renderAdminCalendarGrid();
      renderCalendarWidget();
      if (typeof showToast === 'function') showToast('Calendar event saved & published! 📅');
    } else {
      if (typeof showToast === 'function') showToast('Failed to save to database. Please retry.');
    }
  }

  async function handleAdminDeleteEvent() {
    var id = document.getElementById('adm-ev-id').value;
    if (!id) return;

    if (!confirm('Are you sure you want to remove this parade event from the company calendar?')) {
      return;
    }

    var updatedList = _calendarEvents.filter(function(x) { return x.id !== id; });
    var success = await saveCalendarEvents(updatedList);
    if (success) {
      closeAdminEventModal();
      renderAdminCalendarGrid();
      renderCalendarWidget();
      if (typeof showToast === 'function') showToast('Event removed from company calendar.');
    }
  }

  async function handleAdminResetToDefaultMaster() {
    if (!confirm('This will restore the authentic 2026 1st PJ Boys\' Brigade master parade schedule from the official Google Doc. Any custom manual changes will be refreshed. Continue?')) {
      return;
    }

    var defaultData = JSON.parse(JSON.stringify(DEFAULT_2026_CALENDAR));
    var success = await saveCalendarEvents(defaultData);
    if (success) {
      renderAdminCalendarGrid();
      renderCalendarWidget();
      if (typeof showToast === 'function') showToast('Restored official 2026 company master calendar! 🎖️');
    }
  }

  // ── Global Handlers for Widget UI ──────────────────────────────────────────

  function calNavigateMonth(offset) {
    _currentMonth += offset;
    if (_currentMonth > 11) {
      _currentMonth = 0;
      _currentYear++;
    } else if (_currentMonth < 0) {
      _currentMonth = 11;
      _currentYear--;
    }
    renderCalendarWidget();
  }

  function calSelectDate(dateStr) {
    _selectedDateStr = dateStr;
    var parts = dateStr.split('-');
    if (parts.length === 3) {
      _currentYear = parseInt(parts[0], 10);
      _currentMonth = parseInt(parts[1], 10) - 1;
    }
    renderCalendarWidget();
  }

  // ── Module Initialization ──────────────────────────────────────────────────

  async function initCalendarModule() {
    renderCalendarWidget();
    await loadCalendarEvents();
    loadMemberEvents();
    renderCalendarWidget();
  }

  // Attach to window
  if (typeof window !== 'undefined') {
    window.loadCalendarEvents           = loadCalendarEvents;
    window.saveCalendarEvents           = saveCalendarEvents;
    window.loadMemberEvents             = loadMemberEvents;
    window.saveMemberEvents             = saveMemberEvents;
    window.addPersonalEvent             = addPersonalEvent;
    window.deletePersonalEvent          = deletePersonalEvent;
    window.renderCalendarWidget         = renderCalendarWidget;
    window.calNavigateMonth             = calNavigateMonth;
    window.calSelectDate                = calSelectDate;
    window.openCalendarDayModal         = openCalendarDayModal;
    window.closeCalendarDayModal        = closeCalendarDayModal;
    window.handleAddModalReminder       = handleAddModalReminder;
    window.deleteModalReminder          = deleteModalReminder;
    window.renderAdminCalendarGrid      = renderAdminCalendarGrid;
    window.adminNavigateMonth           = adminNavigateMonth;
    window.openAdminEventModal          = openAdminEventModal;
    window.closeAdminEventModal         = closeAdminEventModal;
    window.handleAdminSaveEvent         = handleAdminSaveEvent;
    window.handleAdminDeleteEvent       = handleAdminDeleteEvent;
    window.handleAdminResetToDefaultMaster = handleAdminResetToDefaultMaster;
    window.initCalendarModule           = initCalendarModule;
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() { initCalendarModule(); });
    } else {
      initCalendarModule();
    }
  }

  // Export for node testing
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      DEFAULT_2026_CALENDAR: DEFAULT_2026_CALENDAR,
      loadCalendarEvents: loadCalendarEvents,
      saveCalendarEvents: saveCalendarEvents,
      loadMemberEvents: loadMemberEvents,
      saveMemberEvents: saveMemberEvents,
      addPersonalEvent: addPersonalEvent,
      deletePersonalEvent: deletePersonalEvent,
      getCompanyEventsForDate: getCompanyEventsForDate,
      getMemberEventsForDate: getMemberEventsForDate,
      getNextUpcomingParade: getNextUpcomingParade,
      getMonthMatrix: getMonthMatrix,
      renderCalendarWidget: renderCalendarWidget,
      KIT_BADGES: KIT_BADGES,
      TYPE_BADGES: TYPE_BADGES
    };
  }

})(typeof window !== 'undefined' ? window : global);
