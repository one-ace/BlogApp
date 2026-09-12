# 🖋️ Editorial Blog Application

A modern, full-stack blogging platform and editorial studio built with **Node.js**, **Express**, **EJS**, and **MongoDB**. Designed with a distraction-free reading and writing experience in mind.

---

## ✨ Features

- **Editorial Writing Studio**: Write articles with Markdown support, live preview, cover image upload, and draft/publish workflows.
- **Secure Authentication**: User sign-up, login, and session handling using JWT stored in secure HTTP-only cookies, password hashing with bcrypt, and profile management.
- **Interactive Reader Experience**: Like posts, engage in discussions with threaded comments, explore articles by category, and search with keyword filtering.
- **Author Profiles & Dashboard**: Dedicated profile pages showcasing published stories, author bios, and metrics.
- **Production-Ready Security**:
  - Helmet for secure HTTP response headers (CSP, frameguard, etc.)
  - Express Rate Limiting against brute-force and spam
  - HTML sanitization using `sanitize-html` to prevent stored XSS
  - Input validation and MongoDB ObjectId guards against injection/crashes
  - Strictly parameterized database queries

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express 5
- **Database**: MongoDB with Mongoose ODM
- **Templating**: EJS with reusable partials
- **Styling**: Bootstrap 5 + custom editorial design system & Bootstrap Icons
- **Markdown & Sanitization**: Marked, Sanitize-HTML
- **File Uploads**: Multer
- **Authentication & Security**: JSON Web Tokens (JWT), Bcrypt, Helmet, Express-Rate-Limit, Cookie-Parser

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [MongoDB](https://www.mongodb.com/try/download/community) installed and running locally, or a [MongoDB Atlas](https://www.mongodb.com/atlas) connection URI.

### Installation

1. **Clone the repository**:
   ```bash
   git clone <your-repository-url>
   cd blog
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```
   Update `.env` with your configuration:
   ```env
   PORT=8000
   MONGO_URI=mongodb://localhost:27017/blog
   JWT_SECRET=your_super_secret_jwt_key
   NODE_ENV=development
   ```

4. **Seed Sample Articles (Optional)**:
   Populate your local database with sample editorial articles:
   ```bash
   npm run seed
   ```

5. **Start the Development Server**:
   ```bash
   npm run dev
   ```
   Open your browser and navigate to `http://localhost:8000`.

---

## 📜 Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts server with `nodemon` for auto-reloading during development |
| `npm start` | Starts production server with `node index.js` |
| `npm run seed` | Seeds the database with curated demo articles and authors |

---

## 📁 Project Structure

```
blog/
├── controllers/          # Business logic handlers
├── middlewares/          # Auth verification and security middlewares
├── models/               # Mongoose schemas (User, Blog, Comment)
├── public/               # Static assets (custom CSS, images, uploads)
├── routes/               # Express route handlers (user, blog, static)
├── services/             # Helper services (JWT token creation/verification)
├── views/                # EJS templates and layouts
│   └── partials/         # Reusable EJS header, navbar, footer, scripts
├── .env.example          # Sample environment configuration template
├── index.js              # Application entry point
├── package.json          # Node dependencies and scripts
└── seed_blogs.js         # Database seeding script
```

---

## 🔒 Security Practices

- Keep `.env` out of version control (already configured in `.gitignore`).
- Ensure `JWT_SECRET` is set to a strong, high-entropy string in production.
- Use secure cookies and HTTPS in production environments.

---

## 📄 License

This project is licensed under the ISC License.
