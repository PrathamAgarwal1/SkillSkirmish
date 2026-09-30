# SkillSkirmish sandbox: Machine Learning environment
# JupyterLab + the usual Kaggle stack (NumPy, pandas, scikit-learn, XGBoost, LightGBM, PyTorch CPU)
# plus Streamlit for turning a model into a deployable app, and the Kaggle CLI for datasets.
FROM python:3.12-slim-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates build-essential procps curl unzip libgomp1 \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

RUN pip install --no-cache-dir \
    "jupyterlab>=4.2" ipykernel ipywidgets nbconvert \
    numpy pandas scipy scikit-learn xgboost lightgbm \
    matplotlib seaborn plotly \
    streamlit kaggle python-dotenv requests

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUSERBASE=/workspace/.pydeps \
    PATH=/workspace/.pydeps/bin:$PATH \
    HOME=/tmp/home \
    MPLCONFIGDIR=/tmp/matplotlib \
    JUPYTER_RUNTIME_DIR=/tmp/jupyter-runtime \
    STREAMLIT_BROWSER_GATHER_USAGE_STATS=false

RUN mkdir -p /tmp/home && chmod 1777 /tmp/home
WORKDIR /workspace
CMD ["sleep", "infinity"]
