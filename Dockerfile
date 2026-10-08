FROM node:24-alpine AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.14-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend /build/dist /app/frontend-dist
ENV STATIC_DIR=/app/frontend-dist ENVIRONMENT=production AI_MODE=mock
RUN useradd --create-home careflow
USER careflow
EXPOSE 10000
CMD ["python", "scripts/serve.py"]
