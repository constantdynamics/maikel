#!/bin/bash
set -e

# Stock Screener - Automated Setup Script
# This script guides you through the complete setup process

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Stock Screener - Setup Wizard${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

check_command() {
  if command -v "$1" &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} $1 found"
    return 0
  else
    echo -e "  ${RED}✗${NC} $1 not found"
    return 1
  fi
}

check_command "node" || { echo "Install Node.js 18+ from https://nodejs.org"; exit 1; }
check_command "npm" || { echo "npm should come with Node.js"; exit 1; }

NEED_INSTALL=false
if ! check_command "npx"; then
  NEED_INSTALL=true
fi

echo ""

# Step 1: Install dependencies
echo -e "${BLUE}Step 1: Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 2: Supabase Setup
echo -e "${BLUE}Step 2: Supabase Setup${NC}"
echo -e "You need a free Supabase account. If you don't have one:"
echo -e "  → Go to ${YELLOW}https://supabase.com${NC} and sign up"
echo -e "  → Create a new project (free tier)"
echo ""

read -p "Do you already have a Supabase project? (y/n): " HAS_SUPABASE

if [ "$HAS_SUPABASE" != "y" ]; then
  echo ""
  echo -e "${YELLOW}Please create a Supabase project first:${NC}"
  echo "  1. Go to https://supabase.com/dashboard"
  echo "  2. Click 'New Project'"
  echo "  3. Choose a name (e.g., 'stock-screener')"
  echo "  4. Set a database password (save this!)"
  echo "  5. Choose region closest to you"
  echo "  6. Wait for project to initialize (~2 min)"
  echo ""
  read -p "Press Enter when your project is ready..."
fi

echo ""
echo -e "Now I need your Supabase credentials."
echo -e "Find them at: ${YELLOW}Project Settings → API${NC}"
echo ""

read -p "Supabase Project URL (https://xxx.supabase.co): " SUPABASE_URL
read -p "Supabase anon/public key: " SUPABASE_ANON_KEY
read -p "Supabase service_role key: " SUPABASE_SERVICE_KEY

# Validate URL format
if [[ ! "$SUPABASE_URL" =~ ^https://.*\.supabase\.co$ ]]; then
  echo -e "${RED}Warning: URL doesn't look like a Supabase URL. Continuing anyway...${NC}"
fi

echo ""

# Step 3: Run database schema
echo -e "${BLUE}Step 3: Setting up database schema...${NC}"
echo -e "You need to run the SQL schema in the Supabase SQL Editor."
echo ""
echo -e "  1. Go to ${YELLOW}${SUPABASE_URL}/project/default/sql${NC}"
echo -e "     (or Supabase Dashboard → SQL Editor)"
echo -e "  2. Click 'New query'"
echo -e "  3. Copy-paste the contents of: ${YELLOW}supabase/schema.sql${NC}"
echo -e "  4. Click 'Run' (RUN button, bottom right)"
echo ""

# Try to open the SQL editor in the browser
SUPABASE_REF=$(echo "$SUPABASE_URL" | sed 's|https://||' | sed 's|\.supabase\.co||')
SQL_URL="https://supabase.com/dashboard/project/${SUPABASE_REF}/sql/new"

echo -e "Or open this URL directly: ${YELLOW}${SQL_URL}${NC}"
echo ""

# Copy schema to clipboard if possible
if command -v pbcopy &> /dev/null; then
  cat supabase/schema.sql | pbcopy
  echo -e "${GREEN}✓ Schema SQL copied to clipboard!${NC}"
elif command -v xclip &> /dev/null; then
  cat supabase/schema.sql | xclip -selection clipboard
  echo -e "${GREEN}✓ Schema SQL copied to clipboard!${NC}"
else
  echo -e "Tip: The schema file is at ${YELLOW}supabase/schema.sql${NC}"
fi

read -p "Press Enter when you've run the schema SQL..."
echo -e "${GREEN}✓ Database schema deployed${NC}"
echo ""

# Step 4: Create auth user
echo -e "${BLUE}Step 4: Creating your login account...${NC}"
echo -e "Go to ${YELLOW}Supabase Dashboard → Authentication → Users${NC}"
echo -e "  1. Click 'Add user' → 'Create new user'"
echo -e "  2. Enter your email and a strong password"
echo -e "  3. Check 'Auto Confirm User'"
echo ""
read -p "Enter the email you used: " USER_EMAIL
read -p "Press Enter when the user is created..."
echo -e "${GREEN}✓ Auth user created${NC}"
echo ""

# Step 5: Alpha Vantage API key
echo -e "${BLUE}Step 5: Alpha Vantage API Key (optional but recommended)${NC}"
echo -e "Get a free API key at: ${YELLOW}https://www.alphavantage.co/support/#api-key${NC}"
echo ""
read -p "Alpha Vantage API Key (press Enter to skip): " AV_API_KEY

if [ -z "$AV_API_KEY" ]; then
  AV_API_KEY="demo"
  echo -e "${YELLOW}Skipped - using 'demo' key (limited functionality)${NC}"
fi
echo ""

# Step 6: Generate cron secret
echo -e "${BLUE}Step 6: Generating cron secret...${NC}"
CRON_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -d '\n/+=' | head -c 64)
echo -e "${GREEN}✓ Generated secure cron secret${NC}"
echo ""

# Step 7: Write .env.local
echo -e "${BLUE}Step 7: Writing environment configuration...${NC}"

cat > .env.local << ENVEOF
# Supabase
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_KEY}

# Alpha Vantage API
ALPHA_VANTAGE_API_KEY=${AV_API_KEY}

# Cron secret
CRON_SECRET=${CRON_SECRET}
ENVEOF

echo -e "${GREEN}✓ .env.local written${NC}"
echo ""

# Step 8: Test the build
echo -e "${BLUE}Step 8: Testing build...${NC}"
npm run build
echo -e "${GREEN}✓ Build successful${NC}"
echo ""

# Step 9: Vercel deployment
echo -e "${BLUE}Step 9: Vercel Deployment${NC}"
echo ""

read -p "Do you want to deploy to Vercel now? (y/n): " DEPLOY_VERCEL

if [ "$DEPLOY_VERCEL" = "y" ]; then
  if ! check_command "vercel"; then
    echo -e "Installing Vercel CLI..."
    npm i -g vercel
  fi

  echo ""
  echo -e "Logging in to Vercel..."
  vercel login

  echo ""
  echo -e "Deploying to Vercel..."
  vercel --prod

  echo ""
  echo -e "${YELLOW}IMPORTANT: Set environment variables in Vercel!${NC}"
  echo -e "Go to your Vercel project → Settings → Environment Variables"
  echo -e "Add these variables:"
  echo -e "  NEXT_PUBLIC_SUPABASE_URL = ${SUPABASE_URL}"
  echo -e "  NEXT_PUBLIC_SUPABASE_ANON_KEY = ${SUPABASE_ANON_KEY}"
  echo -e "  SUPABASE_SERVICE_ROLE_KEY = ${SUPABASE_SERVICE_KEY}"
  echo -e "  ALPHA_VANTAGE_API_KEY = ${AV_API_KEY}"
  echo -e "  CRON_SECRET = ${CRON_SECRET}"
  echo ""
  echo -e "Then redeploy: ${YELLOW}vercel --prod${NC}"
else
  echo ""
  echo -e "${YELLOW}Manual deployment instructions:${NC}"
  echo "  1. Push code to GitHub"
  echo "  2. Go to https://vercel.com/new"
  echo "  3. Import your GitHub repository"
  echo "  4. Add environment variables (see .env.local)"
  echo "  5. Deploy"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Local development: ${YELLOW}npm run dev${NC}"
echo -e "Open: ${YELLOW}http://localhost:3000${NC}"
echo -e "Login with: ${YELLOW}${USER_EMAIL}${NC}"
echo ""
echo -e "Environment variables for Vercel:"
echo -e "  NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}"
echo -e "  NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}"
echo -e "  SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_KEY}"
echo -e "  ALPHA_VANTAGE_API_KEY=${AV_API_KEY}"
echo -e "  CRON_SECRET=${CRON_SECRET}"
echo ""
