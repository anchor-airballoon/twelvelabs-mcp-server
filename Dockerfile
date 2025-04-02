FROM node:20-alpine AS builder

WORKDIR /app

# package.json, package-lock.json, tsconfig.json, src/ 등 전체 복사
COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json
COPY tsconfig.json /app/tsconfig.json
COPY index.ts /app/index.ts

RUN npm install

# 빌드 (TypeScript -> JavaScript)
RUN npx tsc && chmod +x /app/index.js

# 실제 배포용 이미지
FROM node:20-alpine AS release
WORKDIR /app

COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json
COPY --from=builder /app/index.js /app/index.js
COPY --from=builder /app/tsconfig.json /app/tsconfig.json

# 프로덕션 환경: devDependencies 없이 설치하고 prepare 스크립트 실행하지 않음
RUN npm ci --omit=dev --ignore-scripts

ENV NODE_ENV=production

# TwelveLabs API Key 필요
# docker run -e TWELVELABS_API_KEY=xxxx ...
ENTRYPOINT ["node", "/app/index.js"]
