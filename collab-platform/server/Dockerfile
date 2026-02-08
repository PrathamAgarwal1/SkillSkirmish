FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Default port (can be overridden)
EXPOSE 5000

# Start server
CMD ["npm", "start"]
