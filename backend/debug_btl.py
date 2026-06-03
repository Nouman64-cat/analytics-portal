import uuid
from sqlmodel import Session, select
from app.database import engine
from app.models.user import User, UserRole
from app.bd_scope import get_bd_entity_scope

def debug_user(email: str):
    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == email)).first()
        if not user:
            print(f"User {email} not found")
            return
            
        print(f"User: {user.email} (Role: {user.role}, ID: {user.id})")
        print(f"BD Entity ID: {user.bd_entity_id}")
        print(f"Team Lead User ID: {user.team_lead_user_id}")
        
        scope = get_bd_entity_scope(user, session)
        print(f"BD Scope (Entity IDs): {scope}")
        
        if user.role == UserRole.BD_TEAM_LEAD:
            members = session.exec(select(User.email, User.bd_entity_id).where(User.team_lead_user_id == user.id)).all()
            print("Team Members:")
            for m in members:
                print(f" - {m.email} (BD Entity: {m.bd_entity_id})")
        
        print("---")

if __name__ == "__main__":
    with Session(engine) as session:
        print("Finding BTLs with team members...")
        btls = session.exec(select(User).where(User.role == UserRole.BD_TEAM_LEAD)).all()
        for b in btls:
            members = session.exec(select(User).where(User.team_lead_user_id == b.id)).all()
            if members or b.bd_entity_id:
                print(f"--- BTL: {b.email} (ID: {b.id}) ---")
                print(f"BD Entity ID: {b.bd_entity_id}")
                for m in members:
                    print(f"  -> Member: {m.email} (BD Entity: {m.bd_entity_id})")
        
        print("\nChecking any users that have a team lead assigned:")
        users_with_lead = session.exec(select(User).where(User.team_lead_user_id != None)).all()
        for u in users_with_lead:
            print(f"{u.email} -> Lead ID: {u.team_lead_user_id}")
