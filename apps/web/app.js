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
        manager: "Заряна",
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
      const backdrop = document.getElementById('sidebarBackdrop');
      if (!sb) return;

      if (window.innerWidth <= 1024) {
        sb.classList.toggle('mobile-open');
        const isOpen = sb.classList.contains('mobile-open');
        if (backdrop) backdrop.classList.toggle('active', isOpen);
      } else {
        sb.classList.toggle('collapsed');
        const isCollapsed = sb.classList.contains('collapsed');
        localStorage.setItem('revops_sidebar_collapsed', isCollapsed ? '1' : '0');
        if (mcChartInstance) {
          setTimeout(() => mcChartInstance.resize(), 260);
        }
      }
    }

    function closeMobileSidebar() {
      const sb = document.getElementById('mpSidebar');
      const backdrop = document.getElementById('sidebarBackdrop');
      if (sb) sb.classList.remove('mobile-open');
      if (backdrop) backdrop.classList.remove('active');
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


    const TAB_LABELS = {
      pulse: '1. Пульс выручки',
      express: '2. Экспресс-аудит',
      rop: '3. Пьедестал РОПа',
      audit: '4. ИИ-Аудит звонков',
      leaks: '5. Воронка утечек',
      impact: '6. Влияние на выручку',
      montecarlo: '7. Monte Carlo симуляция',
      skills: '8. Навыки & Payroll',
      settings: '9. Настройки & Интеграции'
    };

    function filterRepAudit(repName) {
      switchTab('audit');
      const sel = document.getElementById('filterManager');
      if (sel) {
        sel.value = repName;
        filterCallsTable();
      }
      showToast('Фильтр по менеджеру', `Открыт аудит звонков сотрудника: ${repName}`);
    }

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

      // Update Breadcrumbs
      const bc = document.getElementById('currentViewBreadcrumb');
      if (bc && TAB_LABELS[tabId]) {
        bc.textContent = TAB_LABELS[tabId];
      }

      // Close mobile sidebar if open
      closeMobileSidebar();

      if (tabId === 'montecarlo' && mcChartInstance) {
        mcChartInstance.resize();
      }
      if (tabId === 'pulse' && revPacingChartInstance) {
        revPacingChartInstance.resize();
      }
      if (tabId === 'rop' && repPerfChartInstance) {
        repPerfChartInstance.resize();
      }
      if (tabId === 'audit' && speechRadarChartInstance) {
        speechRadarChartInstance.resize();
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


    let currentTableDensity = 'excel-pro';
    let activeExpandedCallId = null;

    function setTableDensity(mode) {
      currentTableDensity = mode;
      const tc = document.getElementById('callsTableContainer');
      const btnPro = document.getElementById('btnDensityPro');
      const btnComfort = document.getElementById('btnDensityComfort');

      if (mode === 'excel-pro') {
        if (tc) tc.classList.add('excel-pro');
        if (btnPro) { btnPro.style.background = 'rgba(115,82,255,0.3)'; btnPro.style.color = '#fff'; }
        if (btnComfort) { btnComfort.style.background = 'transparent'; btnComfort.style.color = 'var(--text-secondary)'; }
      } else {
        if (tc) tc.classList.remove('excel-pro');
        if (btnComfort) { btnComfort.style.background = 'rgba(115,82,255,0.3)'; btnComfort.style.color = '#fff'; }
        if (btnPro) { btnPro.style.background = 'transparent'; btnPro.style.color = 'var(--text-secondary)'; }
      }
      localStorage.setItem('revops_table_density', mode);
      showToast('Режим таблицы', mode === 'excel-pro' ? 'Включен ультра-плотный режим (Excel Pro)' : 'Включен комфортный режим');
    }

    function toggleInlineCallDetails(callId, event) {
      if (event) event.stopPropagation();

      const existingExpand = document.getElementById(`expand-row-${callId}`);
      if (existingExpand) {
        existingExpand.remove();
        const mainRow = document.getElementById(`call-row-${callId}`);
        if (mainRow) mainRow.classList.remove('expanded');
        activeExpandedCallId = null;
        return;
      }

      // Close previously open drawer if any
      if (activeExpandedCallId) {
        const prevExpand = document.getElementById(`expand-row-${activeExpandedCallId}`);
        if (prevExpand) prevExpand.remove();
        const prevRow = document.getElementById(`call-row-${activeExpandedCallId}`);
        if (prevRow) prevRow.classList.remove('expanded');
      }

      const mainRow = document.getElementById(`call-row-${callId}`);
      const call = CALLS_DATA.find(c => c.id === callId);
      if (!mainRow || !call) return;

      mainRow.classList.add('expanded');
      activeExpandedCallId = callId;

      const expandTr = document.createElement('tr');
      expandTr.id = `expand-row-${callId}`;
      expandTr.className = 'inline-expand-row';

      const nextStepColor = call.next_step === 1 ? '#10b981' : '#f43f5e';
      const nextStepBg = call.next_step === 1 ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)';
      const nextStepText = call.next_step === 1 ? '✓ Слот встречи зафиксирован' : '✕ Слив: точный день и время не зафиксированы';

      expandTr.innerHTML = `
        <td colspan="22" class="inline-expand-cell">
          <div class="inline-expand-drawer">
            <!-- Header Bar -->
            <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 14px; flex-wrap: wrap;">
              <div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="badge-info" style="font-family: 'JetBrains Mono', monospace;">${call.id}</span>
                  <span class="badge-won">${call.deal_id}</span>
                  <span style="font-size: 0.72rem; color: var(--text-muted);">&bull; Длительность: <strong>${call.duration}</strong></span>
                </div>
                <h3 style="font-size: 1.05rem; font-weight: 800; color: #fff; margin-top: 4px;">
                  ${call.deal_title}
                </h3>
                <div style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 2px;">
                  Менеджер: <strong>${call.manager}</strong> &bull; Клиент: ${call.client} &bull; Сумма: <strong style="color: #34d399; font-family: 'JetBrains Mono', monospace;">${call.amount}</strong> &bull; Этап: ${call.stage}
                </div>
              </div>

              <div style="display: flex; align-items: center; gap: 8px;">
                <button class="btn btn-emerald" onclick="copyRescueScriptByCallId('${call.id}')" style="font-size: 0.72rem; padding: 6px 12px;">
                  <span>💬 Скопировать в WhatsApp</span>
                </button>
                <button class="btn btn-primary" onclick="openCallModal('${call.id}')" style="font-size: 0.72rem; padding: 6px 12px;">
                  <span>Полный экран &nearr;</span>
                </button>
                <button class="btn btn-ghost" onclick="toggleInlineCallDetails('${call.id}')" style="padding: 6px 10px; font-size: 0.72rem;">✕ Свернуть</button>
              </div>
            </div>

            <!-- 4-Step Audit Timeline -->
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px;">
              <div style="padding: 8px; background: rgba(16,185,129,0.08); border-left: 3px solid #10b981; border-radius: 4px;">
                <div style="font-size: 0.68rem; color: #34d399; font-weight: 700;">0:00 &bull; Вступление</div>
                <div style="font-size: 0.72rem; color: #fff; margin-top: 2px;">Приветствие и регламент</div>
              </div>
              <div style="padding: 8px; background: rgba(16,185,129,0.08); border-left: 3px solid #10b981; border-radius: 4px;">
                <div style="font-size: 0.68rem; color: #34d399; font-weight: 700;">0:35 &bull; Квалификация</div>
                <div style="font-size: 0.72rem; color: #fff; margin-top: 2px;">Выявление болей и ЛПР</div>
              </div>
              <div style="padding: 8px; background: rgba(251,191,36,0.08); border-left: 3px solid #fbbf24; border-radius: 4px;">
                <div style="font-size: 0.68rem; color: #fde68a; font-weight: 700;">1:10 &bull; Презентация</div>
                <div style="font-size: 0.72rem; color: #fff; margin-top: 2px;">Оффер и кейсы</div>
              </div>
              <div style="padding: 8px; background: ${nextStepBg}; border-left: 3px solid ${nextStepColor}; border-radius: 4px;">
                <div style="font-size: 0.68rem; color: ${nextStepColor}; font-weight: 700;">1:45 &bull; Next Step</div>
                <div style="font-size: 0.72rem; color: #fff; margin-top: 2px;">${nextStepText}</div>
              </div>
            </div>

            <!-- 2-Column Details: Left = Error & Recommendation, Right = Transcript -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <div style="padding: 12px; background: rgba(244,63,94,0.08); border: 1px solid rgba(244,63,94,0.3); border-radius: var(--radius-sm);">
                  <div style="font-size: 0.7rem; font-weight: 700; color: #fb7185; text-transform: uppercase;">ДЕФЕКТЫ РЕЧИ И ОШИБКИ:</div>
                  <div style="font-size: 0.78rem; color: #fff; margin-top: 4px; line-height: 1.4;">${call.error_summary}</div>
                </div>

                <div style="padding: 12px; background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.3); border-radius: var(--radius-sm);">
                  <div style="font-size: 0.7rem; font-weight: 700; color: #34d399; text-transform: uppercase;">РЕКОМЕНДАЦИЯ РОПу / ИИ-КОУЧИНГ:</div>
                  <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 4px; line-height: 1.4;">${call.recommendation}</div>
                </div>

                <div style="padding: 10px 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); font-size: 0.74rem;">
                  <span style="color: var(--text-muted);">Выручка под угрозой:</span> <strong style="color: #fb7185; font-family: 'JetBrains Mono', monospace;">${call.risk_amount}</strong>
                </div>
              </div>

              <div>
                <div style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">
                  Стенограмма диалога (Gemini 3.5 Flash):
                </div>
                <pre style="white-space: pre-wrap; font-family: 'Inter', sans-serif; font-size: 0.74rem; line-height: 1.5; color: var(--text-primary); background: rgba(0,0,0,0.4); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); max-height: 200px; overflow-y: auto;">${call.transcript}</pre>
              </div>
            </div>
          </div>
        </td>
      `;

      mainRow.parentNode.insertBefore(expandTr, mainRow.nextSibling);
    }

    function copyRescueScriptByCallId(callId) {
      // Map to case
      const caseMap = {
        'b24_activity_78': 'case01',
        'b24_activity_80': 'case02',
        'b24_activity_82': 'case03',
        'b24_activity_84': 'case04',
        'b24_activity_86': 'case05'
      };
      const key = caseMap[callId];
      if (key && typeof copyRescueScript === 'function') {
        copyRescueScript(key);
      } else {
        showToast('WhatsApp Скрипт', 'Шаблон сообщения скопирован в буфер обмена.');
      }
    }

    function filterCallsTable() {
      const mgr = document.getElementById('filterManager')?.value || 'all';
      const st = document.getElementById('filterStatus')?.value || 'all';
      const q = (document.getElementById('transcriptSearch')?.value || '').trim().toLowerCase();
      const tbody = document.getElementById('callsTableBody');
      if (!tbody) return;
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
        badge.className = (q && filtered.length < CALLS_DATA.length) ? 'badge-warn' : 'badge-info';
      }

      const rowsCountEl = document.getElementById('agRowsCount');
      if (rowsCountEl) rowsCountEl.textContent = `${filtered.length} строк`;

      filtered.forEach((call, rowIdx) => {
        const tr = document.createElement('tr');
        tr.id = `call-row-${call.id}`;
        tr.className = 'call-row';

        let scoreBadge = '';
        if (call.score >= 11) scoreBadge = `<span class="badge-won" style="font-family: 'JetBrains Mono', monospace;">${call.score}/13</span>`;
        else if (call.score >= 8) scoreBadge = `<span class="badge-warn" style="font-family: 'JetBrains Mono', monospace;">${call.score}/13</span>`;
        else scoreBadge = `<span class="badge-lost" style="font-family: 'JetBrains Mono', monospace;">${call.score}/13</span>`;

        let statusPill = '';
        if (call.status === 'won') statusPill = `<span class="badge-won">🟢 Эталон</span>`;
        else if (call.status === 'norm') statusPill = `<span class="badge-warn">🟡 Норма</span>`;
        else statusPill = `<span class="badge-lost">🔴 Слив</span>`;

        let searchSnippet = '';
        if (q && call.transcript.toLowerCase().includes(q)) {
          const idx = call.transcript.toLowerCase().indexOf(q);
          const start = Math.max(0, idx - 30);
          const end = Math.min(call.transcript.length, idx + q.length + 50);
          const rawSnippet = call.transcript.substring(start, end);
          const highlighted = rawSnippet.replace(new RegExp(`(${q})`, 'gi'), '<mark class="search-highlight">$1</mark>');
          searchSnippet = `<div style="font-size: 0.70rem; color: var(--accent-cyan); margin-top: 3px;">💬 "...${highlighted}..."</div>`;
        }

        // 13 criteria heatmap cells
        let crCells = '';
        call.cr.forEach((val, idx) => {
          const pass = (val === 1);
          const icon = pass ? '1' : '0';
          const cls = pass ? 'cr-pass' : 'cr-fail';
          const tip = `${pass ? '✓ Выполнено' : '✕ Дефект'}: ${CRITERIA_NAMES[idx]}`;
          crCells += `<td style="text-align: center; padding: 4px 2px;"><span class="cr-dot ${cls}" title="${tip}">${icon}</span></td>`;
        });

        const riskCol = (call.status === 'risk')
          ? `<strong style="color: #fb7185; font-family: 'JetBrains Mono', monospace; font-size: 0.74rem;">${call.risk_amount}</strong>`
          : `<span style="color: #34d399; font-size: 0.72rem;">0 ₽</span>`;

        tr.innerHTML = `
          <td><code style="color: var(--accent-cyan); font-size: 0.74rem;">${call.id}</code></td>
          <td>
            <div style="font-weight: 700; color: #fff; font-size: 0.78rem;">${call.deal_title}</div>
            <div style="font-size: 0.70rem; color: var(--text-muted);">${call.client}</div>
            ${searchSnippet}
          </td>
          <td><strong style="font-size: 0.76rem;">${call.manager}</strong></td>
          <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.74rem; font-weight: 700;">${call.amount}</td>
          <td><span style="font-size: 0.72rem; color: var(--text-secondary);">${call.stage}</span></td>
          ${crCells}
          <td style="text-align: center;">${scoreBadge}</td>
          <td style="text-align: center;">${statusPill}</td>
          <td style="text-align: right;">${riskCol}</td>
          <td style="text-align: center;">
            <button class="btn btn-ghost" style="padding: 3px 8px; font-size: 0.68rem; border-color: rgba(115,82,255,0.3); color: #c4b5fd;" onclick="toggleInlineCallDetails('${call.id}', event)">
              <span>Разбор ▾</span>
            </button>
          </td>
        `;

        tr.onclick = (e) => {
          if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
            toggleInlineCallDetails(call.id);
          }
        };

        tbody.appendChild(tr);
      });

      // Calculate team summary for each cr1..cr13
      let crSums = Array(13).fill(0);
      let totalRisk = 0;
      let totalScore = 0;

      filtered.forEach(c => {
        c.cr.forEach((val, idx) => {
          if (val === 1) crSums[idx]++;
        });
        totalScore += c.score;
        if (c.status === 'risk') totalRisk += 500000;
      });

      const count = filtered.length || 1;
      let crFootCells = '';
      crSums.forEach((sum, idx) => {
        const pct = Math.round((sum / count) * 100);
        let color = '#34d399';
        if (pct < 50) color = '#fb7185';
        else if (pct < 80) color = '#fbbf24';
        crFootCells += `<td style="text-align: center; padding: 6px 2px; font-size: 0.68rem; color: ${color};" title="Среднее по команде: ${CRITERIA_NAMES[idx]} = ${pct}%">${pct}%</td>`;
      });

      const avgScore = (totalScore / count).toFixed(1);
      const foot = document.getElementById('callsTableFoot');
      if (foot) {
        foot.innerHTML = `
          <tr>
            <td colspan="5" style="padding: 8px 12px; color: #fff; font-size: 0.74rem;">
              <span>📊 СРЕДНИЙ % ПРОХОЖДЕНИЯ СТАНДАРТОВ (КОМАНДА):</span>
            </td>
            ${crFootCells}
            <td style="text-align: center; color: var(--accent-cyan); font-family: 'JetBrains Mono', monospace; font-size: 0.78rem;">${avgScore}/13</td>
            <td style="text-align: center;"><span class="badge-won" style="font-size: 0.65rem;">70% Win</span></td>
            <td style="text-align: right; color: #fb7185; font-family: 'JetBrains Mono', monospace; font-size: 0.78rem;">${totalRisk.toLocaleString('ru-RU')} ₽</td>
            <td style="text-align: center; font-size: 0.70rem; color: var(--text-muted);">${count} звонков</td>
          </tr>
        `;
      }
    }


    function setAuditStatusFilter(status) {
      const sel = document.getElementById('filterStatus');
      if (sel) {
        sel.value = status;
        filterCallsTable();
        const labelMap = { won: '🟢 Эталон', norm: '🟡 Норма', risk: '🔴 Слив' };
        showToast('Фильтр применён', 'Отображены звонки категории: ' + (labelMap[status] || status));
      }
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

      // Update Step Timeline Next Step status
      const tlStep = document.getElementById('stepTimelineNextStep');
      const tlStatus = document.getElementById('stepTimelineNextStepStatus');
      const tlTime = document.getElementById('stepTimelineNextStepTime');
      if (tlStep && tlStatus && tlTime) {
        if (call.next_step === 1) {
          tlStep.style.background = 'rgba(16, 185, 129, 0.08)';
          tlStep.style.borderLeftColor = '#10b981';
          tlTime.style.color = '#34d399';
          tlStatus.textContent = '✓ Слот встречи зафиксирован';
          tlStatus.style.color = '#34d399';
        } else {
          tlStep.style.background = 'rgba(244, 63, 94, 0.08)';
          tlStep.style.borderLeftColor = '#f43f5e';
          tlTime.style.color = '#fca5a5';
          tlStatus.textContent = '✕ Слив: нет точного времени';
          tlStatus.style.color = '#fca5a5';
        }
      }

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

    let waveformInterval = null;
    let isPlayingAudio = false;
    let playSeconds = 0;

    function getCallDurationSeconds() {
      const durEl = document.getElementById('modalAudioDuration');
      if (durEl && durEl.textContent) {
        const parts = durEl.textContent.trim().split(':');
        if (parts.length === 2) {
          const m = parseInt(parts[0], 10) || 0;
          const s = parseInt(parts[1], 10) || 0;
          return (m * 60) + s;
        }
      }
      return 117; // fallback
    }

    function togglePlaySimulation() {
      const btn = document.getElementById('btnPlayAudio');
      const bars = document.querySelectorAll('.wave-bar');
      const timeEl = document.getElementById('audioCurrentTime');
      const totalSec = getCallDurationSeconds();

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
          
          // Update scrubber progress along waveform
          const totalBars = bars.length || 42;
          const currentBar = Math.min(totalBars - 1, Math.round((playSeconds / totalSec) * (totalBars - 1)));
          updateWaveformScrub(currentBar, totalBars);

          if (playSeconds >= totalSec) {
            togglePlaySimulation();
            playSeconds = 0;
            if (timeEl) timeEl.textContent = '0:00';
            updateWaveformScrub(0, totalBars);
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

    function updateWaveformScrub(activeIdx, totalBars) {
      const container = document.getElementById('waveformBarsContainer');
      if (!container) return;
      const bars = container.querySelectorAll('.wave-bar');
      bars.forEach((b, i) => {
        if (i <= activeIdx) {
          b.style.opacity = '1';
          b.style.filter = 'brightness(1.35)';
        } else {
          b.style.opacity = '0.35';
          b.style.filter = 'none';
        }
      });
    }

    function initWaveformScrubbing() {
      const container = document.getElementById('waveformBarsContainer');
      if (!container) return;
      const bars = container.querySelectorAll('.wave-bar');
      const totalBars = bars.length || 42;
      bars.forEach((bar, idx) => {
        bar.style.cursor = 'pointer';
        bar.title = 'Перемотка звонка';
        bar.onclick = (e) => {
          e.stopPropagation();
          const totalSec = getCallDurationSeconds();
          const targetSec = Math.round((idx / (totalBars - 1)) * totalSec);
          playSeconds = targetSec;
          const mins = Math.floor(playSeconds / 60);
          const secs = (playSeconds % 60).toString().padStart(2, '0');
          const timeEl = document.getElementById('audioCurrentTime');
          if (timeEl) timeEl.textContent = `${mins}:${secs}`;
          updateWaveformScrub(idx, totalBars);
          showToast('Аудиоплеер', `Перемотка на ${mins}:${secs}`);
        };
      });
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
      // Lost = 340,000 baseline scaled
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

    // ==========================================================================
    // INTERACTIVE CHARTS ENGINE (CHART.JS 4.4.2 SUITE)
    // ==========================================================================
    let revPacingChartInstance = null;
    let repPerfChartInstance = null;
    let speechRadarChartInstance = null;

    let currentRevMode = 'cum'; // 'cum' or 'daily'
    let currentConversionMultiplier = 1.0;

    const PACING_LABELS = ['1 Окт', '3 Окт', '6 Окт', '9 Окт', '12 Окт', '15 Окт', '18 Окт', '21 Окт', '24 Окт', '27 Окт', '30 Окт'];
    const PLAN_CUM_DATA = [0, 500000, 1000000, 1500000, 2000000, 2500000, 3000000, 3500000, 4000000, 4500000, 5000000];
    const FACT_CUM_DATA = [0, 0, 0, 0, 0, 500000, 500000, 500000, 500000, 500000, 500000];

    function calculateSsotData(multiplier) {
      return [
        null, null, null, null, null,
        500000,
        Math.round(500000 + 400000 * multiplier),
        Math.round(500000 + 800000 * multiplier),
        Math.round(500000 + 1200000 * multiplier),
        Math.round(500000 + 1550000 * multiplier),
        Math.round(500000 + 1875000 * multiplier)
      ];
    }

    function initRevenuePacingChart() {
      const ctx = document.getElementById('revenuePacingChart');
      if (!ctx) return;

      const ssotData = calculateSsotData(currentConversionMultiplier);

      revPacingChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: PACING_LABELS,
          datasets: [
            {
              label: 'Факт Won (500 000 ₽)',
              data: FACT_CUM_DATA,
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              borderWidth: 3,
              fill: true,
              tension: 0.35,
              pointRadius: [0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0],
              pointBackgroundColor: '#34d399',
              pointBorderColor: '#fff',
              pointHoverRadius: 8
            },
            {
              label: 'План таргета (5 000 000 ₽)',
              data: PLAN_CUM_DATA,
              borderColor: '#00d4ff',
              borderWidth: 2,
              borderDash: [5, 5],
              fill: false,
              tension: 0.1,
              pointRadius: 0
            },
            {
              label: 'SSOT Прогноз кассы',
              data: ssotData,
              borderColor: '#fbbf24',
              backgroundColor: 'rgba(251, 191, 36, 0.08)',
              borderWidth: 2.5,
              fill: true,
              tension: 0.35,
              pointRadius: [0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 6],
              pointBackgroundColor: '#fbbf24',
              pointHoverRadius: 8
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(14, 18, 28, 0.95)',
              titleColor: '#fff',
              bodyColor: '#cbd5e1',
              borderColor: 'rgba(255, 255, 255, 0.12)',
              borderWidth: 1,
              padding: 12,
              displayColors: true,
              callbacks: {
                label: function(context) {
                  const val = context.parsed.y;
                  if (val === null || val === undefined) return '';
                  return ` ${context.dataset.label}: ${val.toLocaleString('ru-RU')} ₽`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.04)' },
              ticks: { color: '#94a3b8', font: { size: 11 } }
            },
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: {
                color: '#94a3b8',
                font: { family: 'JetBrains Mono', size: 11 },
                callback: function(value) {
                  return (value / 1000000).toFixed(1) + 'M ₽';
                }
              }
            }
          }
        }
      });
    }

    function setRevenueChartMode(mode) {
      if (!revPacingChartInstance) return;
      currentRevMode = mode;
      
      const btnCum = document.getElementById('btnChartModeCum');
      const btnDaily = document.getElementById('btnChartModeDaily');

      if (mode === 'cum') {
        btnCum.style.background = 'rgba(115,82,255,0.3)';
        btnCum.style.color = '#fff';
        btnDaily.style.background = 'transparent';
        btnDaily.style.color = 'var(--text-secondary)';

        revPacingChartInstance.data.datasets[0].data = FACT_CUM_DATA;
        revPacingChartInstance.data.datasets[1].data = PLAN_CUM_DATA;
        revPacingChartInstance.data.datasets[2].data = calculateSsotData(currentConversionMultiplier);
        revPacingChartInstance.options.scales.y.ticks.callback = function(val) {
          return (val / 1000000).toFixed(1) + 'M ₽';
        };
      } else {
        btnDaily.style.background = 'rgba(115,82,255,0.3)';
        btnDaily.style.color = '#fff';
        btnCum.style.background = 'transparent';
        btnCum.style.color = 'var(--text-secondary)';

        // Daily values
        const dailyPlan = Array(11).fill(166667);
        const dailyFact = [0, 0, 0, 0, 0, 500000, 0, 0, 0, 0, 0];
        const dailySsot = [0, 0, 0, 0, 0, 500000, 133333, 133333, 133333, 133333, 133333];

        revPacingChartInstance.data.datasets[0].data = dailyFact;
        revPacingChartInstance.data.datasets[1].data = dailyPlan;
        revPacingChartInstance.data.datasets[2].data = dailySsot;
        revPacingChartInstance.options.scales.y.ticks.callback = function(val) {
          return (val / 1000).toFixed(0) + 'k ₽';
        };
      }
      revPacingChartInstance.update();
    }

    function toggleChartSeries(idx) {
      if (!revPacingChartInstance) return;
      const isVisible = revPacingChartInstance.isDatasetVisible(idx);
      if (isVisible) {
        revPacingChartInstance.hide(idx);
      } else {
        revPacingChartInstance.show(idx);
      }
    }

    function updateRevenueSimulation(val) {
      currentConversionMultiplier = val / 100;
      document.getElementById('lblConversionVal').textContent = val + '%';
      
      const totalProjected = Math.round(500000 + 1875000 * currentConversionMultiplier);
      document.getElementById('lblSimProjectedCash').textContent = totalProjected.toLocaleString('ru-RU') + ' ₽';

      if (revPacingChartInstance && currentRevMode === 'cum') {
        revPacingChartInstance.data.datasets[2].data = calculateSsotData(currentConversionMultiplier);
        revPacingChartInstance.update('none');
      }
    }

    function resetRevenueSimulation() {
      const slider = document.getElementById('sliderConversion');
      if (slider) slider.value = 100;
      updateRevenueSimulation(100);
      showToast('Симулятор сброшен', 'Конверсия воронки возвращена к 100% (норматив).');
    }

    // ==========================================================================
    // REP PERFORMANCE COMPARISON CHART
    // ==========================================================================
        const REP_NAMES = ['Заряна', 'Надежда', 'Виктория', 'Светлана'];

    function getDynamicRepMetrics() {
      const pipe = [];
      const score = [];
      const nextstep = [];
      const risk = [];

      REP_NAMES.forEach(rep => {
        const repCalls = CALLS_DATA.filter(c => c.manager === rep);
        const count = repCalls.length || 1;
        const totalPipe = repCalls.length * 500000;
        const totalScore = repCalls.reduce((acc, c) => acc + c.score, 0);
        const nsCount = repCalls.filter(c => c.next_step === 1).length;
        const riskAmt = repCalls.filter(c => c.status === 'risk').length * 500000;

        pipe.push(totalPipe);
        score.push(parseFloat((totalScore / count).toFixed(1)));
        nextstep.push(Math.round((nsCount / count) * 100));
        risk.push(riskAmt);
      });

      return {
        pipe: {
          label: 'Пайплайн в работе, ₽',
          data: pipe,
          colors: ['#f59e0b', '#94a3b8', '#d97706', '#ef4444'],
          unit: ' ₽',
          isCurrency: true
        },
        score: {
          label: 'Средний балл речи Gemini (/13)',
          data: score,
          colors: ['#f59e0b', '#10b981', '#38bdf8', '#ef4444'],
          unit: ' б.',
          isCurrency: false
        },
        step: {
          label: 'Фиксация Next Step, %',
          data: nextstep,
          colors: ['#f59e0b', '#10b981', '#38bdf8', '#ef4444'],
          unit: '%',
          isCurrency: false
        },
        risk: {
          label: 'Выручка под угрозой срыва, ₽',
          data: risk,
          colors: ['#f59e0b', '#10b981', '#38bdf8', '#ef4444'],
          unit: ' ₽',
          isCurrency: true
        }
      };
    }

    function initRepPerformanceChart() {
      const ctx = document.getElementById('repPerformanceChart');
      if (!ctx) return;

      const repMetrics = getDynamicRepMetrics();
      const m = repMetrics['pipe'];

      repPerfChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: REP_NAMES,
          datasets: [{
            label: m.label,
            data: m.data,
            backgroundColor: m.colors,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.1)'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(14, 18, 28, 0.95)',
              titleColor: '#fff',
              bodyColor: '#cbd5e1',
              borderColor: 'rgba(255, 255, 255, 0.12)',
              borderWidth: 1,
              padding: 10,
              callbacks: {
                label: function(context) {
                  const val = context.parsed.y;
                  return ` ${context.dataset.label}: ${val.toLocaleString('ru-RU')}`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#fff', font: { weight: 600, size: 12 } }
            },
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: {
                color: '#94a3b8',
                font: { family: 'JetBrains Mono', size: 11 },
                callback: function(value) {
                  return (value >= 1000000 ? (value/1000000).toFixed(1) + 'M' : value >= 1000 ? (value/1000).toFixed(0) + 'k' : value);
                }
              }
            }
          }
        }
      });
    }

    function setRepChartMetric(metricKey) {
      const repMetrics = getDynamicRepMetrics();
      if (!repPerfChartInstance || !repMetrics[metricKey]) return;
      const m = repMetrics[metricKey];

      // Update button styles
      const buttons = ['pipe', 'score', 'step', 'risk'];
      buttons.forEach(b => {
        const el = document.getElementById('btnRepMetric' + b.charAt(0).toUpperCase() + b.slice(1));
        if (el) {
          if (b === metricKey) {
            el.className = 'btn btn-primary';
          } else {
            el.className = 'btn btn-ghost';
          }
        }
      });

      repPerfChartInstance.data.datasets[0].label = m.label;
      repPerfChartInstance.data.datasets[0].data = m.data;
      repPerfChartInstance.data.datasets[0].backgroundColor = m.colors;

      if (m.isCurrency) {
        repPerfChartInstance.options.scales.y.ticks.callback = function(val) {
          return (val / 1000000).toFixed(1) + 'M ₽';
        };
      } else {
        repPerfChartInstance.options.scales.y.ticks.callback = function(val) {
          return val + m.unit;
        };
      }

      repPerfChartInstance.update();
      showToast('Метрика графика изменена', `Отображен разрез: ${m.label}`);
    }

    // ==========================================================================
    // 13 B2B CRITERIA RADAR CHART
    // ==========================================================================
    const RADAR_CRITERIA_LABELS = [
      '1. Next Step', '2. Инициатива', '3. ЛПР', '4. Боли', '5. Дорого',
      '6. Подумаю', '7. Кейсы', '8. Закрытие', '9. Приветствие',
      '10. Чистота', '11. Talk/Listen', '12. Итог', '13. Маржа'
    ];

        // DYNAMIC 13-CRITERIA RADAR MAP (100% SSOT from CALLS_DATA)
    function getDynamicRadarData(repName = 'all') {
      const filtered = (repName === 'all')
        ? CALLS_DATA
        : CALLS_DATA.filter(c => c.manager === repName);
      const n = filtered.length || 1;
      const sums = Array(13).fill(0);
      filtered.forEach(c => {
        c.cr.forEach((val, idx) => {
          if (val === 1) sums[idx]++;
        });
      });
      return sums.map(s => Math.round((s / n) * 100));
    }

    function initSpeechRadarChart() {
      const ctx = document.getElementById('speechRadarChart');
      if (!ctx) return;

      speechRadarChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
          labels: RADAR_CRITERIA_LABELS,
          datasets: [
            {
              label: 'Эталон B2B (100%)',
              data: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
              borderColor: 'rgba(0, 212, 255, 0.4)',
              borderWidth: 1.5,
              borderDash: [4, 4],
              pointRadius: 0,
              fill: false
            },
            {
              label: 'Факт выполнения, %',
              data: getDynamicRadarData('all'),
              borderColor: '#8b5cf6',
              backgroundColor: 'rgba(139, 92, 246, 0.22)',
              borderWidth: 2.5,
              pointBackgroundColor: '#8b5cf6',
              pointBorderColor: '#fff',
              pointRadius: 4,
              fill: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              labels: { color: '#cbd5e1', font: { size: 11 } }
            },
            tooltip: {
              backgroundColor: 'rgba(14, 18, 28, 0.95)',
              titleColor: '#fff',
              bodyColor: '#cbd5e1',
              callbacks: {
                label: function(ctx) {
                  return ` ${ctx.dataset.label}: ${ctx.parsed.r}%`;
                }
              }
            }
          },
          scales: {
            r: {
              min: 0,
              max: 100,
              angleLines: { color: 'rgba(255, 255, 255, 0.08)' },
              grid: { color: 'rgba(255, 255, 255, 0.06)' },
              pointLabels: {
                color: '#cbd5e1',
                font: { size: 10, weight: 600 }
              },
              ticks: {
                display: false,
                stepSize: 25
              }
            }
          }
        }
      });
    }

    function updateRadarChart(repName) {
      if (!speechRadarChartInstance) return;
      const data = getDynamicRadarData(repName);
      speechRadarChartInstance.data.datasets[1].data = data;
      speechRadarChartInstance.data.datasets[1].label = (repName === 'all' ? 'Команда (Факт %)' : `Факт ${repName} (%)`);
      
      if (repName === 'Светлана') {
        speechRadarChartInstance.data.datasets[1].borderColor = '#fb7185';
        speechRadarChartInstance.data.datasets[1].backgroundColor = 'rgba(244, 63, 94, 0.25)';
        speechRadarChartInstance.data.datasets[1].pointBackgroundColor = '#ef4444';
      } else {
        speechRadarChartInstance.data.datasets[1].borderColor = '#8b5cf6';
        speechRadarChartInstance.data.datasets[1].backgroundColor = 'rgba(139, 92, 246, 0.22)';
        speechRadarChartInstance.data.datasets[1].pointBackgroundColor = '#8b5cf6';
      }

      speechRadarChartInstance.update();
      showToast('Радар перестроен', `Отображены 13 речевых критериев для: ${repName}`);
    }

    document.addEventListener('DOMContentLoaded', () => {
      checkAuth();
      if (localStorage.getItem('revops_sidebar_collapsed') === '1') {
        const sb = document.getElementById('mpSidebar');
        if (sb) sb.classList.add('collapsed');
      }
      initCallsTable();
      const savedDensity = localStorage.getItem('revops_table_density') || 'excel-pro';
      setTableDensity(savedDensity);
      initMonteCarloChart();
      initRevenuePacingChart();
      initRepPerformanceChart();
      initSpeechRadarChart();

      // V20.2 Tier-1 Additions
      initSpotlight();
      initWaveformScrubbing();

      const cmdInput = document.getElementById('cmdPaletteInput');
      if (cmdInput) {
        cmdInput.addEventListener('keydown', handleCmdPaletteKeydown);
      }
    });

    // ==========================================================================
    // MOUSE-TRACKING RADIAL SPOTLIGHT (.bento-card) - LINEAR / VERCEL STYLE
    // ==========================================================================
    function initSpotlight() {
      const cards = document.querySelectorAll('.bento-card');
      cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
          const rect = card.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          card.style.setProperty('--mouse-x', `${x}px`);
          card.style.setProperty('--mouse-y', `${y}px`);
        });
      });
    }

    // ==========================================================================
    // GLOBAL COMMAND PALETTE (Ctrl+K / Cmd+K)
    // ==========================================================================
    let cmdPaletteSelectedIndex = 0;
    let filteredCmdItems = [];

    const ALL_CMD_ITEMS = [
      // Tabs Navigation
      { type: 'Раздел', icon: '⚡', label: '1. Пульс выручки', action: () => switchTab('pulse') },
      { type: 'Раздел', icon: '⚡', label: '2. Экспресс-аудит звонков', action: () => switchTab('express') },
      { type: 'Раздел', icon: '🏆', label: '3. Пьедестал РОПа & Рейтинг', action: () => switchTab('rop') },
      { type: 'Раздел', icon: '🎙️', label: '4. ИИ-Аудит звонков & Тепловая карта', action: () => switchTab('audit') },
      { type: 'Раздел', icon: '🌊', label: '5. Диагностика утечек выручки', action: () => switchTab('leaks') },
      { type: 'Раздел', icon: '📊', label: '6. Влияние на выручку & Детектор Fake Yes', action: () => switchTab('impact') },
      { type: 'Раздел', icon: '🎲', label: '7. Monte Carlo 3.0 симуляция', action: () => switchTab('montecarlo') },
      { type: 'Раздел', icon: '👥', label: '8. Навыки & Динамический Payroll', action: () => switchTab('skills') },
      { type: 'Раздел', icon: '⚙️', label: '9. Настройки & E2E Контур', action: () => switchTab('settings') },

      // CRM Deals Drilldown
      { type: 'Сделка', icon: '💼', label: 'B24-80: Услуги повышения лояльности (Светлана • 500k)', action: () => { switchTab('audit'); openCallModal('b24_activity_78'); } },
      { type: 'Сделка', icon: '💼', label: 'B24-82: Сопровождение гос закупок (Надежда • 500k)', action: () => { switchTab('audit'); openCallModal('b24_activity_80'); } },
      { type: 'Сделка', icon: '💼', label: 'B24-84: Продажа ортопедических матрасов (Заряна • 500k)', action: () => { switchTab('audit'); openCallModal('b24_activity_82'); } },
      { type: 'Сделка', icon: '💼', label: 'B24-86: Производство кухонь (Светлана • 500k)', action: () => { switchTab('audit'); openCallModal('b24_activity_84'); } },
      { type: 'Сделка', icon: '💼', label: 'B24-88: Юридические услуги банкротства (Виктория • 500k)', action: () => { switchTab('audit'); openCallModal('b24_activity_86'); } },
      { type: 'Сделка', icon: '💼', label: 'B24-90: Поставка складского оборудования (Заряна • 500k)', action: () => { switchTab('audit'); openCallModal('b24_activity_88'); } },
      { type: 'Сделка', icon: '💼', label: 'B24-92: Разработка CRM под ключ (Заряна • 500k)', action: () => { switchTab('audit'); openCallModal('b24_activity_90'); } },
      { type: 'Сделка', icon: '💼', label: 'B24-94: Стройматериалы и аренда спецтехники (Заряна • 500k)', action: () => { switchTab('audit'); openCallModal('b24_activity_92'); } },
      { type: 'Сделка', icon: '💼', label: 'B24-96: Оптовая торговля автозапчастями (Виктория • 500k)', action: () => { switchTab('audit'); openCallModal('b24_activity_94'); } },
      { type: 'Сделка', icon: '💼', label: 'B24-98: Обучение корпоративному английскому (Заряна • 500k)', action: () => { switchTab('audit'); openCallModal('b24_activity_96'); } },

      // Reps
      { type: 'Менеджер', icon: '👑', label: 'Заряна: РОП / Топ-перформер (5 звонков • 2 500 000 ₽)', action: () => filterRepAudit('Заряна') },
      { type: 'Менеджер', icon: '🥈', label: 'Надежда: КАМ Enterprise / Рекорд речи 12/13 (1 звонок • 500 000 ₽)', action: () => filterRepAudit('Надежда') },
      { type: 'Менеджер', icon: '🥉', label: 'Виктория: Квалификация / 100% Next Step (2 звонка • 1 000 000 ₽)', action: () => filterRepAudit('Виктория') },
      { type: 'Менеджер', icon: '🚨', label: 'Светлана: P0 Риск срыва / 0% Next Step (2 звонка • 1 000 000 ₽)', action: () => filterRepAudit('Светлана') },

      // Quick Actions
      { type: 'Действие', icon: '📥', label: 'Экспорт реестра звонков в CSV', action: () => exportCallsToCSV() },
      { type: 'Действие', icon: '📄', label: 'Открыть Executive One-Pager (PDF/Печать)', action: () => openOnePagerModal() },
      { type: 'Действие', icon: '🔄', label: 'Синхронизировать CRM & n8n (SSOT Re-Sync)', action: () => triggerSyncSimulation() },
      { type: 'Действие', icon: '📊', label: 'Включить ультра-плотный режим (Excel Pro 34px)', action: () => setTableDensity('excel-pro') },
      { type: 'Действие', icon: '🛋️', label: 'Включить комфортный режим таблицы (Comfort)', action: () => setTableDensity('comfort') },
      { type: 'Действие', icon: '🔒', label: 'Выйти из учетной записи (PIN Gate)', action: () => logout() }
    ];

    function openCommandPalette() {
      const overlay = document.getElementById('cmdPaletteOverlay');
      const input = document.getElementById('cmdPaletteInput');
      if (overlay) {
        overlay.classList.add('active');
        if (input) {
          input.value = '';
          input.focus();
        }
        cmdPaletteSelectedIndex = 0;
        renderCmdPaletteResults('');
      }
    }

    function closeCommandPalette(e) {
      if (e && e.target && e.target.id !== 'cmdPaletteOverlay' && !e.target.classList.contains('cmd-palette-esc-badge')) {
        return;
      }
      const overlay = document.getElementById('cmdPaletteOverlay');
      if (overlay) overlay.classList.remove('active');
    }

    function toggleCommandPalette() {
      const overlay = document.getElementById('cmdPaletteOverlay');
      if (overlay && overlay.classList.contains('active')) {
        overlay.classList.remove('active');
      } else {
        openCommandPalette();
      }
    }

    function handleCmdPaletteSearch(query) {
      cmdPaletteSelectedIndex = 0;
      renderCmdPaletteResults(query);
    }

    function renderCmdPaletteResults(query) {
      const resContainer = document.getElementById('cmdPaletteResults');
      if (!resContainer) return;
      const q = (query || '').trim().toLowerCase();

      filteredCmdItems = ALL_CMD_ITEMS.filter(item => {
        if (!q) return true;
        return item.label.toLowerCase().includes(q) || item.type.toLowerCase().includes(q);
      });

      if (filteredCmdItems.length === 0) {
        resContainer.innerHTML = `
          <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.82rem;">
            Ничего не найдено по запросу "<strong>${query}</strong>"
          </div>
        `;
        return;
      }

      // Group by type
      const groups = {};
      filteredCmdItems.forEach((item, idx) => {
        if (!groups[item.type]) groups[item.type] = [];
        groups[item.type].push({ item, globalIdx: idx });
      });

      let html = '';
      Object.keys(groups).forEach(type => {
        html += `<div class="cmd-palette-group-title">${type}</div>`;
        groups[type].forEach(({ item, globalIdx }) => {
          const isSelected = (globalIdx === cmdPaletteSelectedIndex);
          html += `
            <div class="cmd-palette-item ${isSelected ? 'selected' : ''}" onclick="executeCmdPaletteAction(${globalIdx})">
              <div class="cmd-palette-item-left">
                <span style="font-size: 1rem;">${item.icon}</span>
                <span style="font-weight: ${isSelected ? '700' : '500'};">${item.label}</span>
              </div>
              <span style="font-size: 0.68rem; color: var(--text-muted); font-family: monospace;">↵ Выбрать</span>
            </div>
          `;
        });
      });

      resContainer.innerHTML = html;
    }

    function executeCmdPaletteAction(idx) {
      const item = filteredCmdItems[idx];
      if (item && typeof item.action === 'function') {
        const overlay = document.getElementById('cmdPaletteOverlay');
        if (overlay) overlay.classList.remove('active');
        item.action();
      }
    }

    function handleCmdPaletteKeydown(e) {
      const overlay = document.getElementById('cmdPaletteOverlay');
      if (!overlay || !overlay.classList.contains('active')) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filteredCmdItems.length > 0) {
          cmdPaletteSelectedIndex = (cmdPaletteSelectedIndex + 1) % filteredCmdItems.length;
          renderCmdPaletteResults(document.getElementById('cmdPaletteInput')?.value || '');
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filteredCmdItems.length > 0) {
          cmdPaletteSelectedIndex = (cmdPaletteSelectedIndex - 1 + filteredCmdItems.length) % filteredCmdItems.length;
          renderCmdPaletteResults(document.getElementById('cmdPaletteInput')?.value || '');
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        executeCmdPaletteAction(cmdPaletteSelectedIndex);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        overlay.classList.remove('active');
      }
    }

    // Keyboard trigger: Ctrl+K / Cmd+K
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л')) {
        e.preventDefault();
        toggleCommandPalette();
      } else if (e.key === 'Escape') {
        const overlay = document.getElementById('cmdPaletteOverlay');
        if (overlay && overlay.classList.contains('active')) {
          overlay.classList.remove('active');
        }
      }
    });

    // ==========================================================================
    // MULTI-STEP SYNC SIMULATION (n8n -> raw_deals -> SSOT)
    // ==========================================================================
    let isSyncing = false;
    function triggerSyncSimulation() {
      if (isSyncing) return;
      isSyncing = true;

      const btn = document.getElementById('btnSyncCRM');
      const icon = document.getElementById('syncIconSvg');
      const text = document.getElementById('syncBtnText');

      if (icon) icon.style.animation = 'spin 0.8s linear infinite';
      if (text) text.textContent = 'Синхронизация...';
      if (btn) btn.disabled = true;

      // Step 1
      showToast('Синхронизация [1/3]', '📡 Проверка вебхука n8n и amoCRM/Bitrix24 REST API...');

      // Step 2
      setTimeout(() => {
        showToast('Синхронизация [2/3]', '🔍 Сверка raw_deals и речевых транскриптов Gemini 3.5 Flash...');
      }, 700);

      // Step 3
      setTimeout(() => {
        showToast('Синхронизация [3/3]', '⚡ SSOT обновлен: 10 сделок, 5 000 000 ₽ синхронизировано без расхождений!');
        if (icon) icon.style.animation = '';
        if (text) text.textContent = 'Синхронизировать';
        if (btn) btn.disabled = false;
        isSyncing = false;
      }, 1500);
    }
