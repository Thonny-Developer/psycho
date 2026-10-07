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
import { requestReply, requestPlan, requestSplit, describeError } from './api.js';
import { createStorage, DEFAULT_SETTINGS, MAX_SCENARIOS } from './storage.js';
import { isCrisis, makeMessage, CRISIS_REPLY, MESSAGE_MAX } from './chat.js';
import { greetingFor, GROUND } from './content.js';
import { IC } from './icons.js';
import { h, icon, replaceKeepFocus, announce } from './ui.js';
import { createOnboarding } from './screens/onboarding.js';
import { createHome } from './screens/home.js';
import { createCalm } from './screens/calm.js';
import { createChat } from './screens/chat-screen.js';
import { createPlanScreen } from './screens/plan-screen.js';
import { createDone } from './screens/done.js';
import { createSaved } from './screens/saved.js';
import { createSettings } from './screens/settings.js';
import { createHelpDialog, createConfirmSheet, createToast } from './screens/overlays.js';

const storage = createStorage();
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
  };
}

function initialState() {
  const state = baseState();
  const prefs = storage.loadPrefs();
  const session = storage.loadSession();
  Object.assign(state, prefs, { scenarios: storage.listScenarios() });

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

function persist() {
  const prefs = storage.savePrefs({ onboarded: state.onboarded, settings: state.settings });
  const keep = ['calm', 'chat', 'plan', 'saved', 'settings', 'done'];
  storage.saveSession({
    screen: keep.includes(state.screen) ? state.screen : state.onboarded ? 'home' : 'onb',
    type: state.type,
    messages: state.messages,
    plan: state.planStatus === 'ready' ? state.plan : null,
    planFrom: state.planFrom,
    calmMode: state.calmMode,
  });
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
      setState({ screen: 'done', scenarios: saved.scenarios });
    }, DONE_DELAY);
  } else if (after.done !== before.done) {
    announce(`Сделано ${after.done} из ${after.total}`);
  }
}

const actions = {
  nextOnboarding: () => setState({ onb: Math.min(2, state.onb + 1) }),
  skipOnboarding: () => setState({ onb: 2 }),
  finishOnboarding: () => setState({ onboarded: true, screen: 'home', onb: 0 }),
  replayOnboarding: () => setState({ screen: 'onb', onb: 0 }),

  goHome: () => setState({ screen: 'home' }),
  openSaved: () => setState({ screen: 'saved' }),
  openSettings: () => setState({ screen: 'settings' }),
  viewPlan: () => setState({ screen: 'plan' }),

  goBack() {
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

  /** «Своя ситуация»: сразу в чат, без дыхания — человек пришёл рассказать сам. */
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
    setState({ plan, planStatus: 'ready', newIds: new Set() });
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
    setState({ screen: 'plan', planFrom: 'chat', ai: 'idle', planStatus: 'ready', plan, split: {} });
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
      setState({ planRetrying: false, split: {}, ...commitPlan(fresh) });
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
    const plan = setStepDone(state.plan, stepId, done);
    setState(commitPlan(plan));
    afterToggle(before, plan);
  },

  toggleSubstep(stepId, substepId, done) {
    const before = getProgress(state.plan);
    const plan = setSubstepDone(state.plan, stepId, substepId, done);
    setState(commitPlan(plan));
    afterToggle(before, plan);
  },

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
    showToast('Сценарий удалён', IC.trash, 'Вернуть', () => {
      const restored = storage.restoreScenario(item);
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
      plan,
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

function closeHelp() {
  setState({ helpOpen: false });
}

function helpBreathe() {
  setState({ helpOpen: false, screen: 'calm', calmMode: 'breath' });
}

function clearAll() {
  storage.clearAll();
  clearTimeout(doneTimer);
  clearTimeout(toastTimer);
  state = { ...baseState(), conversation: state.conversation + 1 };
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
  settings: createSettings,
};

let current = null;
let currentKey = '';
let firstRender = true;

function screenKey(s) {
  if (s.screen === 'onb') return `onb-${s.onb}`;
  if (s.screen === 'calm') return `calm-${s.calmMode}`;
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
  const button = (path, label, onClick, focus) =>
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': label, dataset: { focus }, onClick }, icon(path, 22));

  replaceKeepFocus(els.header, [
    s === 'home' || s === 'onb'
      ? h('div', { class: `logo${s === 'onb' ? '' : ' logo--compact'}` },
        h('span', { class: 'logo__mark', 'aria-hidden': 'true' }),
        h('span', { class: 'logo__word' }, 'Паника-режим'))
      : null,
    ['chat', 'plan', 'saved', 'settings'].includes(s) ? button(IC.back, 'Назад', actions.goBack, 'back') : null,
    ['calm', 'done'].includes(s) ? button(IC.close, 'Выйти на главную', actions.goHome, 'close') : null,
    h('div', { class: 'header__spacer' }),
    s === 'home' ? button(IC.sliders, 'Настройки', actions.openSettings, 'settings') : null,
    h('button', { class: 'help-btn', type: 'button', dataset: { focus: 'help' }, onClick: () => actions.openHelp('manual') },
      icon(IC.heart, 18, { strokeWidth: 1.9 }), 'Живая помощь'),
  ]);
}

function renderBanner() {
  const show = !state.online && state.screen !== 'onb';
  els.banner.hidden = !show;
  if (show && !els.banner.childElementCount) {
    els.banner.append(icon(IC.wifiOff, 20), h('span', {}, 'Нет сети. Дыхание и сохранённые планы работают и без неё.'));
  }
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
  current.update?.({ ...state, reduced: isReduced() }, options);
}

let layerKey = '';
let returnFocus = null;

function renderLayers() {
  const modalKey = state.helpOpen ? `help-${state.helpReason}` : state.confirmClear ? 'confirm' : '';
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
  if (state.confirmClear) setState({ confirmClear: false });
  else if (state.helpOpen) closeHelp();
});

render();
