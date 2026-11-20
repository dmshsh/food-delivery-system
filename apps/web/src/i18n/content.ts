'use client';

import { useCallback, useMemo } from 'react';
import { useI18n } from './I18nProvider';
import type { Language } from './dictionaries';

/**
 * Translations for content that lives in the database rather than in the code:
 * dish names, descriptions and categories, and bonus-history notes.
 *
 * The database stores them once, in English. Items we know (the seeded menu) are
 * translated here, keyed by their English text; anything an admin adds later is
 * shown exactly as it was typed, so nothing ever disappears or turns into a key.
 */

type Translated = Partial<Record<Exclude<Language, 'en'>, string>>;

const CATEGORIES: Record<string, Translated> = {
  Meals: { ru: 'Блюда', kk: 'Тағамдар' },
  Drinks: { ru: 'Напитки', kk: 'Сусындар' },
  Extras: { ru: 'Дополнительно', kk: 'Қосымша' },
  Desserts: { ru: 'Десерты', kk: 'Десерттер' },
  Salads: { ru: 'Салаты', kk: 'Салаттар' },
  Soups: { ru: 'Супы', kk: 'Сорпалар' },
};

const DISHES: Record<string, { name: Translated; description?: Record<string, Translated> }> = {
  'Rice bowl': {
    name: { ru: 'Рисовый боул', kk: 'Күріш боулы' },
    description: {
      'Warm rice, seasonal vegetables and a sesame dressing.': {
        ru: 'Тёплый рис, сезонные овощи и кунжутная заправка.',
        kk: 'Жылы күріш, маусымдық көкөністер және күнжіт тұздығы.',
      },
    },
  },
  'Chicken wrap': {
    name: { ru: 'Ролл с курицей', kk: 'Тауық еті қосылған ролл' },
    description: {
      'Grilled chicken, crunchy greens and a soft tortilla.': {
        ru: 'Курица гриль, хрустящая зелень и мягкая тортилья.',
        kk: 'Грильдегі тауық еті, қытырлақ көк шөп және жұмсақ тортилья.',
      },
    },
  },
  'Vegetable soup': {
    name: { ru: 'Овощной суп', kk: 'Көкөніс сорпасы' },
    description: {
      'A light broth with potatoes, carrots and herbs.': {
        ru: 'Лёгкий бульон с картофелем, морковью и зеленью.',
        kk: 'Картоп, сәбіз және көк шөп қосылған жеңіл сорпа.',
      },
    },
  },
  'Lemon tea': {
    name: { ru: 'Чай с лимоном', kk: 'Лимон қосылған шай' },
    description: {
      'Black tea with lemon. Served warm.': {
        ru: 'Чёрный чай с лимоном. Подаётся тёплым.',
        kk: 'Лимон қосылған қара шай. Жылы күйінде беріледі.',
      },
    },
  },
  'Apple juice': {
    name: { ru: 'Яблочный сок', kk: 'Алма шырыны' },
    description: {
      'A 250 ml bottle of apple juice.': {
        ru: 'Бутылка яблочного сока, 250 мл.',
        kk: '250 мл алма шырыны бөтелкесі.',
      },
    },
  },
  'Oat cookie': {
    name: { ru: 'Овсяное печенье', kk: 'Сұлы печеньесі' },
    description: {
      'A small oat cookie for the end of lunch.': {
        ru: 'Небольшое овсяное печенье к концу обеда.',
        kk: 'Түскі астың соңына арналған шағын сұлы печеньесі.',
      },
    },
  },
};

/** Bonus notes the API writes in English; the order number is taken back out of them. */
const NOTES: { pattern: RegExp; text: Translated }[] = [
  { pattern: /^Earned on order #(\d+)$/, text: { ru: 'Начислено за заказ #{id}', kk: '#{id} тапсырысы үшін есептелді' } },
  { pattern: /^Discount on order #(\d+)$/, text: { ru: 'Скидка по заказу #{id}', kk: '#{id} тапсырысы бойынша жеңілдік' } },
  { pattern: /^Earned on the sample order$/, text: { ru: 'Начислено за демонстрационный заказ', kk: 'Үлгі тапсырыс үшін есептелді' } },
  {
    pattern: /^Synthetic opening balance for the demo$/,
    text: { ru: 'Стартовый демонстрационный баланс', kk: 'Демоға арналған бастапқы баланс' },
  },
];

function pick(lang: Language, english: string, translated: Translated | undefined): string {
  if (lang === 'en' || !translated) return english;
  return translated[lang] ?? english;
}

export function translateCategory(lang: Language, category: string): string {
  return pick(lang, category, CATEGORIES[category]);
}

export function translateDishName(lang: Language, name: string): string {
  return pick(lang, name, DISHES[name]?.name);
}

export function translateDishDescription(lang: Language, name: string, description: string): string {
  return pick(lang, description, DISHES[name]?.description?.[description]);
}

export function translateNote(lang: Language, note: string): string {
  if (lang === 'en') return note;
  for (const { pattern, text } of NOTES) {
    const match = note.match(pattern);
    if (match) return pick(lang, note, text).replace('{id}', match[1] ?? '');
  }
  return note;
}

/** The translators above, already bound to the current language. */
export function useContent() {
  const { lang } = useI18n();
  const category = useCallback((c: string) => translateCategory(lang, c), [lang]);
  const dish = useCallback((n: string) => translateDishName(lang, n), [lang]);
  const description = useCallback((n: string, d: string) => translateDishDescription(lang, n, d), [lang]);
  const note = useCallback((n: string) => translateNote(lang, n), [lang]);
  return useMemo(() => ({ category, dish, description, note }), [category, dish, description, note]);
}
