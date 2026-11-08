/**
 * 1st Petaling Jaya Boys' Brigade Portal
 * Company Calendar & Member Personal Schedule Module
 * Pre-populated with official 2026 Master Calendar (Senior & Junior Sections)
 * Featuring 5 Dynamic Calendar Views (Upcoming, Week, Month, Year, Events)
 * and Day Schedule modal with Admin Console CRUD Synchronization
 */

(function(_global) {
  'use strict';

  // ── Authentic 2026 Company Calendar Dataset + Malaysian Public Holidays ─────
  var DEFAULT_2026_CALENDAR = [
    // January 2026
    { id: 'hol-2026-01-01', date: '2026-01-01', title: "New Year's Day (regional holiday)", type: 'holiday', kit: 'None', time: 'All day', location: 'National', srDetails: 'Public Holiday', jrDetails: 'Public Holiday', notes: 'Happy New Year 2026!' },
    { id: 'cal-2026-01-03', date: '2026-01-03', title: 'Fellowship Parade', type: 'special', kit: 'PT Kit', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Fellowship Parade & Ice-breaking', jrDetails: 'No parade', notes: 'First parade of 2026. Welcome back!' },
    { id: 'cal-2026-01-10', date: '2026-01-10', title: 'Regular Parade', type: 'parade', kit: 'PT Kit', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Target · Comp. Knowledge (A) · Soc-Entrepreneur (B) · Drill', jrDetails: 'Junior Games & Drill Introduction', notes: '' },
    { id: 'cal-2026-01-17', date: '2026-01-17', title: 'Regular Parade', type: 'parade', kit: 'PT Kit', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Comp. Knowledge (A) · Soc-Entrepreneur (B) · Drill', jrDetails: 'Junior Games & Squad Basics', notes: '' },
    { id: 'cal-2026-01-24', date: '2026-01-24', title: 'Regular Parade & Parents Briefing', type: 'parade', kit: 'PT Kit', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Target · Comp. Knowledge (A) · Soc-Entrepreneur (B) · Parents & Recruits Briefing · Drill', jrDetails: 'Junior Games · Recruits Briefing · Parents Briefing', notes: 'Parents & Recruits Welcome Briefing at 4:30 PM' },
    { id: 'hol-2026-01-31', date: '2026-01-31', title: 'Thaipusam (regional holiday)', type: 'holiday', kit: 'None', time: 'All day', location: 'Selangor & KL', srDetails: 'Public Holiday', jrDetails: 'Public Holiday', notes: 'Thaipusam State Public Holiday' },
    { id: 'cal-2026-01-31', date: '2026-01-31', title: 'Special Event (Optional)', type: 'special', kit: 'PT Kit', time: '2:15 PM – 5:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Special Event (Optional) · Squad Fellowship', jrDetails: 'No Parade (Company Break)', notes: 'Thaipusam on Jan 31' },

    // February 2026
    { id: 'hol-2026-02-01', date: '2026-02-01', title: 'Federal Territory Day (regional holiday)', type: 'holiday', kit: 'None', time: 'All day', location: 'KL & Putrajaya', srDetails: 'Public Holiday', jrDetails: 'Public Holiday', notes: 'Federal Territory Day' },
    { id: 'cal-2026-02-07', date: '2026-02-07', title: 'Regular Parade', type: 'parade', kit: 'Day Dress', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Target · Comp. Knowledge (A) · Soc-Entrepreneur (B) · Drill', jrDetails: 'JR - BB in Malaysia · Target · Badge Class 1', notes: 'Day Dress uniform inspection' },
    { id: 'hol-2026-02-14', date: '2026-02-14', title: "Valentine's Day", type: 'holiday', kit: 'None', time: 'All day', location: 'National', srDetails: 'Observance', jrDetails: 'Observance', notes: '' },
    { id: 'cal-2026-02-14', date: '2026-02-14', title: 'Chinese New Year - No Parade', type: 'noparade', kit: 'None', time: 'All Day', location: 'No Parade', srDetails: 'Chinese New Year holiday break', jrDetails: 'Chinese New Year holiday break', notes: 'Happy Chinese New Year! No parade.' },
    { id: 'hol-2026-02-17', date: '2026-02-17', title: "Chinese New Year's Day", type: 'holiday', kit: 'None', time: 'All day', location: 'National', srDetails: 'Public Holiday', jrDetails: 'Public Holiday', notes: 'Year of the Horse' },
    { id: 'hol-2026-02-18', date: '2026-02-18', title: 'Second Day of Chinese New Year (regional holiday)', type: 'holiday', kit: 'None', time: 'All day', location: 'National', srDetails: 'Public Holiday', jrDetails: 'Public Holiday', notes: 'Chinese New Year Holiday' },
    { id: 'cal-2026-02-21', date: '2026-02-21', title: 'Chinese New Year - No Parade', type: 'noparade', kit: 'None', time: 'All Day', location: 'No Parade', srDetails: 'Chinese New Year holiday break', jrDetails: 'Chinese New Year holiday break', notes: 'CNY holidays: Feb 17-18' },
    { id: 'hol-2026-02-24', date: '2026-02-24', title: 'Nuzul Al-Quran (regional holiday) (tentative)', type: 'holiday', kit: 'None', time: 'All day', location: 'Selangor & KL', srDetails: 'Public Holiday', jrDetails: 'Public Holiday', notes: '' },
    { id: 'cal-2026-02-28', date: '2026-02-28', title: 'Special Event - Half Day', type: 'special', kit: 'Drill Kit', time: '2:15 PM – 5:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Special Event - Half Day (Squad Zulu) · NO CE · Target/Drill · Board Games', jrDetails: 'JR - Morse Code · Target · Special Event', notes: 'Squad Zulu in charge' },

    // March 2026
    { id: 'cal-2026-03-07', date: '2026-03-07', title: 'Regular Parade', type: 'parade', kit: 'Day Dress', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Target · Comp. Knowledge (A) · Soc-Entrepreneur (B) · Drill', jrDetails: 'JR - BB History · Target · Badge Class 1', notes: '' },
    { id: 'cal-2026-03-14', date: '2026-03-14', title: 'Regular Parade', type: 'parade', kit: 'Day Dress', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Target · Comp. Knowledge (A) · Soc-Entrepreneur (B) · Drill', jrDetails: 'JR - Morse Code · Target · Badge Class 1', notes: '' },
    { id: 'hol-2026-03-20', date: '2026-03-20', title: 'Hari Raya Puasa (tentative)', type: 'holiday', kit: 'None', time: 'All day', location: 'National', srDetails: 'Public Holiday', jrDetails: 'Public Holiday', notes: 'Hari Raya Aidilfitri Day 1' },
    { id: 'hol-2026-03-21', date: '2026-03-21', title: 'Hari Raya Puasa Holiday Day 2 (tentative)', type: 'holiday', kit: 'None', time: 'All day', location: 'National', srDetails: 'Public Holiday', jrDetails: 'Public Holiday', notes: 'Hari Raya Aidilfitri Day 2' },
    { id: 'cal-2026-03-21', date: '2026-03-21', title: '4 in 1 State Camp (20–22 Mar)', type: 'camp', kit: 'Drill Kit', time: 'Full Weekend', location: 'State Camp Site', srDetails: '4 in 1 State Camp (20-22 March)', jrDetails: 'JR - Bootcamp · 4 in 1 State Camp (20-22)', notes: 'Hari Raya Aidilfitri on Mar 21-22' },
    { id: 'cal-2026-03-28', date: '2026-03-28', title: 'Special Event - Half Day', type: 'special', kit: 'PT Kit', time: '2:15 PM – 5:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Special Event - Half Day (Squad Alpha) · NO CE · Target Test / Drill · Intersquad Sports', jrDetails: 'JR - Morse Code Test · Target Test · Special Event', notes: 'Squad Alpha in charge' },

    // April 2026
    { id: 'hol-2026-04-03', date: '2026-04-03', title: 'Good Friday (regional holiday)', type: 'holiday', kit: 'None', time: 'All day', location: 'Observance', srDetails: 'Good Friday Service', jrDetails: 'Good Friday Service', notes: 'Blessed Good Friday' },
    { id: 'cal-2026-04-04', date: '2026-04-04', title: 'Easter - No Parade', type: 'noparade', kit: 'None', time: 'All Day', location: 'No Parade', srDetails: 'Easter Weekend - No Parade', jrDetails: 'Easter Weekend - No Parade', notes: 'Blessed Easter!' },
    { id: 'hol-2026-04-05', date: '2026-04-05', title: 'Easter Sunday', type: 'holiday', kit: 'None', time: 'All day', location: 'Trinity Methodist Church PJ', srDetails: 'Easter Sunrise & Morning Services', jrDetails: 'Easter Celebration', notes: 'Christ is Risen!' },
    { id: 'cal-2026-04-11', date: '2026-04-11', title: 'Regular Parade', type: 'parade', kit: 'Day Dress', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · First Aid (B) · Campers (B+A) · Drill', jrDetails: 'JR - BB Recruitment · Badge Class 2', notes: 'Stage 2 Badge Classes commence' },
    { id: 'cal-2026-04-18', date: '2026-04-18', title: 'Regular Parade', type: 'parade', kit: 'Drill Kit', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · First Aid (B) · Campers (B+A) · Drill', jrDetails: 'JR - Sports · Badge Class 2', notes: '' },
    { id: 'cal-2026-04-25', date: '2026-04-25', title: 'Rank Exchange Parade', type: 'parade', kit: 'PT Kit', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'RANK EXCHANGE · Worship · CE · First Aid (B) · Campers (B+A) · Drill', jrDetails: 'JR - Sports · Badge Class 2', notes: 'Annual Senior Section Rank Exchange' },

    // May 2026
    { id: 'hol-2026-05-01', date: '2026-05-01', title: 'Labour Day', type: 'holiday', kit: 'None', time: 'All day', location: 'National', srDetails: 'Public Holiday', jrDetails: 'Public Holiday', notes: "Workers' Day" },
    { id: 'cal-2026-05-02', date: '2026-05-02', title: 'Labour Day / Wesak - No Parade', type: 'noparade', kit: 'None', time: 'All Day', location: 'No Parade', srDetails: 'Wesak Day / Labour Day Holiday - No Parade', jrDetails: 'JR - Junior Leadership Training (1-3) - No Parade', notes: 'Labour Day: May 1, Wesak: May 31' },
    { id: 'cal-2026-05-09', date: '2026-05-09', title: 'BCM (8–10 May) - No Parade', type: 'noparade', kit: 'Day Dress', time: 'All Day', location: 'BCM Center', srDetails: "Boys' Brigade Council Meeting (BCM 8-10 May) - No Parade", jrDetails: 'BCM (8-10 May) - No Parade', notes: 'Officers attending national council meeting' },
    { id: 'cal-2026-05-16', date: '2026-05-16', title: 'Regular Parade', type: 'parade', kit: 'Drill Kit', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · First Aid (B) · Campers (B+A) · Drill', jrDetails: "JR - Mother's Day Crafts · Badge Class 2", notes: "Mother's Day celebration" },
    { id: 'cal-2026-05-23', date: '2026-05-23', title: 'Special Event - Half Day', type: 'special', kit: 'PT Kit', time: '2:15 PM – 5:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Special Event - Half Day (Squad Papa) · NO CE · Drill · Intersquad Sports', jrDetails: 'JR - Sports Outing · Special Event', notes: 'Squad Papa in charge' },
    { id: 'cal-2026-05-30', date: '2026-05-30', title: '1st PJ Company Camp (30 May – 1 Jun)', type: 'camp', kit: 'PT Kit', time: 'Full Weekend', location: 'Company Campsite', srDetails: 'Company Camp / Family Outing (30-31 May)', jrDetails: 'JR - Company Camp (30 May - 1 June)', notes: 'Annual Company Camp for all members and families' },
    { id: 'hol-2026-05-31', date: '2026-05-31', title: 'Wesak Day', type: 'holiday', kit: 'None', time: 'All day', location: 'National', srDetails: 'Public Holiday', jrDetails: 'Public Holiday', notes: 'Wesak Day' },

    // June 2026
    { id: 'hol-2026-06-01', date: '2026-06-01', title: "Agong's Birthday", type: 'holiday', kit: 'None', time: 'All day', location: 'National', srDetails: 'Public Holiday', jrDetails: 'Public Holiday', notes: "King's Official Birthday" },
    { id: 'cal-2026-06-06', date: '2026-06-06', title: 'Regular Parade', type: 'parade', kit: 'Day Dress', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · First Aid (B) · Campers (B+A) · Drill', jrDetails: "JR - Respect & Obedience · Drill Assessment · Badge Class 2", notes: "Agong's Birthday on Jun 1" },
    { id: 'cal-2026-06-13', date: '2026-06-13', title: 'Regular Parade', type: 'parade', kit: 'Day Dress', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · First Aid (B) · Campers (B+A) · Drill', jrDetails: 'JR - Respect & Obedience · Badge Class 2', notes: '' },
    { id: 'hol-2026-06-17', date: '2026-06-17', title: 'Awal Muharram', type: 'holiday', kit: 'None', time: 'All day', location: 'National', srDetails: 'Public Holiday', jrDetails: 'Public Holiday', notes: 'Islamic New Year' },
    { id: 'cal-2026-06-20', date: '2026-06-20', title: 'Enrolment Rehearsal', type: 'ceremonial', kit: 'Drill Kit', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church Sanctuary', srDetails: 'NO CE · BBGB Enrolment Full Rehearsal', jrDetails: "JR - Father's Day Craft · Enrolment Rehearsal", notes: 'Enrolment Service full walkthrough' },
    { id: 'cal-2026-06-27', date: '2026-06-27', title: 'Enrolment Final Rehearsal', type: 'ceremonial', kit: 'PT Kit', time: '2:15 PM – 5:30 PM', location: 'Trinity Methodist Church Sanctuary', srDetails: 'NO CE · BBGB Enrolment Rehearsal', jrDetails: 'JR - BBGB Enrolment Rehearsal', notes: 'Final rehearsal before Sunday ceremony' },
    { id: 'cal-2026-06-28', date: '2026-06-28', title: 'ENROLMENT SUNDAY', type: 'ceremonial', kit: 'Ceremonial', time: '8:30 AM – 1:00 PM', location: 'Trinity Methodist Church Sanctuary', srDetails: 'Company Enrolment Service & Dedication Ceremony', jrDetails: 'Company Enrolment Service & Dedication Ceremony', notes: 'Mandatory Full Ceremonial Kit for all members and officers' },

    // July 2026
    { id: 'cal-2026-07-04', date: '2026-07-04', title: 'Regular Parade & NCO Stayover', type: 'parade', kit: 'PT Kit', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'SSDC Practice and NCO Stayover (4-5 July)', jrDetails: 'JR - Photo Session · CE Assessment', notes: 'Senior NCO stayover on Saturday evening' },
    { id: 'cal-2026-07-11', date: '2026-07-11', title: 'SSDC at KSL Sports Puchong - No Parade', type: 'noparade', kit: 'Day Dress', time: '8:00 AM – 4:00 PM', location: 'KSL Sports Puchong', srDetails: 'SSDC at KSL Sports Puchong - No Regular Parade', jrDetails: 'JR - SSDC Prep & NCO Stayover', notes: 'State Sports & Drill Competition' },
    { id: 'cal-2026-07-18', date: '2026-07-18', title: 'Regular Parade', type: 'parade', kit: 'Drill Kit', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Safety (B) · Nature Awareness (B) · Drill', jrDetails: 'JR - Fire & Rescue · Badge Class 3', notes: 'Badge Class 3 syllabus starts' },
    { id: 'cal-2026-07-25', date: '2026-07-25', title: 'Campers & Expedition Assessment Camp', type: 'camp', kit: 'Drill Kit', time: 'Full Day / Overnight', location: 'Camp Site', srDetails: 'NO CE · Campers & Expedition Assessment Camp', jrDetails: 'JR - Fire & Rescue Outing', notes: 'Practical field assessment for Campers badge' },

    // August 2026
    { id: 'cal-2026-08-01', date: '2026-08-01', title: 'Mid-Year Recess - No Parade', type: 'noparade', kit: 'None', time: 'All Day', location: 'No Parade', srDetails: 'Mid-year Company Recess - No Parade', jrDetails: 'Mid-year Company Recess - No Parade', notes: 'Enjoy your rest!' },
    { id: 'cal-2026-08-08', date: '2026-08-08', title: 'Regular Parade', type: 'parade', kit: 'Day Dress', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Safety (B) · Nature Awareness (B) · Drill', jrDetails: 'JR - Road Safety · Badge Class 3', notes: '' },
    { id: 'cal-2026-08-15', date: '2026-08-15', title: 'Regular Parade', type: 'parade', kit: 'Drill Kit', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Safety (B) · Nature Awareness (B) · Drill', jrDetails: 'JR - Road Safety · Badge Class 3', notes: '' },
    { id: 'cal-2026-08-22', date: '2026-08-22', title: 'Regular Parade & Outing', type: 'parade', kit: 'PT Kit', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Safety (B) · Nature Awareness (B) · Drill', jrDetails: 'JR - Road Safety Outing · Badge Class 3', notes: '' },
    { id: 'cal-2026-08-29', date: '2026-08-29', title: 'Drill Camp (Optional)', type: 'special', kit: 'Drill Kit', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Special Event (Optional) / Drill Camp', jrDetails: 'JR - No Parade (National Day weekend)', notes: 'National Day (Merdeka) on Aug 31' },
    { id: 'hol-2026-08-31', date: '2026-08-31', title: 'National Day (Merdeka)', type: 'holiday', kit: 'None', time: 'All day', location: 'National', srDetails: 'Public Holiday', jrDetails: 'Public Holiday', notes: 'Hari Kebangsaan Malaysia' },

    // September 2026
    { id: 'cal-2026-09-05', date: '2026-09-05', title: 'Regular Parade & Photo Session', type: 'parade', kit: 'Day Dress', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Photo Session · Safety (B) · Nature Awareness (B) · Drill', jrDetails: 'JR - Merdeka Craft · Badge Class 3 · Photo Session', notes: 'Annual squad & platoon official photography' },
    { id: 'cal-2026-09-12', date: '2026-09-12', title: 'Regular Parade', type: 'parade', kit: 'Day Dress', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Safety (B) · Nature Awareness (B) · Drill Theory (B+A)', jrDetails: 'JR - Nature Awareness · Badge Class 3', notes: '' },
    { id: 'hol-2026-09-16', date: '2026-09-16', title: 'Malaysia Day', type: 'holiday', kit: 'None', time: 'All day', location: 'National', srDetails: 'Public Holiday', jrDetails: 'Public Holiday', notes: 'Hari Malaysia' },
    { id: 'cal-2026-09-19', date: '2026-09-19', title: 'Regular Parade', type: 'parade', kit: 'Drill Kit', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Safety (B) · Nature Awareness (B) · Drill Theory (B+A)', jrDetails: 'JR - Nature Awareness · Badge Class 3 · Drill Theory', notes: '' },
    { id: 'hol-2026-09-25', date: '2026-09-25', title: 'Maulidur Rasul', type: 'holiday', kit: 'None', time: 'All day', location: 'National', srDetails: 'Public Holiday', jrDetails: 'Public Holiday', notes: "Prophet Muhammad's Birthday" },
    { id: 'cal-2026-09-26', date: '2026-09-26', title: 'Career Talk with BB Alumni', type: 'special', kit: 'PT Kit', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'NO CE · Career Talk with BB Alumni · Special Event (Officers)', jrDetails: 'JR - Nature Awareness Outing · Special Event', notes: 'BB Alumni career mentoring & sharing session' },

    // October 2026
    { id: 'cal-2026-10-03', date: '2026-10-03', title: "SELANGOR STATE FOUNDER'S DAY", type: 'ceremonial', kit: 'Ceremonial', time: '8:00 AM – 2:00 PM', location: 'State Assembly Grounds', srDetails: "Selangor State Founder's Day Celebration & Parade", jrDetails: "Selangor State Founder's Day Celebration", notes: 'State-level ceremonial gathering' },
    { id: 'cal-2026-10-10', date: '2026-10-10', title: 'Planning Retreat - No Parade', type: 'noparade', kit: 'None', time: 'All Day', location: 'Retreat Center', srDetails: 'Planning Retreat (9-11 Oct) - No Parade', jrDetails: 'Planning Retreat (9-11 Oct) - No Parade', notes: 'Officers and NCO planning weekend' },
    { id: 'cal-2026-10-17', date: '2026-10-17', title: 'Regular Parade & Hobbies Showcase', type: 'parade', kit: 'Drill Kit', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Arts, Crafts, Hobbies Presentation · Drill Theory (B+A)', jrDetails: 'PJR - Safe Touch · JR - BGR · SR - Award Assessment, Drill Theory', notes: '' },
    { id: 'cal-2026-10-24', date: '2026-10-24', title: 'Regular Parade', type: 'parade', kit: 'PT Kit', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Safety (A) · Drill Theory (B+A)', jrDetails: 'PJR - Safe Touch · JR - BGR · Safety, Drill Theory', notes: '' },
    { id: 'cal-2026-10-31', date: '2026-10-31', title: 'Athletics & Drill Commanding', type: 'parade', kit: 'Day Dress', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'No Standard Parade · Athletics + Drill Commanding (B+A)', jrDetails: 'JR - Drill Assessments', notes: 'End-of-year practical badges assessment' },

    // November 2026
    { id: 'cal-2026-11-07', date: '2026-11-07', title: 'Regular Parade & Awards Submission', type: 'parade', kit: 'Day Dress', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Worship · CE · Awards Submission Review', jrDetails: 'JR - Drill & CE Assessment · Awards Submission', notes: 'Deepavali on Nov 8' },
    { id: 'hol-2026-11-08', date: '2026-11-08', title: 'Diwali (regional holiday)', type: 'holiday', kit: 'None', time: 'All day', location: 'National', srDetails: 'Deepavali Public Holiday', jrDetails: 'Deepavali Public Holiday', notes: 'Happy Deepavali / Diwali!' },
    { id: 'cal-2026-11-14', date: '2026-11-14', title: 'Brigade Officers Retreat - No Parade', type: 'noparade', kit: 'None', time: 'All Day', location: 'Retreat Center', srDetails: 'Brigade Officers Retreat - No Parade', jrDetails: 'Brigade Officers Retreat - No Parade', notes: 'Officers retreat weekend' },
    { id: 'cal-2026-11-21', date: '2026-11-21', title: 'Regular Parade & Re-assessments', type: 'parade', kit: 'Drill Kit', time: '2:15 PM – 6:00 PM', location: 'Trinity Methodist Church PJ', srDetails: 'Senior Badges & Awards Application Submission', jrDetails: 'JR - Re-assessments · Awards Application Submission', notes: 'Final deadline for all badge claims' },
    { id: 'cal-2026-11-28', date: '2026-11-28', title: 'Awards Day Preparation', type: 'special', kit: 'PT Kit', time: '2:15 PM – 5:30 PM', location: 'Trinity Methodist Church Hall', srDetails: 'Awards Day Rehearsal & Setup', jrDetails: 'JR - Awards Day Prep & Rehearsal', notes: 'Setup for Christmas Party & Awards Ceremony' },

    // December 2026
    { id: 'cal-2026-12-05', date: '2026-12-05', title: '1ST PJ AWARDS DAY & CHRISTMAS PARTY', type: 'ceremonial', kit: 'Day Dress', time: '2:00 PM – 7:30 PM', location: 'Trinity Methodist Church Grand Hall', srDetails: 'Annual Company Awards Ceremony, Rank Promotions & Christmas Celebration', jrDetails: 'Junior Section Awards Presentation & Christmas Celebration', notes: 'Annual Company celebration with parents, alumni and friends!' },
    { id: 'hol-2026-12-11', date: '2026-12-11', title: "Sultan of Selangor's Birthday", type: 'holiday', kit: 'None', time: 'All day', location: 'Selangor', srDetails: 'State Public Holiday', jrDetails: 'State Public Holiday', notes: "Official Birthday of HRH The Sultan of Selangor" },
    { id: 'hol-2026-12-24', date: '2026-12-24', title: 'Christmas Eve', type: 'holiday', kit: 'None', time: 'All day', location: 'Trinity Methodist Church PJ', srDetails: 'Christmas Eve Candlelight Service', jrDetails: 'Christmas Eve Candlelight Service', notes: 'Christmas Eve Candlelight Service at TMCPJ' },
    { id: 'hol-2026-12-25', date: '2026-12-25', title: 'Christmas Day', type: 'holiday', kit: 'None', time: 'All day', location: 'National', srDetails: 'Christmas Day Celebration', jrDetails: 'Christmas Day Celebration', notes: 'Merry Christmas!' },
    { id: 'hol-2026-12-31', date: '2026-12-31', title: "New Year's Eve", type: 'holiday', kit: 'None', time: 'All day', location: 'National', srDetails: "New Year's Eve Watchnight Service", jrDetails: "New Year's Eve Watchnight Service", notes: 'Farewell 2026, Welcome 2027!' }
  ];

  // ── Module State ───────────────────────────────────────────────────────────
  var _calendarEvents   = JSON.parse(JSON.stringify(DEFAULT_2026_CALENDAR));
  var _memberReminders  = [];
  var _calendarViewMode = 'upcoming'; // 'upcoming' | 'week' | 'month' | 'year' | 'events'
  var _calendarDate     = new Date();
  var _currentMonth     = _calendarDate.getMonth();
  var _currentYear      = _calendarDate.getFullYear();
  var _selectedDateStr  = formatDateKey(_calendarDate);

  function formatDateKey(dateObj) {
    var d = (dateObj instanceof Date) ? dateObj : new Date(dateObj);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  // ── Kit & Type Metadata ────────────────────────────────────────────────────
  var KIT_BADGES = {
    'PT Kit':     { label: 'PT Kit',      color: 'var(--green)',          bg: 'rgba(16,185,129,0.14)', icon: '🥋' },
    'Day Dress':  { label: 'Day Dress',   color: 'var(--blue)',           bg: 'rgba(59,130,246,0.14)', icon: '👔' },
    'Drill Kit':  { label: 'Drill Kit',   color: 'var(--accent)',         bg: 'var(--accent-soft)',    icon: '🎖️' },
    'Ceremonial': { label: 'Ceremonial',  color: 'var(--purple)',         bg: 'rgba(168,85,247,0.14)', icon: '🏅' },
    'Casual':     { label: 'Casual',      color: 'var(--text-secondary)', bg: 'var(--surface-tint)',   icon: '👕' },
    'None':       { label: 'No Kit',      color: 'var(--text-muted)',     bg: 'var(--surface-tint)',   icon: '—' }
  };

  var TYPE_BADGES = {
    'parade':     { label: 'Regular Parade',   color: '#22c55e', bg: 'rgba(34,197,94,0.16)',   border: 'rgba(34,197,94,0.4)',  dot: '#22c55e' },
    'noparade':   { label: 'No Parade',        color: '#ef4444', bg: 'rgba(239,68,68,0.16)',  border: 'rgba(239,68,68,0.4)',  dot: '#ef4444' },
    'special':    { label: 'Special Event',    color: '#eab308', bg: 'rgba(234,179,8,0.18)',  border: 'rgba(234,179,8,0.4)',  dot: '#eab308' },
    'camp':       { label: 'Camp / Outing',    color: '#06b6d4', bg: 'rgba(6,182,212,0.16)',  border: 'rgba(6,182,212,0.4)',  dot: '#06b6d4' },
    'ceremonial': { label: 'Ceremonial',       color: '#a855f7', bg: 'rgba(168,85,247,0.16)', border: 'rgba(168,85,247,0.4)', dot: '#a855f7' },
    'holiday':    { label: 'Public Holiday',   color: '#16a34a', bg: 'rgba(22,163,74,0.18)',  border: 'rgba(22,163,74,0.5)',  dot: '#16a34a' }
  };

  // ── Role Authorization Check ───────────────────────────────────────────────
  function isCalendarAdmin() {
    if (typeof RBAC !== 'undefined') {
      if (typeof RBAC.isSuperAdmin === 'function' && RBAC.isSuperAdmin()) return true;
      if (typeof RBAC.isAdmin === 'function' && RBAC.isAdmin()) return true;
      if (typeof RBAC.hasPermission === 'function' && RBAC.hasPermission('admin')) return true;
    }
    if (typeof sessionGet === 'function') {
      var role = (sessionGet('role') || '').toLowerCase();
      if (role === 'admin' || role === 'superadmin' || role === 'officer' || role === 'captain') return true;
      var rank = (sessionGet('rank') || '').toLowerCase();
      if (rank.includes('officer') || rank.includes('captain') || rank.includes('lieutenant') || rank.includes('chaplain')) return true;
    }
    return false;
  }

  // ── Supabase & Storage Persistence ─────────────────────────────────────────

  async function loadCalendarEvents() {
    try {
      var client = (typeof getSupaClient === 'function') ? getSupaClient() : ((typeof window !== 'undefined' && window.getSupaClient) ? window.getSupaClient() : (typeof supa !== 'undefined' ? supa : (typeof window !== 'undefined' ? window.supa : null)));
      if (client && typeof client.get === 'function') {
        var rows = await client.get('bb_config?key=eq.bb_company_calendar&select=value');
        if (rows && rows.length && rows[0].value) {
          var parsed = (typeof rows[0].value === 'string') ? JSON.parse(rows[0].value) : rows[0].value;
          if (Array.isArray(parsed) && parsed.length > 0) {
            _calendarEvents = parsed;
            try {
              localStorage.setItem('bb_company_calendar_cache', JSON.stringify(parsed));
            } catch (_) {}
            return _calendarEvents;
          }
        }
      }
    } catch (e) {
      console.warn('loadCalendarEvents error:', e);
    }

    try {
      var cached = localStorage.getItem('bb_company_calendar_cache');
      if (cached) {
        var cParsed = JSON.parse(cached);
        if (Array.isArray(cParsed) && cParsed.length > 0) {
          _calendarEvents = cParsed;
          return _calendarEvents;
        }
      }
    } catch (_) {}

    _calendarEvents = JSON.parse(JSON.stringify(DEFAULT_2026_CALENDAR));
    return _calendarEvents;
  }

  async function saveCalendarEvents(eventsArray) {
    if (!Array.isArray(eventsArray)) return false;
    _calendarEvents = eventsArray;
    try {
      localStorage.setItem('bb_company_calendar_cache', JSON.stringify(eventsArray));
    } catch (_) {}

    try {
      var client = (typeof getSupaClient === 'function') ? getSupaClient() : ((typeof window !== 'undefined' && window.getSupaClient) ? window.getSupaClient() : (typeof supa !== 'undefined' ? supa : (typeof window !== 'undefined' ? window.supa : null)));
      if (client && typeof client.upsert === 'function') {
        await client.upsert('bb_config', {
          key: 'bb_company_calendar',
          value: JSON.stringify(eventsArray),
          updated_at: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn('saveCalendarEvents error:', e);
      return false;
    }
    return true;
  }

  // ── Member Personal Reminders Persistence ──────────────────────────────────

  function getMemberStorageKey() {
    var userKey = 'guest';
    if (typeof sessionGet === 'function') {
      userKey = sessionGet('email') || sessionGet('ic') || 'guest';
    }
    return 'bb_member_reminders_' + userKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function loadMemberEvents() {
    try {
      var raw = localStorage.getItem(getMemberStorageKey());
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          _memberReminders = parsed;
          return _memberReminders;
        }
      }
    } catch (_) {}
    _memberReminders = [];
    return _memberReminders;
  }

  function saveMemberEvents(remindersArray) {
    _memberReminders = remindersArray || [];
    try {
      localStorage.setItem(getMemberStorageKey(), JSON.stringify(_memberReminders));
    } catch (_) {}

    (async function() {
      try {
        var userKey = (typeof sessionGet === 'function') ? (sessionGet('email') || sessionGet('ic')) : null;
        if (!userKey) return;
        var client = (typeof supa !== 'undefined' ? supa : (typeof getSupa === 'function' ? getSupa() : null));
        if (client && typeof client.upsert === 'function') {
          var safeKey = 'bb_member_reminders_' + userKey.replace(/[^a-zA-Z0-9_-]/g, '_');
          await client.upsert('bb_config', {
            key: safeKey,
            value: JSON.stringify(_memberReminders),
            updated_at: new Date().toISOString()
          });
        }
      } catch (_) {}
    })();

    return true;
  }

  async function fetchRemoteMemberEvents() {
    var userKey = (typeof sessionGet === 'function') ? (sessionGet('email') || sessionGet('ic')) : null;
    if (!userKey) return _memberReminders;

    var storageKey = getMemberStorageKey();
    var configKey  = 'bb_member_reminders_' + userKey.replace(/[^a-zA-Z0-9_-]/g, '_');

    try {
      var client = (typeof supa !== 'undefined' ? supa : (typeof getSupa === 'function' ? getSupa() : null));
      if (!client || typeof client.get !== 'function') return _memberReminders;

      var rows = await client.get('bb_config?key=eq.' + encodeURIComponent(configKey) + '&select=value');
      if (rows && rows.length && rows[0].value) {
        var remote = (typeof rows[0].value === 'string') ? JSON.parse(rows[0].value) : rows[0].value;
        if (Array.isArray(remote)) {
          var existingMap = {};
          loadMemberEvents();
          _memberReminders.forEach(function(r) { if (r && r.id) existingMap[r.id] = r; });
          remote.forEach(function(r) { if (r && r.id) existingMap[r.id] = r; });
          _memberReminders = Object.values(existingMap);
          try {
            localStorage.setItem(storageKey, JSON.stringify(_memberReminders));
          } catch (_) {}
          if (typeof renderCalendarWidget === 'function') renderCalendarWidget();
        }
      }
    } catch (e) {
      console.warn('fetchRemoteMemberEvents error:', e);
    }
    return _memberReminders;
  }

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
      if (evDate >= refDate && sorted[i].type !== 'noparade' && sorted[i].type !== 'holiday') {
        return sorted[i];
      }
    }
    return sorted.find(function(s) { return s.type !== 'noparade' && s.type !== 'holiday'; }) || sorted[0];
  }

  function getNextUpcomingEvent(fromDateStr) {
    var refDate = fromDateStr ? new Date(fromDateStr) : new Date();
    refDate.setHours(0, 0, 0, 0);

    var sorted = _calendarEvents.slice().sort(function(a, b) {
      return a.date.localeCompare(b.date);
    });

    for (var i = 0; i < sorted.length; i++) {
      var evDate = new Date(sorted[i].date + 'T00:00:00');
      if (evDate >= refDate) {
        return sorted[i];
      }
    }
    return sorted[0];
  }

  function getUpcomingEventsList(fromDateStr, count) {
    var maxCount = count || 4;
    var refDate = fromDateStr ? new Date(fromDateStr) : new Date();
    refDate.setHours(0, 0, 0, 0);

    var sorted = _calendarEvents.slice().sort(function(a, b) {
      return a.date.localeCompare(b.date);
    });

    var results = [];
    for (var i = 0; i < sorted.length; i++) {
      var evDate = new Date(sorted[i].date + 'T00:00:00');
      if (evDate >= refDate) {
        results.push(sorted[i]);
        if (results.length >= maxCount) break;
      }
    }
    return results;
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

  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var DAY_SHORT_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  function getMonthMatrix(year, month) {
    var firstDay = new Date(year, month, 1).getDay();
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

    // Next month filler
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

  function getWeekDays(dateObj) {
    var d = (dateObj instanceof Date) ? new Date(dateObj) : new Date();
    d.setHours(0, 0, 0, 0);
    var dayOfWeek = d.getDay(); // 0 is Sunday
    var sunday = new Date(d);
    sunday.setDate(d.getDate() - dayOfWeek);

    var days = [];
    for (var i = 0; i < 7; i++) {
      var cur = new Date(sunday);
      cur.setDate(sunday.getDate() + i);
      days.push({
        date: cur,
        dateKey: formatDateKey(cur),
        dayName: DAY_SHORT_NAMES[i],
        dayFullName: DAY_NAMES[i],
        dayNumber: cur.getDate(),
        isToday: formatDateKey(cur) === formatDateKey(new Date())
      });
    }
    return days;
  }

  // ── Standard Default Parade Rundown ────────────────────────────────────────
  var DEFAULT_PARADE_RUNDOWN = [
    { time: '9:30 AM – 11:30 AM', title: 'Band', desc: 'Sectional & full band rehearsal (Brass, Woodwinds, Percussion)', icon: 'band' },
    { time: '1:30 PM – 2:15 PM', title: 'Lunch', desc: 'Band members rest & lunch break', icon: 'lunch' },
    { time: '2:15 PM – 2:30 PM', title: 'Fall-in', desc: 'Company roll call, squad muster & uniform inspection', icon: 'fallin' },
    { time: '2:30 PM – 3:00 PM', title: 'Worship', desc: 'Praise, worship & opening prayer', icon: 'worship' },
    { time: '3:00 PM – 4:00 PM', title: 'Christian Education', desc: 'Biblical teachings & squad discussions', icon: 'ce' },
    { time: '4:00 PM – 5:00 PM', title: 'Badge Class', desc: 'Target & proficiency badge curriculum', icon: 'badge' },
    { time: '5:00 PM – 5:45 PM', title: 'Drill', desc: 'Squad drill movements, foot drill & marching commands', icon: 'drill' },
    { time: '5:45 PM', title: 'Dismissal', desc: 'Final announcements, vespers & dismissal', icon: 'dismissal' }
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // MASTER CALENDAR TAB CONTROLLER & 5-VIEW SYSTEM
  // ═══════════════════════════════════════════════════════════════════════════

  function switchCalendarView(viewMode) {
    if (['upcoming', 'week', 'month', 'year', 'events'].indexOf(viewMode) !== -1) {
      _calendarViewMode = viewMode;
    }
    renderCalendarTab();
  }

  function calNavigate(offset) {
    if (_calendarViewMode === 'week') {
      _calendarDate.setDate(_calendarDate.getDate() + (offset * 7));
      _currentMonth = _calendarDate.getMonth();
      _currentYear  = _calendarDate.getFullYear();
    } else if (_calendarViewMode === 'year') {
      _calendarDate.setFullYear(_calendarDate.getFullYear() + offset);
      _currentYear = _calendarDate.getFullYear();
    } else {
      // Month, upcoming, events
      _calendarDate.setMonth(_calendarDate.getMonth() + offset);
      _currentMonth = _calendarDate.getMonth();
      _currentYear  = _calendarDate.getFullYear();
    }
    renderCalendarTab();
  }

  function calJumpToday() {
    _calendarDate    = new Date();
    _currentMonth    = _calendarDate.getMonth();
    _currentYear     = _calendarDate.getFullYear();
    _selectedDateStr = formatDateKey(_calendarDate);
    renderCalendarTab();
  }

  function calStepDay(direction) {
    var cur = new Date(_selectedDateStr + 'T00:00:00');
    cur.setDate(cur.getDate() + direction);
    var nextStr = formatDateKey(cur);
    openCalendarDayModal(nextStr);
  }

  /**
   * Main entry point to render the entire Calendar Hub inside #tasks-no-dept
   */
  function renderCalendarTab(requestedMode) {
    var container = document.getElementById('tasks-no-dept');
    if (!container) return;

    if (requestedMode && ['upcoming', 'week', 'month', 'year', 'events'].indexOf(requestedMode) !== -1) {
      _calendarViewMode = requestedMode;
    }

    loadMemberEvents();

    var isAdmin = isCalendarAdmin();
    var dateTitle = '';
    if (_calendarViewMode === 'week') {
      var weekDays = getWeekDays(_calendarDate);
      var wStart = weekDays[0].date;
      var wEnd = weekDays[6].date;
      var startMon = MONTH_SHORT_NAMES[wStart.getMonth()];
      var endMon = MONTH_SHORT_NAMES[wEnd.getMonth()];
      if (startMon === endMon) {
        dateTitle = wStart.getDate() + ' – ' + wEnd.getDate() + ' ' + startMon + ' ' + wEnd.getFullYear();
      } else {
        dateTitle = wStart.getDate() + ' ' + startMon + ' – ' + wEnd.getDate() + ' ' + endMon + ' ' + wEnd.getFullYear();
      }
    } else if (_calendarViewMode === 'year') {
      dateTitle = String(_currentYear);
    } else if (_calendarViewMode === 'events') {
      dateTitle = MONTH_NAMES[_currentMonth] + ' ' + _currentYear + ' – Forward';
    } else {
      // Month & Upcoming
      dateTitle = MONTH_NAMES[_currentMonth] + ' ' + _currentYear;
    }

    var html = ''
      + '<div class="cal-hub-container">'
        // ── Top Header Toolbar ──
        + '<div class="cal-hub-header">'
          + '<div class="cal-hub-title-block">'
            + '<div style="display:flex;align-items:center;gap:10px;">'
              + '<span class="cal-hub-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>'
              + '<div>'
                + '<div class="cal-hub-title">Company Calendar</div>'
                + '<div class="cal-hub-sub">Saturdays &bull; Trinity Methodist Church PJ (TMCPJ)</div>'
              + '</div>'
            + '</div>'
          + '</div>'

          // ── View Switcher Segmented Control ──
          + '<div class="cal-view-switcher" role="tablist">'
            + '<button type="button" class="cal-view-tab ' + (_calendarViewMode === 'upcoming' ? 'active' : '') + '" onclick="switchCalendarView(\'upcoming\')" role="tab" aria-selected="' + (_calendarViewMode === 'upcoming') + '">Upcoming</button>'
            + '<button type="button" class="cal-view-tab ' + (_calendarViewMode === 'week' ? 'active' : '') + '" onclick="switchCalendarView(\'week\')" role="tab" aria-selected="' + (_calendarViewMode === 'week') + '">Week</button>'
            + '<button type="button" class="cal-view-tab ' + (_calendarViewMode === 'month' ? 'active' : '') + '" onclick="switchCalendarView(\'month\')" role="tab" aria-selected="' + (_calendarViewMode === 'month') + '">Month</button>'
            + '<button type="button" class="cal-view-tab ' + (_calendarViewMode === 'year' ? 'active' : '') + '" onclick="switchCalendarView(\'year\')" role="tab" aria-selected="' + (_calendarViewMode === 'year') + '">Year</button>'
            + '<button type="button" class="cal-view-tab ' + (_calendarViewMode === 'events' ? 'active' : '') + '" onclick="switchCalendarView(\'events\')" role="tab" aria-selected="' + (_calendarViewMode === 'events') + '">Events</button>'
          + '</div>'
        + '</div>'

        // ── Date Navigation & Action Subbar ──
        + '<div class="cal-nav-toolbar">'
          + '<div class="cal-nav-controls">'
            + '<button type="button" class="portal-btn-sm portal-btn-secondary" onclick="calJumpToday()" style="font-weight:600;padding:5px 12px;">Today</button>'
            + '<button type="button" class="cal-nav-arrow" onclick="calNavigate(-1)" title="Previous">&lsaquo;</button>'
            + '<button type="button" class="cal-nav-arrow" onclick="calNavigate(1)" title="Next">&rsaquo;</button>'
            + '<div class="cal-current-range-heading">' + escapeHtml(dateTitle) + '</div>'
          + '</div>'

          + '<div style="display:flex;align-items:center;gap:8px;">'
            + (isAdmin ? '<button type="button" class="portal-btn-sm portal-btn-primary" onclick="openAdminEventModal()" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:6px 14px;"><svg class="ui-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Event</button>' : '')
          + '</div>'
        + '</div>'

        // ── Active View Body Container ──
        + '<div class="cal-view-body">';

    if (_calendarViewMode === 'week') {
      html += renderWeekView();
    } else if (_calendarViewMode === 'month') {
      html += renderMonthView();
    } else if (_calendarViewMode === 'year') {
      html += renderYearView();
    } else if (_calendarViewMode === 'events') {
      html += renderEventsView();
    } else {
      html += renderUpcomingView();
    }

    html += '</div></div>'; // end cal-hub-container

    container.innerHTML = html;
  }

  // ── 1. UPCOMING PARADE / ACTIVITY VIEW ──────────────────────────────────────
  function renderUpcomingView() {
    var todayStr = formatDateKey(new Date());
    var upcoming = getNextUpcomingEvent(todayStr) || _calendarEvents[0];
    var nextList = getUpcomingEventsList(todayStr, 4);

    var diffDays = Math.ceil((new Date(upcoming.date + 'T00:00:00') - new Date()) / (1000 * 60 * 60 * 24));
    var countdownLabel = '';
    if (diffDays === 0) countdownLabel = 'Parade Today! 🎖️';
    else if (diffDays === 1) countdownLabel = 'Tomorrow ⏳';
    else if (diffDays > 1) countdownLabel = 'In ' + diffDays + ' days (' + upcoming.date + ')';
    else countdownLabel = 'Upcoming Event';

    var upDateObj = new Date(upcoming.date + 'T00:00:00');
    var fullDateFormatted = upDateObj.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    var kitMeta  = KIT_BADGES[upcoming.kit] || { label: upcoming.kit, bg: 'var(--surface-tint)', color: 'var(--text-secondary)', icon: '👕' };
    var typeMeta = TYPE_BADGES[upcoming.type] || { label: 'Event', bg: 'rgba(234,179,8,0.15)', color: 'var(--accent)' };

    var html = ''
      + '<div class="cal-upcoming-hero">'
        + '<div class="cal-hero-top-badge">'
          + '<span class="cal-pill-badge" style="background:' + typeMeta.bg + ';color:' + typeMeta.color + ';border:1px solid ' + typeMeta.border + ';font-size:11px;padding:3px 10px;border-radius:20px;font-weight:700;">' + escapeHtml(typeMeta.label) + '</span>'
          + '<span class="cal-countdown-badge">' + escapeHtml(countdownLabel) + '</span>'
        + '</div>'

        + '<div class="cal-hero-title-wrap">'
          + '<div class="cal-hero-date">' + escapeHtml(fullDateFormatted) + '</div>'
          + '<div class="cal-hero-event-name">' + escapeHtml(upcoming.title) + '</div>'
        + '</div>'

        + '<div class="cal-hero-meta-strip">'
          + '<div class="cal-hero-meta-item">🕒 <strong>' + escapeHtml(upcoming.time || '2:15 PM – 6:00 PM') + '</strong></div>'
          + '<div class="cal-hero-meta-item">📍 <strong>' + escapeHtml(upcoming.location || 'Trinity Methodist Church PJ (TMCPJ)') + '</strong></div>'
          + (upcoming.kit && upcoming.kit !== 'None' ? ('<div class="cal-hero-meta-item">🥋 Uniform of the Day: <strong style="color:var(--accent);">' + kitMeta.icon + ' ' + escapeHtml(kitMeta.label) + '</strong></div>') : '')
        + '</div>';

    // Rundown Table / Timeline
    html += ''
      + '<div class="cal-hero-section-title">Parade Rundown &amp; Activity Schedule</div>'
      + '<div class="schedule-table" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">';

    DEFAULT_PARADE_RUNDOWN.forEach(function(step) {
      html += ''
        + '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:12px;gap:12px;flex-wrap:wrap;">'
          + '<div style="display:flex;align-items:center;gap:12px;">'
            + '<div style="width:36px;height:36px;border-radius:10px;background:var(--bg-card);border:1px solid var(--border-card);display:flex;align-items:center;justify-content:center;color:var(--accent);flex-shrink:0;">'
              + '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
            + '</div>'
            + '<div>'
              + '<div style="font-family:var(--font-headline);font-size:16px;font-weight:600;color:var(--text-primary);letter-spacing:0.5px;">' + escapeHtml(step.title) + '</div>'
              + '<div style="font-size:12px;color:var(--text-secondary);">' + escapeHtml(step.desc) + '</div>'
            + '</div>'
          + '</div>'
          + '<div style="font-family:var(--font-headline);font-size:13px;font-weight:700;color:var(--accent);background:var(--bg-card);border:1px solid var(--border-card);padding:5px 12px;border-radius:20px;letter-spacing:0.5px;white-space:nowrap;">'
            + escapeHtml(step.time)
          + '</div>'
        + '</div>';
    });

    html += '</div>'; // end schedule-table

    // Senior and Junior Syllabi
    if (upcoming.srDetails || upcoming.jrDetails) {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:12px;margin-bottom:16px;">';
      if (upcoming.srDetails) {
        html += '<div class="cal-detail-subbox"><div class="cal-subbox-title">🎖️ Senior Section Program &amp; Badges</div><div style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin-top:4px;">' + escapeHtml(upcoming.srDetails) + '</div></div>';
      }
      if (upcoming.jrDetails) {
        html += '<div class="cal-detail-subbox"><div class="cal-subbox-title">🎯 Junior Section Program &amp; Badges</div><div style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin-top:4px;">' + escapeHtml(upcoming.jrDetails) + '</div></div>';
      }
      html += '</div>';
    }

    // Notice & Remarks
    html += ''
      + '<div style="margin-bottom:16px;padding:12px 14px;background:rgba(200,150,30,0.08);border:1px solid rgba(200,150,30,0.25);border-radius:10px;display:flex;align-items:center;gap:10px;font-size:12px;color:var(--text-secondary);line-height:1.5;">'
        + '<svg class="ui-icon" style="flex-shrink:0;color:var(--accent);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
        + '<span>All members are expected to fall in promptly at <strong>2:15 PM</strong> in the designated Uniform of the Day (UOD). Band members report at <strong>9:30 AM</strong>. ' + (upcoming.notes ? ('<br/><strong>Remark:</strong> ' + escapeHtml(upcoming.notes)) : '') + '</span>'
      + '</div>'

      // Actions
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px;">'
        + '<button type="button" class="portal-btn portal-btn-primary" onclick="openCalendarDayModal(\'' + upcoming.date + '\')" style="font-size:13px;padding:8px 18px;display:inline-flex;align-items:center;gap:8px;">'
          + '<svg class="ui-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>'
          + 'View Full Day Schedule'
        + '</button>'
        + (isCalendarAdmin() ? '<button type="button" class="portal-btn portal-btn-secondary" onclick="openAdminEventModal(\'' + upcoming.date + '\', \'' + upcoming.id + '\')" style="font-size:13px;padding:8px 16px;">✏️ Edit This Event</button>' : '')
      + '</div>';

    // Upcoming Strip
    if (nextList.length > 1) {
      html += ''
        + '<div style="margin-top:20px;">'
          + '<div class="cal-hero-section-title" style="margin-bottom:10px;">Subsequent Company Parades &amp; Events</div>'
          + '<div class="cal-upcoming-strip-grid">';
      for (var s = 1; s < nextList.length; s++) {
        var subEv = nextList[s];
        var sDateObj = new Date(subEv.date + 'T00:00:00');
        var sDateText = sDateObj.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' });
        var sKitMeta = KIT_BADGES[subEv.kit] || { label: subEv.kit, bg: 'var(--surface-tint)', color: 'var(--text-secondary)', icon: '👕' };
        var sTypeMeta = TYPE_BADGES[subEv.type] || { label: 'Event', bg: 'rgba(234,179,8,0.15)', color: 'var(--accent)' };

        html += ''
          + '<div class="cal-upcoming-mini-card" onclick="openCalendarDayModal(\'' + subEv.date + '\')">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
              + '<span class="cal-mini-date">' + escapeHtml(sDateText) + '</span>'
              + '<span class="cal-pill-badge" style="background:' + sTypeMeta.bg + ';color:' + sTypeMeta.color + ';">' + escapeHtml(sTypeMeta.label) + '</span>'
            + '</div>'
            + '<div class="cal-mini-title">' + escapeHtml(subEv.title) + '</div>'
            + '<div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">'
              + (subEv.kit && subEv.kit !== 'None' ? ('<span style="color:var(--accent);">' + sKitMeta.icon + ' ' + escapeHtml(sKitMeta.label) + '</span> &bull; ') : '')
              + escapeHtml(subEv.time || '2:15 PM – 6:00 PM')
            + '</div>'
          + '</div>';
      }
      html += '</div></div>';
    }

    html += '</div>'; // end cal-upcoming-hero
    return html;
  }

  // ── 2. WEEK VIEW (Image 3 Google Calendar Style) ───────────────────────────
  function renderWeekView() {
    var weekDays = getWeekDays(_calendarDate);
    var now = new Date();
    var nowTimeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    var nowHour = now.getHours() + (now.getMinutes() / 60);

    var html = '<div class="cal-week-wrapper">';

    // Week Header Row
    html += '<div class="cal-week-header-row">';
    html += '<div class="cal-week-tz-cell">GMT+8</div>';
    weekDays.forEach(function(day) {
      html += ''
        + '<div class="cal-week-day-header ' + (day.isToday ? 'cal-today-col' : '') + '" onclick="openCalendarDayModal(\'' + day.dateKey + '\')">'
          + '<div class="cal-week-day-name">' + day.dayName + '</div>'
          + '<div class="cal-week-day-circle ' + (day.isToday ? 'active' : '') + '">' + day.dayNumber + '</div>'
        + '</div>';
    });
    html += '</div>'; // end cal-week-header-row

    // All Day Row (Image 3: green bar at top, e.g. Diwali)
    html += '<div class="cal-week-allday-row">';
    html += '<div class="cal-week-allday-label">All day</div>';
    weekDays.forEach(function(day) {
      var dayEvents = getCompanyEventsForDate(day.dateKey);
      var allDayEv = dayEvents.find(function(e) { return e.type === 'holiday' || e.type === 'noparade' || (e.time && e.time.toLowerCase().includes('all day')); });
      html += '<div class="cal-week-allday-cell" onclick="openCalendarDayModal(\'' + day.dateKey + '\')">';
      if (allDayEv) {
        var isHol = allDayEv.type === 'holiday';
        var barStyle = isHol ? 'background:#137333;color:#fff;' : 'background:#d93025;color:#fff;';
        html += '<div class="cal-week-allday-pill" style="' + barStyle + '" title="' + escapeHtml(allDayEv.title) + '">' + escapeHtml(allDayEv.title) + '</div>';
      }
      html += '</div>';
    });
    html += '</div>'; // end cal-week-allday-row

    // Hourly Grid (8 AM to 9 PM)
    var hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
    html += '<div class="cal-week-time-grid" style="position:relative;">';

    // Live Red Current Time Indicator
    var currentDayIndex = weekDays.findIndex(function(d) { return d.isToday; });
    if (currentDayIndex !== -1 && nowHour >= 8 && nowHour <= 21) {
      var topPercent = ((nowHour - 8) / (21 - 8 + 1)) * 100;
      html += '<div class="cal-week-now-indicator" style="top:' + topPercent.toFixed(2) + '%;" title="Current Time: ' + nowTimeStr + '"><div class="cal-now-dot"></div><div class="cal-now-line"></div></div>';
    }

    hours.forEach(function(h) {
      var ampm = h >= 12 ? 'PM' : 'AM';
      var displayH = h > 12 ? (h - 12) : h;
      var timeLabel = displayH + ' ' + ampm;

      html += '<div class="cal-week-hour-row">';
      html += '<div class="cal-week-time-label">' + timeLabel + '</div>';

      weekDays.forEach(function(day) {
        var dayEvents = getCompanyEventsForDate(day.dateKey);
        // Find if any parade/timed event occurs around this hour
        var eventAtHour = null;
        if (dayEvents.length > 0) {
          dayEvents.forEach(function(ev) {
            if (ev.type !== 'holiday' && ev.type !== 'noparade') {
              if (h === 9 && (ev.time && ev.time.includes('9:30 AM'))) {
                eventAtHour = { title: 'Band Rehearsal', kit: 'PT Kit', time: '9:30 AM – 11:30 AM', color: '#1a73e8', ev: ev };
              } else if (h === 14 && (ev.time && (ev.time.includes('2:15 PM') || ev.time.includes('2:00 PM')))) {
                eventAtHour = { title: ev.title, kit: ev.kit, time: ev.time, color: '#f59e0b', ev: ev };
              }
            }
          });
        }

        html += '<div class="cal-week-hour-cell" onclick="openCalendarDayModal(\'' + day.dateKey + '\')">';
        if (eventAtHour) {
          html += ''
            + '<div class="cal-week-event-card" style="border-left:3px solid ' + eventAtHour.color + ';" onclick="event.stopPropagation();openCalendarDayModal(\'' + day.dateKey + '\')">'
              + '<div class="cal-we-title">' + escapeHtml(eventAtHour.title) + '</div>'
              + '<div class="cal-we-time">' + escapeHtml(eventAtHour.time) + '</div>'
            + '</div>';
        }
        html += '</div>';
      });

      html += '</div>'; // end cal-week-hour-row
    });

    html += '</div>'; // end cal-week-time-grid
    html += '</div>'; // end cal-week-wrapper
    return html;
  }

  // ── 3. MONTH VIEW (Image 4 Google Calendar Style) ──────────────────────────
  function renderMonthView() {
    var matrix = getMonthMatrix(_currentYear, _currentMonth);
    var todayStr = formatDateKey(new Date());

    var html = '<div class="cal-month-table-wrapper">';

    // Weekday Header
    html += '<div class="cal-month-head-row">';
    DAY_SHORT_NAMES.forEach(function(d) {
      html += '<div class="cal-month-head-cell">' + d + '</div>';
    });
    html += '</div>';

    // Days Grid
    html += '<div class="cal-month-grid">';
    matrix.forEach(function(cell) {
      var isToday = cell.dateKey === todayStr;
      var compEvents = getCompanyEventsForDate(cell.dateKey);
      var memEvents  = getMemberEventsForDate(cell.dateKey);

      var cellClass = 'cal-month-day-cell';
      if (!cell.isCurrentMonth) cellClass += ' cal-month-cell-overflow';
      if (isToday) cellClass += ' cal-month-cell-today';

      html += '<div class="' + cellClass + '" onclick="openCalendarDayModal(\'' + cell.dateKey + '\')">';

      // Top number bar
      html += '<div class="cal-m-cell-top">';
      if (isToday) {
        html += '<span class="cal-m-today-badge">' + cell.dayNumber + '</span>';
      } else {
        html += '<span class="cal-m-day-number">' + cell.dayNumber + '</span>';
      }
      html += '</div>';

      // Event Pills (Image 4 format)
      html += '<div class="cal-m-events-list">';
      var maxShow = 3;
      var shownCount = 0;

      compEvents.forEach(function(ev) {
        if (shownCount >= maxShow) return;
        shownCount++;
        var isHoliday = ev.type === 'holiday';
        var isNoParade = ev.type === 'noparade';
        var isCamp = ev.type === 'camp';
        var isCeremonial = ev.type === 'ceremonial';

        var pillCls = 'cal-m-pill-gold';
        if (isHoliday) pillCls = 'cal-m-pill-green';
        else if (isNoParade) pillCls = 'cal-m-pill-red';
        else if (isCamp) pillCls = 'cal-m-pill-cyan';
        else if (isCeremonial) pillCls = 'cal-m-pill-purple';

        html += '<div class="cal-m-pill ' + pillCls + '" title="' + escapeHtml(ev.title) + '">' + escapeHtml(ev.title) + '</div>';
      });

      memEvents.forEach(function(rem) {
        if (shownCount >= maxShow) return;
        shownCount++;
        html += '<div class="cal-m-pill cal-m-pill-personal" title="Personal: ' + escapeHtml(rem.title) + '">📌 ' + escapeHtml(rem.title) + '</div>';
      });

      var totalEvents = compEvents.length + memEvents.length;
      if (totalEvents > maxShow) {
        html += '<div class="cal-m-more">+' + (totalEvents - maxShow) + ' more</div>';
      }

      html += '</div>'; // end cal-m-events-list
      html += '</div>'; // end cal-month-day-cell
    });

    html += '</div>'; // end cal-month-grid
    html += '</div>'; // end cal-month-table-wrapper
    return html;
  }

  // ── 4. YEAR VIEW (Image 5 Google Calendar Style) ───────────────────────────
  function renderYearView() {
    var todayStr = formatDateKey(new Date());
    var html = '<div class="cal-year-grid">';

    for (var m = 0; m < 12; m++) {
      var matrix = getMonthMatrix(_currentYear, m);
      html += ''
        + '<div class="cal-year-month-box">'
          + '<div class="cal-year-month-name" onclick="_currentMonth=' + m + ';switchCalendarView(\'month\')">'
            + MONTH_NAMES[m]
          + '</div>'
          + '<div class="cal-year-weekdays">'
            + '<span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>'
          + '</div>'
          + '<div class="cal-year-days-grid">';

      matrix.forEach(function(c) {
        if (!c.isCurrentMonth) {
          html += '<span class="cal-year-day-empty"></span>';
          return;
        }
        var isToday = c.dateKey === todayStr;
        var dayEvs = getCompanyEventsForDate(c.dateKey);
        var hasEv = dayEvs.length > 0;

        var dotHtml = '';
        if (hasEv) {
          var firstEv = dayEvs[0];
          var dotColor = '#eab308';
          if (firstEv.type === 'holiday') dotColor = '#16a34a';
          else if (firstEv.type === 'noparade') dotColor = '#ef4444';
          else if (firstEv.type === 'camp') dotColor = '#06b6d4';
          else if (firstEv.type === 'ceremonial') dotColor = '#a855f7';
          dotHtml = '<span class="cal-y-dot" style="background:' + dotColor + ';"></span>';
        }

        html += ''
          + '<div class="cal-year-day-cell ' + (isToday ? 'cal-y-today' : '') + '" onclick="openCalendarDayModal(\'' + c.dateKey + '\')">'
            + '<span class="cal-y-num">' + c.dayNumber + '</span>'
            + dotHtml
          + '</div>';
      });

      html += '</div></div>'; // end cal-year-month-box
    }

    html += '</div>'; // end cal-year-grid
    return html;
  }

  // ── 5. EVENTS / SCHEDULE VIEW (Image 6 Google Calendar Style) ──────────────
  function renderEventsView() {
    var todayStr = formatDateKey(new Date());
    var sorted = _calendarEvents.slice().sort(function(a, b) {
      return a.date.localeCompare(b.date);
    });

    // Start filtering from beginning of active viewing month
    var filterStart = _currentYear + '-' + String(_currentMonth + 1).padStart(2, '0') + '-01';
    var activeList = sorted.filter(function(e) { return e.date >= filterStart; });
    if (!activeList.length) activeList = sorted.slice(-15);

    var html = '<div class="cal-agenda-container">';
    var renderedDates = {};

    activeList.forEach(function(ev) {
      var isToday = ev.date === todayStr;
      var evDateObj = new Date(ev.date + 'T00:00:00');
      var dayNum = evDateObj.getDate();
      var monthShort = MONTH_SHORT_NAMES[evDateObj.getMonth()];
      var dayNameShort = DAY_SHORT_NAMES[evDateObj.getDay()];

      var typeMeta = TYPE_BADGES[ev.type] || { label: 'Event', color: '#eab308', dot: '#eab308', bg: 'rgba(234,179,8,0.15)' };
      var kitMeta  = KIT_BADGES[ev.kit] || { label: ev.kit, icon: '👕', color: 'var(--text-secondary)' };

      var isFirstForDate = !renderedDates[ev.date];
      renderedDates[ev.date] = true;

      html += ''
        + '<div class="cal-agenda-row ' + (isToday ? 'cal-agenda-today' : '') + '" onclick="openCalendarDayModal(\'' + ev.date + '\')">'
          + '<div class="cal-agenda-date-col">'
            + (isFirstForDate ? (
                '<div class="cal-agenda-date-circle ' + (isToday ? 'active' : '') + '">' + dayNum + '</div>'
                + '<div class="cal-agenda-date-sub">' + monthShort + ', ' + dayNameShort + '</div>'
              ) : '<div style="width:36px;"></div>')
          + '</div>'

          + '<div class="cal-agenda-content-col">'
            + (isToday && isFirstForDate ? '<div class="cal-agenda-now-line"></div>' : '')
            + '<div class="cal-agenda-item-body">'
              + '<span class="cal-agenda-dot" style="background:' + typeMeta.dot + ';"></span>'
              + '<div class="cal-agenda-time-text">' + escapeHtml(ev.time || 'All day') + '</div>'
              + '<div class="cal-agenda-title-text">' + escapeHtml(ev.title) + '</div>'
              + (ev.kit && ev.kit !== 'None' ? ('<span class="cal-pill-badge" style="background:' + kitMeta.bg + ';color:' + kitMeta.color + ';margin-left:auto;">' + kitMeta.icon + ' ' + escapeHtml(kitMeta.label) + '</span>') : '')
            + '</div>'
          + '</div>'
        + '</div>';
    });

    html += '</div>'; // end cal-agenda-container
    return html;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DAY SCHEDULE MODAL WITH STEP-DAY NAVIGATION & ADMIN CONTROLS
  // ═══════════════════════════════════════════════════════════════════════════

  function openCalendarDayModal(dateStr, focusAddReminder) {
    var modal = document.getElementById('calendar-day-modal');
    if (!modal) return;

    var targetDate = dateStr || _selectedDateStr;
    _selectedDateStr = targetDate;

    var compEvents = getCompanyEventsForDate(targetDate);
    var ev = compEvents.length > 0 ? compEvents[0] : null;

    var dateObj = new Date(targetDate + 'T00:00:00');
    var fullDateStr = dateObj.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    var kitMeta = (ev && KIT_BADGES[ev.kit]) ? KIT_BADGES[ev.kit] : null;
    var typeMeta = (ev && TYPE_BADGES[ev.type]) ? TYPE_BADGES[ev.type] : null;
    var isAdmin = isCalendarAdmin();

    // Step-Day Navigation Header Title
    var titleEl = document.getElementById('cdm-date-title');
    if (titleEl) {
      titleEl.innerHTML = ''
        + '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;">'
          + '<div style="display:flex;align-items:center;gap:6px;">'
            + '<button type="button" class="portal-btn-sm portal-btn-secondary" onclick="calStepDay(-1)" title="Previous Day" style="padding:2px 8px;font-size:14px;border-radius:6px;">&lsaquo;</button>'
            + '<span>' + escapeHtml(fullDateStr) + '</span>'
            + '<button type="button" class="portal-btn-sm portal-btn-secondary" onclick="calStepDay(1)" title="Next Day" style="padding:2px 8px;font-size:14px;border-radius:6px;">&rsaquo;</button>'
          + '</div>'
        + '</div>';
    }

    // Header Badges & Admin Trigger
    var headerBadges = document.getElementById('cdm-header-badges');
    if (headerBadges) {
      var badgesHtml = '';
      if (typeMeta) {
        badgesHtml += '<span class="cal-pill-badge" style="background:' + typeMeta.bg + ';color:' + typeMeta.color + ';border:1px solid ' + typeMeta.border + ';">' + escapeHtml(typeMeta.label) + '</span> ';
      }
      if (kitMeta && ev && ev.kit !== 'None') {
        badgesHtml += '<span class="cal-pill-badge" style="background:' + kitMeta.bg + ';color:' + kitMeta.color + ';">' + kitMeta.icon + ' ' + escapeHtml(kitMeta.label) + '</span> ';
      }
      if (isAdmin) {
        badgesHtml += '<button type="button" class="portal-btn-sm portal-btn-secondary" onclick="openAdminEventModal(\'' + targetDate + '\', \'' + (ev ? ev.id : '') + '\')" style="font-size:11px;padding:3px 10px;margin-left:auto;">✏️ Edit Schedule</button>';
      }
      headerBadges.innerHTML = badgesHtml;
    }

    var eventNameEl = document.getElementById('cdm-event-name');
    if (eventNameEl) {
      eventNameEl.textContent = ev ? ev.title : 'Free Day / No Official Company Activity';
    }

    // Venue & Time + Schedule Rundown
    var venueEl = document.getElementById('cdm-venue-time');
    if (venueEl) {
      var vHtml = '';
      if (ev && ev.type !== 'noparade') {
        vHtml += '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px;">'
          + '<span style="color:var(--accent);font-weight:600;">🕒 ' + escapeHtml(ev.time || '2:15 PM – 6:00 PM') + '</span>'
          + '<span>📍 ' + escapeHtml(ev.location || 'Trinity Methodist Church PJ (TMCPJ)') + '</span>'
        + '</div>';

        // Parade Detailed Rundown
        if (ev.type === 'parade' || ev.type === 'special' || ev.type === 'ceremonial') {
          vHtml += ''
            + '<div style="background:var(--bg-card-subtle);border:1px solid var(--border-card);border-radius:10px;padding:12px;margin-top:10px;">'
              + '<div style="font-family:var(--font-headline);font-size:13px;font-weight:700;color:var(--accent);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Schedule Rundown &bull; Saturday Timeline</div>'
              + '<div style="display:flex;flex-direction:column;gap:6px;">';
          DEFAULT_PARADE_RUNDOWN.forEach(function(r) {
            vHtml += ''
              + '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:6px;font-size:12px;">'
                + '<div><strong>' + escapeHtml(r.title) + '</strong> &bull; <span style="color:var(--text-secondary);">' + escapeHtml(r.desc) + '</span></div>'
                + '<span style="color:var(--accent);font-weight:700;font-family:var(--font-headline);white-space:nowrap;margin-left:8px;">' + escapeHtml(r.time) + '</span>'
              + '</div>';
          });
          vHtml += '</div></div>';
        }
      } else if (ev && ev.type === 'noparade') {
        vHtml = '<span style="color:var(--red);font-weight:600;">⛔ No Company Parade Scheduled for this date</span>';
      } else {
        vHtml = '<span style="color:var(--text-muted);">No official brigade event scheduled. Enjoy your weekend!</span>';
      }
      venueEl.innerHTML = vHtml;
    }

    // Senior Section Breakdown
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

    // Junior Section Breakdown
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

    // Remarks & Notes
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

    // Member Personal Reminders
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

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN GRID VIEW & EVENT FORM (ADMIN CONSOLE CRUD)
  // ═══════════════════════════════════════════════════════════════════════════

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
        var kitMeta = KIT_BADGES[ev.kit] || { label: ev.kit, bg: 'var(--surface-tint-hover)', color: 'var(--text-primary)' };
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

    document.getElementById('adm-ev-id').value       = ev ? ev.id : '';
    document.getElementById('adm-ev-date').value     = targetDate;
    document.getElementById('adm-ev-title').value    = ev ? ev.title : 'Regular Parade';
    document.getElementById('adm-ev-type').value     = ev ? (ev.type || 'parade') : 'parade';
    document.getElementById('adm-ev-kit').value      = ev ? (ev.kit || 'PT Kit') : 'PT Kit';
    document.getElementById('adm-ev-time').value     = ev ? (ev.time || '2:15 PM – 6:00 PM') : '2:15 PM – 6:00 PM';
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
      time: timeVal || '2:15 PM – 6:00 PM',
      location: locVal || 'Trinity Methodist Church PJ',
      srDetails: cleanSr,
      jrDetails: cleanJr,
      notes: cleanNotes,
      updatedAt: new Date().toISOString()
    };

    var updatedList = _calendarEvents.slice();
    var idx = updatedList.findIndex(function(x) { return x.id === eventObj.id || (x.date === eventObj.date && x.type === eventObj.type); });
    if (idx >= 0) {
      updatedList[idx] = eventObj;
    } else {
      updatedList.push(eventObj);
    }

    var success = await saveCalendarEvents(updatedList);
    if (success) {
      closeAdminEventModal();
      renderAdminCalendarGrid();
      renderCalendarTab();
      renderCalendarWidget();
      if (typeof showToast === 'function') showToast('Calendar event saved & published! 📅');
    } else {
      if (typeof showToast === 'function') showToast('Failed to save to database. Please retry.');
    }
  }

  async function handleAdminDeleteEvent() {
    var id = document.getElementById('adm-ev-id').value;
    if (!id) return;

    var confirmed = (typeof showConfirmModal === 'function')
      ? await showConfirmModal('Are you sure you want to remove this parade event from the company calendar?', 'Delete Parade Event')
      : true;
    if (!confirmed) {
      return;
    }

    var updatedList = _calendarEvents.filter(function(x) { return x.id !== id; });
    var success = await saveCalendarEvents(updatedList);
    if (success) {
      closeAdminEventModal();
      renderAdminCalendarGrid();
      renderCalendarTab();
      renderCalendarWidget();
      if (typeof showToast === 'function') showToast('Event removed from company calendar.');
    }
  }

  async function handleAdminResetToDefaultMaster() {
    var confirmed = (typeof showConfirmModal === 'function')
      ? await showConfirmModal("This will restore the authentic 2026 1st PJ Boys' Brigade master parade schedule from the official Google Doc. Any custom manual changes will be refreshed. Continue?", 'Restore Master Schedule')
      : true;
    if (!confirmed) {
      return;
    }

    var defaultData = JSON.parse(JSON.stringify(DEFAULT_2026_CALENDAR));
    var success = await saveCalendarEvents(defaultData);
    if (success) {
      renderAdminCalendarGrid();
      renderCalendarTab();
      renderCalendarWidget();
      if (typeof showToast === 'function') showToast('Restored official 2026 company master calendar! 🎖️');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPACT HOME PAGE WIDGET RENDERING
  // ═══════════════════════════════════════════════════════════════════════════

  function renderCalendarWidget(containerId) {
    var container = document.getElementById(containerId || 'company-calendar-widget');
    if (!container) return;

    loadMemberEvents();

    var todayStr = formatDateKey(new Date());
    var todayDay = new Date().getDate();
    var matrix = getMonthMatrix(_currentYear, _currentMonth);

    var selectedCompanyEvents = getCompanyEventsForDate(_selectedDateStr);
    var selectedMemberEvents  = getMemberEventsForDate(_selectedDateStr);
    var primaryEvent = selectedCompanyEvents.length > 0 ? selectedCompanyEvents[0] : null;

    var nextParade = getNextUpcomingParade(todayStr);
    var badgeMonth = MONTH_SHORT_NAMES[_currentMonth];

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

      + '<div class="cal-weekdays-row">'
        + '<span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>'
      + '</div>'

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

      var dotsHtml = '<div class="cal-dots-wrap">';
      if (hasCompEvent) {
        var ev = compEvents[0];
        var dotColor = '#eab308';
        if (ev.type === 'noparade') dotColor = '#ef4444';
        else if (ev.type === 'camp') dotColor = '#06b6d4';
        else if (ev.type === 'ceremonial') dotColor = '#a855f7';
        else if (ev.type === 'holiday') dotColor = '#16a34a';
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
    + '</div>';

    container.innerHTML = html;
  }

  function calNavigateMonth(offset) {
    _currentMonth += offset;
    if (_currentMonth > 11) {
      _currentMonth = 0;
      _currentYear++;
    } else if (_currentMonth < 0) {
      _currentMonth = 11;
      _currentYear--;
    }
    _calendarDate.setFullYear(_currentYear);
    _calendarDate.setMonth(_currentMonth);
    renderCalendarWidget();
  }

  function calSelectDate(dateStr) {
    _selectedDateStr = dateStr;
    var parts = dateStr.split('-');
    if (parts.length === 3) {
      _currentYear = parseInt(parts[0], 10);
      _currentMonth = parseInt(parts[1], 10) - 1;
      _calendarDate.setFullYear(_currentYear);
      _calendarDate.setMonth(_currentMonth);
    }
    renderCalendarWidget();
  }

  // ── Module Initialization ──────────────────────────────────────────────────

  async function initCalendarModule() {
    renderCalendarWidget();
    renderCalendarTab();
    await loadCalendarEvents();
    loadMemberEvents();
    fetchRemoteMemberEvents().catch(function() {});
    renderCalendarWidget();
    renderCalendarTab();
  }

  // Attach to window
  if (typeof window !== 'undefined') {
    window.loadCalendarEvents           = loadCalendarEvents;
    window.saveCalendarEvents           = saveCalendarEvents;
    window.loadMemberEvents             = loadMemberEvents;
    window.saveMemberEvents             = saveMemberEvents;
    window.fetchRemoteMemberEvents      = fetchRemoteMemberEvents;
    window.addPersonalEvent             = addPersonalEvent;
    window.deletePersonalEvent          = deletePersonalEvent;
    window.renderCalendarWidget         = renderCalendarWidget;
    window.renderCalendarTab            = renderCalendarTab;
    window.switchCalendarView           = switchCalendarView;
    window.calNavigate                  = calNavigate;
    window.calJumpToday                 = calJumpToday;
    window.calStepDay                   = calStepDay;
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
      fetchRemoteMemberEvents: fetchRemoteMemberEvents,
      addPersonalEvent: addPersonalEvent,
      deletePersonalEvent: deletePersonalEvent,
      getCompanyEventsForDate: getCompanyEventsForDate,
      getMemberEventsForDate: getMemberEventsForDate,
      getNextUpcomingParade: getNextUpcomingParade,
      getNextUpcomingEvent: getNextUpcomingEvent,
      getMonthMatrix: getMonthMatrix,
      getWeekDays: getWeekDays,
      renderCalendarWidget: renderCalendarWidget,
      renderCalendarTab: renderCalendarTab,
      switchCalendarView: switchCalendarView,
      openCalendarDayModal: openCalendarDayModal,
      closeCalendarDayModal: closeCalendarDayModal,
      calStepDay: calStepDay,
      calNavigate: calNavigate,
      calJumpToday: calJumpToday,
      openAdminEventModal: openAdminEventModal,
      closeAdminEventModal: closeAdminEventModal,
      handleAdminSaveEvent: handleAdminSaveEvent,
      handleAdminDeleteEvent: handleAdminDeleteEvent,
      KIT_BADGES: KIT_BADGES,
      TYPE_BADGES: TYPE_BADGES
    };
  }

})(typeof window !== 'undefined' ? window : global);
