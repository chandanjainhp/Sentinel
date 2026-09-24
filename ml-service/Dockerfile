# Sentinel ML service. CPU only. Listens on $ML_PORT (default 9000).
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ML_PORT=9000 \
    ML_MODELS_DIR=/app/models

WORKDIR /app

# CPU-only torch first (avoids the multi-GB CUDA wheel), then the rest.
COPY requirements.txt .
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY vendor ./vendor
# Trained checkpoints + .meta.json. You can also mount your own at /app/models.
COPY models ./models

RUN useradd --system --no-create-home sentinel
USER sentinel

EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request as u; u.urlopen(f'http://127.0.0.1:{os.environ.get(\"ML_PORT\",\"9000\")}/health', timeout=4)"

CMD ["python", "-m", "app"]
