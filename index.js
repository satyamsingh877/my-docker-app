const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');
const path = require('path');
const { pool, initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(session({
  secret: 'ecommerce-secret-key-change-in-production',
  resave: false,
  saveUninitialized: true
}));

// Helper
function getCart(req) {
  if (!req.session.cart) req.session.cart = [];
  return req.session.cart;
}

function getCartCount(req) {
  return getCart(req).reduce((sum, item) => sum + item.quantity, 0);
}

// ========== ROUTES ==========

// Home
app.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id LIMIT 4');
    res.render('index', {
      products: result.rows,
      cartCount: getCartCount(req)
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Database error');
  }
});

// All Products
app.get('/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id');
    res.render('products', {
      products: result.rows,
      cartCount: getCartCount(req)
    });
  } catch (err) {
    res.status(500).send('Database error');
  }
});

// Single Product
app.get('/products/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).send('Product not found');

    res.render('product', {
      product: result.rows[0],
      cartCount: getCartCount(req)
    });
  } catch (err) {
    res.status(500).send('Database error');
  }
});

// Add to Cart
app.post('/cart/add/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).send('Product not found');

    const product = result.rows[0];
    const cart = getCart(req);
    const existing = cart.find(item => item.id === product.id);

    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        quantity: 1
      });
    }

    res.redirect('/cart');
  } catch (err) {
    res.status(500).send('Error adding to cart');
  }
});

// View Cart
app.get('/cart', (req, res) => {
  const cart = getCart(req);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  res.render('cart', {
    cart,
    total,
    cartCount: getCartCount(req)
  });
});

// Update quantity
app.post('/cart/update/:id', (req, res) => {
  const cart = getCart(req);
  const item = cart.find(i => i.id === parseInt(req.params.id));
  const qty = parseInt(req.body.quantity);

  if (item && qty > 0) item.quantity = qty;
  res.redirect('/cart');
});

// Remove from cart
app.post('/cart/remove/:id', (req, res) => {
  req.session.cart = getCart(req).filter(item => item.id !== parseInt(req.params.id));
  res.redirect('/cart');
});

// ========== CHECKOUT (Save to Database) ==========
app.post('/checkout', async (req, res) => {
  const cart = getCart(req);
  if (cart.length === 0) return res.redirect('/cart');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    // Create order
    const orderRes = await client.query(
      'INSERT INTO orders (total) VALUES ($1) RETURNING id',
      [total]
    );
    const orderId = orderRes.rows[0].id;

    // Insert order items
    for (const item of cart) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.id, item.quantity, item.price]
      );
    }

    await client.query('COMMIT');
    req.session.cart = []; // clear cart

    res.send(`
      <div style="text-align:center; margin-top:80px; font-family:Arial">
        <h1>✅ Order Placed Successfully!</h1>
        <p>Order ID: #${orderId}</p>
        <p><a href="/">Continue Shopping</a> | <a href="/admin">View Sales Report</a></p>
      </div>
    `);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).send('Checkout failed');
  } finally {
    client.release();
  }
});

// ========== ADMIN - Top Selling Products ==========
app.get('/admin', async (req, res) => {
  try {
    // Top selling products
    const topProducts = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.price,
        COALESCE(SUM(oi.quantity), 0) AS total_sold,
        COALESCE(SUM(oi.quantity * oi.price), 0) AS revenue
      FROM products p
      LEFT JOIN order_items oi ON p.id = oi.product_id
      GROUP BY p.id
      ORDER BY total_sold DESC
    `);

    // Recent orders
    const recentOrders = await pool.query(`
      SELECT o.id, o.total, o.created_at,
             COUNT(oi.id) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 10
    `);

    res.render('admin', {
      topProducts: topProducts.rows,
      recentOrders: recentOrders.rows,
      cartCount: getCartCount(req)
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading admin panel');
  }
});

// Start server after DB is ready
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`E-commerce app running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
