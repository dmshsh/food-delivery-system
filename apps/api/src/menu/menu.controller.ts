import { Controller, Get } from '@nestjs/common';
import { DbService } from '../db/db.service';

@Controller('menu')
export class MenuController {
  constructor(private readonly db: DbService) {}

  /**
   * The menu is public: guests can browse before signing in.
   * `sort_order` is the arrangement the admin made by dragging the dishes around.
   */
  @Get()
  async list() {
    const { rows } = await this.db.pool.query(
      `SELECT id, name, description, category, price_tiyn AS "priceTiyn", sort_order AS "sortOrder"
       FROM menu_items WHERE available ORDER BY sort_order, id`,
    );
    return { items: rows };
  }
}
