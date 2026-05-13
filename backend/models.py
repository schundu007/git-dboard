from sqlalchemy import Column, Integer, String, DateTime, Text, JSON
from sqlalchemy.sql import func
from database import Base


class LogEntry(Base):
    __tablename__ = "log_entries"
    id = Column(Integer, primary_key=True)
    source = Column(String(50))        # gha | docker | cluster
    run_id = Column(String(100))
    level = Column(String(20))
    message = Column(Text)
    timestamp = Column(DateTime, server_default=func.now())
    meta = Column(JSON, default={})


class BuildRecord(Base):
    __tablename__ = "build_records"
    id = Column(Integer, primary_key=True)
    run_id = Column(String(100), unique=True)
    branch = Column(String(200))
    commit_sha = Column(String(40))
    status = Column(String(50))
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    image_tags = Column(JSON, default=[])
    registries = Column(JSON, default=[])


class NightlyRun(Base):
    __tablename__ = "nightly_runs"
    id = Column(Integer, primary_key=True)
    run_id = Column(String(100), unique=True)
    isaac_sim_version = Column(String(50))
    date = Column(String(20))           # YYYY-MM-DD
    status = Column(String(50))
    test_suite = Column(String(50))     # tasks | general
    passed = Column(Integer, default=0)
    failed = Column(Integer, default=0)
    duration_seconds = Column(Integer)
    artifact_url = Column(String(500))
