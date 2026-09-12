const { Schema, model } = require('mongoose');
const bcrypt = require('bcryptjs');
const { createHmac } = require('crypto');
const { createTokenForUser } = require('../services/authentication');

const userSchema = new Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    bio: {
      type: String,
      default: '',
      maxLength: 300,
    },
    location: {
      type: String,
      default: '',
      trim: true,
    },
    website: {
      type: String,
      default: '',
      trim: true,
    },
    profileImageURL: {
      type: String,
      default: '/images/male-face.jpg',
    },
    role: {
      type: String,
      enum: ['USER', 'ADMIN'],
      default: 'USER',
    },
    salt: {
      type: String,
      select: false,
    },
  },
  { timestamps: true }
);

userSchema.pre('save', async function () {
  const user = this;
  if (!user.isModified('password')) return;

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(user.password, salt);
  this.password = hashedPassword;
});

userSchema.statics.matchpasswordAndGenerateToken = async function (email, password) {
  const user = await this.findOne({ email }).select('+salt');
  if (!user) throw new Error('User not found');

  let isMatch = false;

  if (user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))) {
    isMatch = await bcrypt.compare(password, user.password);
  } else if (user.salt) {
    const userProvidedHash = createHmac('sha256', user.salt).update(password).digest('hex');
    isMatch = user.password === userProvidedHash;
    if (isMatch) {
      user.password = password;
      user.salt = undefined;
      await user.save();
    }
  }

  if (!isMatch) throw new Error('Password does not match');

  const token = createTokenForUser(user);
  return token;
};

const User = model('User', userSchema);

module.exports = User;
