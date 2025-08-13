#!/bin/bash

# Card Scanner Vercel Deployment Script

echo "🚀 Deploying Card Scanner to Vercel..."

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

# Build the project
echo "🔨 Building project..."
npm run build

# Check if environment variables are set
echo "⚡ Setting up environment variables..."
echo "Make sure to set your OPENAI_API_KEY in Vercel:"
echo "Run: vercel env add OPENAI_API_KEY"

# Deploy to Vercel
echo "📦 Deploying to Vercel..."
vercel --prod

echo "✅ Deployment complete!"
echo "Your Card Scanner app is now live on Vercel!"
