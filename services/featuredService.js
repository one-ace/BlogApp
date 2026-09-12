const fs = require('fs');
const path = require('path');
const Blog = require('../models/blog');
const User = require('../models/user');

const ROTATION_MINUTES = parseInt(process.env.FEATURED_ROTATION_MINUTES, 10) || 5;
const ROTATION_MS = ROTATION_MINUTES * 60 * 1000;

let cachedBlogs = [];
let lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache TTL

let seededTitles = [];
try {
  const seedFile = path.resolve('./blog_posts.json');
  if (fs.existsSync(seedFile)) {
    const raw = fs.readFileSync(seedFile, 'utf8');
    const posts = JSON.parse(raw);
    seededTitles = posts.map((p) => p.title).filter(Boolean);
  }
} catch (err) {
  console.warn('[FeaturedService] Unable to parse blog_posts.json:', err.message);
}

function calculateReadTime(bodyText) {
  if (!bodyText || typeof bodyText !== 'string') return '1 min read';
  const wordCount = bodyText.trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.ceil(wordCount / 200));
  return `${minutes} min read`;
}

function createExcerpt(bodyText, maxLength = 160) {
  if (!bodyText || typeof bodyText !== 'string') return '';
  const clean = bodyText
    .replace(/^#+\s+/gm, '') // Remove heading hashes
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove markdown links
    .replace(/[*_`>~]/g, '') // Remove formatting characters
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length <= maxLength) return clean;
  return clean.substring(0, maxLength).trim() + '...';
}

function formatBlogPayload(blog) {
  if (!blog) return null;
  const createdBy = blog.createdBy || {};
  const formattedDate = new Date(blog.createdAt || Date.now()).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return {
    _id: blog._id.toString(),
    title: blog.title,
    excerpt: createExcerpt(blog.body),
    category: blog.category || 'General',
    tags: Array.isArray(blog.tags) ? blog.tags : [],
    coverImageURL: blog.coverImageURL || '',
    readTime: calculateReadTime(blog.body),
    createdAt: blog.createdAt,
    formattedDate,
    likesCount: Array.isArray(blog.likes) ? blog.likes.length : 0,
    createdBy: {
      _id: createdBy._id ? createdBy._id.toString() : '',
      fullName: createdBy.fullName || 'Editorial Staff',
      profileImageURL: createdBy.profileImageURL || '/images/male-face.jpg',
      bio: createdBy.bio || createdBy.location || 'Staff Contributor',
    },
  };
}

async function getCandidateBlogs() {
  const now = Date.now();
  if (cachedBlogs.length > 0 && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedBlogs;
  }

  let query = { status: 'PUBLISHED' };
  if (seededTitles.length > 0) {
    query.title = { $in: seededTitles };
  }

  let blogs = await Blog.find(query)
    .populate('createdBy', 'fullName profileImageURL email bio location')
    .sort({ _id: 1 })
    .lean();

  // If no seeded blogs matched, fallback to any published blogs
  if (!blogs || blogs.length === 0) {
    blogs = await Blog.find({ status: 'PUBLISHED' })
      .populate('createdBy', 'fullName profileImageURL email bio location')
      .sort({ createdAt: -1 })
      .lean();
  }

  if (blogs && blogs.length > 0) {
    cachedBlogs = blogs;
    lastCacheTime = now;
  }

  return cachedBlogs;
}

async function getCurrentFeaturedBlog(offset = 0) {
  const blogs = await getCandidateBlogs();
  if (!blogs || blogs.length === 0) {
    return {
      success: false,
      blog: null,
      nextSwapAt: Date.now() + ROTATION_MS,
      secondsRemaining: ROTATION_MINUTES * 60,
      intervalMinutes: ROTATION_MINUTES,
      currentIndex: 0,
      totalCount: 0,
    };
  }

  const now = Date.now();
  const timeSlot = Math.floor(now / ROTATION_MS);
  const nextSwapAt = (timeSlot + 1) * ROTATION_MS;
  const secondsRemaining = Math.max(0, Math.round((nextSwapAt - now) / 1000));

  const total = blogs.length;
  // Handle positive or negative offset cleanly
  const rawIndex = (timeSlot + offset) % total;
  const currentIndex = (rawIndex + total) % total;

  const rawBlog = blogs[currentIndex];
  const formatted = formatBlogPayload(rawBlog);

  return {
    success: true,
    blog: formatted,
    nextSwapAt,
    secondsRemaining,
    intervalMinutes: ROTATION_MINUTES,
    currentIndex,
    totalCount: total,
  };
}

async function getFeaturedBlogByIndex(index) {
  const blogs = await getCandidateBlogs();
  if (!blogs || blogs.length === 0) {
    return {
      success: false,
      blog: null,
      currentIndex: 0,
      totalCount: 0,
    };
  }

  const total = blogs.length;
  const validIndex = ((index % total) + total) % total;
  const rawBlog = blogs[validIndex];
  const formatted = formatBlogPayload(rawBlog);

  const now = Date.now();
  const timeSlot = Math.floor(now / ROTATION_MS);
  const nextSwapAt = (timeSlot + 1) * ROTATION_MS;
  const secondsRemaining = Math.max(0, Math.round((nextSwapAt - now) / 1000));

  return {
    success: true,
    blog: formatted,
    nextSwapAt,
    secondsRemaining,
    intervalMinutes: ROTATION_MINUTES,
    currentIndex: validIndex,
    totalCount: total,
  };
}

module.exports = {
  getCurrentFeaturedBlog,
  getFeaturedBlogByIndex,
  calculateReadTime,
  createExcerpt,
  ROTATION_MINUTES,
};
