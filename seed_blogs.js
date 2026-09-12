require('dotenv').config();
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('./models/user');
const Blog = require('./models/blog');

function cleanUrl(val) {
  if (!val || typeof val !== 'string') return '';
  const trimmed = val.trim();
  // If in markdown link format [text](url) or [url](url)
  const match = trimmed.match(/^\[(.*?)\]\((.*?)\)$/);
  if (match) {
    let target = match[2].trim();
    if (target.startsWith('mailto:')) target = target.replace('mailto:', '');
    return target;
  }
  return trimmed;
}

function cleanText(val) {
  if (!val || typeof val !== 'string') return '';
  return val.trim();
}

async function seed() {
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/blog';
  console.log(`Connecting to MongoDB at: ${MONGO_URI}...`);
  await mongoose.connect(MONGO_URI);
  console.log('MongoDB connected.');

  let filePath = path.resolve('./blog_posts.json');
  if (!fs.existsSync(filePath)) {
    filePath = path.resolve('./articles.json');
  }
  if (!fs.existsSync(filePath)) {
    console.error('Neither blog_posts.json nor articles.json found!');
    process.exit(1);
  }

  console.log(`Reading articles from: ${filePath}...`);
  const rawData = fs.readFileSync(filePath, 'utf-8');
  const articlesData = JSON.parse(rawData);

  console.log(`Found ${articlesData.length} articles to process.\n`);

  let authorsCreated = 0;
  let articlesCreated = 0;
  let articlesUpdated = 0;

  for (const item of articlesData) {
    const authorInfo = item.author || {};
    let email = cleanUrl(authorInfo.email) || `author_${Date.now()}_${Math.random().toString(36).substring(7)}@editorial.io`;
    const fullName = cleanText(authorInfo.fullName) || 'Editorial Writer';
    const bio = cleanText(authorInfo.bio) || '';
    const location = cleanText(authorInfo.location) || '';
    const website = cleanUrl(authorInfo.website) || '';
    const profileImageURL = cleanUrl(authorInfo.profileImageURL) || '/images/male-face.jpg';

    // Find or create author user
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        fullName,
        email,
        password: 'EditorialPassword123!',
        bio,
        location,
        website,
        profileImageURL,
        role: 'USER',
      });
      authorsCreated++;
      console.log(`✓ Created author: ${fullName} (${email})`);
    } else {
      // Update bio/location/website/avatar if available
      let modified = false;
      if (!user.bio && bio) { user.bio = bio; modified = true; }
      if (!user.location && location) { user.location = location; modified = true; }
      if (!user.website && website) { user.website = website; modified = true; }
      if ((!user.profileImageURL || user.profileImageURL === '/images/male-face.jpg') && profileImageURL) {
        user.profileImageURL = profileImageURL;
        modified = true;
      }
      if (modified) await user.save();
    }

    const title = cleanText(item.title);
    const category = cleanText(item.category) || 'General';
    const tags = Array.isArray(item.tags) ? item.tags.map(t => cleanText(t)) : [];
    const coverImageURL = cleanUrl(item.coverImageURL) || '';
    const status = item.status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED';
    const body = cleanText(item.body) || '';

    // Check if article with this title already exists
    let blog = await Blog.findOne({ title });
    if (!blog) {
      blog = await Blog.create({
        title,
        body,
        category,
        tags,
        coverImageURL,
        status,
        createdBy: user._id,
      });
      articlesCreated++;
      console.log(`  + Published: "${title}" [${category}] by ${user.fullName}`);
    } else {
      blog.body = body;
      blog.category = category;
      blog.tags = tags;
      blog.coverImageURL = coverImageURL;
      blog.status = status;
      blog.createdBy = user._id;
      await blog.save();
      articlesUpdated++;
      console.log(`  ~ Updated: "${title}" [${category}]`);
    }
  }

  console.log('\n========================================');
  console.log('Seeding Summary:');
  console.log(`- New Authors Created: ${authorsCreated}`);
  console.log(`- New Articles Created: ${articlesCreated}`);
  console.log(`- Articles Updated: ${articlesUpdated}`);
  console.log(`- Total Processed: ${articlesData.length}`);
  console.log('========================================\n');

  await mongoose.disconnect();
  console.log('MongoDB disconnected. Seeding completed successfully!');
}

seed().catch(err => {
  console.error('Seeding failed with error:', err);
  process.exit(1);
});
