# Use official Microsoft Playwright image with all required Chromium OS dependencies pre-installed
FROM mcr.microsoft.com/playwright:v1.45.1-jammy

# Set working directory
WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install npm dependencies
RUN npm install --omit=dev

# Copy project source files
COPY . .

# Set environment variables for production headless execution
ENV NODE_ENV=production
ENV HEADLESS=true

# Expose local webhook port if needed
EXPOSE 3000

# Start the continuous booking monitor
CMD ["npm", "start"]
