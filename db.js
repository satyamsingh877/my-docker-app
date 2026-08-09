const { Pool } = require('pg');
const bcrypt = require('bcrypt');

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
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        is_admin BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Products table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price INTEGER NOT NULL,
        image TEXT,
        description TEXT,
        stock INTEGER DEFAULT 100,
        category VARCHAR(100) DEFAULT 'General'
      );
    `);

    // Orders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        total INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Order items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id),
        quantity INTEGER NOT NULL,
        price INTEGER NOT NULL
      );
    `);

    // Create default admin user (email: admin@shop.com / password: admin123)
    const adminCheck = await client.query(`SELECT id FROM users WHERE email = 'admin@shop.com'`);
    if (adminCheck.rows.length === 0) {
      const hashed = await bcrypt.hash('admin123', 10);
      await client.query(
        `INSERT INTO users (name, email, password, is_admin) VALUES ($1, $2, $3, true)`,
        ['Admin', 'admin@shop.com', hashed]
      );
      console.log('Default admin created → email: admin@shop.com | password: admin123');
    }

    // Sample products
    const prodCheck = await client.query('SELECT COUNT(*) FROM products');
    if (parseInt(prodCheck.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO products (name, price, image, description, category) VALUES
        ('Wireless Headphones', 2499, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop', 'High quality wireless headphones with noise cancellation.', 'Electronics'),
        ('Smart Watch', 4999, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=400&fit=crop', 'Feature-rich smartwatch with health tracking.', 'Electronics'),
        ('Bluetooth Speaker', 1799, 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=400&h=400&fit=crop', 'Portable Bluetooth speaker with deep bass.', 'Electronics'),
        ('Laptop Backpack', 1299, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&h=400&fit=crop', 'Durable laptop backpack with multiple compartments.', 'Accessories'),
        ('USB-C Hub', 999, 'https://images.unsplash.com/photo-1625948515291-69613efd103f?w=400&h=400&fit=crop', '7-in-1 USB-C hub for laptops.', 'Accessories'),
        ('Mechanical Keyboard', 3499, 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400&h=400&fit=crop', 'RGB mechanical keyboard with blue switches.', 'Electronics');
      `);
      console.log('Sample products inserted');
    }

    console.log('Database initialized successfully');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
