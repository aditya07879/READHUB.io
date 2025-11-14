require('dotenv').config();

const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const passport = require('passport'); 
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');


const authController = require('./controllers/authController'); 
const summaryController = require('./controllers/summaryController');
const requireAuth = require('./middleware/authmiddleware');
const errorHandler = require('./middleware/errormiddleware');


const mainRoutes = require('./routes/main');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const summaryRouter = require('./routes/summary.router');
const paymentsRouter = require('./routes/payments');


const User = require('./models/user');
const setupPassport = require('./config/passport'); 

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/readhub';
const COOKIE_NAME = process.env.COOKIE_NAME || 'token';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const IS_PROD = process.env.NODE_ENV === 'production';


app.set('view engine', 'ejs');
app.set('views', path.resolve(__dirname, 'views'));
app.set('view cache', false);

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


try {
  setupPassport(app);
} catch (err) {
  console.warn('Passport setup warning:', err && err.message);
}


if (!IS_PROD) {
  const cors = require('cors');
  app.use(cors({
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
    credentials: true
  }));
}

app.use((req, res, next) => {
  res.setHeader('Access-Control-Expose-Headers', 'X-Limit-Reached');
  next();
});

app.use(async (req, res, next) => {
  res.locals.user = null;
  req.user = null;

  const token =
    (req.cookies && (req.cookies[COOKIE_NAME] || req.cookies.auth_token)) ||
    (req.headers.authorization && req.headers.authorization.split(' ')[1]);

  if (!token) return next();

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const userId = payload.id || payload.sub || payload._id;
    if (!userId) return next();

    const user = await User.findById(userId).select('-passwordHash').lean();
    if (user) {
      res.locals.user = user;
      req.user = user;
    }
  } catch (err) {
   
    try { res.clearCookie(COOKIE_NAME); res.clearCookie('auth_token'); } catch (e) {}
  }

  return next();
});


app.use('/', mainRoutes);
app.use('/auth', authRoutes);


app.use('/api/summary', summaryRouter);


app.use('/api', apiRoutes);


app.use('/payments', paymentsRouter);


app.use(errorHandler);


(async function start() {
  try {
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  }
})();
