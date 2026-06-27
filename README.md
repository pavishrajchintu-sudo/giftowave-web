# Giftowave

Giftowave is a boutique e-commerce web app for selling personalized magazine-style gifts. It serves static frontend pages from `public/` and uses an Express backend for authentication, payments, order history, founder/admin order management, and an AI assistant proxy.

## Features

- Product storefront with cart and checkout flow
- Google Sign-In authentication
- JWT-based protected user sessions
- Razorpay payment order creation
- MongoDB order storage through Mongoose
- User dashboard for order history
- Founder dashboard for viewing and marking orders as shipped
- AI assistant endpoint that forwards chat messages to the Giftowave agent service

## Tech Stack

- Node.js
- Express
- MongoDB with Mongoose
- Google Auth Library
- JSON Web Tokens
- Razorpay
- Static HTML/CSS/JavaScript frontend

## Project Structure

```text
.
|-- public/
|   |-- index.html
|   |-- dashboard.html
|   |-- founder-dashboard.html
|   |-- agent.html
|   |-- index.css
|   |-- *.jpeg
|-- server.js
|-- package.json
|-- package-lock.json
|-- .env
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root with the following values:

```env
MONGO_URI=your_mongodb_connection_string
GOOGLE_CLIENT_ID=your_google_oauth_client_id
JWT_SECRET=your_jwt_secret
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
PORT=5000
```

Keep `.env` private. It should not be committed to source control.

### 3. Start the server

```bash
npm start
```

The app runs at:

```text
http://localhost:5000
```

## Available Scripts

```bash
npm start
```

Starts the Express server with `node server.js`.

```bash
npm test
```

Currently this is a placeholder and does not run a real test suite.

## Pages

- `/` - Main Giftowave storefront
- `/dashboard.html` - Customer order history page
- `/founder-dashboard.html` - Founder/admin order management page
- `/agent.html` - Standalone AI assistant page

## API Endpoints

### Authentication

- `POST /api/auth/google` - Verify a Google ID token, create or load a user, and return a JWT session token.

### Payments

- `POST /api/create-order` - Create a Razorpay order. Requires a bearer token.

### Orders

- `POST /api/orders` - Save a paid order for the authenticated user.
- `GET /api/user/orders` - Fetch order history for the authenticated user.

### Founder/Admin

- `GET /api/admin/all-orders` - Fetch all orders. Requires founder access.
- `PUT /api/admin/order/:id/ship` - Mark an order as shipped. Requires founder access.

### AI Assistant

- `POST /api/ask-giftowave-agent` - Forward a chat message to the external Giftowave AI agent.

## Notes

- The founder account is currently determined in `server.js` by matching a specific email address during Google login.
- The frontend uses Razorpay Checkout and Google Identity scripts from their hosted CDNs.
- The AI assistant depends on the external service configured in `server.js`.
