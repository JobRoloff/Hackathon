# Hackathon

## Getting Started

create virtual environment

```bash
python3 -m venv .venv
```

install project requirements

```bash
pip install -r requirements.txt
```

train ml model

```bash
python3 predict_model.py
```

start api

```bash
uvicorn api:app --host 0.0.0.0 --port 5000
```