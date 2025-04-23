FROM node:18-alpine

# Create app directory with proper permissions
RUN mkdir -p /usr/src/node-app && chown -R node:node /usr/src/node-app
WORKDIR /usr/src/node-app

# Copy package files first (better layer caching)
COPY --chown=node:node package*.json ./

# Install production dependencies
USER node
RUN npm ci --only=production

# Copy ALL files (including src folder)
COPY --chown=node:node . .

# Specify the correct entry point for src/index.js
EXPOSE 3000
CMD ["node", "src/index.js"]  # Updated path to index.js
