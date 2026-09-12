const JWT = require('jsonwebtoken');

const secret = process.env.JWT_SECRET;
if (!secret) {
    throw new Error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
}

function createTokenForUser(user) {
    const payload = {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        profileImageURL: user.profileImageURL,
        role: user.role
    };
    const token = JWT.sign(payload, secret, { expiresIn: '2d' });
    return token;
}

function validateToken(token) {
    const payload = JWT.verify(token, secret);
    return payload;
}

module.exports = {
    createTokenForUser,
    validateToken
};