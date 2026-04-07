name: Database Integrity & Deployment

on:
pull_request:
paths: - 'packages/database/**'
push:
branches: - master
paths: - 'packages/database/**'

jobs:
check-migrations:
name: Check Schema Integrity
runs-on: ubuntu-latest
steps: - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install Dependencies
        run: npm install

      - name: Run Schema Check
        working-directory: packages/database
        run: npm run db:check

deploy-migrations:
name: Apply Migrations to Production
needs: check-migrations
if: github.event_name == 'push' && github.ref == 'refs/heads/master'
runs-on: ubuntu-latest
steps: - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install Dependencies
        run: npm install

      - name: Run Migrations
        working-directory: packages/database
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: npm run db:migrate
