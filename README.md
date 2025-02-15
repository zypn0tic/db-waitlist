# Next-Gen Advertising Waitlist

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env`
3. Fill in your environment variables in `.env`
4. Install dependencies: `npm install`
5. Run the server: `npm start`

## Environment Variables

The following environment variables are required:

- `MONGODB_URI`: Your MongoDB connection string
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (development/production)
- `EMAIL_SERVICE`: Email service provider
- `EMAIL_USER`: Email username
- `EMAIL_PASS`: Email password
- `RENDER_DEPLOY_HOOK_SECRET`: Render deploy hook secret

## Deployment

When deploying to Render:

1. Add all environment variables in the Render dashboard
2. Do not commit `.env` file to the repository
3. Use the deploy hook URL for automatic deployments
