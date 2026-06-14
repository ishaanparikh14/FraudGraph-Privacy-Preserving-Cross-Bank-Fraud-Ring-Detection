FROM python:3.10-slim

WORKDIR /app

# Install system dependencies (needed for some ML packages)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x start.sh

# Run both kafka scorer and XAI API
CMD ["bash", "start.sh"]
