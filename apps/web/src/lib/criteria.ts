/**
 * apps/web/src/lib/criteria.ts
 *
 * Canonical Single Source of Truth (SSOT) for 13 B2B Audit Criteria (cr1..cr13).
 * Strictly synchronized with Gemini AI prompt_builder.py, n8n (Sh4JkQtMKVdeRJn5)
 * and Google Sheets (🎙️ ИИ_Аудит, Row 16).
 */

export interface CriterionDefinition {
  id: string; // cr1..cr13
  label: string; // Full title
  shortLabel: string; // Short title for charts / heatmaps
  category: string;
  description: string;
}

export const CR_DEFINITIONS: CriterionDefinition[] = [
  {
    id: 'cr1',
    label: 'Твёрдый Next Step',
    shortLabel: 'Next Step',
    category: 'Закрытие',
    description: 'Менеджер назначил конкретный следующий шаг с точной датой и временем (Zoom/встреча/звонок). Без точной даты и времени — 0.',
  },
  {
    id: 'cr2',
    label: 'Инициатива диалога',
    shortLabel: 'Инициатива',
    category: 'Управление диалогом',
    description: 'Менеджер удерживал инициативу, вёл разговор через открытые вопросы и управлял ходом диалога.',
  },
  {
    id: 'cr3',
    label: 'Квалификация ЛПР/ЛВПР',
    shortLabel: 'ЛПР',
    category: 'Квалификация',
    description: 'Менеджер выяснил роль собеседника в принятии решения или уточнил состав согласующих лиц.',
  },
  {
    id: 'cr4',
    label: 'Выявление болей и срочности',
    shortLabel: 'Боли',
    category: 'Квалификация',
    description: 'Менеджер задал вопросы о текущей ситуации, задачах, болях и срочности решения вопроса.',
  },
  {
    id: 'cr5',
    label: 'Отработка «Дорого»',
    shortLabel: 'Дорого',
    category: 'Возражения',
    description: 'Менеджер отработал сомнения по цене через ценность, окупаемость и ROI без демпинга и скидок.',
  },
  {
    id: 'cr6',
    label: 'Отработка «Я подумаю»',
    shortLabel: 'Подумаю',
    category: 'Возражения',
    description: 'Менеджер вскрыл истинные причины паузы и сомнения клиента вместо пассивного согласия.',
  },
  {
    id: 'cr7',
    label: 'Презентация через кейсы и цифры',
    shortLabel: 'Кейсы',
    category: 'Презентация',
    description: 'Менеджер показал ценность через факты, окупаемость или результаты аналогичных внедрений.',
  },
  {
    id: 'cr8',
    label: 'Попытка дожима и сделки',
    shortLabel: 'Дожим',
    category: 'Закрытие',
    description: 'Менеджер предложил конкретное целевое действие: КП под ключ, тест-драйв, пилот или бронь.',
  },
  {
    id: 'cr9',
    label: 'Приветствие и регламент',
    shortLabel: 'Приветствие',
    category: 'Вход в контакт',
    description: 'Менеджер представился, назвал компанию и обозначил понятную цель звонка и регламент.',
  },
  {
    id: 'cr10',
    label: 'Чистота речи и уверенность',
    shortLabel: 'Чистота речи',
    category: 'Этика и тон',
    description: 'Уверенный тон, отсутствие слов-паразитов, чёткая дикция без агрессии и неуверенности.',
  },
  {
    id: 'cr11',
    label: 'Экспертность и знание продукта',
    shortLabel: 'Экспертность',
    category: 'Экспертность',
    description: 'Менеджер уверенно отвечал на технические и бизнес-вопросы, демонстрируя глубокое знание рынка.',
  },
  {
    id: 'cr12',
    label: 'Резюме договорённостей',
    shortLabel: 'Резюме',
    category: 'Закрытие',
    description: 'В конце разговора менеджер подвёл итоги: кто, что и к какому сроку делает.',
  },
  {
    id: 'cr13',
    label: 'Слушание (клиент говорит >40%)',
    shortLabel: 'Слушание',
    category: 'Этика и тон',
    description: 'Менеджер не перебивал клиента, активно слушал, клиент говорил не менее 40% хронометража.',
  },
];

export const CR_LABELS: string[] = CR_DEFINITIONS.map((c) => c.label);
export const CR_SHORT_LABELS: string[] = CR_DEFINITIONS.map((c) => c.shortLabel);
export const CR_MAP: Record<string, string> = Object.fromEntries(
  CR_DEFINITIONS.map((c) => [c.id, c.label])
);
export const CR_DEF_MAP: Record<string, CriterionDefinition> = Object.fromEntries(
  CR_DEFINITIONS.map((c) => [c.id, c])
);
