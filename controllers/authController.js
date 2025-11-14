const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const COOKIE_NAME = process.env.COOKIE_NAME || 'token';
const IS_PROD = process.env.NODE_ENV === 'production';

function makeToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, name: user.fullname },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function setTokenCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

async function signup(req, res) {
  const { fullname, email, password } = req.body;
  if (!fullname || !email || !password)
    return res.render('signup', { error: 'All fields are required.' });

  try {
    const exist = await User.findOne({ email: email.toLowerCase() });
    if (exist)
      return res.render('signup', { error: 'Email already registered.' });

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      fullname,
      email: email.toLowerCase(),
      passwordHash: hash,
    });

    const token = makeToken(user);
    setTokenCookie(res, token);
    return res.redirect('/');
  } catch (err) {
    console.log(err);
    return res.render('signup', { error: 'Signup failed.' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).render('login', { error: 'Email and password required' });

  
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash +password');

    if (!user) return res.status(401).render('login', { error: 'Invalid credentials' });

    const ok = await user.verifyPassword(password);
    if (!ok) return res.status(401).render('login', { error: 'Invalid credentials' });

   
    const payload = { id: user._id, email: user.email };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });

  
    res.cookie(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
    return res.redirect('/');
  } catch (err) {
    return next(err);
  }
};

function logout(req, res) {
  res.clearCookie(COOKIE_NAME);
  return res.redirect('/');
}

function oauthCallback(req, res) {
  const token = makeToken(req.user);
  setTokenCookie(res, token);
  return res.redirect('/');
}

module.exports = {
  signup,
  login,
  logout,
  oauthCallback,
};
