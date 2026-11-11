import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';

export const DEMO_PASSWORD = 'StudentDemo123!';

/** Creates synthetic demo records once, when the database has no users yet. */
export async function seedDemoData(pool: Pool): Promise<boolean> {
  const { rows } = await pool.query('SELECT COUNT(*) AS n FROM users');
  if (rows[0].n > 0) {
    // The database already has users, but it may predate the admin account: add it
    // on its own so an existing demo database gains the admin panel without a reset.
    await ensureAdmin(pool);
    return false;
  }

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
      ['admin@example.test', 'System administrator', 'ADMIN'],
    ]) {
      const r = await client.query(
        'INSERT INTO users(email, password_hash, full_name, role) VALUES ($1,$2,$3,$4) RETURNING id',
        [email, hash, name, role],
      );
      ids[email] = r.rows[0].id;
    }
    const customers: Record<string, number> = {};
    for (const [email, phone, address, points] of [
      ['alice@example.test', '+77000000001', 'Campus entrance A', 120],
      ['bob@example.test', '+77000000002', 'Campus entrance B', 0],
    ] as const) {
      const r = await client.query(
        'INSERT INTO customers(user_id, phone, address, bonus_points) VALUES ($1,$2,$3,$4) RETURNING id',
        [ids[email], phone, address, points],
      );
      customers[email] = r.rows[0].id;
    }
    const menu: Record<string, number> = {};
    let position = 0;
    for (const [name, description, category, price] of [
      ['Rice bowl', 'Warm rice, seasonal vegetables and a sesame dressing.', 'Meals', 180000],
      ['Chicken wrap', 'Grilled chicken, crunchy greens and a soft tortilla.', 'Meals', 150000],
      ['Vegetable soup', 'A light broth with potatoes, carrots and herbs.', 'Meals', 120000],
      ['Lemon tea', 'Black tea with lemon. Served warm.', 'Drinks', 60000],
      ['Apple juice', 'A 250 ml bottle of apple juice.', 'Drinks', 70000],
      ['Oat cookie', 'A small oat cookie for the end of lunch.', 'Extras', 45000],
    ] as const) {
      const r = await client.query(
        'INSERT INTO menu_items(name, description, category, price_tiyn, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [name, description, category, price, position++],
      );
      menu[name] = r.rows[0].id;
    }

    // One already confirmed sample order (2 rice bowls + 1 wrap = 5,100 KZT) so the kitchen and accounting views are not empty.
    const order = await client.query(
      `INSERT INTO orders(customer_id, attempt_id, request_hash, status, delivery_address, notes, bonus_earned, created_at, expires_at)
       VALUES ($1,'seed-A001','seed','CONFIRMED','Campus entrance A','Synthetic sample order', 255, now() - interval '10 minutes', now() - interval '8 minutes')
       RETURNING id`,
      [customers['alice@example.test']],
    );
    const orderId = order.rows[0].id;
    await client.query('INSERT INTO order_items VALUES ($1,$2,2,180000), ($1,$3,1,150000)', [
      orderId,
      menu['Rice bowl'],
      menu['Chicken wrap'],
    ]);
    await client.query(`INSERT INTO payment_attempts(order_id, outcome, amount_tiyn) VALUES ($1,'APPROVED',510000)`, [
      orderId,
    ]);
    await client.query(
      `INSERT INTO order_events(order_id, from_status, to_status, actor_user_id) VALUES ($1,NULL,'CONFIRMED',$2)`,
      [orderId, ids['alice@example.test']],
    );

    // The points that sample order earned (5% of 5,100 KZT = 255), so the bonus page has a history.
    await client.query(
      `INSERT INTO bonus_transactions(customer_id, order_id, kind, points, balance_after, note)
       VALUES ($1,$2,'EARNED',255,255,'Earned on the sample order'),
              ($1,NULL,'ADJUSTED',-135,120,'Synthetic opening balance for the demo')`,
      [customers['alice@example.test'], orderId],
    );

    // A delivered order with a review, so the admin and accounting pages show real feedback.
    const delivered = await client.query(
      `INSERT INTO orders(customer_id, attempt_id, request_hash, status, delivery_address, notes, created_at, expires_at)
       VALUES ($1,'seed-B001','seed','DELIVERED','Campus entrance B','', now() - interval '2 days', now() - interval '2 days')
       RETURNING id`,
      [customers['bob@example.test']],
    );
    const deliveredId = delivered.rows[0].id;
    await client.query('INSERT INTO order_items VALUES ($1,$2,1,120000), ($1,$3,1,60000)', [
      deliveredId,
      menu['Vegetable soup'],
      menu['Lemon tea'],
    ]);
    await client.query(`INSERT INTO payment_attempts(order_id, outcome, amount_tiyn) VALUES ($1,'APPROVED',180000)`, [
      deliveredId,
    ]);
    await client.query(
      `INSERT INTO order_feedback(order_id, customer_id, rating, comment)
       VALUES ($1,$2,5,'The soup arrived hot and the tea was exactly on time.')`,
      [deliveredId, customers['bob@example.test']],
    );

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Adds the admin demo account to a database seeded before the admin panel existed. */
async function ensureAdmin(pool: Pool): Promise<void> {
  const { rows } = await pool.query(`SELECT 1 FROM users WHERE role = 'ADMIN' LIMIT 1`);
  if (rows.length) return;
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await pool.query(
    `INSERT INTO users(email, password_hash, full_name, role)
     VALUES ('admin@example.test', $1, 'System administrator', 'ADMIN')
     ON CONFLICT DO NOTHING`,
    [hash],
  );
  // Give the existing dishes a stable arrangement for the drag-and-drop editor.
  await pool.query(
    `UPDATE menu_items m SET sort_order = n.position
     FROM (SELECT id, row_number() OVER (ORDER BY category, id) AS position FROM menu_items) AS n
     WHERE m.id = n.id AND m.sort_order = 0`,
  );
}
