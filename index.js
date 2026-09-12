require('dotenv').config();
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const userRoute = require('./routes/user');
const blogRoute = require('./routes/blog');
const Blog = require('./models/blog');
const { checkForAuthenticationCookie } = require('./middlewares/authentication');
const featuredService = require('./services/featuredService');

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

app.get('/api/featured-blog', async (req, res) => {
  try {
    const { index, offset, action } = req.query;
    let data;

    if (index !== undefined && index !== '') {
      data = await featuredService.getFeaturedBlogByIndex(parseInt(index, 10) || 0);
    } else if (action === 'next') {
      const current = await featuredService.getCurrentFeaturedBlog();
      const nextIndex = (current.currentIndex + 1) % (current.totalCount || 1);
      data = await featuredService.getFeaturedBlogByIndex(nextIndex);
    } else if (action === 'prev') {
      const current = await featuredService.getCurrentFeaturedBlog();
      const prevIndex = (current.currentIndex - 1 + (current.totalCount || 1)) % (current.totalCount || 1);
      data = await featuredService.getFeaturedBlogByIndex(prevIndex);
    } else if (offset !== undefined && offset !== '') {
      data = await featuredService.getCurrentFeaturedBlog(parseInt(offset, 10) || 0);
    } else {
      data = await featuredService.getCurrentFeaturedBlog();
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching featured blog:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve featured blog' });
  }
});

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

    const [articles, featuredData] = await Promise.all([
      Blog.find(filter)
        .populate('createdBy', 'fullName profileImageURL email bio')
        .sort({ createdAt: -1 })
        .limit(30),
      featuredService.getCurrentFeaturedBlog(),
    ]);

    res.render('home', {
      user: req.user,
      articles: articles || [],
      selectedCategory: category || 'All',
      searchQuery: search || '',
      featuredBlog: featuredData.blog,
      featuredMeta: featuredData,
    });
  } catch (error) {
    console.error('Error rendering homepage articles:', error);
    res.render('home', {
      user: req.user,
      articles: [],
      selectedCategory: 'All',
      searchQuery: '',
      featuredBlog: null,
      featuredMeta: null,
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
