# Diagnostic Center Management - Backend API

Node.js/Express REST API server for the Diagnostic Center Management System.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB (Mongoose ODM)
- **Authentication**: JWT (JSON Web Tokens)
- **File Upload**: Multer
- **Email**: Nodemailer
- **Cloud Storage**: Google Drive API (optional)

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- MongoDB (v6 or higher) running locally or a remote URI

### Installation

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env with your actual values
```

### Running the Server

```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:5001` by default.

## API Routes

| Route                  | Description                     |
| ---------------------- | ------------------------------- |
| `/api/auth`            | Authentication (login/register) |
| `/api/patients`        | Patient CRUD operations         |
| `/api/reports`         | Report generation & management  |
| `/api/tests`           | Test configuration              |
| `/api/subtests`        | Subtest management              |
| `/api/doctors`         | Doctor management               |
| `/api/agents`          | Agent management                |
| `/api/equipment`       | Equipment & inventory tracking  |
| `/api/commissions`     | Commission management           |
| `/api/analysis`        | Doctor/Agent analysis reports   |
| `/api/pin-settings`    | PIN security settings           |
| `/api/updation-links`  | Report sharing links            |

## Project Structure

```
backend/
├── models/          # Mongoose schema definitions
├── routes/          # Express route handlers
├── middleware/      # Auth & PIN verification middleware
├── services/        # External services (Google Drive)
├── utils/           # Utility functions (equipment, formulas)
├── scripts/         # Database initialization & migration scripts
├── uploads/         # File upload directory (gitignored)
├── server.js        # Application entry point
├── .env.example     # Environment variable template
└── package.json     # Dependencies & scripts
```

## Frontend Serving

If a production build of the frontend exists at `../frontend/build`, the server will automatically serve it as static files. Otherwise, it runs as an API-only server.