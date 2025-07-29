// ========== [1] DEPENDENCIES & CONFIG ========== //
const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const path = require('path');

const app = express();

// ========== [2] MULTER SETUP FOR IMAGE UPLOAD ========== //
const fs = require('fs');

// Ensure images folder exists
const uploadPath = path.join(__dirname, 'public/images');
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage: storage });

// ========== [3] MYSQL CONNECTION (UPDATE WITH YOUR CREDENTIALS) ========== //
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Republic_C207',           // Change this
  database: 'car_rental_system' // Or your own DB
});
db.connect(err => {
  if (err) throw err;
  console.log('Connected to MySQL');
});

// ========== [4] MIDDLEWARE SETUP ========== //
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true
}));
app.use(flash());

// ========== [5] AUTH MIDDLEWARE ========== //
const checkAuthenticated = (req, res, next) => {
  if (req.session.user) return next();
  req.flash('error', 'Login required');
  res.redirect('/login');
};
const checkAdmin = (req, res, next) => {
  if (req.session.user?.role === 'admin') return next();
  req.flash('error', 'Admins only');
  res.redirect('/');
};

// ========== [0] HOME PAGE ========== //
app.get('/', (req, res) => {
  res.render('home', { user: req.session.user });  // Pass session user
});


// ========== [6] LOGIN & REGISTER ROUTES ========== //
// Show register page
app.get('/register', (req, res) => {
  res.render('register', { message: req.flash('error') });
});
// Handle registration
// Handle registration with role
app.post('/register', async (req, res) => {
  const { username, email, password, role } = req.body;

  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (results.length > 0) {
      req.flash('error', 'Email already in use');
      return res.redirect('/register');
    }

    const hashed = await bcrypt.hash(password, 10);

    db.query(
      'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      [username, email, hashed, role],
      err => {
        if (err) throw err;
        res.redirect('/login');
      }
    );
  });
});


// Show login page
app.get('/login', (req, res) => {
  res.render('login', { message: req.flash('error') });
});
// Handle login
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (!results.length || !(await bcrypt.compare(password, results[0].password))) {
      req.flash('error', 'Invalid credentials');
      return res.redirect('/login');
    }
    req.session.user = results[0];
    res.redirect('/cars');
  });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ========== [7] VIEW / LIST CARS ========== //
app.get('/cars', checkAuthenticated, (req, res) => {
  db.query('SELECT * FROM cars', (err, results) => {
    if (err) throw err;
    res.render('cars', { cars: results, messages: req.flash('success'), errors: req.flash('error'), isAdminPage: req.session.user.role === 'admin' });
  });
});

// ========== [8] ADD NEW CAR ========== //
// Show add form
app.get('/add-car', checkAuthenticated, checkAdmin, (req, res) => {
  res.render('add-car');
});
// Handle submission
app.post('/add-car', upload.single('image'), (req, res) => {
  const {
    car_model,
    car_type,
    rental_rate,
    rental_term,
    availability,
    available_from,
    available_to,
    pickup_location
  } = req.body;

  //  Handle missing file safely
  let image = '';
  if (req.file) {
  image = req.file.filename; // filename now uses the unique name
  } else {
  console.log("No image uploaded");
  }


  // Insert into database
  db.query(
    'INSERT INTO cars (car_model, car_type, rental_rate, rental_term, availability, available_from, available_to, pickup_location, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      car_model,
      car_type,
      rental_rate,
      rental_term,
      availability,
      available_from,
      available_to,
      pickup_location,
      image
    ],
    (err) => {
      if (err) throw err;
      req.flash('success', 'Car added!');
      res.redirect('/cars');
    }
  );
});


// ========== [9] UPDATE CAR ========== //
// Show update form
app.get('/updateCars/:id', checkAuthenticated, checkAdmin, (req, res) => {
  db.query('SELECT * FROM cars WHERE carId = ?', [req.params.id], (err, results) => {
    if (err) throw err;
    if (results.length === 0) return res.status(404).send('Car not found');
    res.render('updateCars', { cars: results[0] });
  });
});
// Handle update
app.post('/updateCars/:id', upload.single('image'), (req, res) => {
  const { plate, brand, model, status, currentImage } = req.body;
  const image = req.file ? req.file.filename : currentImage;

  db.query(
    'UPDATE cars SET plate = ?, brand = ?, model = ?, status = ?, image = ? WHERE carId = ?',
    [plate, brand, model, status, image, req.params.id],
    (err) => {
      if (err) throw err;
      req.flash('success', 'Car updated');
      res.redirect('/cars');
    }
  );
});

// ========== [10] DELETE CAR ========== //
app.get('/deleteCar/:id', checkAuthenticated, checkAdmin, (req, res) => {
  db.query('DELETE FROM cars WHERE carId = ?', [req.params.id], (err) => {
    if (err) throw err;
    req.flash('success', 'Car deleted');
    res.redirect('/cars');
  });
});

// ========== [11] SEARCH CARS ========== //
app.get('/search', checkAuthenticated, (req, res) => {
  const term = req.query.q;
  if (!term) return res.redirect('/cars');
  const value = `%${term.toLowerCase()}%`;
  db.query(
    'SELECT * FROM cars WHERE (LOWER(car_model) LIKE ? OR LOWER(car_type) LIKE ?) AND availability = 1',
    [value, value],
    (err, results) => {
      if (err) throw err;
      res.render('browseCars', { cars: results, searchTerm: term, user: req.session.user });
    }
  );
});

// ========== [VIEW CAR DETAILS] ==========
app.get('/cars/:id', checkAuthenticated, (req, res) => {
  const carId = req.params.id;

  db.query('SELECT * FROM cars WHERE carId = ?', [carId], (err, results) => {
    if (err) throw err;

    if (results.length === 0) {
      return res.status(404).send('Car not found');
    }

    res.render('carDetail', { car: results[0] });
  });
});

// ========== [CART PAGE] ========== //
app.get('/cart', checkAuthenticated, (req, res) => {
  const cart = req.session.cart || [];
  res.render('cart', { user: req.session.user, cart });
});

// ========== [ADD TO RENTAL CART] ========== //
app.post('/add-to-rental/:id', checkAuthenticated, (req, res) => {
  const carId = req.params.id;
  const days = parseInt(req.body.days) || 1;

  db.query('SELECT * FROM cars WHERE carId = ?', [carId], (err, results) => {
    if (err) throw err;

    if (results.length === 0) {
      req.flash('error', 'Car not found.');
      return res.redirect('/cars');
    }

    const car = results[0];

    // Initialize session cart if it doesn't exist
    if (!req.session.cart) {
      req.session.cart = [];
    }

    // Add selected car with rental duration
    req.session.cart.push({
      carId: car.carId,
      brand: car.car_model.split(" ")[0],  // Simplified brand
      car_model: car.car_model,
      rental_rate: parseFloat(car.rental_rate),
      days: days,
      image: car.image
    });

    req.flash('success', 'Car added to cart.');
    res.redirect('/cart');
  });
});

// ========== [CHECKOUT] ========== //
app.post('/checkout', checkAuthenticated, (req, res) => {
  // For now, we just clear the cart and show a success message
  req.session.cart = [];
  req.flash('success', 'Checkout complete! Thank you for your booking.');
  res.redirect('/cars');
});

// ========== [12] START SERVER ========== //
app.listen(3000, () => console.log('Car Rental app running on http://localhost:3000'));
