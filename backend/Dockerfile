# syntax=docker/dockerfile:1
# StockLock API for AWS Lambda (x86_64, Function URL) through AWS Lambda Web Adapter.
#
# Build from backend/, with the starter CSVs passed as a named build context:
#   docker buildx build --platform linux/amd64 --provenance=false \
#     --build-context data=../alphaforge_starter -t stocklock-api .
# Run locally:
#   docker run --rm -p 8080:8080 -e AWS_REGION=us-east-1 stocklock-api

FROM public.ecr.aws/docker/library/python:3.12-slim

COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.1.0 /lambda-adapter /opt/extensions/lambda-adapter

# Lambda only allows writes under /tmp.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HOME=/tmp \
    XDG_CACHE_HOME=/tmp/.cache \
    DATA_DIR=/opt/stocklock/data \
    CACHE_DIR=/tmp/cache \
    PORT=8080 \
    AWS_LWA_PORT=8080 \
    AWS_LWA_READINESS_CHECK_PATH=/api/health

WORKDIR /opt/stocklock/backend

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY --from=data *.csv /opt/stocklock/data/
COPY app ./app

EXPOSE 8080
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
