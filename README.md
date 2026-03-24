# MentorMinds Stellar - Backend API

Backend API server for the MentorMinds Stellar platform, built with Node.js, Express, TypeScript, and PostgreSQL.

## 🚀 Features

- **RESTful API** with Express.js
- **TypeScript** for type safety
- **PostgreSQL** database with connection pooling
- **Stellar SDK** integration for blockchain operations
- **JWT Authentication** for secure user sessions
- **Input Validation** with Zod
- **Security** with Helmet and CORS
- **Logging** with Morgan
- **Environment Configuration** with dotenv
- **Interactive API Docs** with Swagger UI (OpenAPI 3.0)
- **Timezone Handling** with Luxon (IANA timezones, DST-aware)
- **Session Reminders** with cron-based scheduling

## 📖 API Documentation

Once the server is running, interactive API documentation is available at:

| URL | Description |
|-----|-------------|
| `http://localhost:5000/api/v1/docs` | Swagger UI — explore and test all endpoints |
| `http://localhost:5000/api/v1/docs/spec.json` | Raw OpenAPI 3.0 spec (JSON) |

### Using Swagger UI

1. Open `http://localhost:5000/api/v1/docs` in your browser
2. Click **Authorize** (🔒) and enter your JWT token: `Bearer <your_access_token>`
3. Obtain a token via `POST /auth/login` or `POST /auth/register`
4. Explore endpoints grouped by tag: **Auth**, **Users**, **Mentors**, **Payments**, **Wallets**, **Admin**

The spec auto-updates on every server restart from JSDoc annotations in `src/routes/*.ts`.

## 📋 Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- Stellar account (testnet for development)

## 🛠️ Installation

1. **Install dependencies**:
```bash
npm install
```

2. **Setup environment variables**:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
- Database credentials
- JWT secrets
- Stellar network settings
- CORS origins

3. **Setup database**:
```bash
# Create database
createdb mentorminds

# Run migrations (coming soon)
npm run migrate
```

## 🏃 Running the Server

### Development Mode
```bash
npm run dev
```
Server runs on http://localhost:5000 with hot reload

### Production Build
```bash
npm run build
npm start
```

## 📁 Project Structure

```
mentorminds-backend/
├── src/
│   ├── config/          # Configuration files
│   │   ├── database.ts  # PostgreSQL configuration
│   │   └── stellar.ts   # Stellar SDK configuration
│   ├── controllers/     # Route controllers
│   ├── middleware/      # Express middleware
│   │   ├── errorHandler.ts
│   │   └── notFoundHandler.ts
│   ├── models/          # Database models
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── utils/           # Utility functions
│   ├── types/           # TypeScript types
│   └── server.ts        # Entry point
├── database/
│   └── migrations/      # Database migrations
├── .env.example         # Environment variables template
├── tsconfig.json        # TypeScript configuration
└── package.json
```

## 🔌 API Endpoints

### Health Check
```
GET /health
```

### API Info
```
GET /api/v1
```

### Timezone API
```
GET /api/v1/timezones - List all IANA timezones
GET /api/v1/timezones/:identifier - Get timezone details
```

### Coming Soon
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `GET /api/v1/users/:id` - Get user profile
- `GET /api/v1/mentors` - List mentors
- `POST /api/v1/bookings` - Create booking (with timezone support)
- `POST /api/v1/payments` - Process payment
- `GET /api/v1/wallets/:id` - Get wallet info

## 🔐 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | development |
| `PORT` | Server port | 5000 |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `JWT_SECRET` | JWT signing secret | - |
| `STELLAR_NETWORK` | Stellar network (testnet/mainnet) | testnet |
| `STELLAR_HORIZON_URL` | Horizon server URL | testnet URL |
| `CORS_ORIGIN` | Allowed CORS origins | * |

See `.env.example` for complete list.

## 🧪 Testing

```bash
npm test
```

## 📝 Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors
- `npm run format` - Format code with Prettier

## 🔒 Security

- Helmet.js for security headers
- CORS configuration
- JWT token authentication
- Input validation with Zod
- SQL injection prevention
- Rate limiting (coming soon)

## 📚 Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js 5
- **Language**: TypeScript 5
- **Database**: PostgreSQL 14+
- **Blockchain**: Stellar SDK
- **Authentication**: JWT
- **Validation**: Zod
- **Security**: Helmet, CORS
- **Logging**: Morgan
- **Timezone**: Luxon (IANA timezones, DST-aware)
- **Scheduling**: Cron (session reminders)

## 🚧 Development Roadmap

- [x] Project setup
- [x] Basic Express server
- [x] Database configuration
- [x] Stellar SDK integration
- [ ] Authentication endpoints
- [ ] User management
- [ ] Mentor management
- [ ] Booking system
- [ ] Payment processing
- [ ] Wallet management
- [ ] Admin dashboard API

## 📖 Documentation

- [API Documentation](./docs/API.md) (coming soon)
- [Database Schema](./docs/DATABASE.md) (coming soon)
- [Stellar Integration](./docs/STELLAR_SERVICE.md)
- [Timezone Handling Guide](./docs/timezone-handling.md)
- [DST Edge Cases](./docs/dst-edge-cases.md)
- [Implementation Summary](./docs/IMPLEMENTATION_SUMMARY.md)

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Run tests and linting
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues and questions:
- Create an issue on GitHub
- Check existing documentation
- Review the codebase

---

**Status**: 🟢 Active Development

Built with ❤️ for the MentorMinds Stellar platform
