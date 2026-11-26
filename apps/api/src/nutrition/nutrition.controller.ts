import { BadRequestException, Body, Controller, HttpCode, Post } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { summarise } from '../domain/nutrition';
import { MAX_DISTINCT_ITEMS, MAX_QUANTITY } from '../domain/validation';

/**
 * What a basket of dishes adds up to, and what can be said about it.
 *
 * Public, and deliberately stateless: it answers about a list of dishes, not
 * about a person or an order, so the checkout page can ask the same question of
 * a cart that has not been saved yet.
 *
 * The figures come from the database rather than from the browser, for the same
 * reason prices do: a client that can state its own calories can state anything.
 */
@Controller('nutrition')
export class NutritionController {
  constructor(private readonly db: DbService) {}

  @Post('summary')
  @HttpCode(200)
  async summary(@Body() body: { items?: unknown }) {
    const items = body?.items;
    if (!Array.isArray(items) || items.length > MAX_DISTINCT_ITEMS) {
      throw new BadRequestException({
        code: 'bad_items',
        message: `Send between 1 and ${MAX_DISTINCT_ITEMS} dishes.`,
      });
    }

    const wanted = new Map<number, number>();
    for (const entry of items) {
      const line = entry as { itemId?: unknown; quantity?: unknown };
      if (!Number.isInteger(line.itemId) || !Number.isInteger(line.quantity)) {
        throw new BadRequestException({
          code: 'bad_items',
          message: 'Dish IDs and quantities must be whole numbers.',
        });
      }
      const quantity = line.quantity as number;
      if (quantity < 1 || quantity > MAX_QUANTITY) {
        throw new BadRequestException({
          code: 'bad_items',
          message: `Choose a quantity between 1 and ${MAX_QUANTITY} for each dish.`,
        });
      }
      // The same dish twice in one basket is one dish with a larger quantity,
      // which is also how a group order arrives here.
      wanted.set(line.itemId as number, (wanted.get(line.itemId as number) ?? 0) + quantity);
    }

    if (wanted.size === 0) return { summary: summarise([]), dishes: [] };

    const { rows } = await this.db.pool.query(
      `SELECT id, name, calories_kcal AS "caloriesKcal", protein_g AS "proteinG",
              fat_g AS "fatG", carbs_g AS "carbsG", tags
       FROM menu_items WHERE id = ANY($1::int[])`,
      [[...wanted.keys()]],
    );

    const lines = rows.map((r) => ({
      quantity: wanted.get(r.id) ?? 0,
      caloriesKcal: r.caloriesKcal === null ? null : Number(r.caloriesKcal),
      proteinG: r.proteinG === null ? null : Number(r.proteinG),
      fatG: r.fatG === null ? null : Number(r.fatG),
      carbsG: r.carbsG === null ? null : Number(r.carbsG),
    }));

    return {
      summary: summarise(lines),
      // Named, so the page can say which dish has no figures rather than only
      // that one of them has not.
      dishes: rows.map((r) => ({
        id: r.id,
        name: r.name,
        quantity: wanted.get(r.id) ?? 0,
        caloriesKcal: r.caloriesKcal === null ? null : Number(r.caloriesKcal),
        tags: r.tags,
      })),
    };
  }
}
