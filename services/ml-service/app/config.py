from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    service_token: str = "dev-ml-service-token-change-me"
    minio_endpoint: str = "127.0.0.1"
    minio_port: int = 9000
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "modeljudge"
    minio_use_ssl: bool = False
    mjs_version: str = "1.0.0"
    max_upload_rows: int = 100_000
    max_features: int = 512
    kernel_shap_max_rows: int = 200
    kernel_shap_max_features: int = 30

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
