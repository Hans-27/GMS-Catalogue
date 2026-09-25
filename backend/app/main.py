from contextlib import asynccontextmanager
import logging
import threading
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app import commerce_models, design_studio_models, feedback_models, models, platform_models, product_card_models  # noqa: F401 - registers SQLAlchemy tables
from app.auth import router as auth_router
from app.access_admin import router as access_router
from app.catalogue import router as catalogue_router
from app.commerce import router as commerce_router
from app.config import settings
from app.database import Base, SessionLocal, engine
from app.feedback import router as feedback_router
from app.erp_integration import router as erp_router
from app.erp_product_images import router as erp_product_images_router
from app.data_sync import router as data_sync_router
from app.dashboard import router as dashboard_router
from app.customer_portal import router as customer_portal_router
from app.search import router as search_router
from app.organization import router as organization_router
from app.organization_admin import router as organization_admin_router
from app.product_admin import router as product_admin_router
from app.seed import ensure_reference_data
from app.users import router as users_router
from app.platform_admin import router as platform_admin_router
from app.catalogue_presentation import router as catalogue_presentation_router
from app.catalogue_share_links import router as catalogue_share_links_router
from app.product_videos import router as product_videos_router
from app.design_studio import router as design_studio_router, studio_compat_router
from app.product_card_templates import router as product_card_templates_router
from app.product_cards import router as product_cards_router
from app.workers.design_export_worker import run as run_design_export_worker
from app.workers.product_sync_worker import run as run_product_sync_worker
from app.promotions import (
    occasion_router as promotion_occasions_router,
    public_router as public_promotions_router,
    report_router as promotion_reports_router,
    router as promotions_router,
    scheduler_router as promotion_scheduler_router,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.auto_create_tables:
        Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        ensure_reference_data(db, include_demo_products=settings.seed_demo_data)
    export_worker_stop = threading.Event()
    export_worker = None
    if settings.design_export_worker_enabled:
        export_worker = threading.Thread(
            target=run_design_export_worker,
            args=(export_worker_stop, settings.design_export_poll_seconds),
            name="catalogue-export-worker",
            daemon=True,
        )
        export_worker.start()
    product_sync_stop = threading.Event()
    product_sync_worker = None
    if settings.product_sync_enabled:
        product_sync_worker = threading.Thread(
            target=run_product_sync_worker,
            args=(product_sync_stop,),
            name="product-sync-worker",
            daemon=True,
        )
        product_sync_worker.start()
    try:
        yield
    finally:
        product_sync_stop.set()
        export_worker_stop.set()
        if product_sync_worker is not None:
            product_sync_worker.join(timeout=5.0)
        if export_worker is not None:
            export_worker.join(timeout=max(2.0, settings.design_export_poll_seconds + 1.0))


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
)

logger = logging.getLogger("gms.catalogue")


@app.middleware("http")
async def security_and_request_context(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    request.state.request_id = request_id
    started_at = time.perf_counter()
    origin = request.headers.get("origin")
    unsafe_method = request.method in {"POST", "PUT", "PATCH", "DELETE"}
    has_session_cookie = settings.auth_cookie_name in request.cookies
    if (
        unsafe_method
        and has_session_cookie
        and origin
        and not settings.is_origin_allowed(origin)
    ):
        return JSONResponse(
            status_code=403,
            content={
                "success": False,
                "message": "Cross-site request rejected.",
                "request_id": request_id,
            },
            headers={"X-Request-ID": request_id},
        )
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.path.startswith(settings.api_prefix):
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
        )
    logger.info(
        "%s %s %s %.1fms request_id=%s",
        request.method,
        request.url.path,
        response.status_code,
        (time.perf_counter() - started_at) * 1000,
        request_id,
    )
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=settings.allowed_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "X-Request-ID", "X-Customer-Access"],
    expose_headers=["X-Request-ID", "Content-Disposition"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=5)

app.include_router(auth_router, prefix=settings.api_prefix)
app.include_router(access_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(catalogue_router, prefix=settings.api_prefix)
app.include_router(users_router, prefix=settings.api_prefix)
app.include_router(organization_router, prefix=settings.api_prefix)
app.include_router(organization_admin_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(product_admin_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(product_videos_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(design_studio_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(studio_compat_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(product_card_templates_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(product_cards_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(commerce_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(catalogue_share_links_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(catalogue_presentation_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(platform_admin_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(feedback_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(erp_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(erp_product_images_router, prefix=settings.api_prefix)
app.include_router(data_sync_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(dashboard_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(customer_portal_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(search_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(promotion_occasions_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(promotion_reports_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(promotion_scheduler_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(promotions_router, prefix=f"{settings.api_prefix}/v1")
app.include_router(public_promotions_router, prefix=f"{settings.api_prefix}/v1")
app.mount("/uploads", StaticFiles(directory=settings.upload_dir, check_dir=False), name="uploads")


@app.get(f"{settings.api_prefix}/health", tags=["System"])
def health() -> dict[str, str | bool]:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {
        "status": "ok",
        "service": settings.app_name,
        "database": "connected",
        "environment": "demo" if settings.demo_mode else settings.app_env,
        "version": settings.demo_version,
        "feedback_enabled": settings.feedback_enabled,
    }
