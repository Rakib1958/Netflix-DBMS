# Netflix DBMS - Full-Stack Streaming Platform

A comprehensive Netflix-like streaming platform built with modern web technologies, featuring AI-powered recommendations, robust authentication, and a complete database management system.

## 🚀 Features

### Core Functionality
- **Media Catalog**: Browse movies and TV series with rich metadata from TMDB API
- **User Authentication**: Secure JWT-based authentication with email verification
- **Personalization**: Watchlist, ratings (1-10), and user reviews with voting
- **AI Recommendations**: Mood-based movie suggestions powered by Gemini AI
- **Admin Dashboard**: Complete admin interface for user and content management
- **Search & Discovery**: Advanced search with genre/section filtering

### Technical Features
- **Responsive Design**: Mobile-first UI with modern React components
- **Real-time Updates**: Live rating aggregates and review voting
- **Secure API**: RESTful API with authentication middleware
- **Database Triggers**: Automatic aggregate updates via PostgreSQL triggers
- **Email Integration**: SMTP-based email verification and password reset
- **File Uploads**: Profile picture uploads with static serving

## 🧰 Tech Stack

### Frontend
- **React 18** with Vite
- **Zustand** for state management
- **Axios** for API communication
- **Tailwind CSS** for styling
- **React Router** for navigation
- **Swiper** for carousels

### Backend
- **Node.js** with Express.js
- **PostgreSQL** database
- **JWT** authentication with httpOnly cookies
- **bcryptjs** for password hashing
- **Nodemailer** for email services
- **pg** (node-postgres) for database connectivity

### AI & External APIs
- **Gemini AI** for intelligent recommendations
- **TMDB API** for movie/TV data and images
- **YouTube API** for trailers

### Database
- **PostgreSQL** with complex schema
- **Triggers** for automatic aggregates
- **Transactions** for data integrity
- **Indexes** for performance optimization

## 📁 Project Structure

```
Netflix-DBMS/
├── backend/                 # Express.js server
│   ├── server.js           # Main server file
│   ├── config/             # Configuration files
│   ├── database/           # Database layer
│   │   ├── models/         # Data models
│   │   ├── schema.sql      # Database schema
│   │   └── migrations/     # Schema updates
│   └── utils/              # Utility functions
├── frontend/                # React application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── lib/            # API and utility functions
│   │   └── store/          # Zustand stores
│   └── public/             # Static assets
├── database/                # Database configuration
└── uploads/                 # User uploaded files
```

## 🗄️ Database Schema

The system uses a comprehensive PostgreSQL schema with 15+ tables:

### Core Tables
- **Media**: Central catalog (movies/series) with aggregates
- **Movie/TVSeries**: Type-specific metadata
- **Season/Episode**: Hierarchical TV structure
- **Genre/MediaGenre**: Many-to-many genre classification
- **User**: Authentication and profile data
- **Rating/Review**: User interactions
- **Watchlist**: User saved content

### Key Features
- **UUID Primary Keys** for scalability
- **Automatic Aggregates** via triggers (ratings, votes)
- **Complex Relationships** with proper foreign keys
- **Indexing** for query performance

## 🔧 Installation & Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 13+
- Git

### 1. Clone Repository
```bash
git clone <repository-url>
cd Netflix-DBMS
```

### 2. Backend Setup
```bash
cd backend
npm install

# Create .env file
cp .env.example .env
# Edit .env with your configuration
```

**Required Environment Variables:**
```env
DATABASE_URL=postgresql://user:password@localhost:5432/netflix_db
JWT_SECRET=your-super-secret-jwt-key
GEMINI_API_KEY=your-gemini-api-key
TMDB_API_KEY=your-tmdb-api-key
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

### 3. Database Setup
```bash
# Create PostgreSQL database
createdb netflix_db

# Run schema
psql -d netflix_db -f database/schema.sql

# Optional: Run updates
psql -d netflix_db -f database/schema_update.sql
```

### 4. Frontend Setup
```bash
cd ../frontend
npm install
```

### 5. Start Development Servers

**Backend:**
```bash
cd backend
npm start
# Server runs on http://localhost:5000
```

**Frontend:**
```bash
cd frontend
npm run dev
# App runs on http://localhost:5173
```

## 🚀 Deployment

### Backend Deployment (Render)
1. Connect GitHub repository
2. Set environment variables
3. Deploy with build command: `npm install`
4. Start command: `node server.js`

### Frontend Deployment (Vercel/Netlify)
1. Build command: `npm run build`
2. Publish directory: `dist`
3. Set API base URL to deployed backend

## 📡 API Endpoints

### Authentication
- `POST /api/signup` - User registration
- `POST /api/login` - User login
- `POST /api/logout` - User logout
- `GET /api/fetch-user` - Get current user

### Media Catalog
- `GET /api/catalog/movies` - Get movies with filters
- `GET /api/catalog/series` - Get TV series
- `GET /api/catalog/movies/:id` - Movie details
- `GET /api/catalog/search` - Search media

### User Features
- `GET /api/watchlist` - Get user's watchlist
- `POST /api/watchlist/:id` - Add to watchlist
- `POST /api/media/:id/ratings` - Rate media
- `GET /api/media/:id/reviews` - Get reviews

### AI Features
- `POST /api/ai/recommendations` - Get AI recommendations

### Admin (Protected)
- `GET /api/admin/users` - List all users
- `PATCH /api/admin/users/:id/ban` - Ban/unban user
- `GET /api/admin/reviews` - List all reviews

## 🤖 AI Recommendation System

The AI system uses Google's Gemini AI to provide personalized movie recommendations:

1. **User Input**: Mood, preferred genres, decade, language, runtime
2. **AI Processing**: Gemini analyzes preferences and suggests titles
3. **Matching**: System matches AI suggestions against TMDB catalog
4. **Caching**: Recommendations cached for 6 hours to reduce API costs

## 🔐 Security Features

- **JWT Authentication** with httpOnly cookies
- **Password Hashing** with bcryptjs (10 salt rounds)
- **Email Verification** with OTP tokens
- **SQL Injection Protection** via parameterized queries
- **CORS Configuration** for cross-origin requests
- **Input Validation** and sanitization
- **Rate Limiting** on external API calls

## 🧪 Testing

### API Testing
```bash
cd backend
npm test
```

### Manual Testing
- Use Postman for API endpoints
- Test authentication flows
- Verify database operations
- Check AI recommendations

## 📊 Database Queries

### Complex Queries Examples

**Filtered Catalog:**
```sql
SELECT m.* FROM Media m
INNER JOIN Movie mv ON mv.media_id = m.media_id
WHERE m.media_type = 'movie'
  AND EXISTS (SELECT 1 FROM MediaGenre mg
              JOIN Genre g ON g.genre_id = mg.genre_id
              WHERE mg.media_id = m.media_id AND g.name ILIKE $genre)
ORDER BY CASE
  WHEN $section = 'popular' THEN m.num_votes
  WHEN $section = 'top_rated' THEN m.rating
  ELSE m.created_at
END DESC
```

**Genre-based Recommendations:**
```sql
SELECT DISTINCT m2.* FROM MediaGenre mg1
JOIN MediaGenre mg2 ON mg1.genre_id = mg2.genre_id
WHERE mg1.media_id = $mediaId AND mg2.media_id <> mg1.media_id
ORDER BY m2.num_votes DESC
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- **TMDB API** for movie data
- **Google Gemini AI** for recommendations
- **PostgreSQL** for robust database
- **React Community** for excellent tooling

---

**Built with ❤️ for learning and demonstration purposes**

* Building fullstack apps with MERN
* Debugging real-world issues (CORS, Mongo errors)
* Zustand for clean state logic
* Secure Auth with JWT & Bcrypt
* Building scalable APIs
* Using Gemini AI for real features
* Deploying to the real web with Render
* Best practices, clean code, and error handling

---

## 🙌 Support This Project

If you found this helpful, please:

* ⭐️ Star this repo
* 🛠️ Fork it
* 📣 Share with others
* 🧠 Subscribe on [YouTube](https://www.youtube.com/@emmanuelezeigbo659) for more in-depth dev tutorials
