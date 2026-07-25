FROM node:20-alpine

WORKDIR /usr/src/app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 2033
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "2033"]
