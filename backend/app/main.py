from fastapi import FastAPI

app = FastAPI(title="EASYWhisper Backend")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
