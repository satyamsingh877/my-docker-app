const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');
const path = require('path');

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

// Sample Products Data
const products = [
  {
    id: 1,
    name: "Wireless Headphones",
    price: 2499,
    image: "https://via.placeholder.com/300x300?text=Headphones",
    description: "High quality wireless headphones with noise cancellation."
  },
  {
    id: 2,
    name: "Smart Watch",
    price: 4999,
    image: "https://via.placeholder.com/300x300?text=Smart+Watch",
    description: "Feature-rich smartwatch with health tracking."
  },
  {
    id: 3,
    name: "Bluetooth Speaker",
    price: 1799,
    image: "https://via.placeholder.com/300x300?text=Speaker",
    description: "Portable Bluetooth speaker with deep bass."
  },
  {
    id: 4,
    name: "Laptop Backpack",
    price: 1299,
    image: "https://via.placeholder.com/300x300?text=Backpack",
    description: "Durable laptop backpack with multiple compartments."
  },
  {
    id: 5,
    name: "USB-C Hub",
    price: 999,
    image: "https://via.placeholder.com/300x300?text=USB+Hub",
    description: "7-in-1 USB-C hub for laptops."
  },
  {
    id: 6,
    name: "Mechanical Keyboard",
    price: 3499,
    image: "https://via.placeholder.com/300x300?text=Keyboard",
    description: "RGB mechanical keyboard with blue switches."
  }
];

// Helper: Get cart from session
function getCart(req) {
  if (!req.session.cart) {
    req.session.cart = [];
  }
  return req.session.cart;
}

// Routes

// Home
app.get('/', (req, res) => {
  res.render('index', {
    products: products.slice(0, 4),
    cartCount: getCart(req).reduce((sum, item) => sum + item.quantity, 0)
  });
});

// All Products
app.get('/products', (req, res) => {
  res.render('products', {
    products,
    cartCount: getCart(req).reduce((sum, item) => sum + item.quantity, 0)
  });
});

// Single Product
app.get('/products/:id', (req, res) => {
  const product = products.find(p => p.id === parseInt(req.params.id));
  if (!product) {
    return res.status(404).send('Product not found');
  }
  res.render('product', {
    product,
    cartCount: getCart(req).reduce((sum, item) => sum + item.quantity, 0)
  });
});

// Add to Cart
app.post('/cart/add/:id', (req, res) => {
  const product = products.find(p => p.id === parseInt(req.params.id));
  if (!product) {
    return res.status(404).send('Product not found');
  }

  const cart = getCart(req);
  const existingItem = cart.find(item => item.id === product.id);

  if (existingItem) {
    existingItem.quantity += 1;
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
});

// View Cart
app.get('/cart', (req, res) => {
  const cart = getCart(req);
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  res.render('cart', {
    cart,
    total,
    cartCount: cart.reduce((sum, item) => sum + item.quantity, 0)
  });
});

// Update quantity
app.post('/cart/update/:id', (req, res) => {
  const cart = getCart(req);
  const item = cart.find(i => i.id === parseInt(req.params.id));
  const quantity = parseInt(req.body.quantity);

  if (item && quantity > 0) {
    item.quantity = quantity;
  }

  res.redirect('/cart');
});

// Remove from cart
app.post('/cart/remove/:id', (req, res) => {
  let cart = getCart(req);
  req.session.cart = cart.filter(item => item.id !== parseInt(req.params.id));
  res.redirect('/cart');
});

// Checkout (mock)
app.post('/checkout', (req, res) => {
  req.session.cart = [];
  res.send(`
    <h1 style="text-align:center; margin-top:100px; font-family:Arial">
      ✅ Order Placed Successfully!
    </h1>
    <p style="text-align:center">
      <a href="/">Continue Shopping</a>
    </p>
  `);
});

app.listen(PORT, () => {
  console.log(`E-commerce app running on http://localhost:${PORT}`);
});
