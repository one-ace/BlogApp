require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const userRoute = require('./routes/user');
const blogRoute = require('./routes/blog');
const Blog = require('./models/blog');
const { checkForAuthenticationCookie } = require('./middlewares/authentication');

const app = express();
const PORT = process.env.PORT || 8000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/blog';

app.set('trust proxy', 1);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

mongoose.connection.on('connected', () => console.log('DB Connected'));
mongoose.connection.on('error', (err) => console.error('MongoDB connection error:', err));
mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));

mongoose
  .connect(MONGO_URI)
  .catch((err) => console.error('MongoDB initial connection error:', err));

app.set('view engine', 'ejs');
app.set('views', path.resolve('./views'));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
    },
  },
}));
app.use(express.static(path.resolve('./public')));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(checkForAuthenticationCookie('token'));

app.use('/user', userRoute);
app.use('/blog', blogRoute);

app.get('/', async (req, res) => {
  try {
    const category = req.query.category;
    const search = req.query.search;
    const filter = { status: 'PUBLISHED' };

    if (category && category !== 'All') {
      filter.category = category;
    }

    if (search && search.trim()) {
      const safeSearch = escapeRegex(search.trim());
      filter.$or = [
        { title: { $regex: safeSearch, $options: 'i' } },
        { body: { $regex: safeSearch, $options: 'i' } },
        { tags: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const articles = await Blog.find(filter)
      .populate('createdBy', 'fullName profileImageURL email bio')
      .sort({ createdAt: -1 })
      .limit(30);

    res.render('home', {
      user: req.user,
      articles: articles || [],
      selectedCategory: category || 'All',
      searchQuery: search || '',
    });
  } catch (error) {
    console.error('Error rendering homepage articles:', error);
    res.render('home', {
      user: req.user,
      articles: [],
      selectedCategory: 'All',
      searchQuery: '',
    });
  }
});

app.get('/pricing', (req, res) => {
  res.render('pricing', {
    user: req.user,
  });
});

app.get('/features', (req, res) => {
  res.render('features', {
    user: req.user,
  });
});

app.get('/about', (req, res) => {
  res.render('about', {
    user: req.user,
  });
});

app.get('/privacy', (req, res) => {
  res.render('privacy', {
    user: req.user,
  });
});

app.get('/terms', (req, res) => {
  res.render('terms', {
    user: req.user,
  });
});

app.listen(PORT, () => console.log(`Server started on http://localhost:${PORT}`));
