const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');
const Blog = require('../models/blog');
const Comment = require('../models/comment');

const router = Router();

const ALLOWED_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.resolve('./public/uploads'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = `cover-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.mimetype.startsWith('image/') && ALLOWED_IMAGE_EXTS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpg, jpeg, png, gif, webp) are allowed'), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter,
});

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.redirect('/user/signin');
  }
  next();
}

function parseTags(tagsInput) {
  if (Array.isArray(tagsInput)) return tagsInput;
  if (!tagsInput || typeof tagsInput !== 'string') return [];
  return tagsInput
    .split(',')
    .map((t) => t.trim().replace(/^#/, ''))
    .filter(Boolean);
}

router.get('/new', requireAuth, (req, res) => {
  res.render('editor', {
    user: req.user,
    article: null,
    isNew: true,
  });
});

router.post('/draft', requireAuth, upload.single('coverImage'), async (req, res) => {
  try {
    const { id, title, body, category, tags } = req.body;
    if (body && body.length > 200000) {
      return res.status(400).send('Blog content is too long (max 200KB).');
    }
    const cleanTitle = (title && title.trim()) || 'Untitled Draft';
    const parsedTags = parseTags(tags);
    const coverImageURL = req.file ? `/uploads/${req.file.filename}` : undefined;

    if (id) {
      if (!isValidObjectId(id)) return res.redirect('/user/dashboard');
      const existing = await Blog.findById(id);
      if (!existing) {
        return res.redirect('/user/dashboard');
      }
      if (existing.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN') {
        return res.status(403).send('Unauthorized to modify this draft');
      }

      existing.title = cleanTitle;
      existing.body = body || '';
      existing.category = category || existing.category;
      existing.tags = parsedTags;
      existing.status = 'DRAFT';
      if (coverImageURL) existing.coverImageURL = coverImageURL;
      await existing.save();
    } else {
      await Blog.create({
        title: cleanTitle,
        body: body || '',
        category: category || 'General',
        tags: parsedTags,
        coverImageURL: coverImageURL || '',
        status: 'DRAFT',
        createdBy: req.user._id,
      });
    }

    return res.redirect('/user/dashboard');
  } catch (error) {
    console.error('Error saving draft:', error);
    return res.redirect('/user/dashboard');
  }
});

router.post('/publish', requireAuth, upload.single('coverImage'), async (req, res) => {
  try {
    const { id, title, body, category, tags } = req.body;
    if (body && body.length > 200000) {
      return res.status(400).send('Blog content is too long (max 200KB).');
    }
    const cleanTitle = (title && title.trim()) || 'Untitled Story';
    const parsedTags = parseTags(tags);
    const coverImageURL = req.file ? `/uploads/${req.file.filename}` : undefined;

    if (id) {
      if (!isValidObjectId(id)) return res.redirect('/user/dashboard');
      const existing = await Blog.findById(id);
      if (!existing) {
        return res.redirect('/user/dashboard');
      }
      if (existing.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN') {
        return res.status(403).send('Unauthorized to publish this story');
      }

      existing.title = cleanTitle;
      existing.body = body || '';
      existing.category = category || existing.category;
      existing.tags = parsedTags;
      existing.status = 'PUBLISHED';
      if (coverImageURL) existing.coverImageURL = coverImageURL;
      await existing.save();
    } else {
      await Blog.create({
        title: cleanTitle,
        body: body || '',
        category: category || 'General',
        tags: parsedTags,
        coverImageURL: coverImageURL || '',
        status: 'PUBLISHED',
        createdBy: req.user._id,
      });
    }

    return res.redirect('/user/dashboard');
  } catch (error) {
    console.error('Error publishing story:', error);
    return res.redirect('/user/dashboard');
  }
});

router.get('/edit/:id', requireAuth, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.redirect('/user/dashboard');
    const article = await Blog.findById(req.params.id);
    if (!article) {
      return res.redirect('/user/dashboard');
    }

    if (article.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN') {
      return res.redirect('/user/dashboard');
    }

    res.render('editor', {
      user: req.user,
      article,
      isNew: false,
    });
  } catch (error) {
    console.error('Error loading article for edit:', error);
    return res.redirect('/user/dashboard');
  }
});

router.post('/delete/:id', requireAuth, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.redirect('/user/dashboard');
    const article = await Blog.findById(req.params.id);
    if (!article) {
      return res.redirect('/user/dashboard');
    }

    if (article.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN') {
      return res.status(403).send('Unauthorized');
    }

    await Blog.findByIdAndDelete(req.params.id);
    await Comment.deleteMany({ blogId: req.params.id });
    return res.redirect('/user/dashboard');
  } catch (error) {
    console.error('Error deleting article:', error);
    return res.redirect('/user/dashboard');
  }
});

router.post('/:id/like', requireAuth, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.redirect('/');
    const article = await Blog.findById(req.params.id);
    if (!article) return res.redirect('/');

    const userIndex = article.likes.findIndex((id) => id.toString() === req.user._id.toString());
    if (userIndex > -1) {
      article.likes.splice(userIndex, 1);
    } else {
      article.likes.push(req.user._id);
    }
    await article.save();

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({
        success: true,
        liked: userIndex === -1,
        likesCount: article.likes.length,
      });
    }

    return res.redirect(`/blog/${req.params.id}#like-section`);
  } catch (error) {
    console.error('Error toggling like:', error);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json({ error: 'Failed to toggle like' });
    }
    return res.redirect(`/blog/${req.params.id}`);
  }
});

router.post('/:id/comment', requireAuth, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.redirect('/');
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.redirect(`/blog/${req.params.id}#comments`);
    }
    if (content.trim().length > 2000) {
      return res.redirect(`/blog/${req.params.id}#comments`);
    }

    await Comment.create({
      content: content.trim(),
      blogId: req.params.id,
      createdBy: req.user._id,
    });

    return res.redirect(`/blog/${req.params.id}#comments`);
  } catch (error) {
    console.error('Error creating comment:', error);
    return res.redirect(`/blog/${req.params.id}#comments`);
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.redirect('/');
    const article = await Blog.findById(req.params.id).populate('createdBy', 'fullName email profileImageURL role bio');
    if (!article) {
      return res.redirect('/');
    }

    if (article.status === 'DRAFT') {
      if (!req.user || (req.user._id.toString() !== article.createdBy._id.toString() && req.user.role !== 'ADMIN')) {
        return res.redirect('/');
      }
    }

    const comments = await Comment.find({ blogId: article._id })
      .populate('createdBy', 'fullName profileImageURL email')
      .sort({ createdAt: -1 });

    const isLiked = req.user && article.likes && article.likes.some((id) => id.toString() === req.user._id.toString());

    const rawHtml = marked.parse(article.body || '');
    const parsedBody = sanitizeHtml(rawHtml, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat([
        'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'figure', 'figcaption', 'pre', 'code',
      ]),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        'img': ['src', 'alt', 'title', 'width', 'height'],
        'a': ['href', 'title', 'target', 'rel'],
        'code': ['class'],
        'pre': ['class'],
      },
      allowedSchemes: ['http', 'https', 'mailto'],
    });

    res.render('article', {
      article,
      parsedBody,
      comments: comments || [],
      isLiked: !!isLiked,
      user: req.user,
    });
  } catch (error) {
    console.error('Error loading article:', error);
    return res.redirect('/');
  }
});

module.exports = router;
