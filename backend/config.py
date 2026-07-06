from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    GH_PAT: str
    # Repo-agnostic: the active repo comes from the DB/switcher; these env
    # fallbacks are intentionally empty so no specific repo is hardcoded.
    GH_OWNER: str = ""
    GH_REPO: str = ""

    AWS_REGION: str = "us-east-1"
    ECR_ACCOUNT_ID: str = ""
    ECR_REPO: str = ""

    NGC_API_KEY: str = ""
    NGC_ORG: str = ""

    CLUSTER_HOST: str = ""
    CLUSTER_USER: str = ""
    CLUSTER_KEY_PATH: str = ""
    CLUSTER_SCHEDULER: str = "slurm"  # slurm | pbs

    DATABASE_URL: str = "sqlite+aiosqlite:///./gitpulse.db"

    class Config:
        env_file = ".env"
        extra = "ignore"  # boto3 reads AWS_* directly from env; don't validate them here


settings = Settings()
