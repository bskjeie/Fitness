// Fitness Planner: calorie targets + day-by-day workout suggestions.
// All data stays in this browser (localStorage).

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STORE_KEY = 'fitness-planner-v1';

// met = metabolic equivalent, used to estimate calories burned.
const WORKOUTS = {
  full:     { name: 'Full-Body Strength', met: 5.0, min: 45, exercises: ['Goblet squat 3×10', 'Push-ups 3×10', 'Dumbbell row 3×10/side', 'Romanian deadlift 3×10', 'Plank 3×40s'] },
  upper:    { name: 'Upper Body Strength', met: 5.0, min: 45, exercises: ['Bench or floor press 4×8', 'Bent-over row 4×8', 'Overhead press 3×10', 'Lat pulldown or band pull-apart 3×12', 'Biceps curl + triceps dip 2×12'] },
  lower:    { name: 'Lower Body Strength', met: 5.5, min: 45, exercises: ['Back or goblet squat 4×8', 'Romanian deadlift 4×8', 'Walking lunges 3×10/leg', 'Glute bridge 3×12', 'Calf raises 3×15'] },
  push:     { name: 'Push Day (chest/shoulders/triceps)', met: 5.0, min: 50, exercises: ['Bench press 4×6–8', 'Incline dumbbell press 3×10', 'Overhead press 3×8', 'Lateral raises 3×12', 'Triceps pushdown 3×12'] },
  pull:     { name: 'Pull Day (back/biceps)', met: 5.0, min: 50, exercises: ['Deadlift 3×5', 'Pull-ups or lat pulldown 4×8', 'Seated cable row 3×10', 'Face pulls 3×15', 'Hammer curls 3×12'] },
  legs:     { name: 'Leg Day', met: 6.0, min: 50, exercises: ['Back squat 4×6–8', 'Leg press 3×10', 'Romanian deadlift 3×8', 'Leg curl 3×12', 'Calf raises 4×15'] },
  hiit:     { name: 'HIIT Conditioning', met: 8.0, min: 25, exercises: ['5 min warm-up', '8 rounds: 30s burpees / 30s rest', '8 rounds: 30s jump squats / 30s rest', '5 min cool-down walk'] },
  cardio:   { name: 'Steady Cardio', met: 7.0, min: 40, exercises: ['40 min jog, bike, or row at a pace where you can still talk', 'Stretch 5 min'] },
  mobility: { name: 'Active Recovery & Mobility', met: 2.5, min: 25, exercises: ['20–30 min easy walk', 'Hip flexor stretch 2×45s/side', 'Cat-cow 2×10', "World's greatest stretch 2×5/side", 'Foam roll 5 min'] },
  rest:     { name: 'Rest Day', met: 0, min: 0, exercises: ['Sleep 7–9 hours', 'Light walking is fine'] },
};

// Training-day rotation for each goal.
const ROTATIONS = {
  lose:     ['full', 'hiit', 'full', 'cardio', 'full', 'hiit', 'cardio'],
  maintain: ['upper', 'lower', 'cardio', 'upper', 'lower', 'hiit', 'cardio'],
  gain:     ['push', 'pull', 'legs', 'upper', 'lower', 'push', 'pull'],
};

const GOAL_ADJUST = { lose: -500, maintain: 0, gain: 300 };

// ---------- storage ----------
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* storage unavailable */ }
  return { profile: null, logs: {} };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}
let state = load();

// ---------- date helpers ----------
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = d => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

// ---------- calorie math (Mifflin-St Jeor) ----------
function computeTargets(p) {
  const kg = p.weight * 0.4536;
  const cm = (p.heightFt * 12 + p.heightIn) * 2.54;
  const bmr = 10 * kg + 6.25 * cm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
  const tdee = bmr * p.activity;
  const floor = p.sex === 'male' ? 1500 : 1200;
  const target = Math.max(floor, tdee + GOAL_ADJUST[p.goal]);
  return { kg, bmr: Math.round(bmr), tdee: Math.round(tdee), target: Math.round(target) };
}

const dayTotal = date => (state.logs[date] || []).reduce((s, e) => s + e.calories, 0);

// ---------- workout suggestion ----------
function buildPlan(profile, targets, start, days = 7) {
  const trainingDays = new Set(profile.days);
  const rotation = ROTATIONS[profile.goal];

  // Keep the rotation consistent from week to week by counting training days since a fixed date.
  const epoch = new Date(2024, 0, 1);
  let idx = 0;
  for (let d = new Date(epoch); d < start; d = addDays(d, 1)) if (trainingDays.has(d.getDay())) idx++;

  const plan = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const key = iso(date);
    const isTraining = trainingDays.has(date.getDay());

    // Fuel signal: today's log if present, otherwise yesterday's.
    const todayCals = dayTotal(key);
    const yKey = iso(addDays(date, -1));
    const fuelCals = todayCals || dayTotal(yKey);
    const fuelSource = todayCals ? 'today' : (fuelCals ? 'yesterday' : null);
    const ratio = fuelCals ? fuelCals / targets.target : 1;
    const fuel = !fuelSource ? 'none' : ratio < 0.8 ? 'low' : ratio > 1.15 ? 'high' : 'ok';

    let wKey = isTraining ? rotation[idx++ % rotation.length] : (profile.goal === 'gain' ? 'rest' : 'mobility');
    let minutes = WORKOUTS[wKey].min;
    let exercises = [...WORKOUTS[wKey].exercises];
    let note = '';

    if (isTraining && fuel === 'low') {
      if (wKey === 'hiit') {
        wKey = 'cardio';
        minutes = 30;
        exercises = ['30 min easy cardio (swapped from HIIT)', 'Stretch 5 min'];
        note = `You ate ${fuelCals} kcal ${fuelSource}, well under your ${targets.target} target. HIIT is swapped for easy cardio. Eat before training.`;
      } else {
        minutes = Math.round(minutes * 0.75);
        exercises = exercises.map(e => e.replace(/(\d+)×/, (m, s) => `${Math.max(2, s - 1)}×`));
        note = `You're low on fuel (${fuelCals} kcal ${fuelSource}), so this is one set less per exercise. Focus on form and have a snack with protein and carbs first.`;
      }
    } else if (isTraining && fuel === 'high') {
      if (profile.goal === 'gain') {
        note = `You ate plenty (${fuelCals} kcal ${fuelSource}), so try to set a personal best on your first exercise.`;
      } else {
        minutes += 15;
        exercises.push('Finisher: 15 min incline walk or bike');
        note = `You ate ${fuelCals} kcal ${fuelSource}, above your ${targets.target} target, so a cardio finisher was added.`;
      }
    } else if (!isTraining && fuel === 'high' && profile.goal !== 'gain') {
      wKey = 'cardio';
      minutes = 30;
      exercises = ['30 min brisk walk or easy bike'];
      note = `It's an off day, but you ate ${fuelCals} kcal ${fuelSource}, so add a light 30-minute session.`;
    } else if (fuel === 'ok') {
      note = `You ate ${fuelCals} kcal ${fuelSource}, on target. Do the workout as written.`;
    } else if (fuel === 'none') {
      note = 'No calories logged for yesterday or today, so this is the standard plan.';
    }

    const burn = Math.round(WORKOUTS[wKey].met * targets.kg * (minutes / 60));
    plan.push({ date, key, isTraining, wKey, name: WORKOUTS[wKey].name, minutes, exercises, note, fuel, burn, todayCals });
  }
  return plan;
}

// ---------- rendering ----------
const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderDayChecks(selected) {
  $('#day-checks').innerHTML = DAY_NAMES.map((n, i) =>
    `<label><input type="checkbox" name="days" value="${i}" ${selected.includes(i) ? 'checked' : ''}> ${n}</label>`
  ).join('');
}

function fillProfileForm(p) {
  const f = $('#profile-form');
  for (const k of ['sex', 'age', 'weight', 'heightFt', 'heightIn', 'activity', 'goal']) {
    if (p[k] !== undefined) f.elements[k].value = p[k];
  }
  renderDayChecks(p.days || [1, 3, 5]);
}

function renderStats(targets) {
  $('#stats').innerHTML = !targets ? '<p class="empty">Save your profile to see your calorie targets.</p>' : `
    <div class="stat"><b>${targets.target}</b><span>Daily calorie target</span></div>
    <div class="stat"><b>${targets.tdee}</b><span>Maintenance calories (TDEE)</span></div>
    <div class="stat"><b>${targets.bmr}</b><span>Calories burned at rest (BMR)</span></div>`;
}

function renderHistory(targets) {
  const today = new Date();
  const rows = [];
  for (let i = 0; i < 7; i++) {
    const key = iso(addDays(today, -i));
    const entries = state.logs[key] || [];
    if (!entries.length) continue;
    const total = dayTotal(key);
    const pct = targets ? total / targets.target : 0;
    const cls = !targets ? '' : pct < 0.8 ? 'under' : pct > 1.15 ? 'over' : '';
    rows.push(`
      <div class="day-log">
        <div class="day-log-head"><span>${fmtDate(fromIso(key))}</span><span>${total}${targets ? ` / ${targets.target}` : ''} kcal</span></div>
        ${targets ? `<div class="bar"><i class="${cls}" style="width:${Math.min(100, pct * 100)}%"></i></div>` : ''}
        ${entries.map((e, j) => `
          <div class="entry"><span>${e.calories} kcal${e.note ? ' · ' + esc(e.note) : ''}</span>
          <button class="link" data-del="${key}|${j}" aria-label="Delete entry">remove</button></div>`).join('')}
      </div>`);
  }
  $('#history').innerHTML = rows.length ? rows.join('') : '<p class="empty">Nothing logged in the last 7 days.</p>';
}

function renderPlan(targets) {
  if (!state.profile || !targets) {
    $('#plan').innerHTML = '<p class="empty">Save your profile to get your workout plan.</p>';
    return;
  }
  const todayKey = iso(new Date());
  const plan = buildPlan(state.profile, targets, fromIso(todayKey));
  const tagText = { low: 'Low fuel: lighter workout', high: 'Extra fuel', ok: 'On target', none: 'No calories logged' };
  $('#plan').innerHTML = plan.map(d => `
    <div class="day ${d.key === todayKey ? 'today' : ''}" tabindex="0">
      <div class="date">${d.key === todayKey ? 'Today · ' : ''}${fmtDate(d.date)}</div>
      <div class="wname">${d.name}</div>
      <div class="meta">${d.minutes ? `${d.minutes} min · ~${d.burn} kcal burned` : 'Recovery'}${d.todayCals ? ` · ${d.todayCals} kcal eaten` : ''}</div>
      <span class="tag ${d.fuel}">${tagText[d.fuel]}</span>
      <ul>${d.exercises.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
      ${d.note ? `<div class="note">${esc(d.note)}</div>` : ''}
    </div>`).join('');
}

function render() {
  const targets = state.profile ? computeTargets(state.profile) : null;
  renderStats(targets);
  renderHistory(targets);
  renderPlan(targets);
}

// ---------- events ----------
$('#profile-form').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target.elements;
  const days = [...document.querySelectorAll('#day-checks input:checked')].map(c => Number(c.value));
  state.profile = {
    sex: f.sex.value,
    age: Number(f.age.value),
    weight: Number(f.weight.value),
    heightFt: Number(f.heightFt.value),
    heightIn: Number(f.heightIn.value),
    activity: Number(f.activity.value),
    goal: f.goal.value,
    days,
  };
  save();
  render();
});

$('#log-form').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target.elements;
  const date = f.date.value;
  (state.logs[date] = state.logs[date] || []).push({ calories: Number(f.calories.value), note: f.note.value.trim() });
  save();
  f.calories.value = '';
  f.note.value = '';
  render();
});

$('#history').addEventListener('click', e => {
  const btn = e.target.closest('[data-del]');
  if (!btn) return;
  const [key, j] = btn.dataset.del.split('|');
  state.logs[key].splice(Number(j), 1);
  if (!state.logs[key].length) delete state.logs[key];
  save();
  render();
});

$('#plan').addEventListener('click', e => {
  const card = e.target.closest('.day');
  if (card) card.classList.toggle('open');
});
$('#plan').addEventListener('keydown', e => {
  const card = e.target.closest('.day');
  if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); card.classList.toggle('open'); }
});

// ---------- init ----------
$('#log-form').elements.date.value = iso(new Date());
if (state.profile) fillProfileForm(state.profile);
else renderDayChecks([1, 3, 5]);
render();
