"""`python -m app` -> serve on ML_PORT (default 9000)."""
import os

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=int(os.environ.get("ML_PORT", "9000")))
