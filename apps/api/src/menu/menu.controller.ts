import { Controller, Get } from '@nestjs/common';
import { DbService } from '../db/db.service';

@Controller('menu')
export class MenuController {
  constructor(private readonly db: DbService) {}

  /** The menu is public: guests can browse before signing in. */
  @Get()
  async list() {
    const { rows } = await this.db.pool.query(
      `SELECT id, name, description, category, price_tiyn AS "priceTiyn"
       FROM menu_items WHERE available ORDER BY category, id`,
    );
    return { items: rows };
  }
}
