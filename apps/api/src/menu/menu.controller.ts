import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { ValidationError, validateDishFilter, DIET_TAGS } from '../domain/validation';

@Controller('menu')
export class MenuController {
  constructor(private readonly db: DbService) {}

  /**
   * The menu, with the filters that let someone find a dish by what is in it,
   * by how much energy it carries and by what they want to spend.
   *
   * Public, like the menu itself: choosing lunch should not require an account.
   *
   * Every filter is applied in SQL rather than in the browser. A page that
   * downloads the whole menu and hides rows looks the same with six dishes and
   * falls over with six hundred, and the filters would then disagree with the
   * search the kitchen sees.
   */
  @Get()
  async list(@Query() query: Record<string, string | string[]>) {
    let filter;
    try {
      filter = validateDishFilter(query);
    } catch (e) {
      if (e instanceof ValidationError) throw new BadRequestException({ code: e.code, message: e.message });
      throw e;
    }

    const where: string[] = ['available'];
    const params: unknown[] = [];

    if (filter.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      const like = `$${params.length}`;
      // The ingredients are part of the search on purpose: "no nuts" is a label,
      // but "something with chicken in it" is a question about the contents.
      where.push(`(lower(name) LIKE ${like} OR lower(description) LIKE ${like} OR lower(ingredients) LIKE ${like})`);
    }
    if (filter.maxPriceTiyn !== null) {
      params.push(filter.maxPriceTiyn);
      where.push(`price_tiyn <= $${params.length}`);
    }
    if (filter.maxCalories !== null) {
      params.push(filter.maxCalories);
      // A dish with no figures is not hidden by a calorie filter: we do not know
      // that it fails, and dropping it would quietly shrink the menu.
      where.push(`(calories_kcal IS NULL OR calories_kcal <= $${params.length})`);
    }
    if (filter.minCalories !== null) {
      params.push(filter.minCalories);
      where.push(`(calories_kcal IS NULL OR calories_kcal >= $${params.length})`);
    }
    if (filter.tags.length) {
      params.push(filter.tags);
      where.push(`tags @> $${params.length}::text[]`);
    }
    if (filter.withoutTags.length) {
      params.push(filter.withoutTags);
      // "Without nuts" has to be strict the other way round: a dish whose labels
      // nobody filled in is not proof that it is safe, so it is left out.
      where.push(`NOT (tags && $${params.length}::text[]) AND cardinality(tags) > 0`);
    }

    const order =
      filter.sort === 'price'
        ? 'price_tiyn, sort_order, id'
        : filter.sort === 'calories'
          ? 'calories_kcal NULLS LAST, sort_order, id'
          : 'sort_order, id';

    const { rows } = await this.db.pool.query(
      `SELECT id, name, description, category, price_tiyn AS "priceTiyn", sort_order AS "sortOrder",
              calories_kcal AS "caloriesKcal", protein_g AS "proteinG", fat_g AS "fatG", carbs_g AS "carbsG",
              ingredients, tags
       FROM menu_items
       WHERE ${where.join(' AND ')}
       ORDER BY ${order}`,
      params,
    );

    // The ranges behind the sliders: taken from the whole menu, not from what is
    // showing, so narrowing the filter does not make the slider jump about.
    const bounds = await this.db.pool.query(
      `SELECT COALESCE(MIN(price_tiyn), 0) AS "minPriceTiyn", COALESCE(MAX(price_tiyn), 0) AS "maxPriceTiyn",
              COALESCE(MIN(calories_kcal), 0) AS "minCalories", COALESCE(MAX(calories_kcal), 0) AS "maxCalories",
              COUNT(*) AS total
       FROM menu_items WHERE available`,
    );

    return {
      items: rows.map((r) => ({
        ...r,
        caloriesKcal: r.caloriesKcal === null ? null : Number(r.caloriesKcal),
        proteinG: r.proteinG === null ? null : Number(r.proteinG),
        fatG: r.fatG === null ? null : Number(r.fatG),
        carbsG: r.carbsG === null ? null : Number(r.carbsG),
      })),
      filter,
      bounds: {
        minPriceTiyn: Number(bounds.rows[0].minPriceTiyn),
        maxPriceTiyn: Number(bounds.rows[0].maxPriceTiyn),
        minCalories: Number(bounds.rows[0].minCalories),
        maxCalories: Number(bounds.rows[0].maxCalories),
        total: Number(bounds.rows[0].total),
      },
      availableTags: [...DIET_TAGS],
    };
  }
}
