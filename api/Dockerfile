FROM node:20-alpine

WORKDIR /usr/src/app

RUN apk add --no-cache curl

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 2032
CMD ["npm", "start"]
