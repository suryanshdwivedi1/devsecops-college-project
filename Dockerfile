FROM node:22-alpine

# Patch all Alpine OS packages to latest security fixes
RUN apk update && apk upgrade --no-cache

ARG GIT_SHA=local-dev
ENV GIT_SHA=${GIT_SHA}

WORKDIR /app
COPY package.json .
RUN npm install --omit=dev

# Remove npm/yarn after install to eliminate CLI tool CVEs and shrink attack surface
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /opt/yarn*

COPY . .
USER node
EXPOSE 3000
CMD ["node", "index.js"]