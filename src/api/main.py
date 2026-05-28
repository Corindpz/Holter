from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from src.api.routes.import_routes import router as import_router
from src.api.routes.analysis_routes import router as analysis_router
from src.api.routes.review_routes import router as review_router
from src.api.routes.export_routes import router as export_router
from src.api.routes.dictionary_routes import router as dictionary_router
from src.api.routes.status_routes import router as status_router
from src.api.routes.exclusion_routes import router as exclusion_router
from src.api.routes.analytics_routes import router as analytics_router

app = FastAPI(title="HOLTER PMS", version="1.0")

app.include_router(import_router, prefix="/api")
app.include_router(analysis_router, prefix="/api")
app.include_router(review_router, prefix="/api")
app.include_router(export_router, prefix="/api")
app.include_router(dictionary_router, prefix="/api")
app.include_router(status_router, prefix="/api")
app.include_router(exclusion_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")

_STATIC = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(_STATIC)), name="static")


@app.get("/", include_in_schema=False)
async def root():
    return FileResponse(str(_STATIC / "index.html"))
