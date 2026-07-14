from __future__ import annotations

import io
from typing import Optional

from minio import Minio

from app.config import settings


def get_client() -> Minio:
    return Minio(
        f"{settings.minio_endpoint}:{settings.minio_port}",
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_use_ssl,
    )


def ensure_bucket() -> None:
    client = get_client()
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)


def get_bytes(bucket: str, key: str) -> bytes:
    client = get_client()
    resp = client.get_object(bucket or settings.minio_bucket, key)
    try:
        return resp.read()
    finally:
        resp.close()
        resp.release_conn()


def put_bytes(
    key: str,
    data: bytes,
    content_type: str = "application/octet-stream",
    bucket: Optional[str] = None,
) -> str:
    client = get_client()
    b = bucket or settings.minio_bucket
    client.put_object(
        b,
        key,
        io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )
    return key


def put_file(key: str, path: str, content_type: str = "application/octet-stream") -> str:
    client = get_client()
    client.fput_object(settings.minio_bucket, key, path, content_type=content_type)
    return key
