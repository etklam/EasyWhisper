from fastapi import FastAPI

app = FastAPI(title="FOSSWhisper Backend")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
