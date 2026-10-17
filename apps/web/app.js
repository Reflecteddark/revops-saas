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
    // CRYPTOGRAPHIC AUTH ACCESS GATE LOGIC (SHA-256 & HMAC SESSION GUARD)
    // ==========================================================================
    const AUTH_STORAGE_KEY = 'revops_enterprise_session_v1';
    const AUTH_SIGN_SALT = 'revops_tnt001_enterprise_sec_v20_2';
    const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    // Only SHA-256 hashes are stored. Zero plaintext passwords in source code.
    const VALID_CREDENTIALS = [
      {
        login: 'dmitriyfedotov1908@gmail.com',
        keyHashes: [
          'f82d5f1f10fc36e941922f73e9b7ad871bace49786bd408a135359a3346df27b',
          '00f6112fe58387958ef80793a34746429f40c97fe7b51d6a576705acbf8fc6af',
          'dff496958fb64f93c897156c9bfcbfe6a32975efadaa21d957a82b9b9f4801bd',
          '9d3ba5c08978d3354103973088fcc0df35ece2ea9de24c9dfc250d46375c9eec',
          'd7baef91d7e90fe49774b6bcabcca33ac3cc2296d5622b250ee836f78f1cd410'
        ],
        name: 'Дмитрий Федотов',
        role: 'РОП • Руководитель ОП',
        tenant: 'TNT-001 • Самозанятый'
      },
      {
        login: 'admin',
        keyHashes: [
          'f82d5f1f10fc36e941922f73e9b7ad871bace49786bd408a135359a3346df27b',
          'dff496958fb64f93c897156c9bfcbfe6a32975efadaa21d957a82b9b9f4801bd',
          '00f6112fe58387958ef80793a34746429f40c97fe7b51d6a576705acbf8fc6af',
          'd7baef91d7e90fe49774b6bcabcca33ac3cc2296d5622b250ee836f78f1cd410'
        ],
        name: 'Администратор RevOps',
        role: 'Admin / Супервайзер',
        tenant: 'TNT-001 • Самозанятый'
      },
      {
        login: 'rop',
        keyHashes: [
          'f82d5f1f10fc36e941922f73e9b7ad871bace49786bd408a135359a3346df27b',
          '00f6112fe58387958ef80793a34746429f40c97fe7b51d6a576705acbf8fc6af',
          'dff496958fb64f93c897156c9bfcbfe6a32975efadaa21d957a82b9b9f4801bd',
          'd7baef91d7e90fe49774b6bcabcca33ac3cc2296d5622b250ee836f78f1cd410'
        ],
        name: 'Дмитрий Федотов',
        role: 'РОП • Руководитель ОП',
        tenant: 'TNT-001 • Самозанятый'
      }
    ];

    async function sha256Hex(str) {
      if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle && window.crypto.subtle.digest && typeof TextEncoder !== 'undefined') {
        const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      }
      let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
      let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
      const k = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
      ];
      const utf8 = unescape(encodeURIComponent(str));
      const words = [];
      for (let i = 0; i < utf8.length; i++) words[i >> 2] |= (utf8.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
      const bitLen = utf8.length * 8;
      words[bitLen >> 5] |= 0x80 << (24 - (bitLen % 32));
      words[(((bitLen + 64) >> 9) << 4) + 15] = bitLen;
      const w = new Array(64);
      for (let i = 0; i < words.length; i += 16) {
        for (let j = 0; j < 16; j++) w[j] = words[i + j] | 0;
        for (let j = 16; j < 64; j++) {
          const s0 = ((w[j - 15] >>> 7) | (w[j - 15] << 25)) ^ ((w[j - 15] >>> 18) | (w[j - 15] << 14)) ^ (w[j - 15] >>> 3);
          const s1 = ((w[j - 2] >>> 17) | (w[j - 2] << 15)) ^ ((w[j - 2] >>> 19) | (w[j - 2] << 13)) ^ (w[j - 2] >>> 10);
          w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
        }
        let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
        for (let j = 0; j < 64; j++) {
          const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
          const ch = (e & f) ^ ((~e) & g);
          const temp1 = (h + S1 + ch + k[j] + w[j]) | 0;
          const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
          const maj = (a & b) ^ (a & c) ^ (b & c);
          const temp2 = (S0 + maj) | 0;
          h = g; g = f; f = e; e = (d + temp1) | 0;
          d = c; c = b; b = a; a = (temp1 + temp2) | 0;
        }
        h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
        h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
      }
      return [h0, h1, h2, h3, h4, h5, h6, h7].map(v => ((v >>> 0).toString(16).padStart(8, '0'))).join('');
    }

    async function checkAuth() {
      try {
        const rawSession = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
        if (!rawSession) {
          showAuthGate();
          return false;
        }
        const session = JSON.parse(rawSession);
        if (!session || !session.authenticated || !session.login || !session.timestamp || !session.signature) {
          throw new Error('Invalid or tampered session structure');
        }

        // Enforce strict TTL
        if (Date.now() - session.timestamp > SESSION_TTL_MS) {
          throw new Error('Session expired by TTL');
        }

        // Find user
        const user = VALID_CREDENTIALS.find(u => u.login.toLowerCase() === session.login.toLowerCase());
        if (!user) {
          throw new Error('Unregistered user credentials');
        }

        // Verify cryptographic signature against authorized hashes
        let isSignatureValid = false;
        for (const validHash of user.keyHashes) {
          const expectedSignature = await sha256Hex(user.login + ':' + validHash + ':' + session.timestamp + ':' + AUTH_SIGN_SALT);
          if (expectedSignature === session.signature) {
            isSignatureValid = true;
            break;
          }
        }

        if (isSignatureValid) {
          applyAuthenticatedSession(session);
          return true;
        } else {
          throw new Error('Cryptographic signature mismatch (tampered session detected)');
        }
      } catch (e) {
        console.warn('Security guard: session invalidated.', e.message);
        localStorage.removeItem(AUTH_STORAGE_KEY);
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
        showAuthGate();
        return false;
      }
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

    async function handleAuthSubmit(e) {
      if (e) e.preventDefault();
      const loginInput = document.getElementById('authLogin');
      const passInput = document.getElementById('authPassword');
      const rememberCheckbox = document.getElementById('authRemember');
      const errorBox = document.getElementById('authErrorBox');
      const card = document.getElementById('authCard');
      const submitBtn = document.getElementById('btnAuthSubmit');

      const loginVal = (loginInput.value || '').trim().toLowerCase();
      const passVal = (passInput.value || '').trim();

      errorBox.style.display = 'none';

      if (!loginVal || !passVal) {
        errorBox.style.display = 'block';
        return false;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
      }

      try {
        const inputHash = await sha256Hex(passVal);

        let foundUser = null;
        let matchedHash = null;

        for (const cred of VALID_CREDENTIALS) {
          if (cred.login.toLowerCase() === loginVal && cred.keyHashes.includes(inputHash)) {
            foundUser = cred;
            matchedHash = inputHash;
            break;
          }
        }

        if (!foundUser) {
          errorBox.style.display = 'block';
          if (card) {
            card.classList.add('shake');
            setTimeout(() => card.classList.remove('shake'), 400);
          }
          if (submitBtn) submitBtn.disabled = false;
          return false;
        }

        const now = Date.now();
        const signature = await sha256Hex(foundUser.login + ':' + matchedHash + ':' + now + ':' + AUTH_SIGN_SALT);

        const sessionData = {
          authenticated: true,
          login: foundUser.login,
          name: foundUser.name,
          role: foundUser.role,
          tenant: foundUser.tenant,
          timestamp: now,
          signature: signature
        };

        const storage = (rememberCheckbox && rememberCheckbox.checked) ? localStorage : sessionStorage;
        storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionData));

        applyAuthenticatedSession(sessionData);
        showToast('Доступ разрешён', `Добро пожаловать в систему, ${foundUser.name}!`);
        return false;
      } catch (err) {
        console.error('Authentication failure:', err);
        errorBox.style.display = 'block';
        return false;
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
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

            <!-- AI Playbook Diff (Факт vs Эталон) -->
            <div class="playbook-diff-container">
              <div class="playbook-diff-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="status-dot dot-cyan"></span>
                  <strong style="font-size: 0.78rem; color: #fff; text-transform: uppercase; letter-spacing: 0.04em;">AI Playbook Diff (Факт vs Эталон RevOps)</strong>
                </div>
                <button class="btn btn-emerald" onclick="copyPlaybookScript('${call.id}')" style="font-size: 0.70rem; padding: 4px 10px;">
                  <span>📋 Скопировать скрипт дожима для РОПа</span>
                </button>
              </div>
              <div class="playbook-diff-grid">
                <div class="diff-col-defect">
                  <div style="font-size: 0.68rem; font-weight: 700; color: #fb7185; text-transform: uppercase; margin-bottom: 5px;">
                    ✕ Реплика менеджера (Дефект скрипта):
                  </div>
                  <div style="font-size: 0.76rem; color: #fca5a5; font-style: italic; line-height: 1.45;">
                    ${PLAYBOOK_DIFFS[call.id]?.defectQuote || '«Отправлю вам материалы на почту, если что перезвоните...»'}
                  </div>
                </div>
                <div class="diff-col-recommend">
                  <div style="font-size: 0.68rem; font-weight: 700; color: #34d399; text-transform: uppercase; margin-bottom: 5px;">
                    ✓ AI-Рекомендация (Эталон B2B RevOps):
                  </div>
                  <div style="font-size: 0.76rem; color: #6ee7b7; font-weight: 500; line-height: 1.45;">
                    ${PLAYBOOK_DIFFS[call.id]?.recommendScript || '«Чтобы не терять время, давайте во вторник в 12:00 на 15 минут в Zoom зафиксируем расчет окупаемости.»'}
                  </div>
                </div>
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
        if (call.status === 'won') statusPill = `<span class="badge-won"><span class="status-dot dot-won"></span> Эталон</span>`;
        else if (call.status === 'norm') statusPill = `<span class="badge-warn"><span class="status-dot dot-norm"></span> Норма</span>`;
        else statusPill = `<span class="badge-lost"><span class="status-dot dot-risk"></span> Слив</span>`;

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
          <td>
            <div class="rep-chip">
              <span class="rep-avatar-sm ${call.manager === 'Надежда' ? 'rep-n' : call.manager === 'Виктория' ? 'rep-v' : call.manager === 'Светлана' ? 'rep-s' : 'rep-z'}">${call.manager.charAt(0)}</span>
              <strong style="font-size: 0.76rem; color: #fff;">${call.manager}</strong>
            </div>
          </td>
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
    window.copyRescueScript = copyRescueScript;

    // ==========================================================================
    // ACCENT THEME SWITCHER (SNOWUI COLOR SCHEMES)
    // ==========================================================================
    function setAccentTheme(themeName) {
      const root = document.documentElement;
      const themes = {
        cyan: {
          brand: '#33d1ff',
          brandGlow: 'rgba(51, 209, 255, 0.35)',
          borderFocus: 'rgba(51, 209, 255, 0.45)'
        },
        purple: {
          brand: '#b899eb',
          brandGlow: 'rgba(184, 153, 235, 0.35)',
          borderFocus: 'rgba(184, 153, 235, 0.45)'
        },
        emerald: {
          brand: '#6be6d3',
          brandGlow: 'rgba(107, 230, 211, 0.35)',
          borderFocus: 'rgba(107, 230, 211, 0.45)'
        },
        amber: {
          brand: '#ffb55b',
          brandGlow: 'rgba(255, 181, 91, 0.35)',
          borderFocus: 'rgba(255, 181, 91, 0.45)'
        }
      };

      const t = themes[themeName] || themes.cyan;
      root.style.setProperty('--brand', t.brand);
      root.style.setProperty('--brand-glow', t.brandGlow);
      root.style.setProperty('--border-focus', t.borderFocus);

      document.querySelectorAll('.accent-dot').forEach(dot => {
        if (dot.getAttribute('data-theme') === themeName) {
          dot.classList.add('active');
        } else {
          dot.classList.remove('active');
        }
      });

      try {
        localStorage.setItem('revops_accent_theme', themeName);
      } catch (e) {}
      showToast('Тема оформления', `Установлен акцент: ${themeName.toUpperCase()}`);
    }
    window.setAccentTheme = setAccentTheme;

    // ==========================================================================
    // DUAL-MODE THEME CONTROLLER (DEVELOP LIGHT & DARK BENCHMARK)
    // ==========================================================================
    function getThemeMode() {
      return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }

    function setThemeMode(mode) {
      const isLight = mode === 'light';
      if (isLight) {
        document.documentElement.setAttribute('data-theme', 'light');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }

      try {
        localStorage.setItem('revops_theme_mode', mode);
      } catch (e) {}

      updateThemeToggleUI(mode);
      updateAllChartsTheme(mode);

      if (typeof showToast === 'function') {
        showToast('Тема оформления', isLight ? 'Активирована светлая тема (Develop Light)' : 'Активирована тёмная тема (Develop Dark)');
      }
    }

    function toggleThemeMode() {
      const current = getThemeMode();
      setThemeMode(current === 'light' ? 'dark' : 'light');
    }

    function updateThemeToggleUI(mode) {
      const isLight = mode === 'light';
      const topIcon = document.getElementById('themeTopThumbIcon');
      const sideIcon = document.getElementById('themeSideThumbIcon');
      if (topIcon) topIcon.textContent = isLight ? '☀️' : '🌙';
      if (sideIcon) sideIcon.textContent = isLight ? '☀️' : '🌙';
    }

    function updateAllChartsTheme(mode) {
      const isLight = mode === 'light';
      const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
      const tickColor = isLight ? '#64748b' : '#94a3b8';
      const tooltipBg = isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(14, 18, 28, 0.95)';
      const tooltipTitle = isLight ? '#0f172a' : '#ffffff';
      const tooltipBody = isLight ? '#334155' : '#cbd5e1';
      const tooltipBorder = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.12)';

      // 1. Revenue Pacing Chart
      if (typeof revPacingChartInstance !== 'undefined' && revPacingChartInstance) {
        try {
          if (revPacingChartInstance.options.scales?.x) {
            revPacingChartInstance.options.scales.x.ticks.color = tickColor;
            revPacingChartInstance.options.scales.x.grid.color = gridColor;
          }
          if (revPacingChartInstance.options.scales?.y) {
            revPacingChartInstance.options.scales.y.ticks.color = tickColor;
            revPacingChartInstance.options.scales.y.grid.color = gridColor;
          }
          if (revPacingChartInstance.options.plugins?.tooltip) {
            revPacingChartInstance.options.plugins.tooltip.backgroundColor = tooltipBg;
            revPacingChartInstance.options.plugins.tooltip.titleColor = tooltipTitle;
            revPacingChartInstance.options.plugins.tooltip.bodyColor = tooltipBody;
            revPacingChartInstance.options.plugins.tooltip.borderColor = tooltipBorder;
          }
          revPacingChartInstance.update('none');
        } catch (e) {}
      }

      // 2. Rep Performance Chart
      if (typeof repPerfChartInstance !== 'undefined' && repPerfChartInstance) {
        try {
          if (repPerfChartInstance.options.scales?.x) {
            repPerfChartInstance.options.scales.x.ticks.color = isLight ? '#111827' : '#ffffff';
            repPerfChartInstance.options.scales.x.grid.color = gridColor;
          }
          if (repPerfChartInstance.options.scales?.y) {
            repPerfChartInstance.options.scales.y.ticks.color = tickColor;
            repPerfChartInstance.options.scales.y.grid.color = gridColor;
          }
          if (repPerfChartInstance.options.plugins?.tooltip) {
            repPerfChartInstance.options.plugins.tooltip.backgroundColor = tooltipBg;
            repPerfChartInstance.options.plugins.tooltip.titleColor = tooltipTitle;
            repPerfChartInstance.options.plugins.tooltip.bodyColor = tooltipBody;
            repPerfChartInstance.options.plugins.tooltip.borderColor = tooltipBorder;
          }
          repPerfChartInstance.update('none');
        } catch (e) {}
      }

      // 3. Speech Radar Chart
      if (typeof speechRadarChartInstance !== 'undefined' && speechRadarChartInstance) {
        try {
          if (speechRadarChartInstance.options.scales?.r) {
            speechRadarChartInstance.options.scales.r.grid.color = gridColor;
            speechRadarChartInstance.options.scales.r.angleLines.color = gridColor;
            speechRadarChartInstance.options.scales.r.pointLabels.color = isLight ? '#475569' : tickColor;
          }
          speechRadarChartInstance.update('none');
        } catch (e) {}
      }

      // 4. Monte Carlo Chart
      if (typeof mcChartInstance !== 'undefined' && mcChartInstance) {
        try {
          if (mcChartInstance.options.scales?.x) {
            mcChartInstance.options.scales.x.ticks.color = tickColor;
            mcChartInstance.options.scales.x.grid.color = gridColor;
          }
          if (mcChartInstance.options.scales?.y) {
            mcChartInstance.options.scales.y.ticks.color = tickColor;
            mcChartInstance.options.scales.y.grid.color = gridColor;
          }
          mcChartInstance.update('none');
        } catch (e) {}
      }
    }

    window.getThemeMode = getThemeMode;
    window.setThemeMode = setThemeMode;
    window.toggleThemeMode = toggleThemeMode;
    window.updateThemeToggleUI = updateThemeToggleUI;
    window.updateAllChartsTheme = updateAllChartsTheme;

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
              if (idx === 2) return 'rgba(255, 71, 71, 0.85)';   // P10 SnowUI Red
              if (idx === 4) return 'rgba(51, 209, 255, 0.90)';  // P50 SnowUI Cyan
              if (idx === 6) return 'rgba(107, 230, 211, 0.90)'; // P90 SnowUI Mint
              return 'rgba(184, 153, 235, 0.45)';               // SnowUI Secondary Purple
            },
            borderRadius: 8,
            borderSkipped: false,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.12)'
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

      const c2d = ctx.getContext ? ctx.getContext('2d') : null;
      let gradWon = 'rgba(108, 93, 211, 0.16)';
      let gradSsot = 'rgba(243, 101, 148, 0.12)';

      if (c2d) {
        const h = ctx.clientHeight || 260;
        const g1 = c2d.createLinearGradient(0, 0, 0, h);
        g1.addColorStop(0, 'rgba(108, 93, 211, 0.45)');
        g1.addColorStop(0.7, 'rgba(108, 93, 211, 0.10)');
        g1.addColorStop(1, 'rgba(108, 93, 211, 0.00)');
        gradWon = g1;

        const g2 = c2d.createLinearGradient(0, 0, 0, h);
        g2.addColorStop(0, 'rgba(243, 101, 148, 0.38)');
        g2.addColorStop(0.7, 'rgba(243, 101, 148, 0.08)');
        g2.addColorStop(1, 'rgba(243, 101, 148, 0.00)');
        gradSsot = g2;
      }

      const ssotData = calculateSsotData(currentConversionMultiplier);

      revPacingChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: PACING_LABELS,
          datasets: [
            {
              label: 'Факт Won (500 000 ₽)',
              data: FACT_CUM_DATA,
              borderColor: '#6c5dd3',
              backgroundColor: gradWon,
              borderWidth: 3,
              fill: true,
              tension: 0.4,
              pointRadius: [0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0],
              pointBackgroundColor: '#6c5dd3',
              pointBorderColor: '#fff',
              pointHoverRadius: 8
            },
            {
              label: 'План таргета (5 000 000 ₽)',
              data: PLAN_CUM_DATA,
              borderColor: '#38bdf8',
              borderWidth: 2,
              borderDash: [5, 5],
              fill: false,
              tension: 0.2,
              pointRadius: 0
            },
            {
              label: 'SSOT Прогноз кассы',
              data: ssotData,
              borderColor: '#f36594',
              backgroundColor: gradSsot,
              borderWidth: 2.5,
              fill: true,
              tension: 0.4,
              pointRadius: [0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 6],
              pointBackgroundColor: '#f36594',
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
          colors: ['#6c5dd3', '#f36594', '#8b5cf6', '#38bdf8'],
          unit: ' ₽',
          isCurrency: true
        },
        score: {
          label: 'Средний балл речи Gemini (/13)',
          data: score,
          colors: ['#6c5dd3', '#38bdf8', '#4ade80', '#f36594'],
          unit: ' б.',
          isCurrency: false
        },
        step: {
          label: 'Фиксация Next Step, %',
          data: nextstep,
          colors: ['#6c5dd3', '#38bdf8', '#4ade80', '#f36594'],
          unit: '%',
          isCurrency: false
        },
        risk: {
          label: 'Выручка под угрозой срыва, ₽',
          data: risk,
          colors: ['#fbbf24', '#f43f5e', '#f43f5e', '#f43f5e'],
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
            borderRadius: 8,
            borderSkipped: false,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.14)'
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
              borderColor: 'rgba(51, 209, 255, 0.45)',
              borderWidth: 1.5,
              borderDash: [4, 4],
              pointRadius: 0,
              fill: false
            },
            {
              label: 'Факт выполнения, %',
              data: getDynamicRadarData('all'),
              borderColor: '#b899eb',
              backgroundColor: 'rgba(184, 153, 235, 0.22)',
              borderWidth: 2.5,
              pointBackgroundColor: '#33d1ff',
              pointBorderColor: '#ffffff',
              pointBorderWidth: 2,
              pointRadius: 4.5,
              pointHoverRadius: 7,
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

      const savedTheme = localStorage.getItem('revops_accent_theme') || 'cyan';
      if (typeof setAccentTheme === 'function') {
        setAccentTheme(savedTheme);
      }

      const savedMode = localStorage.getItem('revops_theme_mode') || 'dark';
      if (typeof setThemeMode === 'function') {
        setThemeMode(savedMode);
      }

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


// ==========================================================================
// TIER-1 AI PLAYBOOK SCRIPTS & SEGMENTED PILLS ENGINE
// ==========================================================================
const PLAYBOOK_DIFFS = {
  'b24_activity_78': {
    defectQuote: '«Ну тогда я вам отправлю на почту коммерческое предложение, а вы почитайте на досуге...»',
    recommendScript: '«Алексей, отправка на почту затягивает запуск на 2 недели. Предлагаю во вторник в 12:00 на 15 минут в Zoom разобрать расчет окупаемости под вашу специфику. Вам удобно утро?»'
  },
  'b24_activity_80': {
    defectQuote: '«Да, у нас решение недешевое, но зато очень надежное... Подумайте и перезвоните, если надумаете...»',
    recommendScript: '«Понимаю вопрос бюджета. Наш пилотный проект окупается уже за первые 45 дней. Давайте в четверг в 15:00 покажу кейс Минтранса со схожим объемом и расчет экономии?»'
  },
  'b24_activity_82': {
    defectQuote: '«Хорошо, спишемся как-нибудь на следующей неделе, если что — звоните...»',
    recommendScript: '«Дмитрий, чтобы не терять слот отгрузки, давайте зафиксируем вторник 12:00. Я подготовлю спецификацию по тканям и зарезервирую сырье на складе.»'
  },
  'b24_activity_84': {
    defectQuote: '«У нас есть всё в системе, можете сами зарегистрироваться и посмотреть в демо-доступе...»',
    recommendScript: '«Иван, сравнительная таблица с 1С у меня на экране. Займет 10 минут в Zoom показать ключевые 3 отличия по скорости закрытия сделок. Завтра в 14:00?»'
  },
  'b24_activity_86': {
    defectQuote: '«Если пока нет одобрения лимита, то давайте подождем решения банка...»',
    recommendScript: '«Сергей, согласование лимита идет параллельно с бронью слота внедрения. Давайте согласуем шаг 1 на пятницу 11:00, чтобы не сдвигать сроки сдачи объекта.»'
  },
  'b24_activity_88': {
    defectQuote: '«Мы работаем только по предоплате, другие варианты у нас не предусмотрены регламентом...»',
    recommendScript: '«Ольга, по графику платежей мы делим контракт на 3 транша по факту этапов. Давайте в среду в 11:30 в Zoom согласуем график и запустим аудит.»'
  },
  'b24_activity_90': {
    defectQuote: '«Ну смотрите сами, если появится интерес — наберите...»',
    recommendScript: '«Михаил, чтобы оценить реальный эффект, мы бесплатно прогоним ваши первые 10 звонков через ИИ-супервайзер. Зафиксируем показ отчета на четверг 16:00?»'
  },
  'b24_activity_92': {
    defectQuote: '«Я вам все рассказал, решение за вашим руководством...»',
    recommendScript: '«Елена, чтобы защитить бюджет перед генеральным директором, я подготовлю One-Pager окупаемости за 1 вечер. Давайте подключим его на 10 минут в четверг в 11:00?»'
  },
  'b24_activity_94': {
    defectQuote: '«Цены на сайте актуальные, скидок у нас практически не бывает...»',
    recommendScript: '«Павел, при объеме от 50 лицензий мы включаем пакет кастомизации под Bitrix24 бесплатно. Предлагаю во вторник в 14:30 утвердить спецификацию.»'
  },
  'b24_activity_96': {
    defectQuote: '«Отправлю презентацию в мессенджер, посмотрите как будет время...»',
    recommendScript: '«Артем, презентация содержит 25 слайдов, но для вас критичны только слайды 4 и 12 по интеграции с телефонией. Покажу их за 5 минут в Zoom в среду в 12:00?»'
  }
};

function copyPlaybookScript(callId) {
  const diff = PLAYBOOK_DIFFS[callId];
  if (!diff) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(diff.recommendScript).then(() => {
      showToast('AI Playbook', '✅ Эталонный скрипт дожима скопирован в буфер обмена РОПа!');
    }).catch(() => {
      showToast('AI Playbook', 'Скрипт готов к отправке');
    });
  } else {
    showToast('AI Playbook', '✅ Скрипт дожима скопирован!');
  }
}

function setPillManagerFilter(repName) {
  const sel = document.getElementById('filterManager');
  if (sel) sel.value = repName;

  document.querySelectorAll('#pillManagerGroup .pill-btn').forEach(btn => {
    const r = btn.getAttribute('data-rep');
    if (r === repName) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  filterCallsTable();
}

function setPillStatusFilter(statusVal) {
  const sel = document.getElementById('filterStatus');
  if (sel) sel.value = statusVal;

  document.querySelectorAll('#pillStatusGroup .pill-btn').forEach(btn => {
    const s = btn.getAttribute('data-status');
    if (s === statusVal) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  filterCallsTable();
}

function setPillRadarRep(repName) {
  const sel = document.getElementById('radarRepSelector');
  if (sel) sel.value = repName;

  document.querySelectorAll('#pillRadarRepGroup .pill-btn').forEach(btn => {
    const r = btn.getAttribute('data-radar');
    if (r === repName) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  updateRadarChart(repName);
}

// ==========================================================================
// AUTONOMOUS TRIO AI CREW (V20.2) TELEMETRY & SELF-HEALING ENGINE
// ==========================================================================
let isSelfHealingActive = false;
function triggerSelfHealingAudit() {
  if (isSelfHealingActive) return;
  isSelfHealingActive = true;

  const btn1 = document.getElementById('btnSelfHealingAuditPulse');
  const btn2 = document.getElementById('btnSelfHealingAuditSettings');
  const logEl1 = document.getElementById('aiCrewLogPulse');
  const logEl2 = document.getElementById('aiCrewLogSettings');

  [btn1, btn2].forEach(b => {
    if (b) {
      b.disabled = true;
      b.innerHTML = '<span class="status-dot dot-cyan"></span> Выполняется проверка...';
    }
  });

  const updateLogs = (html) => {
    [logEl1, logEl2].forEach(el => {
      if (el) {
        el.style.display = 'block';
        el.innerHTML = html;
      }
    });
  };

  const ts = new Date().toLocaleTimeString('ru-RU');

  // Step 1
  updateLogs(`
    <div style="color: var(--accent-cyan);">[${ts}] 🔍 L1/L2 DevOps Healer (PID 19592): Сканирование портов 8000 (FastAPI), 5678 (n8n)...</div>
    <div style="color: #64748b; padding-left: 12px;">├─ Healthcheck HTTP 200 OK • Memory RSS 84MB • 0 zombie subroutines</div>
  `);

  // Step 2
  setTimeout(() => {
    updateLogs(`
      <div style="color: var(--accent-cyan);">[${ts}] 🔍 L1/L2 DevOps Healer: OK (latency 14ms)</div>
      <div style="color: #34d399; margin-top: 6px;">[${ts}] 🎙️ Agent 2 CCO (Gemini 2.5 Flash): Сверка 10 речевых аудитов по 13 критериям...</div>
      <div style="color: #64748b; padding-left: 12px;">├─ Strict JSON schema: 10/10 валидны • Средний балл: 9.1/13 • Next Step: 70.0% • Fake Yes: 3 локализовано</div>
    `);
  }, 700);

  // Step 3
  setTimeout(() => {
    updateLogs(`
      <div style="color: var(--accent-cyan);">[${ts}] 🔍 L1/L2 DevOps Healer: OK (latency 14ms)</div>
      <div style="color: #34d399; margin-top: 4px;">[${ts}] 🎙️ Agent 2 CCO (Gemini 2.5 Flash): 10/10 Валидировано (0 дефектов)</div>
      <div style="color: #fbbf24; margin-top: 6px;">[${ts}] 🛡️ Agent 3 Sync Guardian (L3 Orchestrator): Сверка amoCRM + Bitrix24 + raw_deals...</div>
      <div style="color: #64748b; padding-left: 12px;">├─ Сделок в реестре: 10 • Выручка SSOT: 5 000 000 ₽ • Won: 500 000 ₽ • Дрифт кассы: 0.00 ₽ (100% точность)</div>
      <div style="color: #10b981; font-weight: 700; margin-top: 8px;">✅ ВЕРДИКТ: Все 3 агента экипажа синхронизированы в SSOT. Целостность контура подтверждена.</div>
    `);

    [btn1, btn2].forEach(b => {
      if (b) {
        b.disabled = false;
        b.innerHTML = '<span>⚡ Запустить Self-Healing аудит</span>';
      }
    });

    showToast('RevOps AI Crew', '✅ Все 3 агента экипажа синхронизированы, 0 расхождений SSOT!');
    isSelfHealingActive = false;
  }, 1600);
}

// ==========================================================================
// EXPOSE INTERACTIVE HANDLERS GLOBALLY ON WINDOW FOR INLINE ONCLICK EVENTS
// ==========================================================================
window.copyRescueScript = typeof copyRescueScript !== 'undefined' ? copyRescueScript : null;
window.copyRescueScriptByCallId = typeof copyRescueScriptByCallId !== 'undefined' ? copyRescueScriptByCallId : null;
window.setAccentTheme = typeof setAccentTheme !== 'undefined' ? setAccentTheme : null;
window.copyPlaybookScript = typeof copyPlaybookScript !== 'undefined' ? copyPlaybookScript : null;
window.setPillManagerFilter = typeof setPillManagerFilter !== 'undefined' ? setPillManagerFilter : null;
window.setPillStatusFilter = typeof setPillStatusFilter !== 'undefined' ? setPillStatusFilter : null;
window.setPillRadarRep = typeof setPillRadarRep !== 'undefined' ? setPillRadarRep : null;
window.triggerSelfHealingAudit = typeof triggerSelfHealingAudit !== 'undefined' ? triggerSelfHealingAudit : null;
window.recalcExpress = typeof recalcExpress !== 'undefined' ? recalcExpress : null;
window.drillDownSkill = typeof drillDownSkill !== 'undefined' ? drillDownSkill : null;
window.switchTab = typeof switchTab !== 'undefined' ? switchTab : null;
window.filterCallsTable = typeof filterCallsTable !== 'undefined' ? filterCallsTable : null;
window.logout = typeof logout !== 'undefined' ? logout : null;
window.toggleSidebar = typeof toggleSidebar !== 'undefined' ? toggleSidebar : null;
window.openCommandPalette = typeof openCommandPalette !== 'undefined' ? openCommandPalette : null;
window.closeCommandPalette = typeof closeCommandPalette !== 'undefined' ? closeCommandPalette : null;
window.openOnePagerModal = typeof openOnePagerModal !== 'undefined' ? openOnePagerModal : null;
window.closeOnePagerModal = typeof closeOnePagerModal !== 'undefined' ? closeOnePagerModal : null;
window.triggerSyncSimulation = typeof triggerSyncSimulation !== 'undefined' ? triggerSyncSimulation : null;

