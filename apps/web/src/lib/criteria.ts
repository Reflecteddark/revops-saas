/**
 * apps/web/src/lib/criteria.ts
 *
 * Canonical Single Source of Truth (SSOT) for 13 B2B Audit Criteria (cr1..cr13).
 * Strictly synchronized with Gemini AI prompt_builder.py and insights_router.py.
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
    label: 'Приветствие и регламент',
    shortLabel: 'Приветствие',
    category: 'Вход в контакт',
    description: 'Менеджер представился, назвал компанию и обозначил цель звонка/регламент диалога.',
  },
  {
    id: 'cr2',
    label: 'Выявление ЛПР',
    shortLabel: 'ЛПР',
    category: 'Квалификация',
    description: 'Менеджер выяснил роль собеседника в принятии решения или уточнил согласующих лиц.',
  },
  {
    id: 'cr3',
    label: 'Выявление потребностей',
    shortLabel: 'Потребности',
    category: 'Квалификация',
    description: 'Менеджер задал открытые вопросы о текущей ситуации, задачах и болях клиента.',
  },
  {
    id: 'cr4',
    label: 'Квалификация бюджета',
    shortLabel: 'Бюджет',
    category: 'Квалификация',
    description: 'Менеджер уточнил финансовые ориентиры, вилку бюджета или порядок согласования инвестиций.',
  },
  {
    id: 'cr5',
    label: 'Презентация под боли',
    shortLabel: 'Презентация',
    category: 'Презентация',
    description: 'Менеджер презентовал продукт/услугу через призму выявленных болей клиента.',
  },
  {
    id: 'cr6',
    label: 'Презентация через ценность',
    shortLabel: 'Ценность',
    category: 'Презентация',
    description: 'Менеджер показал окупаемость, экономику или конкретные выгоды внедрения.',
  },
  {
    id: 'cr7',
    label: 'Отработка возражений',
    shortLabel: 'Возражения',
    category: 'Возражения',
    description: 'Менеджер отработал сомнения клиента по алгоритму (согласие, аргумент, закрывающий вопрос).',
  },
  {
    id: 'cr8',
    label: 'Инициатива и ведение',
    shortLabel: 'Инициатива',
    category: 'Управление диалогом',
    description: 'Менеджер удерживал инициативу, вёл разговор по скрипту и не отдавал лидерство клиенту.',
  },
  {
    id: 'cr9',
    label: 'Экспертность и знание продукта',
    shortLabel: 'Экспертность',
    category: 'Экспертность',
    description: 'Менеджер уверенно отвечал на технические и бизнес-вопросы, демонстрировал глубокое знание рынка.',
  },
  {
    id: 'cr10',
    label: 'Твёрдый Next Step',
    shortLabel: 'Next Step',
    category: 'Закрытие',
    description: 'Менеджер назначил конкретный следующий шаг с точной датой и временем (Zoom/встреча/звонок).',
  },
  {
    id: 'cr11',
    label: 'Создание задачи в CRM',
    shortLabel: 'CRM-задача',
    category: 'CRM-дисциплина',
    description: 'Менеджер проговорил фиксацию следующего контакта и выставление задачи в CRM.',
  },
  {
    id: 'cr12',
    label: 'Соблюдение этики и эмпатия',
    shortLabel: 'Этика/Эмпатия',
    category: 'Этика и тон',
    description: 'Менеджер проявил дружелюбие, активное слушание и вежливость на протяжении всего разговора.',
  },
  {
    id: 'cr13',
    label: 'Резюме договорённостей',
    shortLabel: 'Резюме',
    category: 'Закрытие',
    description: 'В конце звонка менеджер подвёл итоги: кто, что и к какому сроку делает.',
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
