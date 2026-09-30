# SkillSkirmish sandbox: Python 3.12 environment (APIs, scripts)
FROM python:3.12-slim-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates build-essential procps curl unzip \
 && rm -rf /var/lib/apt/lists/*

# Common web stack preinstalled so templates start instantly
RUN pip install --no-cache-dir "fastapi>=0.110" "uvicorn[standard]>=0.29" "flask>=3.0" requests python-dotenv pytest

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # Project dependencies install into the project folder so they survive container restarts
    PYTHONUSERBASE=/workspace/.pydeps \
    PATH=/workspace/.pydeps/bin:$PATH \
    HOME=/tmp/home

RUN mkdir -p /tmp/home && chmod 1777 /tmp/home
WORKDIR /workspace
CMD ["sleep", "infinity"]
