FROM node:lts-alpine

WORKDIR /app

# Copy package files and install dependencies without running prepare scripts
COPY package*.json ./
RUN npm install --ignore-scripts

# Copy rest of the source code
COPY . .

# Build the project explicitly
RUN npm run build

# Ensure required environment variables are passed at runtime
ENV TWELVELABS_API_KEY=""

# Expose the MCP server on stdio
CMD ["node", "index.js"]
