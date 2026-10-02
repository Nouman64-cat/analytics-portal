# Rizviz Analytics Portal - Backend

A FastAPI service with PostgreSQL (SQLModel) that powers the analytics portal.

## Prerequisites

- Python 3.12+
- PostgreSQL database running

## Setup Instructions

**1. Create & Activate Virtual Environment**

```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

**2. Install Dependencies**

```bash
pip install -r requirements.txt
```

**3. Configure Environment Variables**
Copy the example environment file and configure your database credentials:

```bash
cp .env.example .env
```

Ensure your `DATABASE_URL` in `.env` is correct. Example:
`DATABASE_URL=postgresql://user:password@localhost:5432/rizviz-interviews-ai`

**4. Seed Database (Optional)**
If you want to initialize the database with records from the Excel spreadsheet:

```bash
python -m app.seed
```

_Note: This automatically creates the schema tables on the first run._

## Running the Server

Start the local development server with live reload:

```bash
uvicorn app.main:app --reload --port 8000
```

The API will be available at: http://localhost:8000
Interactive API Docs (Swagger): http://localhost:8000/docs
