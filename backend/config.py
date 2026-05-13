from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    GH_PAT: str
    GH_OWNER: str = "isaac-sim"
    GH_REPO: str = "IsaacLab"

    AWS_REGION: str = "us-east-1"
    ECR_ACCOUNT_ID: str = "365506438424"
    ECR_REPO: str = "issaclab/isaac"

    NGC_API_KEY: str = ""
    NGC_ORG: str = ""

    CLUSTER_HOST: str = ""
    CLUSTER_USER: str = ""
    CLUSTER_KEY_PATH: str = ""
    CLUSTER_SCHEDULER: str = "slurm"  # slurm | pbs

    DATABASE_URL: str = "sqlite+aiosqlite:///./isaaclab_dashboard.db"

    class Config:
        env_file = ".env"
        extra = "ignore"  # boto3 reads AWS_* directly from env; don't validate them here


settings = Settings()
