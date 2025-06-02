FROM node:18
WORKDIR /app
COPY package*.json ./
RUN apt-get update && apt-get install -y python3 make g++
RUN npm install
COPY . .
CMD ["node", "chatbot.js"]