#!/bin/bash
#
# Body Mode - Netlify Deployment Script
# Run this script to deploy your backend to Netlify
#
# IMPORTANT: This script requires interactive input for browser authentication
#

set -e  # Exit on error

echo "========================================="
echo "  Body Mode - Netlify Deployment"
echo "========================================="
echo ""

# Navigate to project directory
cd "$(dirname "$0")"

# Step 1: Login to Netlify
echo "Step 1/7: Logging in to Netlify..."
echo "This will open your browser for authentication."
netlify login

echo ""
echo "✅ Login successful!"
echo ""

# Step 2: Check if site exists
echo "Step 2/7: Checking project status..."
netlify status || echo "No site linked yet (this is expected)"

echo ""

# Step 3: Create new site (will prompt for team selection)
echo "Step 3/7: Creating new Netlify site..."
echo "You'll be prompted to:"
echo "  - Create a new site (not link existing)"
echo "  - Enter site name: body-mode-backend (or any name)"
echo "  - Select team: Viperdam"
echo ""

netlify init

echo ""
echo "✅ Site created and linked!"
echo ""

# Step 4: Set environment variable for Gemini API key
echo "Step 4/7: Setting up environment variables..."
echo ""
echo "⚠️  CRITICAL: You need to set your Gemini API key"
echo ""
echo "BEFORE CONTINUING:"
echo "1. Go to: https://aistudio.google.com/app/apikey"
echo "2. REVOKE the old key: AIzaSyD2QnjMptHnvGAFS_yYq2KKbDYoB0L_Ztc"
echo "3. Generate a NEW API key"
echo "4. Copy it to clipboard"
echo ""
read -p "Press ENTER when you have your new API key ready..."

echo ""
read -p "Paste your new Gemini API key here: " GEMINI_KEY

netlify env:set GEMINI_API_KEY "$GEMINI_KEY"

echo ""
echo "✅ Environment variable set!"
echo ""

# Step 5: Deploy to production
echo "Step 5/7: Deploying to production..."
echo "This may take 30-60 seconds..."
echo ""

netlify deploy --prod --dir=public --functions=netlify/functions

echo ""
echo "✅ Deployment complete!"
echo ""

# Step 6: Get site info
echo "Step 6/7: Getting site information..."
SITE_INFO=$(netlify status)
echo "$SITE_INFO"

# Extract site URL
SITE_URL=$(echo "$SITE_INFO" | grep "Website URL:" | awk '{print $3}')
FUNCTION_URL="${SITE_URL}/.netlify/functions/gemini-proxy"

echo ""
echo "========================================="
echo "  Deployment Successful! 🎉"
echo "========================================="
echo ""
echo "Your site URL: $SITE_URL"
echo "Function URL: $FUNCTION_URL"
echo ""

# Step 7: Test the function
echo "Step 7/7: Testing the deployed function..."
echo ""

curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-1.5-flash",
    "contents": {
      "parts": [{"text": "Say hello in one word"}]
    }
  }' | head -50

echo ""
echo ""
echo "========================================="
echo "  Next Steps:"
echo "========================================="
echo ""
echo "1. Update mobile app URL in:"
echo "   mobile/src/services/netlifyGeminiService.ts"
echo ""
echo "   Change line 15 to:"
echo "   : '$FUNCTION_URL';"
echo ""
echo "2. Remove API key from mobile/.env:"
echo "   Comment out: EXPO_PUBLIC_GEMINI_API_KEY"
echo ""
echo "3. Rebuild your mobile app:"
echo "   cd mobile && npm run android"
echo ""
echo "4. Test all features (food logging, plans, chat)"
echo ""
echo "========================================="
echo "  Deployment Complete! ✅"
echo "========================================="
