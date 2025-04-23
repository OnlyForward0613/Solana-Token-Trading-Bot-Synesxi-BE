FROM node:18-alpine

# Create app directory with proper permissions
RUN mkdir -p /usr/src/node-app && chown -R node:node /usr/src/node-app
WORKDIR /usr/src/node-app

# Copy package files first (better layer caching)
COPY --chown=node:node package*.json ./

# Disable Husky and install production dependencies
USER node
RUN npm ci --only=production

# Copy application code
COPY --chown=node:node . .

# Expose port and run
EXPOSE 3000
CMD ["node", "src/index.js"]
