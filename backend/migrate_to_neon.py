from sqlmodel import create_engine, SQLModel, Session, select
from app.models.candidate import Candidate
from app.models.company import Company
from app.models.resume_profile import ResumeProfile
from app.models.interview import Interview

local_url = "postgresql://postgres:asdf456nouM$@localhost:5432/rizviz-interviews-ai"
remote_url = "postgresql://neondb_owner:npg_yN1geCkYDuj3@ep-lingering-scene-a4ngk6qi-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"

local_engine = create_engine(local_url)
remote_engine = create_engine(remote_url)

# Make sure all tables exist on remote
SQLModel.metadata.create_all(remote_engine)

with Session(local_engine) as local_db:
    candidates = local_db.exec(select(Candidate)).all()
    companies = local_db.exec(select(Company)).all()
    profiles = local_db.exec(select(ResumeProfile)).all()
    interviews = local_db.exec(select(Interview)).all()

    c_list = [Candidate(**c.model_dump()) for c in candidates]
    co_list = [Company(**c.model_dump()) for c in companies]
    p_list = [ResumeProfile(**p.model_dump()) for p in profiles]
    i_list = [Interview(**i.model_dump()) for i in interviews]

with Session(remote_engine) as remote_db:
    remote_db.add_all(c_list)
    remote_db.add_all(co_list)
    remote_db.add_all(p_list)
    remote_db.add_all(i_list)
    remote_db.commit()

print("Migration completed successfully!")
