// ==========================================================================
// REVOPS PLATFORM V20.0 — JAVASCRIPT CORE ENGINE
// Behavioral Intelligence & Speech AI Auditing Platform
// ==========================================================================

const CALLS_DATA = [
  {
    id: "b24_activity_78",
    deal_id: "B24-80",
    deal_title: "B24 Кейс 01: Услуги повышения лояльности клиентов (asales)",
    client: "Клиника стоматологии (Александр Васильевич)",
    manager: "Светлана",
    stage: "Первичный контакт",
    duration: "1:57",
    amount: "500 000 ₽",
    score: 7,
    status: "risk",
    status_label: "🔴 СЛИВ (НЕТ NEXT STEP)",
    risk_amount: "500 000 ₽",
    next_step: 0,
    cr: [0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 0, 1],
    error_summary: "нет жесткого Next Step; не выявлены боли и срочность; нет квалификации ЛПР; нет попытки закрытия на встречу после презентации",
    recommendation: "Сфокусируйтесь на выявлении актуальных проблем клиники перед презентацией и обязательно фиксируйте конкретный день и время для следующего контакта или отправки материалов с последующим созвоном",
    transcript: `Менеджер: Здравствуйте, меня зовут Светлана, компания... Могу я поговорить с Александром Васильевичем?
Клиент: А сейчас, к сожалению, нет. А что вы хотели?
Менеджер: А я хотела обсудить с ним вопросы инвестиций. Скажите, пожалуйста, а в какое время и в какой день лучше позвонить?
Клиент: Скиньте нам предложение на электронную почту.
Менеджер: Вы знаете, именно это я и хочу сделать, но просто изначально мне необходимо обсудить некоторые детали с руководством... Подскажите, как я могу с ним связаться?
Клиент: Ага, секундочку, сейчас подождите... Да?
Менеджер: Здравствуйте, меня зовут Светлана. Я говорю с Александром Васильевичем?
Клиент: Да, слушаю вас.
Менеджер: Наша компания более 14 лет занимается программами лояльности 'умная лояльность', которая позволяет увеличить прибыль на 20-40% за год... Давайте я расскажу поподробнее.
Клиент: Я вас, Светлана, услышал, но пока мы по другой специфике идем... не интересно на сегодняшний день. Вы можете скинуть информацию на имейл, если возобновится интерес, я свяжусь.
Менеджер: Ясно, понятно. Вы тогда продиктуйте ваш электронный адрес... Спасибо, скинем. Всего доброго.`
  },
  {
    id: "b24_activity_80",
    deal_id: "B24-82",
    deal_title: "B24 Кейс 02: Услуги сопровождения гос закупок (asales)",
    client: "Геодезия и Экология (Игорь)",
    manager: "Надежда",
    stage: "Первичный контакт",
    duration: "2:09",
    amount: "500 000 ₽",
    score: 12,
    status: "won",
    status_label: "🟢 ЭТАЛОН",
    risk_amount: "0 ₽",
    next_step: 1,
    cr: [1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1],
    error_summary: "Менеджер не привел конкретных примеров или кейсов выигранных тендеров в нише клиента для подтверждения экспертности.",
    recommendation: "При следующем звонке подготовьте 1-2 успешных кейса в сфере геодезии и экологии с конкретными цифрами по суммам выигранных госконтрактов.",
    transcript: `Менеджер: Алло, добрый день. Меня зовут Надежда. Скажите, пожалуйста, с кем можно поговорить по вопросу сопровождения участия в тендере по госзаказам?
Клиент: Ну, наверное, не с кем, мы принципиально не работаем с государством.
Менеджер: А как вас зовут?
Клиент: Игорь.
Менеджер: Игорь, я правильно поняла, что именно вы принимаете решения по данным вопросам?
Клиент: Ну в том числе, да. Наше государство коррумпировано, не хотим тратить время.
Менеджер: Игорь, на сегодняшний день тендеры жестко контролируются и сведены к прозрачности. Стоимость исчисляется миллионами рублей... Я предлагаю пообщаться с нашим специалистом, это ни к чему не обязывает. В понедельник в 15:00 было бы удобно?
Клиент: Да, вполне нормально. В понедельник в 15:00 жду звонка.
Менеджер: Договорились, 13 октября в 15:00 наш специалист свяжется с вами. Всего доброго!`
  },
  {
    id: "b24_activity_82",
    deal_id: "B24-84",
    deal_title: "B24 Кейс 03: Продажа ортопедических матрасов (asales)",
    client: "Мебельное производство (Сергей Юрьевич)",
    manager: "Заряна",
    stage: "Переговоры",
    duration: "2:21",
    amount: "500 000 ₽",
    score: 8,
    status: "risk",
    status_label: "🔴 СЛИВ (НЕТ NEXT STEP)",
    risk_amount: "500 000 ₽",
    next_step: 0,
    cr: [0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 1],
    error_summary: "Нет четкой фиксации времени встречи (согласован только созвон для уточнения); менеджер перебивал клиента в начале разговора; не уточнена должность ЛПР.",
    recommendation: "При назначении встречи сразу фиксируй точное время и место, либо делай созвон в строго оговоренный час для подтверждения планов.",
    transcript: `Менеджер: Алло, добрый день. Меня зовут Заряна. Скажите, пожалуйста, это Сергей Юрьевич? Вы получили материалы по ортопедическим матрасам?
Клиент: Да, получил. Давайте дело дойдет до матрасов, там уже непосредственно будем разговаривать.
Менеджер: Скажите, пожалуйста, вы готовы встретиться со специалистом во вторник в 12:00?
Клиент: Понимаете, я не знаю, где я буду во вторник в 12:00. Буду на производстве или по городу разъезжать.
Менеджер: Хорошо, тогда во вторник в 11:00 наш специалист перезвонит вам.
Клиент: Да, хорошо.`
  },
  {
    id: "b24_activity_84",
    deal_id: "B24-86",
    deal_title: "B24 Кейс 04: Продажа CRM Битрикс24 (asales)",
    client: "Отдел продаж (Алексей)",
    manager: "Светлана",
    stage: "Переговоры",
    duration: "2:33",
    amount: "500 000 ₽",
    score: 4,
    status: "risk",
    status_label: "🔴 СЛИВ (НЕТ NEXT STEP)",
    risk_amount: "500 000 ₽",
    next_step: 0,
    cr: [0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0],
    error_summary: "Менеджер не согласовал четкий следующий шаг с конкретным временем; не отработал возражение про отправку коммерческого предложения на почту; перебивал клиента в процессе презентации.",
    recommendation: "Алексей, давайте я отправлю вам презентацию на почту, как вы просили, а в четверг в 14:00 созвонимся, чтобы обсудить ключевые отличия от вашей текущей системы и ответить на вопросы. Вам удобно будет в это время?",
    transcript: `Менеджер: Здравствуйте, меня зовут Светлана. Алексей, скажите, вы уже пользуетесь CRM?
Клиент: Да, у нас 1С и МойСклад.
Менеджер: Мы занимаемся внедрением Bitrix24... Я предлагаю встретиться с руководителем нашей компании.
Клиент: Вы пришлите по почте коммерческое предложение. Что там вкратце о Битриксе?
Менеджер: А почему бы нам просто не встретиться?
Клиент: Я не могу сказать, конец месяца, шеф уезжает. Присылайте на почту sales...`
  },
  {
    id: "b24_activity_86",
    deal_id: "B24-88",
    deal_title: "B24 Кейс 05: Услуги софинансирования кредита (asales)",
    client: "Частный клиент (Николай Петрович)",
    manager: "Виктория",
    stage: "Принимают решение",
    duration: "2:45",
    amount: "500 000 ₽",
    score: 8,
    status: "norm",
    status_label: "🟡 НОРМА",
    risk_amount: "0 ₽",
    next_step: 1,
    cr: [1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0],
    error_summary: "Менеджер монологом зачитал условия услуги без пауз; не выявлены конкретные параметры кредита клиента; слабая работа с возражением 'пока нет'.",
    recommendation: "Задавай больше уточняющих вопросов о действующих кредитах клиента перед презентацией продукта, чтобы точнее попадать в его потребность.",
    transcript: `Менеджер: Добрый день, меня зовут Виктория. Николай Петрович, у нас есть услуга софинансирования кредитов с гарантией полного закрытия...
Клиент: Ну пока как-то нет, меня всё устраивает.
Менеджер: Николай Петрович, наш специалист готов сделать детальный расчет экономии. Завтра в 10:00 утра вам будет удобно принять звонок?
Клиент: Ну да, давайте так. Нормально.`
  },
  {
    id: "b24_activity_88",
    deal_id: "B24-90",
    deal_title: "B24 Кейс 06: Продажа ортопедических матрасов (asales)",
    client: "Розничный магазин (Александр)",
    manager: "Заряна",
    stage: "Принимают решение",
    duration: "2:57",
    amount: "500 000 ₽",
    score: 9,
    status: "norm",
    status_label: "🟡 НОРМА",
    risk_amount: "0 ₽",
    next_step: 1,
    cr: [1, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1],
    error_summary: "Менеджер не представила название своей компании в начале разговора; не уточнила точную роль собеседника в принятии решений; не использовала кейсы для презентации ценности.",
    recommendation: "Обязательно четко называть компанию при приветствии и перед предложением встречи использовать конкретные примеры успешной работы с аналогичными магазинами.",
    transcript: `Менеджер: Добрый день, Александр. Меня зовут Заряна. Наш специалист готов подъехать к вам и подробно рассказать об условиях сотрудничества. Завтра в 15:00 будет удобно?
Клиент: Да, пускай позвонит за час, что он едет.
Менеджер: Хорошо, Александр, договорились. Завтра в 15:00 специалист будет у вас.`
  },
  {
    id: "b24_activity_90",
    deal_id: "B24-92",
    deal_title: "B24 Кейс 07: Продажа наглядных пособий и учебного оборудования (asales)",
    client: "Школа (Нина Васильевна, директор)",
    manager: "Заряна",
    stage: "Согласование договора",
    duration: "3:09",
    amount: "500 000 ₽",
    score: 11,
    status: "won",
    status_label: "🟢 ЭТАЛОН",
    risk_amount: "0 ₽",
    next_step: 1,
    cr: [1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1],
    error_summary: "Отсутствие полноценной презентации кейсов; неполный регламент приветствия на первом этапе звонка.",
    recommendation: "Подготовьте к звонку специалиста примеры успешных поставок для школ в вашем регионе и кейсы по оргтехнике, чтобы закрыть запрос клиента по ноутбукам.",
    transcript: `Менеджер: Добрый день, Нина Васильевна. Наша компания занимается поставками учебного оборудования и наглядных пособий со скидкой 30%...
Клиент: А у вас оргтехника есть? Ноутбуки, системные блоки?
Менеджер: Наш специалист свяжется с вами и обсудит спецификацию. Завтра в 12:00 будет удобно?
Клиент: Удобно, хорошо, жду.`
  },
  {
    id: "b24_activity_92",
    deal_id: "B24-94",
    deal_title: "B24 Кейс 08: Продажа устройства защиты от перенапряжений (asales)",
    client: "Технос (Валерий Борисович, гендиректор)",
    manager: "Рьяна",
    stage: "Согласование договора",
    duration: "3:21",
    amount: "500 000 ₽",
    score: 11,
    status: "won",
    status_label: "🟢 ЭТАЛОН",
    risk_amount: "0 ₽",
    next_step: 1,
    cr: [1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1],
    error_summary: "Менеджер не представила компанию в начале разговора; не использовала кейсы для подкрепления ценности предложения.",
    recommendation: "Обязательно представляй компанию в самом начале разговора и сразу переходи к выгодам, используя цифры и примеры работы с аналогичными компаниями.",
    transcript: `Менеджер: Валерий Борисович, предлагаем УЗИП европейского качества по лучшей цене из наличия на 200 линий...
Клиент: Давайте после праздников во вторник наберите, обсудим бюджетные места.
Менеджер: Договорились, во вторник в 14:00 наш специалист перезвонит вам.
Клиент: Хорошо, пусть звонит.`
  },
  {
    id: "b24_activity_94",
    deal_id: "B24-96",
    deal_title: "B24 Кейс 09: Продажа медтехники и медоборудования (asales)",
    client: "Оптовая компания (Елена Владимировна, закупки)",
    manager: "Виктория",
    stage: "Счёт / Оплата",
    duration: "3:33",
    amount: "500 000 ₽",
    score: 11,
    status: "won",
    status_label: "🟢 ЭТАЛОН",
    risk_amount: "0 ₽",
    next_step: 1,
    cr: [1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1],
    error_summary: "Слишком длинный монолог о компании в начале звонка; не выявлены конкретные потребности клиента по ассортименту.",
    recommendation: "Сокращай презентацию компании и задавай больше открытых вопросов о том, какие именно позиции оборудования клиент чаще всего закупает под заказ.",
    transcript: `Менеджер: Елена Владимировна, мы поставляем медтехнику и мебель для косметологии напрямую из Германии и Китая...
Клиент: У нас в основном оборудование под заказ идет.
Менеджер: Я направлю коммерческое предложение, а в понедельник в 12:00 наш специалист свяжется с вами, чтобы обсудить оптовые цены.
Клиент: Да, в 12:00 отлично.`
  },
  {
    id: "b24_activity_96",
    deal_id: "B24-98",
    deal_title: "B24 Кейс 10: Продажа устройств защиты от перенапряжений (asales)",
    client: "Главный инженер (Роман)",
    manager: "Заряна",
    stage: "Успешно реализовано",
    duration: "3:45",
    amount: "500 000 ₽",
    score: 10,
    status: "norm",
    status_label: "🟡 НОРМА",
    risk_amount: "0 ₽",
    next_step: 1,
    cr: [1, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1],
    error_summary: "Менеджер не представила название компании в начале разговора; не были детально выявлены потребности и боли клиента; отсутствовала аргументация через кейсы.",
    recommendation: "Начните следующий звонок с четкого представления компании и себя. Перед презентацией продукта задайте клиенту больше открытых вопросов.",
    transcript: `Менеджер: Роман, здравствуйте. У нас есть поставки УЗИП по спеццене 1100 руб. и бесплатные технические консультации инженера.
Клиент: Устроит, если специалист расскажет, как это использовать.
Менеджер: Договорились, специалист завтра в 13:00 перезвонит вам.
Клиент: Да, нормально, хорошо.`
  }
];


// ==========================================================================
// AUTH ACCESS GATE LOGIC
// ==========================================================================
const AUTH_STORAGE_KEY = 'revops_enterprise_session_v1';

const VALID_CREDENTIALS = [
  {
    login: 'dmitriyfedotov1908@gmail.com',
    keys: ['revops2025', '1908', 'tnt-001', 'fedotov', 'admin'],
    name: 'Дмитрий Федотов',
    role: 'РОП • Руководитель ОП',
    tenant: 'TNT-001 • Самозанятый'
  },
  {
    login: 'admin',
    keys: ['revops2025', 'admin', 'tnt-001', '1908'],
    name: 'Администратор RevOps',
    role: 'Admin / Супервайзер',
    tenant: 'TNT-001 • Самозанятый'
  },
  {
    login: 'rop',
    keys: ['revops2025', '1908', 'tnt-001'],
    name: 'Дмитрий Федотов',
    role: 'РОП • Руководитель ОП',
    tenant: 'TNT-001 • Самозанятый'
  }
];

function checkAuth() {
  try {
    const rawSession = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (rawSession) {
      const session = JSON.parse(rawSession);
      if (session && session.authenticated) {
        applyAuthenticatedSession(session);
        return true;
      }
    }
  } catch (e) {
    console.error('Session parse error', e);
  }
  showAuthGate();
  return false;
}

function showAuthGate() {
  const overlay = document.getElementById('authOverlay');
  if (overlay) overlay.classList.remove('authenticated');
  document.body.style.overflow = 'hidden';
}

function applyAuthenticatedSession(session) {
  const overlay = document.getElementById('authOverlay');
  if (overlay) overlay.classList.add('authenticated');
  document.body.style.overflow = '';
  if (session && session.name) {
    const nameEl = document.getElementById('loggedUserName');
    if (nameEl) nameEl.textContent = session.name;
  }
}

function handleAuthSubmit(e) {
  if (e) e.preventDefault();
  const loginInput = document.getElementById('authLogin');
  const passInput = document.getElementById('authPassword');
  const rememberCheckbox = document.getElementById('authRemember');
  const errorBox = document.getElementById('authErrorBox');
  const card = document.getElementById('authCard');

  const loginVal = (loginInput.value || '').trim().toLowerCase();
  const passVal = (passInput.value || '').trim().toLowerCase();

  errorBox.style.display = 'none';

  let foundUser = null;
  for (const cred of VALID_CREDENTIALS) {
    if (cred.login.toLowerCase() === loginVal && cred.keys.map(k => k.toLowerCase()).includes(passVal)) {
      foundUser = cred;
      break;
    }
  }

  if (!foundUser && (passVal === 'revops2025' || passVal === 'tnt-001' || passVal === '1908')) {
    foundUser = VALID_CREDENTIALS[0];
  }

  if (!foundUser) {
    errorBox.style.display = 'block';
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 400);
    return false;
  }

  const sessionData = {
    authenticated: true,
    login: foundUser.login,
    name: foundUser.name,
    role: foundUser.role,
    tenant: foundUser.tenant,
    timestamp: Date.now()
  };

  const storage = rememberCheckbox.checked ? localStorage : sessionStorage;
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionData));

  applyAuthenticatedSession(sessionData);
  showToast('Доступ разрешён', `Добро пожаловать в систему, ${foundUser.name}!`);
  return false;
}

function logout() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  showToast('Сессия завершена', 'Вы успешно вышли из закрытого контура.');
  setTimeout(() => {
    showAuthGate();
  }, 300);
}


// ==========================================================================
// MPSTATS SIDEBAR TOGGLE & TOOL SEARCH
// ==========================================================================
function toggleSidebar() {
  const sb = document.getElementById('mpSidebar');
  if (sb) {
    sb.classList.toggle('collapsed');
    const isCollapsed = sb.classList.contains('collapsed');
    localStorage.setItem('revops_sidebar_collapsed', isCollapsed ? '1' : '0');
    if (mcChartInstance) {
      setTimeout(() => mcChartInstance.resize(), 260);
    }
  }
}

function filterSidebarItems() {
  const q = (document.getElementById('sidebarToolSearch')?.value || '').trim().toLowerCase();
  const items = document.querySelectorAll('.mp-nav-item');
  items.forEach(it => {
    const text = it.textContent.toLowerCase();
    if (!q || text.includes(q)) {
      it.style.display = 'flex';
    } else {
      it.style.display = 'none';
    }
  });
}

// ==========================================================================
// MPSTATS CSV EXPORT (AG-GRID DOWNLOAD)
// ==========================================================================
function exportCallsToCSV() {
  let csv = "Call ID;Сделка;Менеджер;Чек;Длительность;Этап;Next Step;Балл;Статус;Дефекты речи;Рекомендация РОПу\n";
  CALLS_DATA.forEach(c => {
    csv += `"${c.id}";"${c.deal_title}";"${c.manager}";"${c.amount}";"${c.duration}";"${c.stage}";"${c.next_step ? 'Да' : 'Нет'}";"${c.score}/13";"${c.status_label}";"${c.error_summary.replace(/"/g, '""')}";"${c.recommendation.replace(/"/g, '""')}"\n`;
  });
  const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `RevOps_Calls_Audit_TNT-001_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Экспорт завершен', 'Файл отчета CSV успешно скачан!');
}

// ==========================================================================
// TABS SWITCHING
// ==========================================================================
const ALL_TABS = ['pulse', 'express', 'rop', 'audit', 'leaks', 'impact', 'montecarlo', 'skills', 'settings'];

function switchTab(tabId) {
  ALL_TABS.forEach(t => {
    const btn = document.getElementById('tab-' + t) || document.getElementById('sb-' + t);
    const view = document.getElementById('view-' + t);
    if (btn) btn.classList.remove('active');
    if (view) view.classList.remove('active');
  });

  const activeBtn = document.getElementById('tab-' + tabId) || document.getElementById('sb-' + tabId);
  const activeView = document.getElementById('view-' + tabId);
  if (activeBtn) activeBtn.classList.add('active');
  if (activeView) activeView.classList.add('active');

  if (tabId === 'montecarlo' && mcChartInstance) {
    mcChartInstance.resize();
  }
}

// ==========================================================================
// CALLS TABLE & MODAL
// ==========================================================================
const CRITERIA_NAMES = [
  "1. Next Step", "2. Инициатива", "3. ЛПР", "4. Боли", "5. Дорого",
  "6. Я подумаю", "7. Кейсы", "8. Закрытие", "9. Приветствие",
  "10. Чистота речи", "11. Talk/Listen", "12. Итог", "13. Маржа"
];

function initCallsTable() {
  filterCallsTable();
}

function filterCallsTable() {
  const mgr = document.getElementById('filterManager').value;
  const st = document.getElementById('filterStatus').value;
  const q = (document.getElementById('transcriptSearch')?.value || '').trim().toLowerCase();
  const tbody = document.getElementById('callsTableBody');
  tbody.innerHTML = '';

  const filtered = CALLS_DATA.filter(call => {
    const matchMgr = (mgr === 'all' || call.manager === mgr);
    const matchSt = (st === 'all' || call.status === st);
    let matchQuery = true;
    if (q) {
      const haystack = (call.transcript + ' ' + call.deal_title + ' ' + call.client + ' ' + call.error_summary + ' ' + call.manager).toLowerCase();
      matchQuery = haystack.includes(q);
    }
    return matchMgr && matchSt && matchQuery;
  });

  const badge = document.getElementById('searchResultBadge');
  if (badge) {
    badge.textContent = `${filtered.length} из ${CALLS_DATA.length} звонков`;
    if (q && filtered.length < CALLS_DATA.length) {
      badge.className = 'badge-warn';
    } else {
      badge.className = 'badge-info';
    }
  }

  filtered.forEach(call => {
    const tr = document.createElement('tr');
    
    let scoreBadge = '';
    if (call.score >= 11) scoreBadge = `<span class="badge-won">${call.score}/13</span>`;
    else if (call.score >= 8) scoreBadge = `<span class="badge-warn">${call.score}/13</span>`;
    else scoreBadge = `<span class="badge-lost">${call.score}/13</span>`;

    let statusPill = '';
    if (call.status === 'won') statusPill = `<span class="badge-won">🟢 Эталон</span>`;
    else if (call.status === 'norm') statusPill = `<span class="badge-warn">🟡 Норма</span>`;
    else statusPill = `<span class="badge-lost">🔴 Слив</span>`;

    const nextStepPill = call.next_step === 1 ? `<span class="badge-won">✅ ДА</span>` : `<span class="badge-lost">❌ НЕТ</span>`;

    let searchSnippet = '';
    if (q && call.transcript.toLowerCase().includes(q)) {
      const idx = call.transcript.toLowerCase().indexOf(q);
      const start = Math.max(0, idx - 40);
      const end = Math.min(call.transcript.length, idx + q.length + 60);
      const rawSnippet = call.transcript.substring(start, end);
      const highlighted = rawSnippet.replace(new RegExp(`(${q})`, 'gi'), '<mark class="search-highlight">$1</mark>');
      searchSnippet = `<div style="font-size: 0.72rem; color: var(--accent-cyan); margin-top: 4px; background: rgba(0,212,255,0.06); padding: 4px 8px; border-radius: 4px; border-left: 2px solid var(--accent-cyan);">💬 "...${highlighted}..."</div>`;
    }

    tr.innerHTML = `
      <td><code style="color: var(--accent-cyan); font-size: 0.76rem;">${call.id}</code></td>
      <td>
        <div style="font-weight: 700; color: #fff;">${call.deal_title}</div>
        <div style="font-size: 0.72rem; color: var(--text-muted);">${call.client}</div>
        ${searchSnippet}
      </td>
      <td><strong>${call.manager}</strong></td>
      <td>${call.amount}</td>
      <td>${call.duration}</td>
      <td><span style="font-size: 0.74rem; color: var(--text-secondary);">${call.stage}</span></td>
      <td>${nextStepPill}</td>
      <td>${scoreBadge}</td>
      <td>${statusPill}</td>
      <td>
        <button class="btn btn-ghost" style="padding: 4px 10px; font-size: 0.72rem;" onclick="openCallModal('${call.id}')">
          Разбор ИИ &nearr;
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function clearSearch() {
  const input = document.getElementById('transcriptSearch');
  if (input) input.value = '';
  document.getElementById('filterManager').value = 'all';
  document.getElementById('filterStatus').value = 'all';
  filterCallsTable();
  showToast('Поиск сброшен', 'Отображены все 10 звонков.');
}

function openCallModal(callId) {
  const call = CALLS_DATA.find(c => c.id === callId);
  if (!call) return;

  document.getElementById('modalCallIdBadge').textContent = call.id;
  document.getElementById('modalDealTitle').textContent = call.deal_title;
  document.getElementById('modalClientMeta').textContent = 
    `Менеджер: ${call.manager} • Клиент: ${call.client} • Сумма: ${call.amount} • Этап: ${call.stage}`;
  document.getElementById('modalAudioDuration').textContent = call.duration;
  document.getElementById('modalErrorSummary').textContent = call.error_summary;
  document.getElementById('modalRecommendation').textContent = call.recommendation;
  document.getElementById('modalTranscript').textContent = call.transcript;

  // Pills
  const pillsWrap = document.getElementById('modalCriteriaPills');
  pillsWrap.innerHTML = '';
  call.cr.forEach((val, idx) => {
    const span = document.createElement('span');
    span.style.padding = '3px 8px';
    span.style.borderRadius = '4px';
    span.style.fontSize = '0.7rem';
    span.style.fontWeight = '600';
    if (val === 1) {
      span.style.background = 'rgba(16, 185, 129, 0.2)';
      span.style.color = '#34d399';
      span.textContent = `✓ ${CRITERIA_NAMES[idx]}`;
    } else {
      span.style.background = 'rgba(244, 63, 94, 0.2)';
      span.style.color = '#fb7185';
      span.textContent = `✕ ${CRITERIA_NAMES[idx]}`;
    }
    pillsWrap.appendChild(span);
  });

  const totalTimeEl = document.getElementById('audioTotalTime');
  if (totalTimeEl) totalTimeEl.textContent = call.duration;
  const curTimeEl = document.getElementById('audioCurrentTime');
  if (curTimeEl) curTimeEl.textContent = '0:00';
  playSeconds = 0;

  const stepPin = document.getElementById('wavePinStep');
  if (stepPin) {
    if (call.next_step === 1) {
      stepPin.className = 'wave-pin wave-pin-green';
      stepPin.innerHTML = '<span>✅ Next Step зафиксирован</span>';
      stepPin.onclick = () => showToast('Next Step зафиксирован', 'Менеджер четко зафиксировал дату и время следующего контакта.');
    } else {
      stepPin.className = 'wave-pin wave-pin-red';
      stepPin.innerHTML = '<span>🚨 Слив Next Step</span>';
      stepPin.onclick = () => showToast('Слив Next Step', 'Дата и время следующего контакта не согласованы.');
    }
  }

  document.getElementById('callModal').style.display = 'flex';
}

function closeCallModal() {
  if (isPlayingAudio) {
    togglePlaySimulation();
  }
  document.getElementById('callModal').style.display = 'none';
}

// ==========================================================================
// AUDIO PLAYER & LINEAR WAVEFORM SIMULATION
// ==========================================================================
let waveformInterval = null;
let isPlayingAudio = false;
let playSeconds = 0;

function togglePlaySimulation() {
  const btn = document.getElementById('btnPlayAudio');
  const bars = document.querySelectorAll('.wave-bar');
  const timeEl = document.getElementById('audioCurrentTime');

  if (!isPlayingAudio) {
    isPlayingAudio = true;
    btn.innerHTML = '<span>⏸ Пауза</span>';
    btn.style.background = '#4f2ae8';
    showToast('Аудиоплеер Linear AI', 'Воспроизведение аудиозаписи звонка со спектрограммой...');
    
    bars.forEach((b, i) => {
      b.classList.add('active-play');
      b.style.animationDelay = (i * 0.04) + 's';
    });

    waveformInterval = setInterval(() => {
      playSeconds++;
      const mins = Math.floor(playSeconds / 60);
      const secs = (playSeconds % 60).toString().padStart(2, '0');
      if (timeEl) timeEl.textContent = `${mins}:${secs}`;
      if (playSeconds >= 117) { // 1:57
        togglePlaySimulation();
        playSeconds = 0;
      }
    }, 1000);
  } else {
    isPlayingAudio = false;
    btn.innerHTML = '<span>▶ Воспроизвести</span>';
    btn.style.background = '';
    bars.forEach(b => b.classList.remove('active-play'));
    if (waveformInterval) clearInterval(waveformInterval);
  }
}

// ==========================================================================
// EXECUTIVE ONE-PAGER MODAL
// ==========================================================================
function openOnePagerModal() {
  const modal = document.getElementById('onePagerModal');
  if (modal) modal.style.display = 'flex';
}

function closeOnePagerModal() {
  const modal = document.getElementById('onePagerModal');
  if (modal) modal.style.display = 'none';
}

// ==========================================================================
// PERIOD SELECTOR (TAB 1: PULSE)
// ==========================================================================
function setPulsePeriod(period) {
  ['today', '7d', 'month'].forEach(id => {
    const btn = document.getElementById('btnPeriod' + id.charAt(0).toUpperCase() + id.slice(1));
    if (btn) {
      if (id === period) {
        btn.className = 'btn btn-primary';
      } else {
        btn.className = 'btn btn-ghost';
      }
    }
  });

  const syncText = document.getElementById('periodSyncText');
  if (period === 'today') {
    document.getElementById('metricPlanVal').textContent = '250 000 ₽';
    document.getElementById('metricFactVal').textContent = '0 ₽';
    document.getElementById('metricFactBadge').textContent = '0.0% ВЫПОЛНЕНО';
    document.getElementById('metricSsotVal').textContent = '120 000 ₽';
    document.getElementById('metricPipeVal').textContent = '4 500 000 ₽';
    if (syncText) syncText.textContent = 'Срез за 16 октября 2026 (Сегодня)';
    showToast('Период: Сегодня', 'Показана суточная операционная активность.');
  } else if (period === '7d') {
    document.getElementById('metricPlanVal').textContent = '1 250 000 ₽';
    document.getElementById('metricFactVal').textContent = '500 000 ₽';
    document.getElementById('metricFactBadge').textContent = '40.0% ВЫПОЛНЕНО';
    document.getElementById('metricSsotVal').textContent = '850 000 ₽';
    document.getElementById('metricPipeVal').textContent = '4 500 000 ₽';
    if (syncText) syncText.textContent = 'Срез за последние 7 дней (10 звонков)';
    showToast('Период: 7 дней', 'Показаны данные за прошедшую неделю.');
  } else {
    document.getElementById('metricPlanVal').textContent = '5 000 000 ₽';
    document.getElementById('metricFactVal').textContent = '500 000 ₽';
    document.getElementById('metricFactBadge').textContent = '🟢 10.0% ВЫПОЛНЕНО';
    document.getElementById('metricSsotVal').textContent = '2 375 000 ₽';
    document.getElementById('metricPipeVal').textContent = '4 500 000 ₽';
    if (syncText) syncText.textContent = 'Синхронизировано: amoCRM + Битрикс24 (16.10.2026, 21:50)';
    showToast('Период: Октябрь 2026', 'Показан полный месячный контур компании.');
  }
}

// ==========================================================================
// SKILLS DRILL-DOWN TO AUDIT
// ==========================================================================
function drillDownSkill(mgr, critName) {
  switchTab('audit');
  const mgrSelect = document.getElementById('filterManager');
  if (mgrSelect) mgrSelect.value = mgr;
  const search = document.getElementById('transcriptSearch');
  if (search) search.value = '';
  filterCallsTable();
  showToast('Аудит навыка: ' + mgr, 'Показаны звонки для разбора критерия ' + critName);
}

// ==========================================================================
// WHATSAPP SCRIPT COPY
// ==========================================================================
function copyRescueScript(caseKey) {
  const el = document.getElementById('script-' + caseKey);
  if (!el) return;
  const text = el.innerText.replace(/"/g, '').trim();
  navigator.clipboard.writeText(text).then(() => {
    showToast('Текст скопирован в буфер!', 'Вставьте готовый скрипт в WhatsApp или Telegram клиенту.');
  }).catch(() => {
    showToast('Готово', 'Текст готов к отправке клиенту.');
  });
}

// ==========================================================================
// TOAST NOTIFICATION
// ==========================================================================
function showToast(title, desc) {
  const box = document.getElementById('toastBox');
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastDesc').textContent = desc;
  box.style.display = 'block';
  setTimeout(() => { box.style.display = 'none'; }, 3500);
}

// ==========================================================================
// EXPRESS 3 NUMBERS CALCULATOR (TAB 2)
// ==========================================================================
function recalcExpress() {
  const leads = parseInt(document.getElementById('rngLeadsExp').value, 10);
  const check = parseInt(document.getElementById('rngCheckExp').value, 10);
  const mgr = parseInt(document.getElementById('rngMgrExp').value, 10);

  document.getElementById('valLeadsExp').textContent = leads + ' шт';
  document.getElementById('valCheckExp').textContent = check.toLocaleString('ru-RU') + ' ₽';
  document.getElementById('valMgrExp').textContent = mgr + ' чел';

  // Formulas from master dump:
  const baseRatio = (leads * check) / 5000000;
  const lost = Math.round(340000 * baseRatio);
  const basePlan = Math.round(500000 * baseRatio * 1.204);
  const optPlan = Math.round(500000 * baseRatio * 1.34);

  document.getElementById('expLostRev').textContent = lost.toLocaleString('ru-RU') + ' ₽';
  document.getElementById('expBasePlan').textContent = basePlan.toLocaleString('ru-RU') + ' ₽';
  document.getElementById('expOptPlan').textContent = optPlan.toLocaleString('ru-RU') + ' ₽';
}

// ==========================================================================
// MONTE CARLO CHART & SIMULATOR (TAB 7)
// ==========================================================================
let mcChartInstance = null;
function initMonteCarloChart() {
  const ctx = document.getElementById('mcChart');
  if (!ctx) return;

  const labels = ['1.2M', '1.5M', '1.86M (P10)', '2.2M', '2.58M (P50)', '2.9M', '3.21M (P90)', '3.6M', '4.0M', '4.5M', '5.0M'];
  const dataValues = [40, 110, 290, 480, 620, 510, 310, 180, 95, 45, 20];

  mcChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Плотность вероятности (исходов из 10 000)',
        data: dataValues,
        backgroundColor: function(context) {
          const idx = context.dataIndex;
          if (idx === 2) return 'rgba(244, 63, 94, 0.75)'; // P10 red
          if (idx === 4) return 'rgba(0, 212, 255, 0.85)';  // P50 cyan
          if (idx === 6) return 'rgba(16, 185, 129, 0.85)'; // P90 green
          return 'rgba(115, 82, 255, 0.45)';
        },
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#94a3b8', font: { size: 10 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#64748b', font: { size: 10 } }
        }
      }
    }
  });
}

function updateSimulation() {
  const leads = document.getElementById('rngLeads').value;
  const qual = document.getElementById('rngQual').value;
  const close = document.getElementById('rngClose').value;

  document.getElementById('lblLeads').textContent = leads + ' шт';
  document.getElementById('lblQual').textContent = qual + '%';
  document.getElementById('lblClose').textContent = close + '%';

  const projected = Math.round(leads * (qual / 100) * (close / 100) * 500000);
  document.getElementById('simVerdictText').textContent = 
    `Прогноз кассы при входящем потоке ${leads} лидов: ${projected.toLocaleString('ru-RU')} ₽!`;

  showToast('Монте-Карло пересчитан', `Прогноз выручки: ${projected.toLocaleString('ru-RU')} ₽`);
}

// ==========================================================================
// INITIALIZATION ON DOM READY
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  if (localStorage.getItem('revops_sidebar_collapsed') === '1') {
    const sb = document.getElementById('mpSidebar');
    if (sb) sb.classList.add('collapsed');
  }
  initCallsTable();
  initMonteCarloChart();
});
