FROM oven/bun:1.3.10-slim

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json bun.lock* ./

RUN bun install --frozen-lockfile --production

# Copy source files
COPY src/ ./src/

# Set non-root user for security
USER bun

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]