const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'secret',
  database: process.env.DB_NAME || 'ecommerce',
  port: process.env.DB_PORT || 5432,
});

async function initDB() {
  const client = await pool.connect();
  try {
    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price INTEGER NOT NULL,
        image TEXT,
        description TEXT,
        stock INTEGER DEFAULT 100
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        total INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id),
        quantity INTEGER NOT NULL,
        price INTEGER NOT NULL
      );
    `);

    // Insert sample products only if table is empty
    const res = await client.query('SELECT COUNT(*) FROM products');
    if (parseInt(res.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO products (name, price, image, description) VALUES
        ('Wireless Headphones', 2499, 'https://via.placeholder.com/300x300?text=Headphones', 'High quality wireless headphones with noise cancellation.'),
        ('Smart Watch', 4999, 'https://via.placeholder.com/300x300?text=Smart+Watch', 'Feature-rich smartwatch with health tracking.'),
        ('Bluetooth Speaker', 1799, 'https://via.placeholder.com/300x300?text=Speaker', 'Portable Bluetooth speaker with deep bass.'),
        ('Laptop Backpack', 1299, 'https://via.placeholder.com/300x300?text=Backpack', 'Durable laptop backpack with multiple compartments.'),
        ('USB-C Hub', 999, 'https://via.placeholder.com/300x300?text=USB+Hub', '7-in-1 USB-C hub for laptops.'),
        ('Mechanical Keyboard', 3499, 'https://via.placeholder.com/300x300?text=Keyboard', 'RGB mechanical keyboard with blue switches.');
      `);
      console.log('Sample products inserted');
    }

    console.log('Database initialized successfully');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
