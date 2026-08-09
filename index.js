const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');
const bcrypt = require('bcrypt');
const path = require('path');
const { pool, initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(session({
  secret: 'super-secret-ecommerce-key-change-me',
  resave: false,
  saveUninitialized: false
}));

// Make user available in all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.cartCount = (req.session.cart || []).reduce((s, i) => s + i.quantity, 0);
  next();
});

function getCart(req) {
  if (!req.session.cart) req.session.cart = [];
  return req.session.cart;
}

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.is_admin) {
    return res.status(403).send('Access denied. Admins only.');
  }
  next();
}

// ====================== AUTH ======================
app.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3)',
      [name, email, hashed]
    );
    res.redirect('/login');
  } catch (err) {
    res.render('register', { error: 'Email already exists' });
  }
});

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.render('login', { error: 'Invalid email or password' });
    }
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.render('login', { error: 'Invalid email or password' });
    }
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      is_admin: user.is_admin
    };
    res.redirect('/');
  } catch (err) {
    res.render('login', { error: 'Login failed' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ====================== SHOP ======================
app.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM products ORDER BY id LIMIT 6');
  res.render('index', { products: result.rows });
});

app.get('/products', async (req, res) => {
  const { q, category, min, max } = req.query;
  let query = 'SELECT * FROM products WHERE 1=1';
  const params = [];
  let idx = 1;

  if (q) {
    query += ` AND (name ILIKE $${idx} OR description ILIKE $${idx})`;
    params.push(`%${q}%`);
    idx++;
  }
  if (category && category !== 'all') {
    query += ` AND category = $${idx}`;
    params.push(category);
    idx++;
  }
  if (min) {
    query += ` AND price >= $${idx}`;
    params.push(parseInt(min));
    idx++;
  }
  if (max) {
    query += ` AND price <= $${idx}`;
    params.push(parseInt(max));
    idx++;
  }

  query += ' ORDER BY id';
  const result = await pool.query(query, params);
  const categories = await pool.query('SELECT DISTINCT category FROM products ORDER BY category');

  res.render('products', {
    products: result.rows,
    categories: categories.rows,
    filters: { q: q || '', category: category || 'all', min: min || '', max: max || '' }
  });
});

app.get('/products/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).send('Product not found');
  res.render('product', { product: result.rows[0] });
});

// ====================== CART ======================
app.post('/cart/add/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).send('Product not found');

  const product = result.rows[0];
  const cart = getCart(req);
  const existing = cart.find(i => i.id === product.id);

  if (existing) existing.quantity += 1;
  else cart.push({ id: product.id, name: product.name, price: product.price, image: product.image, quantity: 1 });

  res.redirect('/cart');
});

app.get('/cart', (req, res) => {
  const cart = getCart(req);
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  res.render('cart', { cart, total });
});

app.post('/cart/update/:id', (req, res) => {
  const cart = getCart(req);
  const item = cart.find(i => i.id === parseInt(req.params.id));
  const qty = parseInt(req.body.quantity);
  if (item && qty > 0) item.quantity = qty;
  res.redirect('/cart');
});

app.post('/cart/remove/:id', (req, res) => {
  req.session.cart = getCart(req).filter(i => i.id !== parseInt(req.params.id));
  res.redirect('/cart');
});

// ====================== CHECKOUT ======================
app.post('/checkout', requireLogin, async (req, res) => {
  const cart = getCart(req);
  if (cart.length === 0) return res.redirect('/cart');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

    const orderRes = await client.query(
      'INSERT INTO orders (user_id, total) VALUES ($1, $2) RETURNING id',
      [req.session.user.id, total]
    );
    const orderId = orderRes.rows[0].id;

    for (const item of cart) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
        [orderId, item.id, item.quantity, item.price]
      );
    }

    await client.query('COMMIT');
    req.session.cart = [];
    res.redirect('/orders');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).send('Checkout failed');
  } finally {
    client.release();
  }
});

// ====================== ORDER HISTORY ======================
app.get('/orders', requireLogin, async (req, res) => {
  const orders = await pool.query(
    `SELECT o.*, 
            (SELECT json_agg(json_build_object(
              'name', p.name, 
              'quantity', oi.quantity, 
              'price', oi.price
            ))
            FROM order_items oi 
            JOIN products p ON p.id = oi.product_id 
            WHERE oi.order_id = o.id) as items
     FROM orders o 
     WHERE o.user_id = $1 
     ORDER BY o.created_at DESC`,
    [req.session.user.id]
  );
  res.render('orders', { orders: orders.rows });
});

// ====================== ADMIN ======================
app.get('/admin', requireAdmin, async (req, res) => {
  const topProducts = await pool.query(`
    SELECT p.id, p.name, p.price, p.stock,
           COALESCE(SUM(oi.quantity), 0) AS total_sold,
           COALESCE(SUM(oi.quantity * oi.price), 0) AS revenue
    FROM products p
    LEFT JOIN order_items oi ON p.id = oi.product_id
    GROUP BY p.id
    ORDER BY total_sold DESC
  `);

  const recentOrders = await pool.query(`
    SELECT o.id, o.total, o.created_at, u.name as user_name
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    ORDER BY o.created_at DESC LIMIT 10
  `);

  const products = await pool.query('SELECT * FROM products ORDER BY id');

  res.render('admin', {
    topProducts: topProducts.rows,
    recentOrders: recentOrders.rows,
    products: products.rows
  });
});

// Add Product
app.post('/admin/products', requireAdmin, async (req, res) => {
  const { name, price, image, description, stock, category } = req.body;
  await pool.query(
    `INSERT INTO products (name, price, image, description, stock, category)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [name, price, image, description, stock || 100, category || 'General']
  );
  res.redirect('/admin');
});

// Edit Product
app.post('/admin/products/:id', requireAdmin, async (req, res) => {
  const { name, price, image, description, stock, category } = req.body;
  await pool.query(
    `UPDATE products SET name=$1, price=$2, image=$3, description=$4, stock=$5, category=$6 WHERE id=$7`,
    [name, price, image, description, stock, category, req.params.id]
  );
  res.redirect('/admin');
});

// Delete Product
app.post('/admin/products/:id/delete', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
  res.redirect('/admin');
});

// ====================== START ======================
initDB()
  .then(() => {
    app.listen(PORT, () => console.log(`App running on http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('DB init failed:', err);
    process.exit(1);
  });
