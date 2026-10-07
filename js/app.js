import {
  createPlan,
  getProgress,
  setStepDone,
  setSubstepDone,
  insertSubsteps,
  findStep,
  isValidType,
  plural,
} from './plan.js';
import { getFallbackSteps, FALLBACK_TITLE } from './fallback.js';
import { requestReply, requestPlan, requestSplit, describeError, setTokenProvider } from './api.js';
import { createStorage, userPrefix, DEFAULT_SETTINGS, MAX_SCENARIOS } from './storage.js';
import {
  loadConfig,
  peekSessionUser,
  hasAuthRedirect,
  onAuthChange,
  getAccessToken,
  signIn,
  signUp,
  signInWithGoogle,
  resetPassword,
  updatePassword,
  signOut,
  fetchProfile,
  updateProfile,
  currentTimezone,
} from './auth.js';
import { createSync } from './sync.js';
import { validateEmail, validatePassword, validateName, guestPlansForImport } from './account.js';
import { isCrisis, makeMessage, CRISIS_REPLY, MESSAGE_MAX } from './chat.js';
import { greetingFor, GROUND } from './content.js';
import { IC } from './icons.js';
import { h, icon, replaceKeepFocus, announce, downloadJson } from './ui.js';
import { createOnboarding } from './screens/onboarding.js';
import { createHome } from './screens/home.js';
import { createCalm } from './screens/calm.js';
import { createChat } from './screens/chat-screen.js';
import { createPlanScreen } from './screens/plan-screen.js';
import { createDone } from './screens/done.js';
import { createSaved } from './screens/saved.js';
import { createProfile } from './screens/profile.js';
import { createProfileEdit } from './screens/profile-edit.js';
import { createAuth } from './screens/auth.js';
import {
  createHelpDialog,
  createConfirmSheet,
  createToast,
  createImportSheet,
  createDeleteAccountSheet,
} from './screens/overlays.js';
import { computeStats, uniquePlans, buildExport, exportFileName } from './stats.js';
import { dayKey, recordActivity, withCompletion, evaluateDay, syncToday, computeStreak, weekView } from './streak.js';
import { createStreakScreen } from './screens/streak.js';

// У гостя и у каждого аккаунта своё пространство в localStorage, чтобы данные не смешивались.
// Сохранённая сессия Supabase читается сразу, чтобы после перезагрузки не мелькали данные гостя.
const guestStorage = createStorage();
const restoredUser = peekSessionUser();
let storage = restoredUser ? createStorage(undefined, { prefix: userPrefix(restoredUser.id) }) : guestStorage;
let sync = null;
const FONT_SCALE = { m: 1, l: 1.12, xl: 1.25 };
const DONE_DELAY = 1100;

const media = (query) => window.matchMedia?.(query) ?? { matches: false, addEventListener() {} };
const darkQuery = media('(prefers-color-scheme: dark)');
const motionQuery = media('(prefers-reduced-motion: reduce)');

const $ = (id) => document.getElementById(id);
const els = {
  inner: $('app-inner'),
  header: $('header'),
  banner: $('net-banner'),
  stage: $('stage'),
  layers: $('layers'),
  tabbar: $('tabbar'),
  themeColor: document.querySelector('meta[name="theme-color"]'),
};

// ---------- Состояние ----------

function baseState() {
  return {
    screen: 'onb',
    onb: 0,
    onboarded: false,
    settings: { ...DEFAULT_SETTINGS },
    type: null,
    calmMode: 'breath',
    ground: 0,
    conversation: 0, // меняется при каждом новом разговоре, чтобы поздние ответы AI не попали в чужой
    messages: [],
    ai: 'idle',
    aiErrorText: '',
    plan: null,
    planStatus: 'idle',
    planFrom: 'chat',
    planRetrying: false,
    split: {}, // stepId -> 'loading' | { error }
    newIds: new Set(),
    scenarios: [],
    toast: null,
    helpOpen: false,
    helpReason: 'manual',
    confirmClear: false,
    dataOpen: false,
    online: navigator.onLine !== false,
    accountPromptSeen: false,
    accountHintSeen: false,
    showAccountHint: false,
    account: { enabled: null, user: null, profile: null, expired: false, pending: 0, signingOut: false },
    auth: { mode: 'welcome', busy: false, errors: {}, email: '', sentKind: null },
    authReturn: 'home',
    importOffer: null, // { count, busy }
    reminderTime: null, // у гостя; у аккаунта — в профиле
    firstSeenAt: null,
    serverPlans: [], // все планы аккаунта с сервера, для статистики
    exporting: false,
    profileEdit: { busy: false, errors: {} },
    deleteAccount: null, // { busy, error }
    streakLocal: { activity: {}, doneDays: [] }, // журнал активности и дни, посчитанные на устройстве
    serverDays: [], // засчитанные дни аккаунта с сервера
    streakMonth: null, // месяц календаря на экране серии, 'YYYY-MM'
    streakReturn: 'home',
  };
}

function initialState() {
  const state = baseState();
  const prefs = storage.loadPrefs();
  const session = storage.loadSession();
  Object.assign(state, prefs, { scenarios: storage.listScenarios() });
  if (restoredUser) state.account = { ...state.account, user: restoredUser };
  state.firstSeenAt ??= Date.now();
  state.streakLocal = storage.loadStreak();

  if (session) {
    Object.assign(state, session);
    state.planStatus = session.plan ? 'ready' : 'idle';
  }

  if (!state.onboarded) state.screen = 'onb';
  else if (state.screen === 'onb') state.screen = 'home';
  else if (['plan', 'done'].includes(state.screen) && !state.plan) state.screen = 'home';
  else if (state.screen === 'chat' && !state.messages.length) state.screen = 'home';

  // Перезагрузка во время ответа AI: реплика пользователя осталась без ответа
  const last = state.messages.at(-1);
  if (state.screen === 'chat' && last?.role === 'user' && !last.private) {
    state.ai = 'error';
    state.aiErrorText = 'Ответ не успел прийти. Это не ты — попробуем ещё раз.';
  }
  return state;
}

let state = initialState();

function isReduced(s = state) {
  return s.settings.reduce ?? motionQuery.matches;
}

let storageWarned = false;

let lastSyncedPlan = state.plan;

function persist() {
  const prefs = storage.savePrefs({
    onboarded: state.onboarded,
    settings: state.settings,
    accountPromptSeen: state.accountPromptSeen,
    accountHintSeen: state.accountHintSeen,
    reminderTime: state.reminderTime,
    firstSeenAt: state.firstSeenAt,
  });
  const keep = ['calm', 'chat', 'plan', 'saved', 'profile', 'done', 'streak'];
  storage.saveSession({
    screen: keep.includes(state.screen) ? state.screen : state.onboarded ? 'home' : 'onb',
    type: state.type,
    messages: state.messages,
    plan: state.planStatus === 'ready' ? state.plan : null,
    planFrom: state.planFrom,
    calmMode: state.calmMode,
  });
  // Любое изменение текущего плана аккаунта уходит на сервер: по нему считается серия
  if (sync && state.planStatus === 'ready' && state.plan && state.plan !== lastSyncedPlan) sync.savePlan(state.plan);
  lastSyncedPlan = state.plan;

  if (!prefs.ok && !storageWarned) {
    storageWarned = true;
    showToast('Браузер не даёт сохранять данные. После перезагрузки всё начнётся заново.', IC.info);
  }
}

function setState(patch, options) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  persist();
  render(options);
}

// ---------- Тосты ----------

let toastTimer = null;

function showToast(text, iconPath = IC.info, actionLabel = null, action = null) {
  clearTimeout(toastTimer);
  state = { ...state, toast: { text, icon: iconPath, actionLabel, action, key: Date.now() } };
  announce(actionLabel ? `${text}. Можно нажать «${actionLabel}»` : text);
  toastTimer = setTimeout(() => setState({ toast: null }), action ? 6500 : 4200);
}

// ---------- Действия ----------

const STORAGE_ERRORS = {
  quota: 'В браузере закончилось место. Удали старые сценарии.',
  unavailable: 'Браузер не даёт сохранять данные, например в приватном режиме.',
  limit: `Можно сохранить до ${MAX_SCENARIOS} сценариев. Удали ненужные, чтобы добавить новый.`,
};

function chatErrorText(error) {
  if (error.kind === 'offline' || !navigator.onLine) {
    return 'Сейчас нет сети, поэтому ответить не получится. Это не ты. Могу показать офлайн-план.';
  }
  if (error.kind === 'rate_limit') return 'Слишком много сообщений за минуту. Подожди немного — и попробуем ещё раз.';
  if (error.kind === 'timeout') return 'AI долго не отвечал. Это не ты — попробуем ещё раз.';
  return 'Не получилось связаться. Это не ты — попробуем ещё раз.';
}

/** Сохранённый план синхронизируется со списком сценариев при каждом изменении. */
function commitPlan(plan) {
  const result = storage.updateScenario(plan);
  return { plan, scenarios: result.scenarios };
}

let doneTimer = null;

function afterToggle(before, plan) {
  const after = getProgress(plan);
  clearTimeout(doneTimer);
  if (after.complete && !before.complete) {
    announce('Все шаги выполнены');
    // Пауза, чтобы человек увидел последнюю галочку, потом экран «Готово»
    doneTimer = setTimeout(() => {
      if (state.screen !== 'plan' || state.plan?.id !== plan.id || !getProgress(state.plan).complete) return;
      const saved = storage.addScenario(state.plan);
      if (saved.ok) sync?.setSaved(saved.scenarios.find((p) => p.id === state.plan.id) ?? state.plan, true);
      // Гостю после первого выполненного плана один раз мягко предлагаем аккаунт
      const hint = state.account.enabled === true && !state.account.user && !state.accountHintSeen;
      setState({ screen: 'done', scenarios: saved.scenarios, showAccountHint: hint, accountHintSeen: state.accountHintSeen || hint });
    }, DONE_DELAY);
  } else if (after.done !== before.done) {
    announce(`Сделано ${after.done} из ${after.total}`);
  }
}

const actions = {
  nextOnboarding: () => setState({ onb: Math.min(2, state.onb + 1) }),
  skipOnboarding: () => setState({ onb: 2 }),
  finishOnboarding() {
    // Если аккаунты настроены, один раз спрашиваем, сохранять ли прогресс
    const ask = state.account.enabled === true && !state.account.user && !state.accountPromptSeen;
    setState({ onboarded: true, onb: 0, screen: ask ? 'auth' : 'home', auth: { ...baseState().auth, mode: 'welcome' }, authReturn: 'home' });
  },
  replayOnboarding: () => setState({ screen: 'onb', onb: 0 }),

  goHome: () => setState({ screen: 'home' }),
  openSaved: () => setState({ screen: 'saved' }),
  openSettings: () => setState({ screen: 'profile' }),
  viewPlan: () => setState({ screen: 'plan' }),

  goBack() {
    if (state.screen === 'profile-edit') return setState({ screen: 'profile' });
    if (state.screen === 'streak') return setState({ screen: state.streakReturn ?? 'home' });
    if (state.screen === 'plan') {
      return setState({ screen: state.planFrom === 'saved' ? 'saved' : state.messages.length ? 'chat' : 'home' });
    }
    return setState({ screen: 'home' });
  },

  startCalm: (type) => setState({
    type: isValidType(type) ? type : null,
    screen: 'calm',
    calmMode: 'breath',
    ground: 0,
    conversation: state.conversation + 1,
    messages: [],
    ai: 'idle',
    plan: null,
    planStatus: 'idle',
    split: {},
  }),

  /** Тема или «Своя ситуация»: сразу в чат. Дыхание только по кнопке «Мне плохо прямо сейчас». */
  startChat: (type) => setState({
    type,
    screen: 'chat',
    conversation: state.conversation + 1,
    messages: [makeMessage('ai', greetingFor(type))],
    ai: 'idle',
    plan: null,
    planStatus: 'idle',
    split: {},
  }),

  /** Карточка «План готов» в чате открывает план, если он ещё существует. */
  openChatPlan(planId) {
    if (state.plan?.id === planId) return setState({ screen: 'plan', planFrom: 'chat' });
    const saved = state.scenarios.find((s) => s.id === planId);
    if (saved) return setState({ plan: saved, planStatus: 'ready', screen: 'plan', planFrom: 'chat', split: {} });
    showToast('Этот план уже заменён новым', IC.info);
    return render();
  },

  setCalmMode: (mode) => setState({ calmMode: mode, ground: mode === 'ground' ? 0 : state.ground }),
  nextGround: () => setState({ ground: Math.min(GROUND.length, state.ground + 1) }),

  calmDone() {
    const messages = state.messages.length ? state.messages : [makeMessage('ai', greetingFor(state.type))];
    setState({ screen: 'chat', messages });
  },

  /** Возвращает true, если сообщение принято (поле ввода можно очистить). */
  sendMessage(raw) {
    const text = String(raw ?? '').trim().slice(0, MESSAGE_MAX);
    if (!text || state.ai === 'typing') return false;

    if (isCrisis(text)) {
      // Такие сообщения не уходят в AI: сразу показываем живую помощь
      setState({
        messages: [
          ...state.messages,
          makeMessage('user', text, { private: true }),
          makeMessage('ai', CRISIS_REPLY, { private: true }),
          makeMessage('crisis', '', { private: true }),
        ],
        ai: 'idle',
        helpOpen: true,
        helpReason: 'crisis',
      });
      return true;
    }

    setState({ messages: [...state.messages, makeMessage('user', text)] });
    reply();
    return true;
  },

  retryReply: () => reply(),

  async makePlan() {
    if (state.planStatus === 'loading') return;
    const { type, messages, conversation } = state;
    setState({ screen: 'plan', planStatus: 'loading', plan: null, planFrom: 'chat', split: {}, ai: state.ai === 'error' ? 'idle' : state.ai });

    let plan;
    try {
      const result = await requestPlan({ type, messages });
      plan = createPlan({ type: type ?? 'all', title: result.title, steps: result.steps, source: 'api' });
    } catch (error) {
      plan = createPlan({
        type: type ?? 'all',
        title: FALLBACK_TITLE,
        steps: getFallbackSteps(type ?? 'all'),
        source: 'fallback',
        fallbackReason: describeError(error),
      });
    }
    // Пока ждали, человек мог начать новый разговор
    if (state.conversation !== conversation) return;
    setState({ ...trackPlan(plan), planStatus: 'ready', newIds: new Set() });
    announce(`План готов: ${plan.title}`);
  },

  showOfflinePlan() {
    const type = state.type ?? 'all';
    const plan = createPlan({
      type,
      title: FALLBACK_TITLE,
      steps: getFallbackSteps(type),
      source: 'fallback',
      fallbackReason: state.online ? 'Связаться с AI не получилось.' : 'Сейчас нет сети.',
    });
    setState({ screen: 'plan', planFrom: 'chat', ai: 'idle', planStatus: 'ready', ...trackPlan(plan), split: {} });
  },

  /** Повтор для офлайн-плана: при неудаче текущий план с отметками остаётся. */
  async retryPlan() {
    const old = state.plan;
    if (!old || state.planRetrying) return;
    setState({ planRetrying: true }, { focusKey: 'retry-plan' });
    try {
      const result = await requestPlan({ type: old.type, messages: state.planFrom === 'chat' ? state.messages : [] });
      if (state.plan?.id !== old.id) return setState({ planRetrying: false });
      // id сохраняем: если план уже в сценариях, он там и обновится
      const fresh = { ...createPlan({ type: old.type, title: result.title, steps: result.steps, source: 'api' }), id: old.id };
      const tracked = trackPlan(fresh);
      setState({ planRetrying: false, split: {}, ...commitPlan(tracked.plan), streakLocal: tracked.streakLocal });
      announce(`План готов: ${fresh.title}`);
    } catch (error) {
      if (state.plan?.id !== old.id) return setState({ planRetrying: false });
      const plan = { ...state.plan, fallbackReason: `${describeError(error)} Попробуй позже.` };
      setState({ planRetrying: false, ...commitPlan(plan) }, { focusKey: 'retry-plan' });
      announce('AI всё ещё недоступен, остаётся офлайн-план');
    }
  },

  toggleStep(stepId, done) {
    const before = getProgress(state.plan);
    const tracked = trackPlan(setStepDone(state.plan, stepId, done));
    setState({ ...commitPlan(tracked.plan), streakLocal: tracked.streakLocal });
    afterToggle(before, tracked.plan);
  },

  toggleSubstep(stepId, substepId, done) {
    const before = getProgress(state.plan);
    const tracked = trackPlan(setSubstepDone(state.plan, stepId, substepId, done));
    setState({ ...commitPlan(tracked.plan), streakLocal: tracked.streakLocal });
    afterToggle(before, tracked.plan);
  },

  openStreak: () => setState({ screen: 'streak', streakReturn: state.screen === 'streak' ? state.streakReturn : state.screen, streakMonth: null }),
  setStreakMonth: (month) => setState({ streakMonth: month }, { focusKey: undefined }),

  async splitStep(stepId) {
    const plan = state.plan;
    const step = findStep(plan, stepId);
    if (!step || state.split[stepId] === 'loading') return;
    setState({ split: { ...state.split, [stepId]: 'loading' } }, { focusKey: `step-${stepId}` });

    try {
      const substeps = await requestSplit({ type: plan.type, planTitle: plan.title, step });
      if (state.plan?.id !== plan.id || !findStep(state.plan, stepId)) return;
      const next = insertSubsteps(state.plan, stepId, substeps);
      const inserted = findStep(next, stepId).substeps;
      const split = { ...state.split };
      delete split[stepId];
      setState({ split, newIds: new Set(inserted.map((s) => s.id)), ...commitPlan(next) }, { focusKey: `sub-${inserted[0].id}` });
      announce(`Добавлено подшагов: ${inserted.length}`);
    } catch (error) {
      if (state.plan?.id !== plan.id) return;
      setState({ split: { ...state.split, [stepId]: { error: `Не получилось разбить шаг. ${describeError(error)}` } } });
    }
  },

  savePlan() {
    const result = storage.addScenario(state.plan);
    if (result.ok) sync?.setSaved(result.scenarios.find((p) => p.id === state.plan.id) ?? state.plan, true);
    if (result.ok) showToast('Сохранено в «Мои сценарии»', IC.check);
    else showToast(STORAGE_ERRORS[result.error], IC.info);
    setState({ scenarios: result.scenarios }, { focusKey: 'save' });
  },

  openScenario(id) {
    const plan = state.scenarios.find((s) => s.id === id);
    if (!plan) return;
    setState({
      plan,
      type: plan.type,
      planStatus: 'ready',
      screen: 'plan',
      planFrom: 'saved',
      conversation: state.conversation + 1,
      messages: [],
      ai: 'idle',
      split: {},
    });
  },

  deleteScenario(id) {
    const index = state.scenarios.findIndex((s) => s.id === id);
    const item = state.scenarios[index];
    if (!item) return;
    const result = storage.deleteScenario(id);
    if (!result.ok) {
      showToast(STORAGE_ERRORS[result.error], IC.info);
      return render();
    }
    // Фокус переходит на соседний сценарий, а если список опустел — на заголовок
    const next = result.scenarios[Math.min(index, result.scenarios.length - 1)];
    sync?.setSaved(item, false);
    showToast('Сценарий удалён', IC.trash, 'Вернуть', () => {
      const restored = storage.restoreScenario(item);
      if (restored.ok) sync?.setSaved(item, true);
      clearTimeout(toastTimer);
      setState({ scenarios: restored.scenarios, toast: null }, { focusKey: `open-${item.id}` });
    });
    setState({ scenarios: result.scenarios }, { focusKey: next ? `open-${next.id}` : undefined });
    if (!next) document.getElementById('saved-title')?.focus();
  },

  setSetting: (key, value) => setState({ settings: { ...state.settings, [key]: value } }),
  toggleDataInfo: () => setState({ dataOpen: !state.dataOpen }),
  askClear: () => setState({ confirmClear: true }),

  openHelp: (reason = 'manual') => setState({ helpOpen: true, helpReason: reason }),

  // ---------- Аккаунт ----------

  openAuth(mode = 'login') {
    listenAuth();
    setState({ screen: 'auth', auth: { ...baseState().auth, mode }, authReturn: state.screen === 'auth' ? state.authReturn : state.screen, showAccountHint: false });
  },

  setAuthMode(mode, email = state.auth.email) {
    setState({ auth: { ...baseState().auth, mode, email: String(email ?? '').trim() } });
  },

  closeAuth() {
    if (state.auth.mode === 'welcome') return actions.continueAsGuest();
    setState({ screen: state.authReturn ?? 'home' });
  },

  continueAsGuest: () => setState({ screen: 'home', accountPromptSeen: true }),

  dismissAccountHint: () => setState({ showAccountHint: false }),

  async submitAuth(kind, values) {
    if (state.auth.busy) return;
    const email = String(values.email ?? '').trim();
    const errors = {};
    if (kind !== 'reset' && kind !== 'change') {
      const e = validateEmail(email);
      if (e) errors.email = e;
    }
    if (kind === 'login' && !values.password) errors.password = 'Впиши пароль';
    if (kind === 'signup' || kind === 'reset' || kind === 'change') {
      const e = validatePassword(values.password);
      if (e) errors.password = e;
    }
    if (kind === 'signup') {
      const e = validateName(values.name);
      if (e) errors.name = e;
    }
    if (Object.keys(errors).length) return setState({ auth: { ...state.auth, email, errors } });

    listenAuth();
    setState({ auth: { ...state.auth, email, busy: true, errors: {} } });
    const request = {
      login: () => signIn({ email, password: values.password }),
      signup: () => signUp({ email, password: values.password, name: String(values.name ?? '').trim() }),
      forgot: () => resetPassword(email),
      reset: () => updatePassword(values.password),
      change: () => updatePassword(values.password),
    }[kind];
    const result = await request();

    if (!result.ok) {
      const field = result.code === 'user_already_exists' || result.code === 'email_exists' ? 'email'
        : result.code === 'weak_password' || result.code === 'same_password' ? 'password' : 'form';
      return setState({ auth: { ...state.auth, busy: false, errors: { [field]: result.error } } });
    }

    if (kind === 'forgot') return setState({ auth: { ...state.auth, busy: false, mode: 'sent', sentKind: 'reset' } });
    if (kind === 'signup' && !result.data?.session) {
      return setState({ auth: { ...state.auth, busy: false, mode: 'sent', sentKind: 'confirm' } });
    }
    if (kind === 'reset' || kind === 'change') {
      showToast('Пароль обновлён', IC.check);
      return setState({ screen: kind === 'change' ? 'profile' : 'home', auth: baseState().auth });
    }
    // Вход и регистрация без подтверждения почты: дальше всё сделает событие SIGNED_IN
    setState({ auth: { ...state.auth, busy: false } });
  },

  async signInWithGoogle() {
    if (state.auth.busy) return;
    listenAuth();
    setState({ auth: { ...state.auth, busy: true, errors: {} } });
    const result = await signInWithGoogle();
    // При успехе браузер уходит на страницу Google; сюда попадаем только с ошибкой
    if (!result.ok) setState({ auth: { ...state.auth, busy: false, errors: { form: result.error } } });
  },

  async signOut() {
    if (state.account.signingOut) return;
    if (sync?.pending && !navigator.onLine) {
      showToast('Последние изменения ещё не дошли до аккаунта. Выйти можно, когда появится интернет.', IC.wifiOff);
      return render();
    }
    setState({ account: { ...state.account, signingOut: true } });
    await sync?.flush();
    await signOut();
    leaveAccount('signout');
  },

  openProfileEdit: () => setState({ screen: 'profile-edit', profileEdit: { busy: false, errors: {} } }),

  async saveProfile({ display_name: rawName, avatar }) {
    if (state.profileEdit.busy || !state.account.user) return;
    const nameError = validateName(rawName);
    if (nameError) return setState({ profileEdit: { busy: false, errors: { name: nameError } } });
    setState({ profileEdit: { busy: true, errors: {} } });
    const result = await updateProfile(state.account.user.id, { display_name: String(rawName).trim(), avatar });
    if (!result.ok) {
      const text = state.online ? 'Не получилось сохранить. Это не ты — попробуй ещё раз.' : 'Нет сети. Профиль сохранится, когда появится интернет — попробуй чуть позже.';
      return setState({ profileEdit: { busy: false, errors: { form: text } } });
    }
    showToast('Профиль обновлён', IC.check);
    setState({ account: { ...state.account, profile: result.data }, profileEdit: { busy: false, errors: {} }, screen: 'profile' });
  },

  async setReminder(time) {
    if (!state.account.user) return setState({ reminderTime: time });
    const previous = state.account.profile;
    // Сразу показываем выбор, а если сервер не принял — возвращаем как было
    setState({ account: { ...state.account, profile: { ...previous, reminder_time: time } } });
    const result = await updateProfile(state.account.user.id, { reminder_time: time });
    if (!result.ok) {
      setState({ account: { ...state.account, profile: previous } });
      showToast('Не получилось сохранить напоминание. Попробуй, когда будет интернет.', IC.info);
      render();
    }
  },

  async exportData() {
    if (state.exporting) return;
    setState({ exporting: true });
    let plans = uniquePlans(state.scenarios, state.plan ? [state.plan] : [], state.serverPlans);
    if (sync && state.online) {
      const pulled = await sync.pull();
      if (pulled) plans = uniquePlans(pulled.all, plans);
    }
    downloadJson(exportFileName(), buildExport({
      account: state.account.user,
      profile: state.account.profile,
      settings: state.settings,
      plans,
      conversation: state.messages,
    }));
    setState({ exporting: false });
    showToast('Файл с данными скачан', IC.download);
    render();
  },

  askDeleteAccount: () => setState({ deleteAccount: { busy: false, error: null } }),
  cancelDeleteAccount: () => setState({ deleteAccount: null }),

  async deleteAccount() {
    if (!state.deleteAccount || state.deleteAccount.busy) return;
    setState({ deleteAccount: { busy: true, error: null } });
    let error = null;
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/account', { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) error = (await res.json().catch(() => null))?.error ?? 'Не получилось удалить аккаунт. Это не ты — попробуй чуть позже.';
    } catch {
      error = 'Нет связи с сервером. Удалить аккаунт можно, когда появится интернет.';
    }
    if (error) return setState({ deleteAccount: { busy: false, error } });

    setState({ deleteAccount: null, account: { ...state.account, signingOut: true } });
    sync?.stop();
    await signOut();
    leaveAccount('deleted');
  },

  async acceptImport() {
    if (!state.importOffer || state.importOffer.busy || !sync) return;
    setState({ importOffer: { ...state.importOffer, busy: true } });
    const items = guestPlansForImport({ scenarios: guestStorage.listScenarios(), current: guestStorage.loadSession()?.plan });
    const result = await sync.importPlans(items);
    if (!result.ok) {
      setState({ importOffer: { ...state.importOffer, busy: false } });
      showToast('Перенести не получилось. Это не ты — попробуем позже, предложу снова.', IC.info);
      return render();
    }
    await markImported();
    await refreshFromServer();
    setState({ importOffer: null });
    showToast(`Перенесено планов: ${items.length}`, IC.check);
    render();
  },

  async declineImport() {
    setState({ importOffer: null });
    await markImported();
  },
};

async function reply() {
  const { type, messages, conversation } = state;
  setState({ ai: 'typing' });
  try {
    const result = await requestReply({ type, messages });
    if (state.conversation !== conversation) return;
    const added = result.reply ? [makeMessage('ai', result.reply)] : [];

    if (!result.plan) return setState({ ai: 'idle', messages: [...state.messages, ...added] });

    // Модель сама собрала план через инструмент: карточка в чате и сразу экран плана
    const plan = createPlan({ type: type ?? 'all', title: result.plan.title, steps: result.plan.steps, source: 'api' });
    const n = plan.steps.length;
    if (!added.length) {
      added.push(makeMessage('ai', `План из ${n} ${plural(n, ['шага', 'шагов', 'шагов'])} готов. Начни с первого — он самый лёгкий.`));
    }
    added.push(makeMessage('plan', plan.title, { planId: plan.id }));
    setState({
      ai: 'idle',
      messages: [...state.messages, ...added],
      ...trackPlan(plan),
      planStatus: 'ready',
      planFrom: 'chat',
      split: {},
      screen: 'plan',
    });
    announce(`План готов: ${plan.title}`);
  } catch (error) {
    if (state.conversation !== conversation) return;
    setState({ ai: 'error', aiErrorText: chatErrorText(error) });
  }
}

// ---------- Аккаунт: вход, выход, синхронизация ----------

let authListening = false;

function listenAuth() {
  if (authListening) return;
  authListening = true;
  onAuthChange(handleAuthEvent).then((ok) => {
    if (!ok) authListening = false;
  });
}

function handleAuthEvent(event, session) {
  if (event === 'PASSWORD_RECOVERY') {
    if (session?.user) enterAccount(session.user, { silent: true });
    return setState({ screen: 'auth', auth: { ...baseState().auth, mode: 'reset' }, authReturn: 'home' });
  }
  if (session?.user && ['INITIAL_SESSION', 'SIGNED_IN', 'USER_UPDATED'].includes(event)) {
    return enterAccount(session.user);
  }
  if (event === 'INITIAL_SESSION' && !session && state.account.user) return leaveAccount('expired');
  if (event === 'SIGNED_OUT' && state.account.user && !state.account.signingOut) leaveAccount('expired');
}

/** Состояние из хранилища текущего пространства: сценарии, разговор и план. */
function dataFromStorage() {
  const session = storage.loadSession();
  return {
    scenarios: storage.listScenarios(),
    streakLocal: storage.loadStreak(),
    serverDays: [],
    messages: session?.messages ?? [],
    type: session?.type ?? null,
    plan: session?.plan ?? null,
    planStatus: session?.plan ? 'ready' : 'idle',
    planFrom: session?.planFrom ?? 'chat',
    conversation: state.conversation + 1,
    ai: 'idle',
    split: {},
  };
}

async function enterAccount(user, { silent = false } = {}) {
  const switching = state.account.user?.id !== user.id || storage === guestStorage;
  if (switching) {
    sync?.stop();
    storage = createStorage(undefined, { prefix: userPrefix(user.id) });
  }
  if (switching || !sync || state.account.expired) {
    sync = createSync({
      storage,
      userId: user.id,
      onExpired: () => leaveAccount('expired'),
      onChange: () => {
        if (state.account.pending !== sync?.pending) setState({ account: { ...state.account, pending: sync?.pending ?? 0 } });
      },
    });
  }

  const fromAuth = state.screen === 'auth';
  const patch = { account: { ...state.account, enabled: true, user: { id: user.id, email: user.email ?? '' }, expired: false, signingOut: false } };
  if (switching) Object.assign(patch, dataFromStorage());
  if (fromAuth || switching) {
    Object.assign(patch, {
      screen: fromAuth || !['home', 'saved', 'profile', 'calm'].includes(state.screen) ? 'home' : state.screen,
      auth: baseState().auth,
      accountPromptSeen: true,
    });
  }
  lastSyncedPlan = patch.plan ?? state.plan;
  setState(patch);
  if (fromAuth && !silent) showToast('Вход выполнен. Планы теперь в аккаунте', IC.check);
  if (fromAuth) render();

  await sync.flush();
  await refreshFromServer();
  await loadProfile(user.id);
}

async function refreshFromServer() {
  const pulled = await sync?.pull();
  if (!pulled) return;
  storage.replaceScenarios(pulled.scenarios);
  const serverDays = await sync?.pullStreak();
  setState({ scenarios: storage.listScenarios(), serverPlans: pulled.all, ...(serverDays ? { serverDays } : {}) });
}

async function loadProfile(userId) {
  const result = await fetchProfile(userId);
  if (!result.ok || state.account.user?.id !== userId) return;
  let profile = result.data;
  // День серии считается по часовому поясу профиля: держим его в актуальном состоянии
  const tz = currentTimezone();
  if (profile.timezone !== tz) {
    const updated = await updateProfile(userId, { timezone: tz });
    if (updated.ok) profile = updated.data;
  }
  const guestPlans = guestPlansForImport({ scenarios: guestStorage.listScenarios(), current: guestStorage.loadSession()?.plan });
  const offer = !profile.guest_imported_at && guestPlans.length && !importAsked.has(userId);
  setState({
    account: { ...state.account, profile },
    importOffer: offer ? { count: guestPlans.length, busy: false } : state.importOffer,
  });
}

// Если отметить перенос на сервере не получилось (нет сети), в этой вкладке больше не спрашиваем
const importAsked = new Set();

async function markImported() {
  const userId = state.account.user?.id;
  if (!userId) return;
  importAsked.add(userId);
  const result = await updateProfile(userId, { guest_imported_at: new Date().toISOString() });
  if (result.ok) setState({ account: { ...state.account, profile: result.data } });
}

/**
 * signout — человек вышел сам: кеш аккаунта на этом устройстве стираем.
 * expired — сессия закончилась: данные остаются, просим войти снова.
 */
function leaveAccount(reason) {
  if (reason === 'expired') {
    if (state.account.expired) return;
    setState({ account: { ...state.account, expired: true } });
    showToast('Сессия закончилась. Войди снова — данные на месте', IC.info, 'Войти', () => actions.openAuth('login'));
    return render();
  }

  sync?.stop();
  sync = null;
  if (storage !== guestStorage) storage.clearAll({ withPrefs: false });
  storage = guestStorage;
  lastSyncedPlan = guestStorage.loadSession()?.plan ?? null;
  setState({
    ...dataFromStorage(),
    // Вышли из профиля — там и остаёмся, уже с карточкой гостя
    screen: state.screen === 'profile' ? 'profile' : 'home',
    importOffer: null,
    serverPlans: [],
    account: { ...baseState().account, enabled: state.account.enabled },
  });
  showToast(reason === 'deleted' ? 'Аккаунт удалён. Береги себя' : 'Выход выполнен', reason === 'deleted' ? IC.check : IC.logout);
  render();
}

setTokenProvider(() => (state.account.user && !state.account.expired ? getAccessToken() : Promise.resolve(null)));

async function initAccounts() {
  const config = await loadConfig();
  setState({ account: { ...state.account, enabled: Boolean(config.accounts) } });
  if (config.accounts && (restoredUser || hasAuthRedirect())) listenAuth();
}

function closeHelp() {
  setState({ helpOpen: false });
}

function helpBreathe() {
  setState({ helpOpen: false, screen: 'calm', calmMode: 'breath' });
}

function clearAll() {
  guestStorage.clearAll();
  clearTimeout(doneTimer);
  clearTimeout(toastTimer);
  state = { ...baseState(), conversation: state.conversation + 1, account: { ...baseState().account, enabled: state.account.enabled } };
  render();
  announce('Все данные удалены');
}

// ---------- Отрисовка ----------

const SCREENS = {
  onb: (ctx) => createOnboarding(ctx, state.onb),
  home: createHome,
  calm: createCalm,
  chat: createChat,
  plan: createPlanScreen,
  done: createDone,
  saved: createSaved,
  profile: createProfile,
  'profile-edit': createProfileEdit,
  streak: createStreakScreen,
  auth: createAuth,
};

// Разделы нижней навигации. Остальные экраны — шаги одного сценария, там панель не нужна.
const TABS = [
  { screen: 'home', label: 'Главная', icon: IC.home },
  { screen: 'saved', label: 'Планы', icon: IC.bookmark },
  { screen: 'profile', label: 'Профиль', icon: IC.user },
];

let current = null;
let currentKey = '';
let firstRender = true;

function screenKey(s) {
  if (s.screen === 'onb') return `onb-${s.onb}`;
  if (s.screen === 'calm') return `calm-${s.calmMode}`;
  if (s.screen === 'auth') return `auth-${s.auth.mode}`;
  return s.screen;
}

function applyEnvironment() {
  const root = document.documentElement;
  const { theme, fs } = state.settings;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  root.dataset.reduced = String(isReduced());
  root.style.setProperty('--fs', String(FONT_SCALE[fs] ?? 1));
  const dark = theme === 'dark' || (theme === 'system' && darkQuery.matches);
  els.themeColor?.setAttribute('content', dark ? '#171C21' : '#F3EEE5');
}

function renderHeader() {
  const s = state.screen;
  const tab = TABS.some((t) => t.screen === s);
  const button = (path, label, onClick, focus) =>
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': label, dataset: { focus }, onClick }, icon(path, 22));

  replaceKeepFocus(els.header, [
    tab || s === 'onb'
      ? h('div', { class: `logo${s === 'onb' ? '' : ' logo--compact'}` },
        h('span', { class: 'logo__word' }, 'Паника-режим'))
      : null,
    ['chat', 'plan', 'profile-edit', 'streak'].includes(s) ? button(IC.back, 'Назад', actions.goBack, 'back') : null,
    ['calm', 'done'].includes(s) ? button(IC.close, 'Выйти на главную', actions.goHome, 'close') : null,
    s === 'auth' ? button(IC.close, state.auth.mode === 'welcome' ? 'Продолжить без аккаунта' : 'Закрыть', actions.closeAuth, 'close') : null,
    h('div', { class: 'header__spacer' }),
    h('button', { class: 'help-btn', type: 'button', dataset: { focus: 'help' }, onClick: () => actions.openHelp('manual') },
      icon(IC.heart, 18, { strokeWidth: 1.9 }), 'Живая помощь'),
  ]);
}

function renderTabbar() {
  const visible = TABS.some((t) => t.screen === state.screen);
  els.tabbar.hidden = !visible;
  if (!visible) return;
  replaceKeepFocus(els.tabbar, TABS.map((t) => h('button', {
    type: 'button',
    'aria-current': t.screen === state.screen ? 'page' : null,
    dataset: { focus: `tab-${t.screen}` },
    onClick: () => setState({ screen: t.screen }),
  }, icon(t.icon, 22), h('span', {}, t.label))));
}

function renderBanner() {
  const show = !state.online && state.screen !== 'onb';
  els.banner.hidden = !show;
  if (show && !els.banner.childElementCount) {
    els.banner.append(icon(IC.wifiOff, 20), h('span', {}, 'Нет сети. Дыхание и сохранённые планы работают и без неё.'));
  }
}

// ---------- Серия ----------

function userTimezone() {
  return (state.account.user && state.account.profile?.timezone) || currentTimezone();
}

/**
 * С планом поработали: отмечаем активность сегодня и пересчитываем только сегодняшний день.
 * Возвращает кусок состояния для setState.
 */
function trackPlan(plan) {
  const tracked = withCompletion(plan);
  const tz = userTimezone();
  const today = dayKey(Date.now(), tz);
  const activity = recordActivity(state.streakLocal.activity, tracked.id, today);
  const plans = new Map(uniquePlans([tracked], state.scenarios, state.serverPlans).map((p) => [p.id, p]));
  const { status } = evaluateDay({ day: today, activity, plans, timeZone: tz });
  const streakLocal = { activity, doneDays: syncToday(state.streakLocal.doneDays, today, status) };
  storage.saveStreak(streakLocal);
  return { plan: tracked, streakLocal };
}

/**
 * Что показать в виджете и на экране серии. У аккаунта прошлые дни — с сервера
 * (их пишет только триггер), сегодняшний считается здесь, чтобы отклик был сразу.
 */
function streakView(plans) {
  const tz = userTimezone();
  const today = dayKey(Date.now(), tz);
  const signedIn = Boolean(state.account.user);
  const local = state.streakLocal.doneDays;
  const doneDays = signedIn
    ? [...new Set([...state.serverDays.filter((d) => d !== today), ...local.filter((d) => d === today)])].sort()
    : local;
  const streak = computeStreak(doneDays, today);
  const map = new Map(plans.map((p) => [p.id, p]));
  const todayInfo = evaluateDay({ day: today, activity: state.streakLocal.activity, plans: map, timeZone: tz });
  return {
    ...streak,
    today,
    doneDays,
    remainingSteps: todayInfo.remainingSteps,
    week: weekView(doneDays, today, streak.restDays),
    guest: !signedIn && state.account.enabled === true,
  };
}

/** Состояние плюс вычисляемые поля для экранов. */
function derived() {
  const plans = uniquePlans(state.plan ? [state.plan] : [], state.scenarios, state.serverPlans);
  return {
    ...state,
    reduced: isReduced(),
    stats: computeStats(plans),
    streak: streakView(plans),
    reminderTime: state.account.user ? state.account.profile?.reminder_time?.slice(0, 5) ?? null : state.reminderTime,
  };
}

function renderScreen(options = {}) {
  const key = screenKey(state);
  const ctx = { state, actions };
  if (key !== currentKey) {
    current?.destroy?.();
    current = SCREENS[state.screen](ctx);
    currentKey = key;
    els.stage.replaceChildren(current.el);
    if (!firstRender && !state.helpOpen) {
      const target = current.focusTarget ?? current.el.querySelector('h1, h2, [tabindex="-1"]');
      target?.focus({ preventScroll: true });
    }
  }
  current.update?.(derived(), options);
}

let layerKey = '';
let returnFocus = null;

function renderLayers() {
  const modalKey = state.helpOpen ? `help-${state.helpReason}`
    : state.confirmClear ? 'confirm'
      : state.deleteAccount ? `delete-${state.deleteAccount.busy}-${state.deleteAccount.error ?? ''}`
        : state.importOffer ? `import-${state.importOffer.busy}` : '';
  const key = `${modalKey}|${state.toast?.key ?? ''}`;
  if (key === layerKey) return;
  const hadModal = Boolean(layerKey.split('|')[0]);
  const modalChanged = layerKey.split('|')[0] !== modalKey;
  layerKey = key;

  // Диалог пересоздаётся только при его смене, тост — независимо от диалога
  let modal = els.layers.querySelector('.dialog, .sheet-overlay');
  if (modalChanged) {
    if (modalKey && !hadModal) returnFocus = document.activeElement;
    modal = state.helpOpen
      ? createHelpDialog({ crisis: state.helpReason === 'crisis', onClose: closeHelp, onBreathe: helpBreathe })
      : state.confirmClear
        ? createConfirmSheet({ onCancel: () => setState({ confirmClear: false }), onConfirm: clearAll })
        : state.deleteAccount
          ? createDeleteAccountSheet({ ...state.deleteAccount, onCancel: actions.cancelDeleteAccount, onConfirm: actions.deleteAccount })
          : state.importOffer
            ? createImportSheet({ ...state.importOffer, onImport: actions.acceptImport, onSkip: actions.declineImport })
            : null;
  }
  els.layers.replaceChildren(
    ...[modal, state.toast ? createToast(state.toast, () => state.toast?.action?.()) : null].filter(Boolean),
  );
  // Пока открыт диалог, остальная страница недоступна для фокуса и скринридера
  els.inner.inert = Boolean(modal);

  if (modalChanged) {
    if (modal) modal.focusTarget?.focus();
    else if (hadModal && returnFocus?.isConnected) returnFocus.focus();
  }
}

function render(options) {
  applyEnvironment();
  renderHeader();
  renderTabbar();
  renderBanner();
  renderScreen(options);
  renderLayers();
  state.newIds = new Set();
  firstRender = false;
}

// ---------- Запуск ----------

window.addEventListener('online', () => setState({ online: true }));
window.addEventListener('offline', () => setState({ online: false }));
darkQuery.addEventListener?.('change', () => render());
motionQuery.addEventListener?.('change', () => render());
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (state.deleteAccount && !state.deleteAccount.busy) actions.cancelDeleteAccount();
  else if (state.importOffer && !state.importOffer.busy) actions.declineImport();
  else if (state.confirmClear) setState({ confirmClear: false });
  else if (state.helpOpen) closeHelp();
});

render();
initAccounts();
