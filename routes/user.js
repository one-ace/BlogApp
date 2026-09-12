const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const User = require('../models/user');
const Blog = require('../models/blog');
const { createTokenForUser } = require('../services/authentication');
const { sendPasswordResetEmail } = require('../services/emailService');

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many attempts from this IP. Please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});

const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
};

const ALLOWED_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.resolve('./public/uploads'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = `avatar-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype.startsWith('image/') && ALLOWED_IMAGE_EXTS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpg, jpeg, png, gif, webp) are allowed'), false);
    }
  },
});

router.get('/signin', (req, res) => {
  if (req.user) return res.redirect('/user/dashboard');
  res.render('signin', {
    user: req.user,
    resetSuccess: req.query.reset === 'success',
  });
});

router.get('/signup', (req, res) => {
  if (req.user) return res.redirect('/user/dashboard');
  res.render('signup', {
    email: req.query.email || '',
    plan: req.query.plan || 'free',
    user: req.user,
  });
});

router.get('/dashboard', async (req, res) => {
  if (!req.user) return res.redirect('/user/signin');
  try {
    const user = await User.findById(req.user._id);
    const drafts = await Blog.find({ createdBy: req.user._id, status: 'DRAFT' }).sort({ updatedAt: -1 });
    const publishedStories = await Blog.find({ createdBy: req.user._id, status: 'PUBLISHED' }).sort({ createdAt: -1 });

    res.render('dashboard', {
      user: user || req.user,
      drafts: drafts || [],
      publishedStories: publishedStories || [],
      activeTab: req.query.tab || 'stories',
      updated: req.query.updated === 'true',
    });
  } catch (err) {
    console.error('Error fetching dashboard stories:', err);
    res.render('dashboard', {
      user: req.user,
      drafts: [],
      publishedStories: [],
      activeTab: 'stories',
      updated: false,
    });
  }
});

router.get(['/edit-profile', '/profile/edit'], async (req, res) => {
  if (!req.user) return res.redirect('/user/signin');
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.redirect('/user/signin');

    res.render('edit-profile', {
      user,
      updated: req.query.updated === 'true',
      error: req.query.error || null,
    });
  } catch (error) {
    console.error('Error loading edit profile page:', error);
    return res.redirect('/user/dashboard');
  }
});

router.post('/profile', async (req, res, next) => {
  if (!req.user) return res.redirect('/user/signin');
  upload.single('profileImage')(req, res, async (err) => {
    if (err) {
      console.error('Avatar upload error:', err);
    }
    try {
      const { fullName, bio, location, website, redirect } = req.body;
      const user = await User.findById(req.user._id);
      if (!user) return res.redirect('/user/signin');

      if (fullName && fullName.trim()) user.fullName = fullName.trim().slice(0, 100);
      if (typeof bio !== 'undefined') user.bio = bio.trim().slice(0, 300);
      if (typeof location !== 'undefined') user.location = location.trim().slice(0, 100);
      if (typeof website !== 'undefined' && website.trim()) {
        const ws = website.trim();
        try {
          const parsed = new URL(ws);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return res.redirect('/user/edit-profile?error=invalid-url');
          }
          user.website = ws.slice(0, 200);
        } catch {
          return res.redirect('/user/edit-profile?error=invalid-url');
        }
      } else if (typeof website !== 'undefined') {
        user.website = '';
      }
      if (req.file) {
        user.profileImageURL = `/uploads/${req.file.filename}`;
      }

      await user.save();

      const token = createTokenForUser(user);
      res.cookie('token', token, cookieOptions);

      if (redirect === 'profile') {
        return res.redirect(`/user/profile/${user._id}`);
      } else if (redirect === 'edit') {
        return res.redirect('/user/edit-profile?updated=true');
      }

      return res.redirect('/user/dashboard?tab=profile&updated=true');
    } catch (error) {
      console.error('Error updating profile:', error);
      return res.redirect('/user/dashboard');
    }
  });
});

router.get('/profile/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.redirect('/');
    const author = await User.findById(req.params.id);
    if (!author) {
      return res.redirect('/');
    }

    const articles = await Blog.find({ createdBy: author._id, status: 'PUBLISHED' }).sort({ createdAt: -1 });

    res.render('profile', {
      author,
      articles: articles || [],
      user: req.user,
    });
  } catch (error) {
    console.error('Error loading author profile:', error);
    return res.redirect('/');
  }
});

router.post('/signin', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.render('signin', {
        error: 'Email and password are required',
        user: req.user,
      });
    }
    const token = await User.matchpasswordAndGenerateToken(email, password);

    return res.cookie('token', token, cookieOptions).redirect('/user/dashboard');
  } catch (error) {
    return res.render('signin', {
      error: 'Incorrect Email or Password',
      user: req.user,
    });
  }
});

router.post('/signup', authLimiter, async (req, res) => {
  const { fullName, email, password } = req.body;
  try {
    if (!fullName || !email || !password) {
      return res.render('signup', {
        error: 'All fields are required',
        email: email || '',
        fullName: fullName || '',
        plan: req.body.plan || 'free',
        user: req.user,
      });
    }
    if (password.length < 8) {
      return res.render('signup', {
        error: 'Password must be at least 8 characters long',
        email: email || '',
        fullName: fullName || '',
        plan: req.body.plan || 'free',
        user: req.user,
      });
    }
    await User.create({ fullName, email, password });
    const token = await User.matchpasswordAndGenerateToken(email, password);
    return res.cookie('token', token, cookieOptions).redirect('/user/dashboard');
  } catch (error) {
    const errorMsg = error.code === 11000
      ? 'An account with this email already exists'
      : 'Failed to create account. Please try again.';
    return res.render('signup', {
      error: errorMsg,
      email: email || '',
      fullName: fullName || '',
      plan: req.body.plan || 'free',
      user: req.user,
    });
  }
});

router.get('/logout', (req, res) => {
  res.clearCookie('token').redirect('/');
});

router.get('/forgot-password', (req, res) => {
  if (req.user) return res.redirect('/user/dashboard');
  res.render('forgot-password', {
    user: req.user,
    error: null,
    success: false,
    email: '',
    simulatedResetUrl: null,
  });
});

router.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body;
  const cleanEmail = email ? email.trim().toLowerCase() : '';

  if (!cleanEmail) {
    return res.render('forgot-password', {
      user: req.user,
      error: 'Please enter your email address.',
      success: false,
      email: '',
      simulatedResetUrl: null,
    });
  }

  try {
    const user = await User.findOne({ email: cleanEmail });

    let simulatedResetUrl = null;

    if (user) {
      const resetToken = user.createPasswordResetToken();
      await user.save({ validateBeforeSave: false });

      const resetUrl = `${req.protocol}://${req.get('host')}/user/reset-password/${resetToken}`;
      const emailResult = await sendPasswordResetEmail({
        to: user.email,
        resetUrl,
        fullName: user.fullName,
      });

      if (emailResult && emailResult.simulated) {
        simulatedResetUrl = resetUrl;
      }
    }

    return res.render('forgot-password', {
      user: req.user,
      error: null,
      success: true,
      email: cleanEmail,
      simulatedResetUrl,
    });
  } catch (error) {
    console.error('Error handling forgot-password request:', error);
    return res.render('forgot-password', {
      user: req.user,
      error: 'An unexpected error occurred. Please try again.',
      success: false,
      email: cleanEmail,
      simulatedResetUrl: null,
    });
  }
});

router.get('/reset-password/:token', async (req, res) => {
  if (req.user) return res.redirect('/user/dashboard');
  const { token } = req.params;

  try {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.render('reset-password', {
        user: req.user,
        token: null,
        error: 'Password reset link is invalid or has expired. Please request a new link.',
      });
    }

    return res.render('reset-password', {
      user: req.user,
      token,
      error: null,
    });
  } catch (error) {
    console.error('Error verifying reset token:', error);
    return res.render('reset-password', {
      user: req.user,
      token: null,
      error: 'Invalid password reset link. Please request a new one.',
    });
  }
});

router.post('/reset-password/:token', authLimiter, async (req, res) => {
  const { token } = req.params;
  const { password, confirmPassword } = req.body;

  try {
    if (!password || !confirmPassword) {
      return res.render('reset-password', {
        user: req.user,
        token,
        error: 'Please fill in both password fields.',
      });
    }

    if (password !== confirmPassword) {
      return res.render('reset-password', {
        user: req.user,
        token,
        error: 'Passwords do not match.',
      });
    }

    if (password.length < 8) {
      return res.render('reset-password', {
        user: req.user,
        token,
        error: 'Password must be at least 8 characters long.',
      });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.render('reset-password', {
        user: req.user,
        token: null,
        error: 'Password reset link has expired or is invalid. Please request a new one.',
      });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return res.redirect('/user/signin?reset=success');
  } catch (error) {
    console.error('Error saving new password:', error);
    return res.render('reset-password', {
      user: req.user,
      token,
      error: 'Failed to reset password. Please try again.',
    });
  }
});

module.exports = router;