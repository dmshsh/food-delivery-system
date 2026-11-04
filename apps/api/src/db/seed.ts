import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';

export const DEMO_PASSWORD = 'StudentDemo123!';

/** Creates synthetic demo records once, when the database has no users yet. */
export async function seedDemoData(pool: Pool): Promise<boolean> {
  const { rows } = await pool.query('SELECT COUNT(*) AS n FROM users');
  if (rows[0].n > 0) return false;

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids: Record<string, number> = {};
    for (const [email, name, role] of [
      ['alice@example.test', 'Alice Student', 'CUSTOMER'],
      ['bob@example.test', 'Bob Student', 'CUSTOMER'],
      ['kitchen@example.test', 'Restaurant staff', 'KITCHEN'],
      ['accounts@example.test', 'Order accountant', 'ACCOUNTANT'],
    ]) {
      const r = await client.query(
        'INSERT INTO users(email, password_hash, full_name, role) VALUES ($1,$2,$3,$4) RETURNING id',
        [email, hash, name, role],
      );
      ids[email] = r.rows[0].id;
    }
    const customers: Record<string, number> = {};
    for (const [email, phone, address] of [
      ['alice@example.test', '+77000000001', 'Campus entrance A'],
      ['bob@example.test', '+77000000002', 'Campus entrance B'],
    ]) {
      const r = await client.query('INSERT INTO customers(user_id, phone, address) VALUES ($1,$2,$3) RETURNING id', [
        ids[email], phone, address,
      ]);
      customers[email] = r.rows[0].id;
    }
    const menu: Record<string, number> = {};
    for (const [name, description, category, price] of [
      ['Rice bowl', 'Warm rice, seasonal vegetables and a sesame dressing.', 'Meals', 180000],
      ['Chicken wrap', 'Grilled chicken, crunchy greens and a soft tortilla.', 'Meals', 150000],
      ['Lemon tea', 'Black tea with lemon. Served warm.', 'Drinks', 60000],
      ['Vegetable soup', 'A light broth with potatoes, carrots and herbs.', 'Meals', 120000],
      ['Apple juice', 'A 250 ml bottle of apple juice.', 'Drinks', 70000],
      ['Oat cookie', 'A small oat cookie for the end of lunch.', 'Extras', 45000],
    ] as const) {
      const r = await client.query(
        'INSERT INTO menu_items(name, description, category, price_tiyn) VALUES ($1,$2,$3,$4) RETURNING id',
        [name, description, category, price],
      );
      menu[name] = r.rows[0].id;
    }

    // One already confirmed sample order (2 rice bowls + 1 wrap = 5,100 KZT) so the kitchen and accounting views are not empty.
    const order = await client.query(
      `INSERT INTO orders(customer_id, attempt_id, request_hash, status, delivery_address, notes, created_at, expires_at)
       VALUES ($1,'seed-A001','seed','CONFIRMED','Campus entrance A','Synthetic sample order', now() - interval '10 minutes', now() - interval '8 minutes')
       RETURNING id`,
      [customers['alice@example.test']],
    );
    const orderId = order.rows[0].id;
    await client.query('INSERT INTO order_items VALUES ($1,$2,2,180000), ($1,$3,1,150000)', [
      orderId, menu['Rice bowl'], menu['Chicken wrap'],
    ]);
    await client.query(`INSERT INTO payment_attempts(order_id, outcome, amount_tiyn) VALUES ($1,'APPROVED',510000)`, [orderId]);
    await client.query(`INSERT INTO order_events(order_id, from_status, to_status, actor_user_id) VALUES ($1,NULL,'CONFIRMED',$2)`, [
      orderId, ids['alice@example.test'],
    ]);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
